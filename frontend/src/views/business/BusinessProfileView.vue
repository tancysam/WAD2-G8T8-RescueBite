
<script setup>
import { ref, onMounted, nextTick, watch, onUnmounted } from 'vue'
import axios from 'axios'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'

// Business ID received from Vue Router
const props = defineProps({
  businessId: {
    type: String,
    required: true
  }
})

// Reactive variables
const business = ref(null)
const loading = ref(true)
const errorMessage = ref('')
const mapError = ref('')
const mapElement = ref(null)

// Google Maps variables
let map = null
let marker = null
let requestId = 0

// Configure Google Maps
setOptions({
  key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  v: 'weekly'
})

// Load Google Maps
async function loadMap(businessData) {
  const coordinates = businessData.location?.coordinates

  if (
    !Array.isArray(coordinates) ||
    coordinates.length !== 2
  ) {
    return
  }

  try {
    // MongoDB stores [longitude, latitude]
    const [longitude, latitude] = coordinates

    // Google Maps uses { lat, lng }
    const position = {
      lat: latitude,
      lng: longitude
    }

    // Import Google Maps libraries
    const { Map } = await importLibrary('maps')
    const { AdvancedMarkerElement } = await importLibrary('marker')

    if (!mapElement.value || business.value !== businessData) {
      return
    }

    // Create map
    map = new Map(mapElement.value, {
      center: position,
      zoom: 16,
      mapId: 'DEMO_MAP_ID'
    })

    // Create business marker
    marker = new AdvancedMarkerElement({
      map,
      position,
      title: businessData.name
    })

  } catch (error) {
    console.error('Google Maps error:', error)
    mapError.value = 'Unable to load Google Maps.'
  }
}

// Retrieve business details from backend
async function getBusiness() {
  const currentRequest = ++requestId

  loading.value = true
  business.value = null
  errorMessage.value = ''
  mapError.value = ''

  // Clear previous map and marker
  if (marker) {
    marker.map = null
  }

  marker = null
  map = null

  try {
    const response = await axios.get(
      `http://localhost:8000/api/businesses/${props.businessId}`
    )

    if (currentRequest !== requestId) return

    business.value = response.data.business

    console.log('Business loaded:', business.value)

    // Render business information first
    loading.value = false

    // Wait for the map container to exist
    await nextTick()

    // Display business location
    if (business.value?.location) {
      await loadMap(business.value)
    }

  } catch (error) {
    if (currentRequest !== requestId) return

    console.error('Error fetching business:', error)

    errorMessage.value =
      error.response?.data?.error ||
      'Unable to retrieve business information.'

  } finally {
    if (currentRequest === requestId) {
      loading.value = false
    }
  }
}

// Open directions in Google Maps
function openDirections() {
  const coordinates = business.value?.location?.coordinates

  if (!coordinates) return

  const [longitude, latitude] = coordinates

  const url =
    'https://www.google.com/maps/dir/?api=1' +
    `&destination=${latitude},${longitude}`

  window.open(url, '_blank', 'noopener,noreferrer')
}

// Fetch business when page loads
onMounted(getBusiness)

// Fetch new business if URL ID changes
watch(() => props.businessId, getBusiness)

// Cleanup
onUnmounted(() => {
  requestId++

  if (marker) {
    marker.map = null
  }

  marker = null
  map = null
})
</script>

<template>
  <main class="business-profile">

    <!-- Loading -->
    <p v-if="loading">
      Loading business information...
    </p>

    <!-- Error -->
    <p v-else-if="errorMessage" class="error">
      {{ errorMessage }}
    </p>

    <!-- Business Profile -->
    <div v-else-if="business">

      <!-- Business Header -->
      <header class="business-header">
        <h1>{{ business.name }}</h1>

        <p>
          {{ business.description || 'No description available.' }}
        </p>
      </header>

      <!-- Contact Information -->
      <section class="profile-section">
        <h2>Contact Information</h2>

        <p>
          <strong>Phone:</strong>
          {{ business.phone || 'Not provided' }}
        </p>

        <p>
          <strong>Address:</strong>
          {{ business.address }}
        </p>

        <p>
          <strong>Postal Code:</strong>
          {{ business.postal_code }}
        </p>
      </section>

      <!-- Pickup Information -->
      <section class="profile-section">
        <h2>Pickup Information</h2>

        <p>
          {{
            business.pickup_instructions ||
            'No pickup instructions provided.'
          }}
        </p>
      </section>

      <!-- Google Maps -->
      <section class="profile-section">
        <h2>Business Location</h2>

        <div
          v-if="business.location?.coordinates"
          ref="mapElement"
          class="map"
        ></div>

        <p v-else>
          Location unavailable.
        </p>

        <p v-if="mapError" class="error">
          {{ mapError }}
        </p>

        <button
          v-if="business.location?.coordinates"
          class="directions-button"
          @click="openDirections"
        >
          Get Directions
        </button>
      </section>

      <!-- Back to Businesses -->
      <RouterLink
        to="/businesses"
        class="back-link"
      >
        ← Back to Businesses
      </RouterLink>

    </div>
  </main>
</template>

<style scoped>
.business-profile {
  max-width: 1100px;
  margin: 0 auto;
  padding: 30px;
}

/* Business Header */
.business-header {
  background-color: #f0f7f1;
  padding: 30px;
  border-radius: 12px;
  margin-bottom: 24px;
}

.business-header h1 {
  color: #256b45;
  margin-bottom: 10px;
}

.business-header p {
  color: #555;
  line-height: 1.6;
}

/* Profile Sections */
.profile-section {
  background-color: white;
  border: 1px solid #ddd;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
}

.profile-section h2 {
  color: #256b45;
  margin-bottom: 16px;
}

.profile-section p {
  margin-bottom: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

/* Google Maps */
.map {
  width: 100%;
  height: 400px;
  border-radius: 12px;
  margin-bottom: 15px;
}

/* Directions Button */
.directions-button {
  background-color: #256b45;
  color: white;
  padding: 12px 20px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.directions-button:hover {
  background-color: #1b5034;
}

/* Back Link */
.back-link {
  display: inline-block;
  margin-top: 15px;
  color: #256b45;
  text-decoration: none;
  font-weight: bold;
}

.back-link:hover {
  text-decoration: underline;
}

/* Error */
.error {
  color: red;
}

/* Mobile */
@media (max-width: 600px) {
  .business-profile {
    padding: 16px;
  }

  .business-header {
    padding: 20px;
  }

  .profile-section {
    padding: 18px;
  }

  .map {
    height: 300px;
  }
}
</style>
