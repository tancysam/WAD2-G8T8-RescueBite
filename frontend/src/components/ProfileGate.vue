<script setup>
import axios from 'axios'
import { computed, ref, watch } from 'vue'
import { useAuth, useUser } from '@clerk/vue'
import { useRoute, useRouter } from 'vue-router'
import { clearPendingRegistrationRole, getPendingRegistrationRole } from '../registrationRole.js'
import { canAccessRoute, homeRouteForRole } from '../roleRouting.js'
import { API_URL } from '@/config'

const PROFILE_URL = `${API_URL}/users/me`
const emit = defineEmits(['role-change'])
const router = useRouter()
const route = useRoute()
const { isLoaded: authLoaded, isSignedIn, getToken } = useAuth()
const { isLoaded: userLoaded, user } = useUser()

const phase = ref('loading')
const errorMessage = ref('')
const profileRole = ref(null)
let checkedUserId = null
let requestVersion = 0

watch([phase, profileRole], ([currentPhase, role]) => {
  emit('role-change', currentPhase === 'ready' ? role : null)
}, { immediate: true })

const canShowPage = computed(() =>
  phase.value === 'ready'
  && route.name !== 'auth-complete'
  && canAccessRoute(profileRole.value, route.meta.requiredRole)
)

function displayNameFor(clerkUser) {
  const name = [clerkUser.fullName, clerkUser.username, clerkUser.firstName]
    .find((value) => typeof value === 'string' && value.trim())
  return name ? name.trim() : 'RescueBite member'
}

function messageFor(error, action) {
  if (error.response && error.response.status === 401) {
    return 'Your session could not be verified. Please sign out and sign in again.'
  }
  if (error.code === 'ERR_NETWORK') {
    return 'Cannot connect to the RescueBite server. Please check that it is running and try again.'
  }
  if (error.response && error.response.data && error.response.data.error) {
    return error.response.data.error
  }
  if (error.message === 'The saved profile role does not match your registration choice.') {
    return error.message
  }
  return `Unable to ${action} your profile. Please try again.`
}

function roleFromResponse(response) {
  if (!response.data || !response.data.user) return undefined
  return response.data.user.role
}

async function authenticatedHeaders() {
  const token = await getToken.value()
  if (!token) {
    throw new Error('Sign in before making a protected API request')
  }
  return { Authorization: `Bearer ${token}` }
}

async function checkProfile(clerkUser) {
  const version = ++requestVersion
  phase.value = 'loading'
  errorMessage.value = ''
  profileRole.value = null

  try {
    const response = await axios.get(PROFILE_URL, {
      headers: await authenticatedHeaders()
    })
    if (version !== requestVersion) return
    // An existing MongoDB profile is authoritative, including its saved role.
    profileRole.value = roleFromResponse(response)
    clearPendingRegistrationRole()
  } catch (error) {
    if (!error.response || error.response.status !== 404) {
      if (version !== requestVersion) return
      errorMessage.value = messageFor(error, 'check')
      phase.value = 'error'
      return
    }

    // The pending choice survives a redirect even if Clerk's initial metadata
    // was captured before the user selected Business.
    let role = getPendingRegistrationRole()
    if (role === null || role === undefined) {
      role = clerkUser.unsafeMetadata
        ? clerkUser.unsafeMetadata.rescuebite_role_intent
        : undefined
    }
    if (role !== 'CONSUMER' && role !== 'BUSINESS') {
      if (version !== requestVersion) return
      errorMessage.value = 'Your registration account type is missing. Please ask the RescueBite team for help.'
      phase.value = 'error'
      return
    }

    if (version !== requestVersion) return
    phase.value = 'saving'

    try {
      const response = await axios.post(
        PROFILE_URL,
        { display_name: displayNameFor(clerkUser), role },
        { headers: await authenticatedHeaders() }
      )
      if (roleFromResponse(response) !== role) {
        throw new Error('The saved profile role does not match your registration choice.')
      }
      if (version !== requestVersion) return
      profileRole.value = response.data.user.role
    } catch (createError) {
      if (createError.response && createError.response.status === 409) {
        // Another tab may have created the profile after our first lookup.
        try {
          const response = await axios.get(PROFILE_URL, {
            headers: await authenticatedHeaders()
          })
          if (version !== requestVersion) return
          profileRole.value = roleFromResponse(response)
        } catch (lookupError) {
          if (version !== requestVersion) return
          errorMessage.value = messageFor(lookupError, 'check')
          phase.value = 'error'
          return
        }
      } else {
        if (version !== requestVersion) return
        errorMessage.value = messageFor(createError, 'create')
        phase.value = 'error'
        return
      }
    }
    if (version !== requestVersion) return
    clearPendingRegistrationRole()
  }

  if (!homeRouteForRole(profileRole.value)) {
    errorMessage.value = 'No home page is configured for this account role.'
    phase.value = 'error'
    return
  }

  if (version === requestVersion) phase.value = 'ready'
}

function retry() {
  if (user.value) checkProfile(user.value)
}

watch([authLoaded, isSignedIn, userLoaded, user], ([loaded, signedIn, loadedUser, clerkUser]) => {
  if (!loaded) return
  if (!signedIn) {
    ++requestVersion
    checkedUserId = null
    phase.value = 'loading'
    profileRole.value = null
    router.replace({ name: 'login' })
    return
  }
  if (!loadedUser || !clerkUser || checkedUserId === clerkUser.id) return

  checkedUserId = clerkUser.id
  checkProfile(clerkUser)
}, { immediate: true })

watch([phase, profileRole, () => route.name, () => route.meta.requiredRole], ([currentPhase, role]) => {
  if (currentPhase !== 'ready') return
  if (route.name !== 'auth-complete' && canAccessRoute(role, route.meta.requiredRole)) return

  const homeRoute = homeRouteForRole(role)
  if (homeRoute) router.replace({ name: homeRoute })
}, { immediate: true })
</script>

<template>
  <slot v-if="canShowPage" />

  <main v-else class="profile-gate container-xxl px-4 py-5">
    <div class="profile-card p-4 p-md-5" aria-live="polite">
      <template v-if="phase === 'loading' || phase === 'saving' || phase === 'ready'">
        <p class="rb-script rb-kicker fs-3">one moment</p>
        <p class="rb-display display-6 gate-title">
          {{ phase === 'saving' ? 'Creating your profile' : phase === 'ready' ? 'Taking you home' : 'Checking your profile' }}
        </p>
        <p class="rb-label mt-3">
          {{ phase === 'saving' ? 'Creating your RescueBite profile…' : phase === 'ready' ? 'Taking you to your home page…' : 'Checking your RescueBite profile…' }}
        </p>
      </template>
      <div v-else>
        <h1 class="rb-display display-6 gate-title">Profile setup could not finish</h1>
        <p class="rb-note error mt-3" role="alert">{{ errorMessage }}</p>
        <button type="button" class="rb-pill rb-pill-dark mt-4" @click="retry">Try again</button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.profile-gate {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 70vh;
}

.profile-card {
  width: 100%;
  max-width: 480px;
  border: 1px solid #ddd9c5;
  border-radius: 28px;
  background-color: #f6f4ed;
}

.gate-title {
  margin: 4px 0 0;
  line-height: 1.05;
}
</style>
