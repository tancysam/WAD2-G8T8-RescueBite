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

  <main v-else class="profile-gate">
    <div class="profile-card" aria-live="polite">
      <p v-if="phase === 'loading' || phase === 'saving' || phase === 'ready'">
        {{ phase === 'saving' ? 'Creating your RescueBite profile…' : phase === 'ready' ? 'Taking you to your home page…' : 'Checking your RescueBite profile…' }}
      </p>
      <div v-else>
        <h1>Profile setup could not finish</h1>
        <p role="alert">{{ errorMessage }}</p>
        <button type="button" @click="retry">Try again</button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.profile-gate { display: grid; min-height: calc(100svh - 72px); place-items: center; padding: 32px 20px; background: #faf8f1; }
.profile-card { width: min(100%, 440px); padding: 28px; border: 1px solid #e4e9df; border-radius: 20px; background: white; color: #173d2c; }
.profile-card h1 { margin: 0 0 8px; font-size: 26px; }
.profile-card p { color: #586d5e; line-height: 1.5; }
.profile-card button { width: fit-content; margin-top: 12px; padding: 11px 20px; border: 0; border-radius: 9px; background: #1c6a49; color: white; font: inherit; font-weight: 700; cursor: pointer; }
</style>
