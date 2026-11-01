<script setup>
import { computed, ref, watch } from 'vue'
import { SignIn, SignUp, useAuth } from '@clerk/vue'
import { useRoute, useRouter } from 'vue-router'
import {
  clearPendingRegistrationRole,
  getPendingRegistrationRole,
  setPendingRegistrationRole
} from '../registrationRole.js'

const route = useRoute()
const router = useRouter()
const { isLoaded, isSignedIn } = useAuth()

const isLegacyRegisterUrl = computed(() => route.path === '/' && route.query.mode === 'register')
const mode = computed(() => route.name === 'register' || isLegacyRegisterUrl.value ? 'register' : 'login')
const pendingRole = getPendingRegistrationRole()
const registerRole = ref(pendingRole === null || pendingRole === undefined ? 'CONSUMER' : pendingRole)

const registrationMetadata = computed(() => ({ rescuebite_role_intent: registerRole.value }))

function selectMode(nextMode) {
  router.push({ name: nextMode })
}

function selectRole(role) {
  registerRole.value = role
  setPendingRegistrationRole(role)
}

watch(mode, (currentMode) => {
  if (currentMode === 'register') {
    setPendingRegistrationRole(registerRole.value)
  } else {
    clearPendingRegistrationRole()
  }
}, { immediate: true })

watch(isLegacyRegisterUrl, (legacyUrl) => {
  if (legacyUrl) router.replace({ name: 'register', hash: route.hash })
}, { immediate: true })

watch([isLoaded, isSignedIn], ([loaded, signedIn]) => {
  if (loaded && signedIn) router.replace({ name: 'auth-complete' })
}, { immediate: true })
</script>

<template>
  <main class="auth-page">
    <header class="auth-header px-3 px-lg-4">
      <RouterLink to="/" class="logo fs-2">RescueBite<span class="logo-dot rb-dot">.</span></RouterLink>
      <RouterLink to="/" class="rb-label back-link">← Back to home</RouterLink>
    </header>

    <div class="row g-0 auth-body">
      <section class="col-lg-6 brand-panel p-4 p-md-5" aria-hidden="true">
        <p class="rb-script rb-kicker fs-3 brand-script">{{ mode === 'login' ? 'welcome back' : 'good to meet you' }}</p>
        <p class="rb-display display-1 brand-title">
          {{ mode === 'login' ? 'Back for' : 'Make every' }}<br />{{ mode === 'login' ? 'more?' : 'bite count.' }}
        </p>
      </section>

      <section class="col-lg-6 form-panel p-4 p-md-5" aria-label="Log in or register">
        <div class="form-inner">
          <div class="auth-tabs" role="tablist" aria-label="Account access">
            <button
              id="login-tab"
              type="button"
              role="tab"
              aria-controls="auth-form"
              :aria-selected="mode === 'login'"
              :class="{ active: mode === 'login' }"
              @click="selectMode('login')"
            >Log in</button>
            <button
              id="register-tab"
              type="button"
              role="tab"
              aria-controls="auth-form"
              :aria-selected="mode === 'register'"
              :class="{ active: mode === 'register' }"
              @click="selectMode('register')"
            >Register</button>
          </div>

          <Transition name="slide-down">
            <div v-if="mode === 'register'" class="role-section">
              <div class="row g-3" role="group" aria-label="I’m here as a">
                <div class="col-6">
                  <button
                    type="button"
                    class="role-option"
                    :class="{ selected: registerRole === 'CONSUMER' }"
                    :aria-pressed="registerRole === 'CONSUMER'"
                    @click="selectRole('CONSUMER')"
                  >
                    <svg aria-hidden="true" width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="14" cy="9" r="4"></circle><path d="M5.5 23c.4-5 3.5-7.5 8.5-7.5s8.1 2.5 8.5 7.5"></path></svg>
                    <span class="rb-display role-name">Consumer</span>
                    <span class="role-copy">Rescue good food</span>
                  </button>
                </div>
                <div class="col-6">
                  <button
                    type="button"
                    class="role-option"
                    :class="{ selected: registerRole === 'BUSINESS' }"
                    :aria-pressed="registerRole === 'BUSINESS'"
                    @click="selectRole('BUSINESS')"
                  >
                    <svg aria-hidden="true" width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 11h20l-2-5H6l-2 5ZM6 11v12h16V11M11 23v-7h6v7"></path></svg>
                    <span class="rb-display role-name">Business</span>
                    <span class="role-copy">Share your surplus</span>
                  </button>
                </div>
              </div>
            </div>
          </Transition>

          <div
            id="auth-form"
            class="clerk-form"
            role="tabpanel"
            :aria-labelledby="mode === 'login' ? 'login-tab' : 'register-tab'"
          >
            <p v-if="isLegacyRegisterUrl || !isLoaded" class="rb-label py-4">Loading secure sign in…</p>
            <SignIn
              v-else-if="mode === 'login'"
              routing="path"
              path="/login"
              force-redirect-url="/auth/complete"
              sign-up-url="/register"
              sign-up-force-redirect-url="/auth/complete"
            />
            <SignUp
              v-else
              :key="registerRole"
              routing="path"
              path="/register"
              force-redirect-url="/auth/complete"
              sign-in-url="/login"
              sign-in-force-redirect-url="/auth/complete"
              :unsafe-metadata="registrationMetadata"
            />
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.auth-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: #fbf9f1;
}

.auth-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #ddd9c5;
}

.logo {
  color: #000;
  font-family: 'Anton', Impact, sans-serif;
  line-height: 1;
  text-decoration: none;
  text-transform: uppercase;
}

.logo-dot {
  color: #f4b30c;
}

.back-link {
  color: #191200;
  text-decoration: none;
  transition: color .25s;
}

.back-link:hover {
  color: #8a6200;
}

.auth-body {
  flex: 1;
}

.brand-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  color: #000;
  background-color: #f4b30c;
}

.brand-script {
  color: #000;
  line-height: 1.1;
}

.brand-title {
  margin-top: 8px;
  line-height: .92;
}



.form-panel {
  display: flex;
  justify-content: center;
}

.form-inner {
  width: 100%;
  max-width: 440px;
}

.auth-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 140px;
  background-color: #e8e6d7;
}

.auth-tabs button {
  flex: 1;
  min-height: 44px;
  border: 0;
  border-radius: 140px;
  color: #191200;
  background-color: transparent;
  font-family: 'Archivo', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: .06em;
  text-transform: uppercase;
  transition: background-color .25s, color .25s;
}

.auth-tabs button.active {
  color: #f4b30c;
  background-color: #000;
}

.role-section {
  margin-top: 24px;
}


.role-option {
  display: block;
  width: 100%;
  height: 100%;
  padding: 18px;
  border: 2px solid #ddd9c5;
  border-radius: 28px;
  color: #000;
  background-color: transparent;
  text-align: left;
  transition: border-color .25s, background-color .25s;
}

.role-option.selected {
  border-color: #f4b30c;
  background-color: #f6f4ed;
}

.role-name {
  display: block;
  margin-top: 12px;
  font-size: 24px;
  line-height: 26px;
}

.role-copy {
  display: block;
  margin-top: 4px;
  color: #5f5330;
  font-size: 14px;
  line-height: 20px;
}


.clerk-form {
  display: flex;
  justify-content: center;
  min-height: 340px;
  padding-top: 24px;
}
</style>
