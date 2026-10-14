<script setup>
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import { useAuth } from '@clerk/vue'

const { getToken } = useAuth()

const API_URL = 'http://localhost:8000/api'

const business = ref(null)
const impact = ref(null)
const loading = ref(true)
const errorMessage = ref('')

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

const hasCollected = computed(() => {
  return impact.value !== null && impact.value.reservationsCollected > 0
})

// Find the owner's active business, then load its impact
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

    for (const item of ownedResponse.data.businesses) {
      if (item.status === 'ACTIVE' && business.value === null) {
        business.value = item
      }
    }

    if (business.value === null) {
      return
    }

    const impactResponse = await axios.get(
      `${API_URL}/businesses/${business.value._id}/impact`,
      { headers: headers }
    )

    impact.value = impactResponse.data.impact
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
  <main class="dashboard container py-4 py-md-5">
    <header class="mb-4">
      <h1 class="dashboard-title">Business impact dashboard</h1>
      <p v-if="business" class="text-muted mb-0">{{ business.name }}</p>
    </header>

    <!-- Loading -->
    <p v-if="loading" class="text-muted">Loading your impact...</p>

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

    <!-- Impact -->
    <section v-else>
      <div class="row g-3">
        <div
          v-for="stat in stats"
          :key="stat.label"
          class="col-12 col-sm-6 col-lg-3"
        >
          <div class="card h-100 stat-card">
            <div class="card-body">
              <p class="text-uppercase text-muted small fw-semibold mb-2">
                {{ stat.label }}
              </p>
              <p class="stat-value mb-2">{{ stat.value }}</p>
              <p class="text-muted small mb-0">{{ stat.note }}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="card summary-card mt-3">
        <div class="card-body">
          <h2 class="h5">Your collected reservations</h2>
          <p v-if="hasCollected" class="mb-0">
            Customers have collected
            <strong>{{ impact.reservationsCollected }}</strong>
            reservations so far. Every one kept good food out of the bin.
          </p>
          <p v-else class="text-muted mb-0">
            No reservations have been collected yet. Your impact will appear
            here after your first pickup.
          </p>
          <RouterLink to="/business-orders" class="btn btn-success mt-3">
            View all orders
          </RouterLink>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.dashboard {
  color: #173d2c;
}

.dashboard-title {
  margin: 0 0 4px;
  font-size: clamp(28px, 4vw, 44px);
  color: #164936;
}

.stat-card,
.summary-card {
  border: 1px solid #d9e6dc;
  border-radius: 12px;
  background-color: white;
}

.stat-card {
  border-left: 5px solid #256b45;
}

.stat-value {
  font-family: 'Outfit', sans-serif;
  font-size: clamp(28px, 3.5vw, 38px);
  font-weight: 700;
  color: #256b45;
}
</style>
