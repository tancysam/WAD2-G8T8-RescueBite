
<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import axios from 'axios'
import { useUser, useAuth } from '@clerk/vue'

const { user, isLoaded } = useUser()
const { getToken } = useAuth()

const API_URL = 'http://localhost:8000/api'

// User role
const userRole = ref(null)
const isBusiness = computed(() => userRole.value === 'BUSINESS')

// All businesses
const businesses = ref([])
const loading = ref(true)
const errorMessage = ref('')

// for searchbar
const searchQuery = ref('')

// Retrieve user role from MongoDB
async function getUserRole() {
  if (!user.value) return

  try {
    const token = await getToken.value()

    const response = await axios.get(
      `${API_URL}/users/me`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    userRole.value = response.data.user.role

    console.log('Current User Role:', userRole.value)

    if (isBusiness.value) {
      await getMyBusiness()
    }

  } catch (error) {
    console.error('Error fetching user role:', error)
  }
}

// Retrieve all active businesses
async function getBusinesses() {
  loading.value = true
  errorMessage.value = ''

  try {
    const response = await axios.get(
      `${API_URL}/businesses`
    )

    businesses.value = response.data.businesses

  } catch (error) {
    console.error('Error fetching businesses:', error)

    errorMessage.value =
      (error.response && error.response.data && error.response.data.error) ||
      'Unable to retrieve businesses.'
  } finally {
    loading.value = false
  }
}

//searchbar
const filteredBusinesses = computed(() => {
  return businesses.value.filter((business) => {
    return business.name.toLowerCase().includes(searchQuery.value.toLowerCase())
  })
})

// Load all businesses
onMounted(getBusinesses)

// Retrieve role when Clerk finishes loading
watch(
  [user, isLoaded],
  () => {
    if (isLoaded.value && user.value) {
      getUserRole()
    } else {
      userRole.value = null
      myBusinesses.value = []
    }
  },
  { immediate: true }
)
</script>

<template>
  <main class="businesses-page">

    <!-- Discover Businesses -->
    <h1>Discover Businesses</h1>
    <p>Explore food businesses rescuing surplus food near you.</p>

    <!--searchbar-->
    <input
      v-model="searchQuery"
      type="text"
      placeholder="Search businesses..."
      class="search-bar"
    />

    <!-- Loading -->
    <p v-if="loading">Loading businesses...</p>

    <!-- Error -->
    <p v-else-if="errorMessage" class="error">
      {{ errorMessage }}
    </p>

    <!-- No Businesses -->
    <p v-else-if="filteredBusinesses.length === 0">
      No businesses found.
    </p>

    <!-- Business Cards -->
    <div v-else class="business-grid">

      <div
        v-for="business in filteredBusinesses"
        :key="business._id"
        class="business-card"
      >
        <div class="card-header">
          <h2>{{ business.name }}</h2>
        </div>

        <div class="card-body">
          <p class="description">
            {{ business.description || 'No description available.' }}
          </p>

          <p class="address">
            📍 {{ business.address }}
          </p>

          <p class="postal-code">
            Singapore {{ business.postal_code }}
          </p>

          <RouterLink
            :to="{
              name: 'business-profile',
              params: { businessId: business._id }
            }"
            class="view-button"
          >
            View Business
          </RouterLink>
        </div>
      </div>

    </div>
  </main>
</template>

<style scoped>
.businesses-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 30px;
}

.businesses-page h1 {
  margin-bottom: 10px;
  color: #256b45;
}

.businesses-page > p {
  margin-bottom: 30px;
  color: #666;
}

/* My Business Section */
.my-business-section {
  margin-bottom: 40px;
}

.my-business-section h1 {
  margin-bottom: 20px;
}

.my-business-card {
  width: 100%;
}

/* Register Business Card */
.register-business-card {
  border: 1px solid #ddd;
  border-radius: 12px;
  background-color: white;
  padding: 24px;
}

.register-business-card h2 {
  margin-bottom: 12px;
  color: #256b45;
}

.register-business-card p {
  margin-bottom: 20px;
  color: #555;
}

/* Business Grid */
.business-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

/* Business Card */
.business-card {
  border: 1px solid #ddd;
  border-radius: 12px;
  background-color: white;
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;
}

.business-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
}

.card-header {
  background-color: #e8f5e9;
  padding: 24px;
}

.card-header h2 {
  margin: 0;
  font-size: 20px;
  color: #256b45;
}

.card-body {
  padding: 20px;
}

.description {
  margin-bottom: 16px;
  color: #555;
}

.address {
  margin-bottom: 5px;
}

.postal-code {
  color: #777;
  font-size: 14px;
  margin-bottom: 20px;
}

.view-button {
  display: inline-block;
  background-color: #256b45;
  color: white;
  text-decoration: none;
  padding: 10px 16px;
  border-radius: 8px;
}

.view-button:hover {
  background-color: #1b5034;
}

/* Responsive Layout */
@media (max-width: 900px) {
  .business-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .business-grid {
    grid-template-columns: 1fr;
  }
}

.error {
  color: red;
}


/* Business Action Buttons */
.business-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

/* Edit Business Button */
.edit-button {
  display: inline-block;
  background-color: white;
  color: #256b45;
  border: 1px solid #256b45;
  text-decoration: none;
  padding: 9px 15px;
  border-radius: 8px;
}

.edit-button:hover {
  background-color: #e8f5e9;
}


.search-bar {
  width: 100%;
  padding: 12px 16px;
  margin-bottom: 24px;
  border: 1px solid #ddd;
  border-radius: 10px;
  font-size: 16px;
  box-sizing: border-box;
}

.search-bar:focus {
  outline: none;
  border-color: #256b45;
}
</style>
