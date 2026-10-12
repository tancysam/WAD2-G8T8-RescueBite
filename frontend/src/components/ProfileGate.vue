<script setup>
import { ref, watch } from 'vue'
import { useAuth, useUser } from '@clerk/vue'
import { useRouter } from 'vue-router'
import { useAuthenticatedApi } from '../api/useAuthenticatedApi.js'

const router = useRouter()
const { isLoaded: authLoaded, isSignedIn } = useAuth()
const { isLoaded: userLoaded, user } = useUser()
const api = useAuthenticatedApi()

const phase = ref('loading')
const errorMessage = ref('')
let checkedUserId = null
let requestVersion = 0

function displayNameFor(clerkUser) {
  const name = [clerkUser.fullName, clerkUser.username, clerkUser.firstName]
    .find((value) => typeof value === 'string' && value.trim())
  return name?.trim() || 'RescueBite member'
}

function messageFor(error, action) {
  if (error.response?.status === 401) {
    return 'Your session could not be verified. Please sign out and sign in again.'
  }
  if (error.code === 'ERR_NETWORK') {
    return 'Cannot connect to the RescueBite server. Please check that it is running and try again.'
  }
  if (error.response?.data?.error) return error.response.data.error
  return `Unable to ${action} your profile. Please try again.`
}

async function checkProfile(clerkUser) {
  const version = ++requestVersion
  phase.value = 'loading'
  errorMessage.value = ''

  try {
    await api.get('/users/me')
  } catch (error) {
    if (error.response?.status !== 404) {
      if (version !== requestVersion) return
      errorMessage.value = messageFor(error, 'check')
      phase.value = 'error'
      return
    }

    const role = clerkUser.unsafeMetadata?.rescuebite_role_intent
    if (role !== 'CONSUMER' && role !== 'BUSINESS') {
      if (version !== requestVersion) return
      errorMessage.value = 'Your registration account type is missing. Please ask the RescueBite team for help.'
      phase.value = 'error'
      return
    }

    if (version !== requestVersion) return
    phase.value = 'saving'

    try {
      await api.post('/users/me', {
        display_name: displayNameFor(clerkUser),
        role
      })
    } catch (createError) {
      if (createError.response?.status === 409) {
        // Another tab may have created the profile after our first lookup.
        try {
          await api.get('/users/me')
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
    router.replace({ name: 'login' })
    return
  }
  if (!loadedUser || !clerkUser || checkedUserId === clerkUser.id) return

  checkedUserId = clerkUser.id
  checkProfile(clerkUser)
}, { immediate: true })
</script>

<template>
  <slot v-if="phase === 'ready'" />

  <main v-else class="profile-gate">
    <div class="profile-card" aria-live="polite">
      <p v-if="phase === 'loading' || phase === 'saving'">
        {{ phase === 'saving' ? 'Creating your RescueBite profile…' : 'Checking your RescueBite profile…' }}
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
