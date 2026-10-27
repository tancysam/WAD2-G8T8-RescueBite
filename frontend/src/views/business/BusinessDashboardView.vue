<script setup>
import { ref, computed, onMounted } from 'vue'
import DisplayHeading from '@/components/DisplayHeading.vue'
import axios from 'axios'
import { useAuth } from '@clerk/vue'
import { API_URL } from '@/config'
import { collectionWindow, dayLabel, formatPrice, shortTime } from '../../formatters.js'

const { getToken } = useAuth()

const business = ref(null)
const businesses = ref([])
const selectedBusinessId = ref('')
const impact = ref(null)
const loading = ref(true)
const errorMessage = ref('')
const reservations = ref([])
const managedListings = ref([])
const chartReadout = ref('')

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function formatMoney(amount) {
  return 'S$' + amount.toFixed(2)
}

// Stat cards shown on the dashboard
const stats = computed(() => {
  if (impact.value === null) {
    return []
  }

  return [
    {
      label: 'Meals rescued',
      value: String(impact.value.mealsRescued),
      note: 'Items collected by customers (1 item = 1 meal)'
    },
    {
      label: 'Food saved',
      value: impact.value.estimatedKgSaved + ' kg',
      note: 'Estimated at 0.5 kg per item'
    },
    {
      label: 'Revenue recovered',
      value: formatMoney(impact.value.revenueSgd),
      note: 'Earned from food that would have been wasted'
    },
    {
      label: 'Customer savings',
      value: formatMoney(impact.value.customerSavingsSgd),
      note: 'Original price minus rescue price'
    }
  ]
})

// Items collected in each of the last 8 weeks, oldest first
const weeklyBars = computed(() => {
  const counts = [0, 0, 0, 0, 0, 0, 0, 0]
  const now = Number(new Date())

  for (const reservation of reservations.value) {
    if (reservation.status !== 'COLLECTED' || !reservation.collected_at) continue
    const weeksAgo = Math.floor((now - Number(new Date(reservation.collected_at))) / WEEK_MS)
    if (weeksAgo >= 0 && weeksAgo < 8) {
      counts[7 - weeksAgo] = counts[7 - weeksAgo] + reservation.quantity
    }
  }

  let highest = 1
  for (const count of counts) {
    highest = Math.max(highest, count)
  }

  const bars = []
  for (let i = 0; i < counts.length; i++) {
    const weeksAgo = 7 - i
    bars.push({
      label: weeksAgo === 0 ? 'Now' : '-' + weeksAgo + 'w',
      value: counts[i],
      height: Math.round((counts[i] / highest) * 100),
      readout: (weeksAgo === 0 ? 'This week' : weeksAgo + (weeksAgo === 1 ? ' week ago' : ' weeks ago')) +
        ': ' + counts[i] + (counts[i] === 1 ? ' meal' : ' meals')
    })
  }
  return bars
})

const chartTotal = computed(() => {
  let total = 0
  for (const bar of weeklyBars.value) {
    total = total + bar.value
  }
  return total
})

// Reserved orders whose collection window starts today, earliest first
const todaysPickups = computed(() => {
  const pickups = []
  for (const reservation of reservations.value) {
    if (reservation.status !== 'RESERVED') continue
    if (dayLabel(reservation.listing_snapshot.collection_start_at) !== 'Today') continue

    const start = new Date(reservation.listing_snapshot.collection_start_at)
    const position = pickups.findIndex((other) => start < new Date(other.listing_snapshot.collection_start_at))
    if (position === -1) {
      pickups.push(reservation)
    } else {
      pickups.splice(position, 0, reservation)
    }
  }
  return pickups
})

// Active listings with how many units have been reserved or collected
const liveListings = computed(() => {
  const rows = []
  for (const listing of managedListings.value) {
    if (listing.status !== 'ACTIVE') continue

    let reserved = 0
    for (const reservation of reservations.value) {
      if (reservation.listing_id !== listing._id) continue
      if (reservation.status === 'RESERVED' || reservation.status === 'COLLECTED') {
        reserved = reserved + reservation.quantity
      }
    }

    const total = reserved + listing.quantity_available
    rows.push({
      _id: listing._id,
      title: listing.title,
      type: listing.listing_type === 'BUNDLE' ? 'Bundle' : 'Item',
      price: formatPrice(listing.rescue_price_sgd),
      original: formatPrice(listing.original_price_sgd),
      reserved: reserved,
      total: total,
      percent: total > 0 ? Math.round((reserved / total) * 100) : 0,
      window: collectionWindow(listing.collection_start_at, listing.collection_end_at),
      status: listing.status
    })
  }
  return rows
})

