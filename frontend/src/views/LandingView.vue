<script setup>
import { computed, ref, watch } from 'vue'
import { SignIn, SignUp, useAuth } from '@clerk/vue'
import { useRoute, useRouter } from 'vue-router'
import rescueJourney from '../assets/rescue-journey.svg'

const route = useRoute()
const router = useRouter()
const { isLoaded, isSignedIn } = useAuth()

const mode = computed(() => route.query.mode === 'register' ? 'register' : 'login')
const loginRole = ref('CONSUMER')
const registerRole = ref('CONSUMER')
const selectedRole = computed(() => mode.value === 'register' ? registerRole.value : loginRole.value)

// This records the registration choice with Clerk. The backend must still
// validate and create the MongoDB role during the later profile setup step.
const registrationMetadata = computed(() => ({ rescuebite_role_intent: registerRole.value }))

const clerkAppearance = {
  variables: {
    colorPrimary: '#1c6a49',
    colorText: '#173d2c',
    borderRadius: '12px',
    fontFamily: 'DM Sans, sans-serif'
  },
  elements: {
    rootBox: { width: '100%' },
    cardBox: { width: '100%', boxShadow: 'none' },
    card: { width: '100%', boxShadow: 'none' },
    header: { display: 'none' }
  }
}

function selectMode(nextMode) {
  router.replace({
    name: 'landing',
    query: nextMode === 'register' ? { mode: 'register' } : {}
  })
}

function selectRole(role) {
  if (mode.value === 'register') {
    registerRole.value = role
  } else {
    loginRole.value = role
  }
}

watch([isLoaded, isSignedIn], ([loaded, signedIn]) => {
  if (loaded && signedIn) router.replace('/businesses')
}, { immediate: true })
</script>

<template>
  <main class="landing">
    <section class="story-pane" aria-labelledby="story-title">
      <div class="brand" aria-label="RescueBite">
        <span class="brand-mark" aria-hidden="true">✳</span>
        <span>RescueBite<span class="brand-dot">.</span></span>
      </div>

      <div class="story-content">
        <span class="eyebrow"><span class="eyebrow-dot"></span> GOOD FOOD, SECOND CHANCES</span>
        <h1 id="story-title">Make every<br /><em>bite count.</em></h1>
        <p class="story-description">
          Discover good food from nearby businesses before it goes to waste.
          Save more, enjoy more, and give every meal a better ending.
        </p>

        <div class="journey-visual">
          <img
            :src="rescueJourney"
            alt="A local food shop shares a bag of good food for a neighbor to pick up"
          />
        </div>

        <div class="journey-steps" aria-label="How RescueBite works">
          <div><span>01</span><strong>Discover</strong><small>Find food nearby</small></div>
          <div><span>02</span><strong>Rescue</strong><small>Claim what you love</small></div>
          <div><span>03</span><strong>Enjoy</strong><small>Pick up locally</small></div>
        </div>
      </div>

      <p class="story-footer">Less waste. More to share.</p>
    </section>

    <section class="auth-pane" aria-labelledby="auth-heading">
      <div class="auth-inner">
        <div class="auth-intro">
          <span class="auth-eyebrow">WELCOME TO RESCUEBITE</span>
          <h2 id="auth-heading">{{ mode === 'login' ? 'Good to have you back.' : 'Join the food rescue.' }}</h2>
          <p>{{ mode === 'login' ? 'Sign in to continue making a difference.' : 'Create an account and start saving good food.' }}</p>
        </div>

        <div class="auth-panel">
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

          <div class="role-section">
            <p class="field-label">I’m here as a</p>
            <div class="role-options" role="group" aria-label="Choose account type">
              <button
                type="button"
                class="role-option"
                :class="{ selected: selectedRole === 'CONSUMER' }"
                :aria-pressed="selectedRole === 'CONSUMER'"
                @click="selectRole('CONSUMER')"
              >
                <span class="role-icon" aria-hidden="true">
                  <svg viewBox="0 0 28 28" fill="none"><circle cx="14" cy="9" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 23c.4-5 3.5-7.5 8.5-7.5s8.1 2.5 8.5 7.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                </span>
                <span><strong>Consumer</strong><small>Rescue good food</small></span>
              </button>
              <button
                type="button"
                class="role-option"
                :class="{ selected: selectedRole === 'BUSINESS' }"
                :aria-pressed="selectedRole === 'BUSINESS'"
                @click="selectRole('BUSINESS')"
              >
                <span class="role-icon" aria-hidden="true">
                  <svg viewBox="0 0 28 28" fill="none"><path d="M4 11h20l-2-5H6l-2 5ZM6 11v12h16V11M10 23v-8h8v8" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M4 11v2a3 3 0 0 0 6 0v-2m0 0v2a3 3 0 0 0 6 0v-2m0 0v2a3 3 0 0 0 6 0v-2" stroke="currentColor" stroke-width="1.8"/></svg>
                </span>
                <span><strong>Business</strong><small>Share your surplus</small></span>
              </button>
            </div>
            <p class="role-note" v-if="mode === 'login'">
              Your existing account role determines what you can access after login.
            </p>
            <p class="role-note" v-else>
              Your choice is saved with registration. Account access is confirmed during profile setup.
            </p>
          </div>

          <div
            id="auth-form"
            class="clerk-form"
            role="tabpanel"
            :aria-labelledby="mode === 'login' ? 'login-tab' : 'register-tab'"
          >
            <p v-if="!isLoaded" class="loading-message">Loading secure sign in…</p>
            <SignIn
              v-else-if="mode === 'login'"
              routing="hash"
              force-redirect-url="/businesses"
              sign-up-url="/?mode=register"
              sign-up-force-redirect-url="/businesses"
              :appearance="clerkAppearance"
            />
            <SignUp
              v-else
              routing="hash"
              force-redirect-url="/businesses"
              sign-in-url="/?mode=login"
              sign-in-force-redirect-url="/businesses"
              :unsafe-metadata="registrationMetadata"
              :appearance="clerkAppearance"
            />
          </div>
        </div>

        <p class="auth-footer">Every rescue starts with one good choice.</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.landing { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(450px, .92fr); min-height: 100svh; }
