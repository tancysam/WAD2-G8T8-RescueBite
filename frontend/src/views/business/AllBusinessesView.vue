
<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'

// Reactive variables
const businesses = ref([])
const loading = ref(true)
const errorMessage = ref('')

// Retrieve all active businesses
async function getBusinesses() {
  loading.value = true
  errorMessage.value = ''

  try {
    const response = await axios.get(
      'http://localhost:8000/api/businesses'
    )

    businesses.value = response.data.businesses

    console.log('Businesses:', businesses.value)

  } catch (error) {
    console.error('Error fetching businesses:', error)

    errorMessage.value =
      error.response?.data?.error ||
      'Unable to retrieve businesses.'
  } finally {
    loading.value = false
  }
}

// Run when component mounts
onMounted(getBusinesses)
</script>

<template>
  <main class="businesses-page">

    <h1>Discover Businesses</h1>
    <p>Explore food businesses rescuing surplus food near you.</p>

    <!-- Loading -->
    <p v-if="loading">Loading businesses...</p>

    <!-- Error -->
    <p v-else-if="errorMessage" class="error">
      {{ errorMessage }}
    </p>

    <!-- No Businesses -->
    <p v-else-if="businesses.length === 0">
      No businesses available.
    </p>

    <!-- Business Cards -->
    <div v-else class="business-grid">

      <div
        v-for="business in businesses"
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
</style>