const hasCollected = computed(() => {
  return impact.value !== null && impact.value.reservationsCollected > 0
})

// Load the impact of the business that is currently chosen
async function loadImpact() {
  const token = await getToken.value()
  const impactResponse = await axios.get(
    `${API_URL}/businesses/${business.value._id}/impact`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  impact.value = impactResponse.data.impact

  const headers = { Authorization: `Bearer ${token}` }
  const reservationsResponse = await axios.get(
    `${API_URL}/businesses/${business.value._id}/reservations`,
    { headers: headers }
  )
  reservations.value = reservationsResponse.data.reservations

  const listingsResponse = await axios.get(
    `${API_URL}/businesses/${business.value._id}/managed-listings`,
    { headers: headers }
  )
  managedListings.value = listingsResponse.data.listings
}

// When the owner picks another business from the dropdown
async function changeBusiness() {
  for (const item of businesses.value) {
    if (item._id === selectedBusinessId.value) {
      business.value = item
    }
  }

  loading.value = true
  errorMessage.value = ''
  impact.value = null
  reservations.value = []
  managedListings.value = []
  chartReadout.value = ''

  try {
    await loadImpact()
  } catch (error) {
    console.error('Error loading impact dashboard:', error)
    errorMessage.value = 'Unable to load your impact dashboard.'
  } finally {
    loading.value = false
  }
}

// Find the owner's active businesses, then load the first one's impact
async function loadDashboard() {
  loading.value = true
  errorMessage.value = ''

  try {
    const token = await getToken.value()
    const headers = { Authorization: `Bearer ${token}` }

    const ownedResponse = await axios.get(
      `${API_URL}/users/me/businesses`,
      { headers: headers }
    )

    businesses.value = []
    for (const item of ownedResponse.data.businesses) {
      if (item.status === 'ACTIVE') {
        businesses.value.push(item)
      }
    }

    if (businesses.value.length === 0) {
      return
    }

    business.value = businesses.value[0]
    selectedBusinessId.value = business.value._id

    await loadImpact()
  } catch (error) {
    console.error('Error loading impact dashboard:', error)

    if (error.response && error.response.data && error.response.data.error) {
      errorMessage.value = error.response.data.error
    } else {
      errorMessage.value = 'Unable to load your impact dashboard.'
    }
  } finally {
    loading.value = false
  }
}

onMounted(loadDashboard)
</script>

<template>
  <main class="dashboard">
    <section class="container-xxl px-4 pt-5">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-4">
        <div>
          <p class="rb-script rb-kicker fs-3">look what you saved</p>
          <DisplayHeading :size="160">Impact</DisplayHeading>
          <p v-if="business && businesses.length < 2" class="rb-label mt-2">{{ business.name }}</p>
        </div>
        <div class="d-flex flex-wrap align-items-center gap-3">
          <label v-if="businesses.length > 1" class="rb-label d-flex align-items-center gap-2">
            Business
            <select
              v-model="selectedBusinessId"
              class="rb-select"
              @change="changeBusiness"
            >
              <option v-for="item in businesses" :key="item._id" :value="item._id">
                {{ item.name }}
              </option>
            </select>
          </label>
          <RouterLink v-if="business" to="/business-listings/create" class="rb-pill rb-pill-dark">+ Create listing</RouterLink>
        </div>
      </div>
    </section>

    <section class="container-xxl px-4 pt-5 pb-5">
      <!-- Loading -->
      <p v-if="loading" class="rb-label">Loading your impact…</p>

      <!-- Error -->
      <p v-else-if="errorMessage" class="rb-note error" role="alert">
        {{ errorMessage }}
      </p>

      <!-- No active business -->
      <div v-else-if="business === null" class="rb-note">
        <span>You do not have an active business yet.</span>
        <RouterLink to="/register-business" class="rb-pill rb-pill-dark rb-pill-sm">
          Register a business
        </RouterLink>
      </div>

      <!-- Impact -->
      <template v-else>
        <div class="row g-3">
          <div
            v-for="(stat, index) in stats"
            :key="stat.label"
            class="col-12 col-sm-6 col-xl-3"
          >
            <div class="kpi p-4 h-100" :class="{ first: index === 0 }">
              <p class="rb-label kpi-label">{{ stat.label }}</p>
              <p class="rb-display display-3 kpi-value">{{ stat.value }}</p>
              <p class="kpi-note">{{ stat.note }}</p>
            </div>
          </div>
        </div>

        <div class="row g-4 mt-2">
          <div class="col-lg-7">
            <div class="panel p-4 p-md-5 h-100">
              <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
                <div>
                  <h2 class="rb-display display-6 panel-title">Meals rescued per week</h2>
                  <p class="rb-label small-label">Last 8 weeks · hover a bar for its count</p>
                </div>
                <p class="rb-label readout" aria-live="polite">{{ chartReadout || chartTotal + ' meals in 8 weeks' }}</p>
              </div>

              <div class="chart">
                <button
                  v-for="bar in weeklyBars"
                  :key="bar.label"
                  type="button"
                  class="chart-column"
                  :aria-label="bar.readout"
                  @mouseenter="chartReadout = bar.readout"
                  @focus="chartReadout = bar.readout"
                  @mouseleave="chartReadout = ''"
                  @blur="chartReadout = ''"
                >
                  <span class="bar-value rb-mono">{{ bar.value }}</span>
                  <span class="bar" :class="{ current: bar.label === 'Now' }" :style="{ height: bar.height + '%' }"></span>
                  <span class="bar-label rb-mono">{{ bar.label }}</span>
                </button>
              </div>
            </div>
          </div>

          <div class="col-lg-5">
            <div class="pickups p-4 p-md-5 h-100 d-flex flex-column">
              <div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
                <h2 class="rb-display display-6 panel-title">Today’s pickups</h2>
                <span class="rb-label muted-light">{{ todaysPickups.length }} upcoming</span>
              </div>
              <ul class="pickup-list">
                <li v-for="pickup in todaysPickups" :key="pickup._id">
                  <span class="rb-display pickup-time">{{ shortTime(pickup.listing_snapshot.collection_start_at) }}</span>
                  <span class="pickup-item">{{ pickup.listing_snapshot.title }} × {{ pickup.quantity }}</span>
                </li>
                <li v-if="todaysPickups.length === 0" class="muted-light">No pickups scheduled for today.</li>
              </ul>
              <RouterLink to="/business-orders" class="rb-pill rb-pill-yolk w-100 mt-auto">
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"></path></svg>
                Scan collection QR
              </RouterLink>
            </div>
          </div>
        </div>

        <div class="panel p-4 p-md-5 mt-4">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
            <h2 class="rb-display display-6 panel-title">Live listings</h2>
            <RouterLink to="/business-listings" class="rb-pill rb-pill-line">Manage listings</RouterLink>
          </div>
          <div class="table-responsive mt-4">
            <table class="live-table">
              <thead>
                <tr class="rb-label">
                  <th scope="col">Listing</th>
                  <th scope="col">Price</th>
                  <th scope="col" class="reserved-col">Reserved</th>
                  <th scope="col">Window</th>
                  <th scope="col">Status</th>
                  <th scope="col" aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in liveListings" :key="row._id">
                  <td>
                    <span class="rb-display row-title">{{ row.title }}</span>
                    <span class="rb-label">{{ row.type }}</span>
                  </td>
                  <td class="rb-mono">{{ row.price }} <del class="muted">{{ row.original }}</del></td>
                  <td>
                    <div class="d-flex align-items-center gap-3">
                      <span class="meter"><span class="meter-fill" :style="{ width: row.percent + '%' }"></span></span>
                      <span class="rb-mono text-nowrap">{{ row.reserved }} / {{ row.total }}</span>
                    </div>
                  </td>
                  <td class="rb-label text-dark">{{ row.window }}</td>
                  <td><span :class="['rb-status', row.status.toLowerCase()]">{{ row.status }}</span></td>
                  <td class="text-end">
                    <RouterLink
                      :to="{ name: 'business-listing-edit', params: { businessId: business._id, listingId: row._id } }"
                      class="rb-label edit-link"
                    >Edit</RouterLink>
                  </td>
                </tr>
                <tr v-if="liveListings.length === 0">
                  <td colspan="6" class="muted">No active listings right now.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="collected-banner p-4 p-md-5 d-flex flex-wrap align-items-center justify-content-between gap-4 mt-4">
          <p v-if="hasCollected" class="rb-display display-5 banner-copy">
            Customers have collected {{ impact.reservationsCollected }} reservations. Every one kept good food out of the bin.
          </p>
          <p v-else class="rb-display display-5 banner-copy">
            No reservations collected yet. Your impact appears here after your first pickup.
          </p>
          <RouterLink to="/business-orders" class="rb-pill rb-pill-dark">View all orders</RouterLink>
        </div>
      </template>
    </section>
  </main>
</template>

<style scoped>
.rb-note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px;
  border: 2px solid #f4b30c;
  border-radius: 28px;
}

