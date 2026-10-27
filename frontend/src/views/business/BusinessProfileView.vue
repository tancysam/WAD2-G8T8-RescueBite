
<script setup>
import { ref, onMounted, nextTick, watch, onUnmounted, computed } from 'vue'
import axios from 'axios'
import { useAuth } from '@clerk/vue'
import { importLibrary } from '@googlemaps/js-api-loader'
import CustomerListingCard from '../../components/listings/CustomerListingCard.vue'
import DisplayHeading from '../../components/DisplayHeading.vue'
import { API_URL } from '@/config'

// Business ID received from Vue Router
const { getToken } = useAuth()

const stars = [1, 2, 3, 4, 5]

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

const userRole = ref(null)
const roleLoading = ref(true)
const isOwner = ref(false)

const backRoute = computed(() => {
  return userRole.value === 'BUSINESS'
    ? '/myBusinesses'
    : '/businesses'
})

async function getUserRole() {
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
    isOwner.value = false

    // Only check ownership for business accounts
    if (userRole.value === 'BUSINESS') {
      const ownedResponse = await axios.get(
        `${API_URL}/businesses/ownedBusinesses`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      for (const business of ownedResponse.data.businesses) {
        if (business._id === props.businessId) {
          isOwner.value = true
          break
        }
      }
    }

  } catch (error) {
    console.error('Error fetching user role:', error)
    isOwner.value = false
  } finally {
    roleLoading.value = false
  }
}

// Google Maps variables
let map = null
let marker = null
let requestId = 0

// Load Google Maps
async function loadMap(businessData) {
  const coordinates = businessData.location ? businessData.location.coordinates : undefined

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
      `${API_URL}/businesses/${props.businessId}`
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
    if (business.value && business.value.location) {
      await loadMap(business.value)
    }

  } catch (error) {
    if (currentRequest !== requestId) return

    console.error('Error fetching business:', error)

    errorMessage.value =
      (error.response && error.response.data && error.response.data.error) ||
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
      `${API_URL}/businesses/${props.businessId}/listings`
    )

    listings.value = response.data.listings || []

  } catch (error) {
    console.error('Error fetching listings:', error)

    listingsError.value =
      (error.response && error.response.data && error.response.data.error) ||
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
      `${API_URL}/users/me/favourites/businesses`,
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
        `${API_URL}/users/me/favourites/businesses/${props.businessId}`,
        { headers: headers }
      )
      isFavourite.value = false
      favouriteMessage.value = 'Removed from favourites.'
    } else {
      await axios.put(
        `${API_URL}/users/me/favourites/businesses/${props.businessId}`,
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
      `${API_URL}/businesses/${props.businessId}/reviews`
    )
    reviews.value = response.data.reviews
  } catch (error) {
    reviewsError.value = 'Unable to load reviews.'
  }

  reviewsLoading.value = false
}

// Open directions in Google Maps
function openDirections() {
  const coordinates = business.value && business.value.location
    ? business.value.location.coordinates
    : undefined

  if (!coordinates) return

  const [longitude, latitude] = coordinates

  const url =
    'https://www.google.com/maps/dir/?api=1' +
    `&destination=${latitude},${longitude}`

  window.open(url, '_blank', 'noopener,noreferrer')
}

onMounted(() => {
  getUserRole()
  getBusiness()
  getListings()
})

