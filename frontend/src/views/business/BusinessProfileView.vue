
<script setup>
import { ref, onMounted, nextTick, watch, onUnmounted } from 'vue'
import axios from 'axios'
import { useAuth } from '@clerk/vue'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import CustomerListingCard from '../../components/listings/CustomerListingCard.vue'

// Business ID received from Vue Router
const { getToken } = useAuth()

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
const listings = ref([])
const listingsLoading = ref(false)
const listingsError = ref('')
const isFavourite = ref(false)
const canFavourite = ref(false)
const favouriteMessage = ref('')
const reviews = ref([])
const reviewsLoading = ref(false)
const reviewsError = ref('')

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
    await checkFavourite()
    await getReviews()

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

async function getListings() {
  listingsLoading.value = true
  listingsError.value = ''
  listings.value = []

  try {
    const response = await axios.get(
      `http://localhost:8000/api/businesses/${props.businessId}/listings`
    )

    listings.value = response.data.listings || []

  } catch (error) {
    console.error('Error fetching listings:', error)

    listingsError.value =
      error.response?.data?.error ||
      'Unable to retrieve listings.'

  } finally {
    listingsLoading.value = false
  }
}

async function getHeaders() {
  const token = await getToken.value()
  return {
    Authorization: `Bearer ${token}`
  }
}

async function checkFavourite() {
  try {
    const headers = await getHeaders()
    const response = await axios.get(
      'http://localhost:8000/api/users/me/favourites/businesses',
      { headers: headers }
    )

    canFavourite.value = true
    isFavourite.value = response.data.businesses.some(function (item) {
      return item._id === props.businessId
    })
  } catch (error) {
    canFavourite.value = false
    isFavourite.value = false
  }
}

async function toggleFavourite() {
  favouriteMessage.value = ''

  try {
    const headers = await getHeaders()

    if (isFavourite.value) {
      await axios.delete(
        `http://localhost:8000/api/users/me/favourites/businesses/${props.businessId}`,
        { headers: headers }
      )
      isFavourite.value = false
      favouriteMessage.value = 'Removed from favourites.'
    } else {
      await axios.put(
        `http://localhost:8000/api/users/me/favourites/businesses/${props.businessId}`,
        {},
        { headers: headers }
      )
      isFavourite.value = true
      favouriteMessage.value = 'Saved to favourites.'
    }
  } catch (error) {
    favouriteMessage.value = 'Unable to update favourites.'
  }
}

async function getReviews() {
  reviewsLoading.value = true
  reviewsError.value = ''

  try {
    const response = await axios.get(
      `http://localhost:8000/api/businesses/${props.businessId}/reviews`
    )
    reviews.value = response.data.reviews
  } catch (error) {
    reviewsError.value = 'Unable to load reviews.'
  }

  reviewsLoading.value = false
}

function reviewStars(rating) {
  return '★'.repeat(rating)
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

onMounted(() => {
  getBusiness()
  getListings()
})

watch(() => props.businessId, () => {
  getBusiness()
  getListings()
})

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

    <!-- Back to Businesses -->
    <RouterLink
        to="/businesses"
        class="back-link"
      >
      ← Back to Businesses
    </RouterLink>
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

      <div class="favourite-area">
        <button v-if="canFavourite" class="favourite-button" @click="toggleFavourite">
          {{ isFavourite ? 'Remove from favourites' : 'Save business' }}
        </button>
        <p v-if="favouriteMessage">{{ favouriteMessage }}</p>
      </div>

      <!-- Contact Information -->
      <section class="profile-section">
        <h1>Contact Information</h1>

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
        <p>
          <strong>Pickup Instructions:</strong>
          {{
            business.pickup_instructions ||
            'No pickup instructions provided.'
          }}
        </p>

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

      <section class="listings-section" aria-labelledby="available-listings-heading">
        <div class="listings-heading">
          <div>
            <p class="section-label">AVAILABLE TO RESCUE</p>
            <h2 id="available-listings-heading">Listings from {{ business.name }}</h2>
          </div>
          <span v-if="!listingsLoading && !listingsError" class="listing-count">
            {{ listings.length }} {{ listings.length === 1 ? 'listing' : 'listings' }}
          </span>
        </div>

        <p v-if="listingsLoading" class="listing-state" aria-live="polite">
          Loading available listings…
        </p>

        <p v-else-if="listingsError" class="listing-state error" role="alert">
          {{ listingsError }}
        </p>

        <div v-else-if="listings.length" class="listing-grid">
          <CustomerListingCard
            v-for="listing in listings"
            :key="listing._id"
            :listing="listing"
          />
        </div>

        <div v-else class="empty-listings">
          <h3>No listings available right now</h3>
          <p>Check back later for new food from {{ business.name }}.</p>
        </div>
      </section>
      <section class="reviews-section">
        <h2>Customer reviews</h2>

        <p v-if="reviewsLoading">Loading reviews...</p>
        <p v-else-if="reviewsError" class="error">{{ reviewsError }}</p>
        <p v-else-if="reviews.length === 0">No reviews yet.</p>

        <article v-for="review in reviews" :key="review._id" class="review-card">
          <p class="review-stars">{{ reviewStars(review.rating) }}</p>
          <p>{{ review.comment || 'No comment added.' }}</p>
        </article>
      </section>
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

/* Customer Listings */
.listings-section {
  margin-bottom: 24px;
  padding: 24px;
  border: 1px solid #dfe6df;
  border-radius: 12px;
  background-color: #f5f9f2;
}

.listings-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 20px;
}

.section-label {
  margin: 0 0 5px;
  color: #718b78;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.listings-heading h2 {
  margin: 0;
  color: #256b45;
  font-size: 26px;
}

.listing-count {
  padding: 6px 10px;
  border-radius: 999px;
  color: #45604e;
  background-color: #e4ede0;
  font-size: 12px;
  font-weight: 700;
}

.listing-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}

.listing-state,
.empty-listings {
  margin: 0;
  padding: 28px;
  border-radius: 10px;
  background-color: white;
  text-align: center;
}

.listing-state {
  color: #66746b;
}

.empty-listings h3 {
  margin: 0 0 6px;
  color: #345b43;
}

.empty-listings p {
  margin: 0;
  color: #748078;
}

.favourite-area {
  margin-bottom: 20px;
}

.favourite-area p {
  margin: 8px 0 0;
  color: #4c6756;
}

.favourite-button {
  padding: 10px 16px;
  border: 1px solid #256b45;
  border-radius: 8px;
  color: white;
  background-color: #256b45;
  cursor: pointer;
}

.reviews-section {
  margin-bottom: 24px;
  padding: 24px;
  border: 1px solid #ddd;
  border-radius: 12px;
  background-color: white;
}

.reviews-section h2 {
  color: #256b45;
}

.review-card {
  margin-top: 14px;
  padding: 16px;
  border-radius: 9px;
  background-color: #f5f9f2;
}

.review-card p {
  margin: 0 0 6px;
}

.review-stars {
  color: #e0a100;
  font-size: 20px;
}

/* Profile Sections */
.profile-section {
  background-color: white;
  border: 1px solid #ddd;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
}

.profile-section h1 {
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

  .listings-section {
    padding: 18px;
  }

  .listing-grid {
    grid-template-columns: 1fr;
  }

  .map {
    height: 300px;
  }
}
</style>