.rb-note.error {
  border-color: #ff7a7a;
  background-color: #ff7a7a;
}

/* KPI tiles */
.kpi {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
  min-height: 200px;
  border: 1px solid #ddd9c5;
  background-color: #f6f4ed;
}

.kpi.first {
  border-color: #f4b30c;
  color: #000;
  background-color: #f4b30c;
}

.kpi.first .kpi-label,
.kpi.first .kpi-note {
  color: #000;
}

.kpi-value {
  line-height: .9;
}

.kpi-note {
  margin: 0;
  color: #5f5330;
  font-size: 14px;
  line-height: 21px;
}

.panel {
  border: 1px solid #ddd9c5;
}

.panel-title {
  margin: 0;
  line-height: 1.1;
}

.small-label {
  margin-top: 6px;
  font-size: 12px;
}

.readout {
  color: #191200;
  text-align: right;
}

/* Weekly bar chart */
.chart {
  display: flex;
  gap: 2px;
  height: 260px;
  margin-top: 32px;
  border-bottom: 1px solid #191200;
}

.chart-column {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  min-width: 0;
  padding: 0 0 32px;
  border: 0;
  background: transparent;
}

.bar-value {
  margin-bottom: 6px;
  font-size: 13px;
}

.bar {
  display: block;
  width: 70%;
  min-height: 2px;
  background-color: #191200;
  transition: background-color .25s;
}

