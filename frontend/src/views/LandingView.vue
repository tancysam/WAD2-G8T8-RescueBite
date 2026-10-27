<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { API_URL } from '@/config'
import CustomerListingCard from '../components/listings/CustomerListingCard.vue'
import DisplayHeading from '../components/DisplayHeading.vue'
import { setPendingRegistrationRole } from '../registrationRole.js'

const router = useRouter()

const listings = ref([])
const openFaq = ref(0)

const faqs = [
  { q: 'What is a rescue bundle?', a: 'A bag of surplus items a business puts together near closing time. The listing shows what is typically inside, the rescue price and how many are left.' },
  { q: 'How do I collect my food?', a: 'Go to the pickup address during the collection window and open My Orders. Show your collection QR at the counter and staff scan it to confirm.' },
  { q: 'What if I can’t make it?', a: 'Cancel from My Orders before the window closes so the food can go to someone else. Reservations that are not collected expire when the window ends.' },
  { q: 'Who can list food?', a: 'Any food business: bakeries, cafés, restaurants, hawker stalls and grocers. Register a business profile, then create listings from your dashboard.' }
]

const steps = [
  { number: '01', title: 'Discover', copy: 'Open the map to see bakeries, cafés and stalls near you with surplus food listed for today.' },
  { number: '02', title: 'Rescue', copy: 'Reserve a single item or a rescue bundle at its rescue price. Your portion is held until the collection window closes.' },
  { number: '03', title: 'Enjoy', copy: 'Show your collection QR at the counter, take your food home, and leave the shop a review.' }
]

const bandWords = ['Bakeries', 'save good food', 'Cafés', 'before it’s gone', 'Hawker stalls', 'every bite counts', 'Grocers', 'less waste']

function toggleFaq(index) {
  openFaq.value = openFaq.value === index ? -1 : index
}

// Open registration with the account type already chosen
function startRegister(role) {
  setPendingRegistrationRole(role)
  router.push({ name: 'register' })
}

// A few of today's listings for the landing page
async function getTodaysListings() {
  try {
    const response = await axios.get(`${API_URL}/listings`, { params: { limit: 3 } })
    listings.value = (response.data.listings || []).slice(0, 3)
  } catch (error) {
    console.error('Error fetching listings:', error)
    listings.value = []
  }
}

onMounted(getTodaysListings)
</script>

