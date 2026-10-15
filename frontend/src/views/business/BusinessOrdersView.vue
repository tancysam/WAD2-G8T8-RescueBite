<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import axios from 'axios'
import { useAuth } from '@clerk/vue'
import { Html5Qrcode } from 'html5-qrcode'

const { getToken } = useAuth()

const API_URL = 'http://localhost:8000/api'

const business = ref(null)
const reservations = ref([])
const loading = ref(true)
const errorMessage = ref('')
const activeTab = ref('ALL')
const scanOpen = ref(false)
const scanError = ref('')
let scanner = null
let scannerReady = false

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
  await nextTick()
  if (!scanOpen.value) return

  const current = new Html5Qrcode('collection-scanner')
  scanner = current

  try {
    await current.start({ facingMode: 'environment' }, { fps: 10 }, () => {})
    if (scanner !== current || !scanOpen.value) {
      await current.stop()
    } else {
      scannerReady = true
    }
  } catch (error) {
    if (scanner === current) scanError.value = 'Unable to start the camera. Check camera access and try again.'
  }
}

async function closeScanner() {
  const current = scanner
  scanner = null

  if (current && scannerReady) {
    scannerReady = false
    try {
      await current.stop()
    } catch (error) {
      console.error('Unable to stop the scanner:', error)
    }
  }
  scanOpen.value = false
}

// Find the owner's active business, then load its reservations
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

    for (const item of ownedResponse.data.businesses) {
      if (item.status === 'ACTIVE' && business.value === null) {
        business.value = item
      }
    }

    if (business.value === null) {
      return
    }

    const response = await axios.get(
      `${API_URL}/businesses/${business.value._id}/reservations`,
      { headers: headers }
    )

    reservations.value = response.data.reservations
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
        <button type="button" class="btn-close" aria-label="Exit scanner" @click="closeScanner"></button>
      </header>
      <div v-if="scanError" class="alert alert-danger" role="alert">{{ scanError }}</div>
      <div id="collection-scanner"></div>
    </section>

    <template v-else>
      <header class="mb-4 d-flex justify-content-between align-items-start gap-3 flex-wrap">
        <div>
          <h1 class="orders-title">Orders</h1>
          <p v-if="business" class="text-muted mb-0">
            Reservation history for {{ business.name }}
          </p>
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
  max-width: 520px;
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