.bar.current,
.chart-column:hover .bar,
.chart-column:focus .bar {
  background-color: #f4b30c;
}

.bar-label {
  position: absolute;
  bottom: 6px;
  color: #5f5330;
  font-size: 12px;
  text-transform: uppercase;
}

/* Shell-dark pickups panel */
.pickups {
  color: #fbf9f1;
  background-color: #1a1200;
}

.pickups .panel-title {
  color: #fbf9f1;
}

.muted-light {
  color: #d6cfb4;
}

.pickup-list {
  margin: 24px 0;
  padding: 0;
  list-style: none;
}

.pickup-list li {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 0;
  border-top: 1px solid #4a4120;
}

.pickup-time {
  flex: 0 0 88px;
  color: #f4b30c;
  font-size: 24px;
}

.pickup-item {
  font-size: 16px;
  line-height: 22px;
}

/* Live listings table */
.live-table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
}

.live-table th {
  padding: 0 16px 12px 0;
  font-size: 12px;
  font-weight: 400;
  text-align: left;
}

.reserved-col {
  width: 30%;
}

.live-table td {
  padding: 18px 16px 18px 0;
  border-top: 1px solid #ddd9c5;
}

.row-title {
  display: block;
  font-size: 24px;
  line-height: 28px;
}

.muted {
  color: #5f5330;
}

.meter {
  display: block;
  flex: 1;
  height: 10px;
  overflow: hidden;
  border-radius: 140px;
  background-color: #e8e6d7;
}

.meter-fill {
  display: block;
  height: 100%;
  background-color: #f4b30c;
}

.edit-link {
  color: #191200;
}

.collected-banner {
  color: #000;
  background-color: #f4b30c;
}

.banner-copy {
  flex: 1 1 320px;
  min-width: 0;
  margin: 0;
  line-height: 1;
}
</style>