<template>
  <main class="landing">
    <header class="landing-header">
      <RouterLink to="/" class="logo">RescueBite<span class="logo-dot">.</span></RouterLink>
      <nav class="nav-links d-none d-lg-flex" aria-label="Primary">
        <a href="#how">How it works</a>
        <a href="#rescues">Today’s rescues</a>
        <a href="#business">For businesses</a>
        <a href="#faq">FAQ</a>
      </nav>
      <div class="d-flex flex-wrap align-items-center gap-3">
        <RouterLink :to="{ name: 'login' }" class="rb-pill rb-pill-line rb-pill-sm">Log in</RouterLink>
        <RouterLink :to="{ name: 'register' }" class="rb-pill rb-pill-dark rb-pill-sm">Get started</RouterLink>
      </div>
    </header>

    <!-- Hero and sign in -->
    <section class="container-xxl px-4 py-5 hero">
      <div class="row g-5 align-items-start">
        <div class="col-lg-7">
          <p class="rb-script rb-kicker fs-3">before it’s gone</p>
          <DisplayHeading :size="128">Make every<br />bite count.</DisplayHeading>
          <p class="hero-copy">
            Discover good food from nearby bakeries, cafés and hawker stalls before it goes to waste.
            Reserve it at a rescue price, pick it up on your way home, and give every meal a better ending.
          </p>
          <div class="d-flex flex-wrap gap-3 mt-5">
            <RouterLink to="/explore" class="rb-pill rb-pill-dark">
              Find food nearby
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>
            </RouterLink>
            <button type="button" class="rb-pill rb-pill-line" @click="startRegister('BUSINESS')">List your surplus</button>
          </div>
        </div>

        <div class="col-lg-5">
          <section class="start-card ms-lg-auto p-4 p-md-5" aria-labelledby="start-heading">
            <h2 id="start-heading" class="rb-display display-6 start-title">How do you want to help?</h2>

            <div class="d-flex flex-column gap-3 mt-4">
              <button type="button" class="start-option" @click="startRegister('CONSUMER')">
                <svg aria-hidden="true" width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="14" cy="9" r="4"></circle><path d="M5.5 23c.4-5 3.5-7.5 8.5-7.5s8.1 2.5 8.5 7.5"></path></svg>
                <span class="flex-grow-1">
                  <span class="rb-display option-name">Rescue food</span>
                  <span class="option-copy">Reserve surplus food near you at a rescue price.</span>
                </span>
                <span class="rb-mono option-arrow" aria-hidden="true">→</span>
              </button>
              <button type="button" class="start-option" @click="startRegister('BUSINESS')">
                <svg aria-hidden="true" width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 11h20l-2-5H6l-2 5ZM6 11v12h16V11M11 23v-7h6v7"></path></svg>
                <span class="flex-grow-1">
                  <span class="rb-display option-name">List surplus</span>
                  <span class="option-copy">Sell what’s left at closing instead of throwing it out.</span>
                </span>
                <span class="rb-mono option-arrow" aria-hidden="true">→</span>
              </button>
            </div>

            <p class="member-line">
              Already a member?
              <RouterLink :to="{ name: 'login' }">Log in</RouterLink>
            </p>
          </section>
        </div>
      </div>
    </section>

    <!-- Drip into the yolk section -->
    <div class="wave wave-into-yolk" aria-hidden="true">
      <svg width="100%" height="90" viewBox="0 0 1440 90" preserveAspectRatio="none"><path fill="#fbf9f1" d="M0 0H1440V36C1400 36 1392 50 1356 50C1330 50 1324 40 1290 40C1290 62 1286 80 1276 80C1266 80 1262 62 1262 40C1220 40 1200 30 1150 30C1100 30 1090 46 1010 46C1010 70 1004 86 994 86C984 86 978 70 978 46C930 46 900 32 840 32C790 32 780 44 740 44C700 44 690 34 600 34C600 54 596 66 588 66C580 66 576 54 576 34C520 34 500 48 440 48C400 48 390 36 300 36C300 64 294 84 284 84C274 84 268 64 268 36C220 36 200 46 150 46C100 46 90 34 40 34C20 34 10 36 0 36Z"></path></svg>
    </div>

    <section id="how" class="how">
      <div class="container-xxl px-4 pt-4 pb-5 how-inner">
        <div class="d-flex flex-wrap align-items-end justify-content-between gap-4">
          <div>
            <p class="rb-script rb-kicker fs-3 how-script">it’s simple</p>
            <h2 class="rb-display display-2 how-title">How it<br />works</h2>
          </div>
        </div>
        <div class="row g-5 mt-4">
          <div v-for="step in steps" :key="step.number" class="col-md-4">
            <div class="step">
              <p class="rb-display display-1 step-big" aria-hidden="true">{{ step.number }}</p>
              <h3 class="rb-display display-6 step-title">{{ step.title }}</h3>
              <p class="step-copy">{{ step.copy }}</p>
            </div>
          </div>
        </div>
      </div>
      <div class="band text-nowrap" aria-hidden="true">
        <template v-for="(word, index) in bandWords" :key="word">
          <span :class="index % 2 === 0 ? 'band-word' : 'band-script'">{{ word }}</span>
          <span class="band-dot"></span>
        </template>
      </div>
    </section>

    <div class="wave" aria-hidden="true">
      <svg width="100%" height="90" viewBox="0 0 1440 90" preserveAspectRatio="none"><path fill="#f4b30c" d="M0 0H1440V36C1400 36 1392 50 1356 50C1330 50 1324 40 1290 40C1290 62 1286 80 1276 80C1266 80 1262 62 1262 40C1220 40 1200 30 1150 30C1100 30 1090 46 1010 46C1010 70 1004 86 994 86C984 86 978 70 978 46C930 46 900 32 840 32C790 32 780 44 740 44C700 44 690 34 600 34C600 54 596 66 588 66C580 66 576 54 576 34C520 34 500 48 440 48C400 48 390 36 300 36C300 64 294 84 284 84C274 84 268 64 268 36C220 36 200 46 150 46C100 46 90 34 40 34C20 34 10 36 0 36Z"></path></svg>
    </div>

    <!-- Today's rescues -->
    <section id="rescues" class="container-xxl px-4 py-5 section">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-4">
        <div>
          <p class="rb-script rb-kicker fs-3">don’t miss</p>
          <h2 class="rb-display display-3">Today’s rescues</h2>
        </div>
        <RouterLink to="/explore" class="rb-pill rb-pill-dark">Check the map</RouterLink>
      </div>
      <div v-if="listings.length > 0" class="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-4 mt-4">
        <div v-for="(listing, index) in listings" :key="listing._id" class="col d-flex">
          <CustomerListingCard class="w-100" :listing="listing" :index="index" />
        </div>
      </div>
      <p v-else class="empty-state mt-4">New rescues are listed every evening. Sign in to see what’s near you.</p>
    </section>

    <!-- For businesses -->
    <section id="business" class="business">
      <div class="container-xxl px-4 py-5 section">
        <div class="row g-5 align-items-center">
          <div class="col-lg-6">
            <p class="rb-script rb-kicker fs-3 yolk-script">for businesses</p>
            <h2 class="rb-display display-2 light">Turn surplus<br />into revenue</h2>
            <p class="business-copy">
              List an item or a bundle in under a minute, set a collection window, and confirm every pickup
              by scanning the customer’s QR. Your dashboard keeps count of meals rescued, food saved and revenue recovered.
            </p>
            <button type="button" class="rb-pill rb-pill-yolk mt-4" @click="startRegister('BUSINESS')">Register your business</button>
          </div>
          <div class="col-lg-6">
            <div class="row g-3">
              <div class="col-12 col-sm-6"><div class="stat yolk-stat"><p class="rb-label">Meals rescued</p><p class="rb-display display-2 stat-value">128</p></div></div>
              <div class="col-12 col-sm-6"><div class="stat"><p class="rb-label">Food saved</p><p class="rb-display display-2 stat-value">64<span class="unit"> kg</span></p></div></div>
              <div class="col-12 col-sm-6"><div class="stat"><p class="rb-label">Revenue recovered</p><p class="rb-display display-4 stat-value">S$742</p></div></div>
              <div class="col-12 col-sm-6"><div class="stat"><p class="rb-label">Customer savings</p><p class="rb-display display-4 stat-value">S$1,186</p></div></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- FAQ -->
    <section id="faq" class="container-xxl px-4 py-5 section">
      <div class="row g-5">
        <div class="col-lg-4">
          <p class="rb-script rb-kicker fs-3">asked often</p>
          <h2 class="rb-display display-3">Good<br />questions</h2>
        </div>
        <div class="col-lg-8 d-flex flex-column gap-3">
          <div v-for="(faq, index) in faqs" :key="faq.q" class="faq-row" :class="{ open: openFaq === index }">
            <button type="button" class="faq-question fs-2" :aria-expanded="openFaq === index" @click="toggleFaq(index)">
              {{ faq.q }}
              <span class="rb-mono faq-sign" aria-hidden="true">{{ openFaq === index ? '−' : '+' }}</span>
            </button>
            <p v-if="openFaq === index" class="faq-answer">{{ faq.a }}</p>
          </div>
        </div>
      </div>
    </section>

    <footer class="footer">
      <div class="container-xxl px-4 footer-inner">
        <div class="rb-mono footer-links d-flex flex-wrap justify-content-between gap-4">
          <nav aria-label="Footer" class="d-flex flex-column gap-1">
            <a href="#rescues">Today’s rescues</a>
            <a href="#business">For businesses</a>
          </nav>
          <nav aria-label="Help" class="d-flex flex-column gap-1">
            <a href="#how">How it works</a>
            <a href="#faq">FAQ</a>
            <RouterLink :to="{ name: 'login' }">Log in</RouterLink>
          </nav>
        </div>
        <p class="rb-display display-1 footer-logo d-xl-none" aria-hidden="true">RescueBite<span class="logo-dot">.</span></p>
        <p class="rb-display footer-logo footer-logo-xl d-none d-xl-block" aria-hidden="true">RescueBite<span class="logo-dot">.</span></p>
      </div>
    </footer>
  </main>
