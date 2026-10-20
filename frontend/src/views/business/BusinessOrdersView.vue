<script setup>
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
  return (
    formatDate(snapshot.collection_start_at) + ', ' +
    formatTime(snapshot.collection_start_at) + ' - ' +
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
  if (status === 'RESERVED') return 'text-primary'
  if (status === 'COLLECTED') return 'text-success'
  if (status === 'CANCELLED') return 'text-danger'
  return 'text-secondary'
}

// Newest reservation first (insert each item at the right position)
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

// Load the reservations of the business that is currently chosen
async function loadReservations() {
  const token = await getToken.value()
  const response = await axios.get(
    `${API_URL}/businesses/${business.value._id}/reservations`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  reservations.value = response.data.reservations
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

// Find the owner's active businesses, then load the first one's reservations
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
  <main class="orders container py-4 py-md-5">
    <section v-if="scanOpen" class="scanner-screen mx-auto">
      <header class="d-flex justify-content-between align-items-start gap-3 mb-4">
        <div>
          <h1 class="orders-title">Scan collection QR</h1>
          <p class="text-muted mb-0">Scan the consumer's QR code to confirm the pickup.</p>
        </div>
        <button type="button" class="btn-close" aria-label="Exit scanner" :disabled="verifying" @click="closeScanner"></button>
      </header>
      <div v-if="scanError" class="alert alert-danger" role="alert">{{ scanError }}</div>
      <p v-if="verifying" role="status">Verifying collection...</p>
      <div v-show="!verifying && !collectedOrder && !verificationError" id="collection-scanner"></div>

      <div v-if="collectedOrder || verificationError" class="scan-backdrop">
        <section class="card scan-dialog" role="dialog" aria-modal="true" aria-labelledby="verification-title">
          <div class="card-body">
            <template v-if="collectedOrder">
              <h2 id="verification-title" class="h4 mb-3">Review Collection Details</h2>
              <template v-if="collectedOrder.listingName">
                <section class="card border-0 bg-light mb-3" aria-label="Collection summary">
                  <div class="card-body">
                    <div class="row g-3">
                      <div class="col-4">
                        <p class="small text-secondary mb-1">Consumer</p>
                        <p class="fw-semibold mb-0">{{ collectedOrder.consumerName }}</p>
                      </div>
                      <div class="col-4">
                        <p class="small text-secondary mb-1">Quantity</p>
                        <p class="fw-semibold mb-0">{{ collectedOrder.quantity }}</p>
                      </div>
                      <div class="col-4">
                        <p class="small text-secondary mb-1">Total price</p>
                        <p class="fw-semibold mb-0">{{ formatMoney(collectedOrder.totalPrice) }}</p>
                      </div>
                      <div class="col-12">
                        <p class="small text-secondary mb-1">Listing</p>
                        <p class="fw-semibold mb-0">{{ collectedOrder.listingName }}</p>
                      </div>
                      <div class="col-12">
                        <p class="small text-secondary mb-1">Collected at</p>
                        <p class="fw-semibold mb-0">{{ formatDate(collectedOrder.collectedAt) }}, {{ formatTime(collectedOrder.collectedAt) }}</p>
                      </div>
                    </div>
                  </div>
                </section>
              </template>
              <p v-else>{{ collectedOrder.message }}</p>
              <button type="button" class="btn btn-success w-100" autofocus @click="confirmCollection">Confirm</button>
            </template>
            <template v-else>
              <h2 id="verification-title" class="h4 mb-3" role="alert">{{ verificationError }}</h2>
              <button type="button" class="btn btn-success w-100" autofocus @click="openScanner">Try again</button>
            </template>
          </div>
        </section>
      </div>
    </section>

    <template v-else>
      <header class="mb-4 d-flex justify-content-between align-items-start gap-3 flex-wrap">
        <div>
          <h1 class="orders-title">Orders</h1>
          <p v-if="business" class="text-muted mb-0">
            Reservation history for {{ business.name }}
          </p>
          <select
            v-if="businesses.length > 1"
            v-model="selectedBusinessId"
            class="form-select form-select-sm mt-2"
            aria-label="Choose business"
            @change="changeBusiness"
          >
            <option v-for="item in businesses" :key="item._id" :value="item._id">
              {{ item.name }}
            </option>
          </select>
        </div>
        <button v-if="business" type="button" class="btn btn-success" @click="openScanner">
          Scan collection QR
        </button>
      </header>

    <!-- Loading -->
    <p v-if="loading" class="text-muted">Loading your orders...</p>

    <!-- Error -->
    <div v-else-if="errorMessage" class="alert alert-danger" role="alert">
      {{ errorMessage }}
    </div>

    <!-- No active business -->
    <div v-else-if="business === null" class="alert alert-warning" role="alert">
      You do not have an active business yet.
      <RouterLink to="/register-business" class="alert-link">
        Register a business
      </RouterLink>
    </div>

    <section v-else>
      <!-- Status tabs -->
      <ul class="nav nav-tabs flex-nowrap overflow-auto mb-3">
        <li v-for="tab in tabs" :key="tab.key" class="nav-item">
          <button
            type="button"
            class="nav-link text-nowrap"
            :class="{ active: activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            {{ tab.label }} ({{ counts[tab.key] }})
          </button>
        </li>
      </ul>

      <p v-if="visibleReservations.length === 0" class="text-muted">
        No reservations in this tab.
      </p>

      <!-- Table on tablets and desktops -->
      <div v-else class="d-none d-md-block">
        <div class="table-responsive orders-table">
          <table class="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Total</th>
                <th>Pickup window</th>
                <th>Status</th>
                <th>Reserved</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="reservation in visibleReservations" :key="reservation._id">
                <td>{{ reservation.listing_snapshot.title }}</td>
                <td>{{ reservation.quantity }}</td>
                <td>{{ formatMoney(lineTotal(reservation)) }}</td>
                <td>{{ formatPickup(reservation.listing_snapshot) }}</td>
                <td :class="statusClass(reservation.status)" class="fw-semibold">
                  {{ statusLabel(reservation.status) }}
                </td>
                <td>{{ formatDate(reservation.reserved_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Cards on phones -->
      <div v-if="visibleReservations.length > 0" class="d-md-none">
        <div
          v-for="reservation in visibleReservations"
          :key="reservation._id"
          class="card order-card mb-3"
        >
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start">
              <h2 class="h6 mb-1">{{ reservation.listing_snapshot.title }}</h2>
              <span :class="statusClass(reservation.status)" class="fw-semibold small">
                {{ statusLabel(reservation.status) }}
              </span>
            </div>
            <p class="mb-1">
              {{ reservation.quantity }} x
              {{ formatMoney(reservation.listing_snapshot.rescue_unit_price_sgd) }}
              = <strong>{{ formatMoney(lineTotal(reservation)) }}</strong>
            </p>
            <p class="text-muted small mb-0">
              Pickup: {{ formatPickup(reservation.listing_snapshot) }}
            </p>
            <p class="text-muted small mb-0">
              Reserved: {{ formatDate(reservation.reserved_at) }}
            </p>
          </div>
        </div>
      </div>
    </section>
    </template>
  </main>
</template>

<style scoped>
.orders {
  color: #173d2c;
}

.orders-title {
  margin: 0 0 4px;
  font-size: clamp(28px, 4vw, 44px);
  color: #164936;
}

.scanner-screen {
  width: 100%;
  max-width: 520px;
}

#collection-scanner {
  width: 100%;
  overflow: hidden;
}

.scan-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.55);
}

.scan-dialog {
  width: 100%;
  max-width: 430px;
}

.nav-tabs .nav-link {
  color: #256b45;
}

.nav-tabs .nav-link.active {
  color: #164936;
  font-weight: 600;
}

.orders-table {
  border: 1px solid #d9e6dc;
  border-radius: 12px;
  background-color: white;
}

.order-card {
  border: 1px solid #d9e6dc;
  border-left: 5px solid #256b45;
  border-radius: 12px;
  background-color: white;
}
</style>