.story-pane { display: flex; flex-direction: column; min-width: 0; padding: 34px clamp(28px, 5vw, 88px) 28px; color: #f8f8ec; background: #154a36; overflow: hidden; }
.brand { display: inline-flex; align-items: center; gap: 10px; width: fit-content; font-family: 'Outfit', sans-serif; font-size: 25px; font-weight: 700; letter-spacing: -.04em; }
.brand-mark { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 11px; background: #d0e77e; color: #184633; font-size: 29px; line-height: 1; }
.brand-dot { color: #d0e77e; }
.story-content { width: 100%; max-width: 650px; margin: 52px 0 34px; }
.eyebrow, .auth-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .17em; }
.eyebrow { display: inline-flex; align-items: center; gap: 10px; color: #d5e8ac; }
.eyebrow-dot { width: 7px; height: 7px; border-radius: 50%; background: #e7bc75; }
h1 { margin: 18px 0 15px; font-size: clamp(56px, 5.2vw, 84px); line-height: .98; font-weight: 700; letter-spacing: -.055em; }
h1 em { color: #d0e77e; font-style: normal; }
.story-description { max-width: 510px; color: #d5e4d7; font-size: 16px; line-height: 1.65; }
.journey-visual { position: relative; display: grid; place-items: center; height: clamp(230px, 26vw, 320px); margin-top: 24px; border-radius: 28px; background: #f5f0d9; overflow: hidden; }
.journey-visual img { display: block; width: 100%; max-width: 640px; height: 100%; object-fit: contain; }
.journey-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding-top: 25px; }
.journey-steps div { display: grid; grid-template-columns: auto 1fr; column-gap: 10px; align-items: baseline; }
.journey-steps span { grid-row: span 2; color: #d0e77e; font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 700; }
.journey-steps strong { font-size: 13px; font-weight: 700; }
.journey-steps small { color: #b8d2be; font-size: 11px; }
.story-footer { margin: auto 0 0; color: #a9c9b1; font-size: 12px; letter-spacing: .04em; }
.auth-pane { display: grid; place-items: center; min-width: 0; padding: 52px clamp(24px, 5vw, 74px); background: #faf8f1; }
.auth-inner { width: min(100%, 480px); }
.auth-intro { margin-bottom: 24px; }
.auth-eyebrow { color: #6f987a; }
h2 { margin: 8px 0 5px; color: #163f2d; font-size: clamp(30px, 2.8vw, 42px); line-height: 1.13; font-weight: 700; letter-spacing: -.04em; }
.auth-intro p { margin: 0; color: #6c7b70; font-size: 14px; line-height: 1.6; }
.auth-panel { padding: 25px 28px 22px; border: 1px solid #e4e9df; border-radius: 26px; background: #fff; box-shadow: 0 20px 60px rgba(32, 67, 43, .07); }
.auth-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: 14px; background: #f1f4ed; }
.auth-tabs button { min-height: 42px; border: 0; border-radius: 11px; color: #76877b; background: transparent; font-size: 14px; font-weight: 700; }
.auth-tabs button.active { color: #173e2c; background: #fff; box-shadow: 0 2px 7px rgba(29, 62, 38, .09); }
.auth-tabs button:focus-visible, .role-option:focus-visible { outline: 3px solid #96c968; outline-offset: 2px; }
.role-section { padding: 24px 0 18px; border-bottom: 1px solid #e9eee8; }
.field-label { margin: 0 0 10px; color: #314f3d; font-size: 13px; font-weight: 700; }
.role-options { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.role-option { display: flex; align-items: center; gap: 10px; min-width: 0; min-height: 72px; padding: 10px; border: 1.5px solid #dde6dd; border-radius: 13px; color: #4d6857; background: #fff; text-align: left; }
.role-option.selected { border-color: #277650; background: #f1f8ef; color: #1b593b; }
.role-option > span:last-child { min-width: 0; }
.role-option strong, .role-option small { display: block; }
.role-option strong { color: #244b36; font-size: 13px; }
.role-option small { margin-top: 3px; color: #7b8c80; font-size: 11px; white-space: nowrap; }
.role-icon { display: grid; flex: 0 0 34px; place-items: center; width: 34px; height: 34px; border-radius: 9px; background: #eef4e9; }
.role-icon svg { width: 22px; height: 22px; }
.role-note { margin: 10px 0 0; color: #849087; font-size: 11px; line-height: 1.45; }
.clerk-form { min-height: 340px; padding-top: 18px; }
.loading-message { padding: 28px 0; color: #6c7b70; font-size: 13px; }
.auth-footer { margin: 20px 0 0; color: #93a198; font-size: 12px; text-align: center; }
@media (max-width: 1050px) {
  .landing { grid-template-columns: minmax(0, 1fr) minmax(420px, .9fr); }
  .story-pane { padding-inline: 32px; }
  .journey-steps { gap: 5px; }
  .journey-steps div { column-gap: 5px; }
}
@media (max-width: 800px) {
  .landing { display: block; }
  .story-pane { padding: 25px 30px 30px; }
  .story-content { max-width: 650px; margin: 44px 0 24px; }
  h1 { font-size: clamp(50px, 9vw, 72px); }
  .journey-visual { height: 300px; }
  .auth-pane { padding: 52px 24px 60px; }
}
@media (max-width: 520px) {
  .story-pane { padding: 22px 20px 26px; }
  .story-content { margin-top: 34px; }
  h1 { font-size: 49px; }
  .story-description { font-size: 14px; }
  .journey-visual { height: 225px; margin-top: 24px; border-radius: 20px; }
  .journey-steps { gap: 7px; padding-top: 18px; }
  .journey-steps div { display: block; }
  .journey-steps span { display: block; margin-bottom: 3px; }
  .journey-steps strong { display: block; font-size: 12px; }
  .journey-steps small { display: block; font-size: 10px; }
  .auth-pane { padding: 43px 15px 52px; }
  .auth-panel { padding: 20px 14px; border-radius: 20px; }
  .role-option { gap: 6px; padding: 8px 6px; }
  .role-icon { flex-basis: 29px; width: 29px; height: 29px; }
  .role-option strong { font-size: 12px; }
  .role-option small { font-size: 10px; }
}
</style>