</template>

<style scoped>
.landing {
  overflow-x: hidden;
  color: #191200;
  background-color: #fbf9f1;
}

.landing-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px 32px;
  padding: 24px 32px;
  border-bottom: 1px solid #ddd9c5;
}

.logo {
  color: #000;
  font-family: 'Anton', Impact, sans-serif;
  font-size: 34px;
  line-height: 1;
  text-decoration: none;
  text-transform: uppercase;
}

.logo-dot {
  color: #f4b30c;
}

.nav-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 32px;
  font-family: 'DM Mono', ui-monospace, monospace;
  font-size: 14px;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.nav-links a {
  padding: 6px 0;
  border-bottom: 2px solid transparent;
  color: #191200;
  text-decoration: none;
  transition: border-color .25s;
}

.nav-links a:hover {
  border-bottom-color: #f4b30c;
}

/* Hero */


.hero-copy {
  max-width: 560px;
  margin: 32px 0 0;
  font-size: 18px;
  line-height: 30px;
}



/* "How do you want to help?" card */
.start-card {
  max-width: 480px;
  border: 1px solid #ddd9c5;
  border-radius: 28px;
  background-color: #f6f4ed;
}


.start-title {
  margin: 0;
  line-height: 1.1;
}

.start-option {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 18px 20px;
  border: 2px solid #ddd9c5;
  border-radius: 28px;
  color: #000;
  background-color: #fbf9f1;
  text-align: left;
  transition: border-color .25s, background-color .25s;
}