watch(() => props.businessId, () => {
  isOwner.value = false
  getUserRole()
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
    <section class="container-xxl px-4 pt-4">
      <!-- Back to Businesses -->
      <RouterLink
        v-if="!roleLoading"
        :to="backRoute"
        class="rb-label back-link"
      >
        {{ userRole === 'BUSINESS' ? '← Back to my businesses' : '← Back to businesses' }}
      </RouterLink>
    </section>

    <section class="container-xxl px-4 pb-5">
      <!-- Loading -->
      <p v-if="loading" class="rb-label mt-4">Loading business information…</p>

      <!-- Error -->
      <p v-else-if="errorMessage" class="rb-note error mt-4" role="alert">
        {{ errorMessage }}
      </p>

      <!-- Business Profile -->
      <template v-else-if="business">
        <!-- Business Header -->
        <header class="d-flex flex-wrap align-items-end justify-content-between gap-4 mt-4">
          <div class="header-copy">
            <p class="rb-script rb-kicker fs-3">rescue from</p>
            <DisplayHeading :size="128">{{ business.name }}</DisplayHeading>
            <p class="description">
              {{ business.description || 'No description available.' }}
            </p>
          </div>
          <div class="d-flex flex-wrap align-items-center gap-3">
            <RouterLink
              v-if="userRole === 'BUSINESS' && isOwner"
              :to="`/businesses/${businessId}/edit`"
              class="rb-pill rb-pill-line"
            >
              Edit business
            </RouterLink>
            <button
              v-if="canFavourite"
              type="button"
              class="rb-pill save-button"
              :aria-pressed="isFavourite"
              @click="toggleFavourite"
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" :fill="isFavourite ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"></path></svg>
              {{ isFavourite ? 'Saved' : 'Save business' }}
            </button>
          </div>
        </header>
        <p v-if="favouriteMessage" class="rb-label mt-3 text-end" aria-live="polite">{{ favouriteMessage }}</p>

        <div class="row g-4 mt-4">
          <!-- Contact Information -->
          <aside class="col-lg-4">
            <section class="info-panel p-4" aria-labelledby="info-heading">
              <h2 id="info-heading" class="rb-display display-6 mb-3">Visit</h2>

              <dl class="info-list">
                <div><dt class="rb-label">Phone</dt><dd>{{ business.phone || 'Not provided' }}</dd></div>
                <div><dt class="rb-label">Address</dt><dd>{{ business.address }}</dd></div>
                <div><dt class="rb-label">Pickup instructions</dt><dd>{{ business.pickup_instructions || 'No pickup instructions provided.' }}</dd></div>
              </dl>

              <div
                v-if="business.location && business.location.coordinates"
                ref="mapElement"
                class="map"
              ></div>
              <p v-else class="rb-label">Location unavailable.</p>

              <p v-if="mapError" class="rb-note error mt-3" role="alert">{{ mapError }}</p>

              <button
                v-if="business.location && business.location.coordinates"
                type="button"
                class="rb-pill rb-pill-dark w-100 mt-3"
                @click="openDirections"
              >
                Get directions
              </button>
            </section>
          </aside>

          <!-- Listings -->
          <section class="col-lg-8" aria-labelledby="available-listings-heading">
            <div class="section-head">
              <div>
                <p class="rb-label mb-1">Available to rescue</p>
                <h2 id="available-listings-heading" class="rb-display display-6 mb-0">Listings</h2>
              </div>
              <div class="d-flex flex-wrap align-items-center gap-3">
                <span v-if="!listingsLoading && !listingsError" class="rb-label">
                  {{ listings.length }} {{ listings.length === 1 ? 'listing' : 'listings' }}
                </span>
                <RouterLink
                  v-if="userRole === 'BUSINESS'"
                  :to="{ name: 'business-listings' }"
                  class="rb-pill rb-pill-line rb-pill-sm"
                >
                  Edit listings
                </RouterLink>
              </div>
            </div>

            <p v-if="listingsLoading" class="rb-label mt-4" aria-live="polite">
              Loading available listings…
            </p>

            <p v-else-if="listingsError" class="rb-note error mt-4" role="alert">
              {{ listingsError }}
            </p>

            <div v-else-if="listings.length" class="row row-cols-1 row-cols-md-2 g-4 mt-1">
              <div v-for="(listing, index) in listings" :key="listing._id" class="col d-flex">
                <CustomerListingCard class="w-100" :listing="listing" :index="index" :business-name="business.name" />
              </div>
            </div>

            <div v-else class="rb-empty mt-4">
              <p class="rb-display display-6 mb-2">Nothing listed right now</p>
              <p class="mb-0">Check back later for new food from {{ business.name }}.</p>
            </div>
          </section>
        </div>

        <!-- Reviews -->
        <section class="reviews mt-5" aria-labelledby="reviews-heading">
          <div class="section-head">
            <h2 id="reviews-heading" class="rb-display display-6 mb-0">Customer reviews</h2>
            <span v-if="!reviewsLoading && !reviewsError" class="rb-label">{{ reviews.length }} {{ reviews.length === 1 ? 'review' : 'reviews' }}</span>
          </div>

          <p v-if="reviewsLoading" class="rb-label mt-4">Loading reviews…</p>
          <p v-else-if="reviewsError" class="rb-note error mt-4" role="alert">{{ reviewsError }}</p>
          <p v-else-if="reviews.length === 0" class="rb-empty mt-4">No reviews yet.</p>

          <div v-else class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3 mt-1">
            <div v-for="review in reviews" :key="review._id" class="col">
              <article class="review-card h-100">
                <p class="star-row" :aria-label="review.rating + ' out of 5'">
                  <svg
                    v-for="star in stars.slice(0, review.rating)"
                    :key="star"
                    aria-hidden="true"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  ><path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9Z"></path></svg>
                </p>
                <p class="mb-0">{{ review.comment || 'No comment added.' }}</p>
              </article>
            </div>
          </div>
        </section>
      </template>
    </section>
  </main>
</template>

<style scoped>
.back-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: #191200;
  text-decoration: none;
}

.back-link:hover {
  color: #8a6200;
}

.header-copy {
  max-width: 900px;
}

.description {
  max-width: 640px;
  margin: 20px 0 0;
  font-size: 18px;
  line-height: 27px;
}

.save-button {
  color: #000;
  background-color: transparent;
}

.save-button:hover {
  color: #f4b30c;
  background-color: #000;
}

.info-panel {
  border-radius: 28px;
  background-color: #f6f4ed;
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0 0 20px;
}

.info-list dd {
  margin: 4px 0 0;
  font-size: 16px;
  line-height: 24px;
}

.map {
  width: 100%;
  height: 300px;
}

.section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 2px solid #000;
}

.review-card {
  padding: 20px 24px;
  border-radius: 28px;
  background-color: #f6f4ed;
}

.star-row {
  display: flex;
  gap: 4px;
  margin: 0 0 8px;
  color: #8a6200;
}
</style>
