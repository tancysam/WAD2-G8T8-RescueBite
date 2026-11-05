<script setup>
import DisplayHeading from '../../components/DisplayHeading.vue'
import { paymentLabel } from '../../payments.js'
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import axios from 'axios'
import { useAuth } from '@clerk/vue'
import { Html5Qrcode } from 'html5-qrcode'
import { API_URL } from '@/config'

const { getToken } = useAuth()

const business = ref(null)
const businesses = ref([])
const selectedBusinessId = ref('')
const reservations = ref([])
const loading = ref(true)
const errorMessage = ref('')
const activeTab = ref('ALL')
const scanOpen = ref(false)
const scanError = ref('')
const verifying = ref(false)
const collectedOrder = ref(null)
const verificationError = ref(null)
let scanner = null
let scannerStart = null

const tabs = [
  { key: 'ALL', label: 'All' },
  { key: 'RESERVED', label: 'Upcoming' },
  { key: 'COLLECTED', label: 'Collected' },
  { key: 'CANCELLED', label: 'Cancelled' },
  { key: 'EXPIRED', label: 'Expired' }
]

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

function pad(number) {
  return String(number).padStart(2, '0')
}

function formatDate(value) {
  const date = new Date(value)
  return date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear()
}

function formatTime(value) {
  const date = new Date(value)
  return pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function formatPickup(snapshot) {
  const sameDay = formatDate(snapshot.collection_start_at) === formatDate(snapshot.collection_end_at)
  return (
    formatDate(snapshot.collection_start_at) + ', ' +
    formatTime(snapshot.collection_start_at) + ' - ' +
    (sameDay ? '' : formatDate(snapshot.collection_end_at) + ', ') +
    formatTime(snapshot.collection_end_at)
  )
}

function formatMoney(amount) {
  return 'S$' + amount.toFixed(2)
}

function lineTotal(reservation) {
  return reservation.quantity * reservation.listing_snapshot.rescue_unit_price_sgd
}

function statusLabel(status) {
  if (status === 'RESERVED') return 'Upcoming'
  if (status === 'COLLECTED') return 'Collected'
  if (status === 'CANCELLED') return 'Cancelled'
  return 'Expired'
}

function statusClass(status) {
  return 'rb-status ' + status.toLowerCase()
}

function newestFirst(list) {
  const sorted = []

  for (const item of list) {
    const time = Number(new Date(item.reserved_at))
    let position = 0

    while (
      position < sorted.length &&
      Number(new Date(sorted[position].reserved_at)) > time
    ) {
      position = position + 1
    }

    sorted.splice(position, 0, item)
  }

  return sorted
}

const counts = computed(() => {
  const result = { ALL: 0, RESERVED: 0, COLLECTED: 0, CANCELLED: 0, EXPIRED: 0 }

  for (const reservation of reservations.value) {
    result.ALL = result.ALL + 1
    result[reservation.status] = result[reservation.status] + 1
  }

  return result
})

const visibleReservations = computed(() => {
  const sorted = newestFirst(reservations.value)

  if (activeTab.value === 'ALL') {
    return sorted
  }

  return sorted.filter((item) => item.status === activeTab.value)
})

async function openScanner() {
  scanOpen.value = true
  scanError.value = ''
  verificationError.value = null
  await nextTick()
  if (!scanOpen.value) return

  const current = new Html5Qrcode('collection-scanner')
  scanner = current

  try {
    scannerStart = current.start({ facingMode: 'environment' }, { fps: 10 }, verifyScannedCode)
    await scannerStart
  } catch (error) {
    if (scanner === current) scanError.value = 'Unable to start the camera. Check camera access and try again.'
  } finally {
    if (scanner === current) scannerStart = null
  }
}

async function stopCamera() {
  const current = scanner
  const starting = scannerStart
  scanner = null
  scannerStart = null

  if (!current) return
  try {
    if (starting) await starting
    await current.stop()
  } catch (error) {
    console.error('Unable to stop the scanner:', error)
  }
  try {
    current.clear()
  } catch (error) {
    console.error('Unable to clear the scanner:', error)
  }
}

async function closeScanner() {
  await stopCamera()
  scanOpen.value = false
  collectedOrder.value = null
  verificationError.value = null
}

async function verifyScannedCode(collectionCode) {
  if (verifying.value || !scanOpen.value) return
  verifying.value = true
  await stopCamera()

  try {
    const token = await getToken.value()
    const response = await axios.post(
      `${API_URL}/businesses/collections/verify`,
      { businessId: business.value._id, collectionCode },
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (scanOpen.value) collectedOrder.value = response.data.collection || {
      message: 'Collection saved, but the server did not return the order details. Select Confirmed to refresh Orders.'
    }
  } catch (error) {
    if (scanOpen.value) {
      const backendError = error.response && error.response.data && error.response.data.error
      verificationError.value = backendError || 'Unable to verify this QR code. Please try again.'
    }
  } finally {
    verifying.value = false
  }
}

async function confirmCollection() {
  await closeScanner()
  activeTab.value = 'ALL'
  await loadOrders()
}

async function loadReservations() {
  const token = await getToken.value()
  const response = await axios.get(
    `${API_URL}/businesses/${business.value._id}/reservations`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  reservations.value = response.data.reservations
}

async function changeBusiness() {
  for (const item of businesses.value) {
    if (item._id === selectedBusinessId.value) {
      business.value = item
    }
  }

  loading.value = true
  errorMessage.value = ''
  activeTab.value = 'ALL'
  reservations.value = []

  try {
    await loadReservations()
  } catch (error) {
    console.error('Error loading orders:', error)
    errorMessage.value = 'Unable to load your orders.'
  } finally {
    loading.value = false
  }
}

async function loadOrders() {
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

    await loadReservations()
  } catch (error) {
    console.error('Error loading orders:', error)

    if (error.response && error.response.data && error.response.data.error) {
      errorMessage.value = error.response.data.error
    } else {
      errorMessage.value = 'Unable to load your orders.'
    }
  } finally {
    loading.value = false
  }
}

onMounted(loadOrders)
onUnmounted(closeScanner)
</script>

<template>
  <main class="orders">
    <section v-if="scanOpen" class="container-xxl px-4 py-5">
      <div class="scanner-screen mx-auto">
        <div class="d-flex justify-content-between align-items-start gap-3 mb-4">
          <div>
            <p class="rb-script rb-kicker fs-3">ready when they are</p>
            <h1 class="rb-display display-4">Scan collection QR</h1>
            <p class="rb-label mt-2 mb-0">Scan the customer’s QR code to confirm the pickup.</p>
          </div>
          <button type="button" class="rb-close" aria-label="Exit scanner" :disabled="verifying" @click="closeScanner">×</button>
        </div>
        <p v-if="scanError" class="rb-note error mb-3" role="alert">{{ scanError }}</p>
        <p v-if="verifying" class="rb-label" role="status">Verifying collection…</p>
        <div v-show="!verifying && !collectedOrder && !verificationError" id="collection-scanner" class="scanner-frame"></div>
      </div>

      <Transition name="pop">
        <div v-if="collectedOrder || verificationError" class="rb-backdrop">
          <section class="rb-dialog" role="dialog" aria-modal="true" aria-labelledby="verification-title">
            <template v-if="collectedOrder">
              <p class="rb-script rb-kicker fs-3">collected!</p>
              <h2 id="verification-title" class="rb-display display-6 mb-3">Review collection details</h2>
              <section v-if="collectedOrder.listingName" class="detail-panel mb-4" aria-label="Collection summary">
                <div class="row g-3">
                  <div class="col-12 col-sm-4">
                    <p class="rb-label mb-1">Customer</p>
                    <p class="fw-semibold mb-0 wrap-text">{{ collectedOrder.consumerName }}</p>
                  </div>
                  <div class="col-12 col-sm-4">
                    <p class="rb-label mb-1">Quantity</p>
                    <p class="fw-semibold mb-0">{{ collectedOrder.quantity }}</p>
                  </div>
                  <div class="col-12 col-sm-4">
                    <p class="rb-label mb-1">Total</p>
                    <p class="fw-semibold mb-0">{{ formatMoney(collectedOrder.totalPrice) }}</p>
                  </div>
                  <div class="col-12">
                    <p class="rb-label mb-1">Listing</p>
                    <p class="fw-semibold mb-0 wrap-text">{{ collectedOrder.listingName }}</p>
                  </div>
                  <div class="col-12">
                    <p class="rb-label mb-1">Collected at</p>
                    <p class="fw-semibold mb-0">{{ formatDate(collectedOrder.collectedAt) }}, {{ formatTime(collectedOrder.collectedAt) }}</p>
                  </div>
                </div>
              </section>
              <p v-else class="wrap-text">{{ collectedOrder.message }}</p>
              <button type="button" class="rb-pill rb-pill-dark w-100" autofocus @click="confirmCollection">Confirm</button>
            </template>
            <template v-else>
              <h2 id="verification-title" class="rb-display display-6 mb-4" role="alert">{{ verificationError }}</h2>
              <button type="button" class="rb-pill rb-pill-dark w-100" autofocus @click="openScanner">Try again</button>
            </template>
          </section>
        </div>
      </Transition>
    </section>

    <template v-else>
      <section class="container-xxl px-4 pt-5">
        <div class="d-flex flex-wrap align-items-end justify-content-between gap-4">
          <div>
            <p class="rb-script rb-kicker fs-3">who’s coming by</p>
            <DisplayHeading :size="160">Orders</DisplayHeading>
            <p v-if="business" class="rb-label mt-2">Reservation history for {{ business.name }}</p>
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
            <button v-if="business" type="button" class="rb-pill rb-pill-dark" @click="openScanner">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"></path></svg>
              Scan collection QR
            </button>
          </div>
        </div>
      </section>

      <section class="container-xxl px-4 pt-5 pb-5">
        <p v-if="loading" class="rb-label">Loading your orders…</p>

        <p v-else-if="errorMessage" class="rb-note error" role="alert">
          {{ errorMessage }}
        </p>

        <div v-else-if="business === null" class="rb-note">
          <span>You do not have an active business yet.</span>
          <RouterLink to="/register-business" class="rb-pill rb-pill-dark rb-pill-sm">Register a business</RouterLink>
        </div>

        <template v-else>
          <div class="rb-chip-row" role="group" aria-label="Filter by status">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              type="button"
              class="rb-chip"
              :class="{ active: activeTab === tab.key }"
              :aria-pressed="activeTab === tab.key"
              @click="activeTab = tab.key"
            >
              {{ tab.label }} <span class="ms-1">{{ counts[tab.key] }}</span>
            </button>
          </div>

          <div v-if="visibleReservations.length === 0" class="rb-empty mt-4">
            <p class="rb-display display-6 mb-2">Nothing here yet</p>
            <p class="mb-0">No reservations in this tab.</p>
          </div>

          <div v-else class="d-none d-md-block mt-4">
            <div class="table-responsive">
              <table class="orders-table">
                <thead>
                  <tr class="rb-label">
                    <th scope="col">Item</th>
                    <th scope="col">Qty</th>
                    <th scope="col">Total</th>
                    <th scope="col">Pickup window</th>
                    <th scope="col">Status</th>
                    <th scope="col">Reserved</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="reservation in visibleReservations" :key="reservation._id">
                    <td><span class="rb-display row-title">{{ reservation.listing_snapshot.title }}</span></td>
                    <td class="rb-mono">{{ reservation.quantity }}</td>
                    <td class="rb-mono">{{ formatMoney(lineTotal(reservation)) }}</td>
                    <td class="rb-label text-dark">{{ formatPickup(reservation.listing_snapshot) }}</td>
                    <td>
                      <div class="d-flex flex-wrap gap-2">
                        <span :class="statusClass(reservation.status)">{{ statusLabel(reservation.status) }}</span>
                        <span v-if="paymentLabel(reservation)" :class="['rb-status', paymentLabel(reservation).tone]">{{ paymentLabel(reservation).text }}</span>
                      </div>
                    </td>
                    <td class="rb-label">{{ formatDate(reservation.reserved_at) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div v-if="visibleReservations.length > 0" class="d-md-none mt-2">
            <article
              v-for="reservation in visibleReservations"
              :key="reservation._id"
              class="order-row"
            >
              <div class="d-flex justify-content-between align-items-start gap-3">
                <h2 class="rb-display row-title">{{ reservation.listing_snapshot.title }}</h2>
                <div class="d-flex flex-wrap justify-content-end gap-2">
                  <span :class="statusClass(reservation.status)">{{ statusLabel(reservation.status) }}</span>
                  <span v-if="paymentLabel(reservation)" :class="['rb-status', paymentLabel(reservation).tone]">{{ paymentLabel(reservation).text }}</span>
                </div>
              </div>
              <p class="rb-mono mt-2 mb-1">
                {{ reservation.quantity }} × {{ formatMoney(reservation.listing_snapshot.rescue_unit_price_sgd) }}
                = <strong>{{ formatMoney(lineTotal(reservation)) }}</strong>
              </p>
              <p class="rb-label mb-0">Pickup: {{ formatPickup(reservation.listing_snapshot) }}</p>
              <p class="rb-label mb-0">Reserved: {{ formatDate(reservation.reserved_at) }}</p>
            </article>
          </div>
        </template>
      </section>
    </template>
  </main>
</template>

<style scoped>
.scanner-screen {
  width: 100%;
  max-width: 560px;
}

.scanner-frame {
  width: 100%;
  overflow: hidden;
  padding: 16px;
  background-color: #f4b30c;
}

.detail-panel {
  padding: 20px 24px;
  border-radius: 28px;
  background-color: #f6f4ed;
}

.orders-table {
  width: 100%;
  border-collapse: collapse;
}

.orders-table th {
  padding: 0 16px 12px 0;
  font-size: 12px;
  font-weight: 400;
  text-align: left;
}

.orders-table td {
  padding: 18px 16px 18px 0;
  border-top: 1px solid #ddd9c5;
}

.row-title {
  display: block;
  margin: 0;
  font-size: 24px;
  line-height: 28px;
}

.order-row {
  padding: 20px 0;
  border-bottom: 1px solid #ddd9c5;
}

/* Long customer and listing names wrap instead of overflowing the modal */
.wrap-text {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