.start-option:hover,
.start-option:focus {
  border-color: #f4b30c;
  background-color: #fbf9f1;
}

.start-option svg {
  flex: 0 0 28px;
}

.option-name {
  display: block;
  font-size: 24px;
  line-height: 26px;
}

.option-copy {
  display: block;
  margin-top: 4px;
  color: #5f5330;
  font-size: 14px;
  line-height: 20px;
}

.option-arrow {
  font-size: 20px;
}

.member-line {
  margin: 24px 0 0;
  color: #5f5330;
  font-size: 15px;
  text-align: center;
}

.member-line a {
  color: #191200;
  font-weight: 700;
}

/* Dripping edges between sections */
.wave {
  margin-top: -1px;
  line-height: 0;
  background-color: #fbf9f1;
}

.wave-into-yolk {
  background-color: #f4b30c;
}

.wave svg {
  display: block;
}

/* How it works */
.how {
  overflow: hidden;
  color: #000;
  background-color: #f4b30c;
}

.how-title {
  line-height: .92;
}

.how-script {
  color: #000;
}


.step {
  padding-top: 24px;
  border-top: 2px solid #000;
}

.step-big {
  line-height: 1;
}

.step-title {
  margin: 16px 0 12px;
  line-height: 1.1;
}

.step-copy {
  max-width: 380px;
  margin: 0;
  font-size: 18px;
  line-height: 27px;
}

.band {
  display: flex;
  align-items: center;
  gap: 32px;
  margin-bottom: 48px;
  padding: 20px 40px;
  overflow: hidden;
  color: #f4b30c;
  background-color: #000;
}

.band-word {
  font-family: 'Anton', Impact, sans-serif;
  font-size: 40px;
  line-height: 1;
  text-transform: uppercase;
}

.band-script {
  color: #fbf9f1;
  font-family: 'Kaushan Script', cursive;
  font-size: 32px;
  line-height: 1;
}

.band-dot {
  flex: 0 0 14px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background-color: #f4b30c;
}

/* Shared section spacing */
.yolk-script {
  color: #f4b30c;
}

.empty-state {
  padding: 48px 32px;
  border-radius: 28px;
  color: #5f5330;
  background-color: #f6f4ed;
  text-align: center;
}

/* For businesses */
.business {
  color: #fbf9f1;
  background-color: #1a1200;
}

.light {
  color: #fbf9f1;
}

.business-copy {
  max-width: 520px;
  margin: 32px 0 0;
  color: #d6cfb4;
  font-size: 18px;
  line-height: 27px;
}

.stat {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 160px;
  height: 100%;
  padding: 24px;
  border: 1px solid #4a4120;
}

.stat .rb-label {
  color: #d6cfb4;
  font-size: 12px;
}

.yolk-stat {
  border-color: #f4b30c;
  color: #000;
  background-color: #f4b30c;
}

.yolk-stat .rb-label,
.yolk-stat .stat-value {
  color: #000;
}

.stat-value {
  margin: 0;
  color: #fbf9f1;
  line-height: 1;
}

.unit {
  font-size: .45em;
}


/* FAQ */
.faq-row {
  border-radius: 28px;
  background-color: #f6f4ed;
  transition: background-color .25s;
}

.faq-row.open {
  background-color: #f4b30c;
}

.faq-question {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  min-height: 72px;
  padding: 16px 24px;
  border: 0;
  color: #000;
  background: transparent;
  font-family: 'Anton', Impact, sans-serif;
  line-height: 1.1;
  text-align: left;
  text-transform: uppercase;
}

.faq-sign {
  font-size: 28px;
}

.faq-answer {
  max-width: 640px;
  margin: 0;
  padding: 0 24px 24px;
  color: #000;
  font-size: 18px;
  line-height: 27px;
}

/* Footer */
.footer {
  color: #fbf9f1;
  background-color: #1a1200;
}

.footer-inner {
  padding-top: 56px;
  padding-bottom: 40px;
}

.footer-links {
  font-size: 14px;
  line-height: 24px;
  letter-spacing: .04em;
  text-transform: uppercase;
}


.footer a {
  color: #f4b30c;
  text-decoration: none;
}

.footer a:hover {
  color: #fbf9f1;
}


.footer-logo {
  margin: 56px 0 0;
  color: #fbf9f1;
  line-height: .85;
}

.footer-logo-xl {
  font-size: 236px;
}
</style>
