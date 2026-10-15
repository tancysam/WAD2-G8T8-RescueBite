<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { useAuth } from '@clerk/vue'
import placeholderImage from '../../assets/placeholder.jpg'

const API_URL = 'http://localhost:8000/api'
const route = useRoute()
const { getToken } = useAuth()

const listing = ref(null)
const business = ref(null)
const loading = ref(true)
const errorMessage = ref('')
const imageFailed = ref(false)
const isFavourite = ref(false)
const canFavourite = ref(false)
const favouriteMessage = ref('')
const isConsumer = ref(false)
const showReserveModal = ref(false)
const reserveQuantity = ref(1)
const reserving = ref(false)
const reservationError = ref('')
const reservationSuccess = ref(false)

const primaryImage = computed(() => {
  if (imageFailed.value) return placeholderImage
  if (
    listing.value &&
    listing.value.images &&
    listing.value.images.length > 0 &&
    listing.value.images[0].url
  ) {
    return listing.value.images[0].url
  }
  return placeholderImage
})

const imageAlt = computed(() => {
  if (listing.value && listing.value.images && listing.value.images.length > 0) {
    return listing.value.title
  }
  return ''
})

const savingsPercentage = computed(() => {
  if (!listing.value) return null

  const originalPrice = Number(listing.value.original_price_sgd)
  const rescuePrice = Number(listing.value.rescue_price_sgd)

  if (!(originalPrice > 0) || rescuePrice < 0) return null
  return Math.round(((originalPrice - rescuePrice) / originalPrice) * 100)
})

function formatPrice(value) {
  const price = Number(value)
  if (isNaN(price)) return '$0.00'
  return '$' + price.toFixed(2)
}

function formatDate(value) {
  const date = new Date(value)
  if (isNaN(date)) return 'Time unavailable'

  return date.toLocaleDateString('en-GB') + ' ' + date.toLocaleTimeString('en-US')
}

async function getListingDetails() {
  loading.value = true
  listing.value = null
  business.value = null
  errorMessage.value = ''
  imageFailed.value = false

  try {
    const listingResponse = await axios.get(
      `${API_URL}/listings/${route.params.listingId}`
    )

    listing.value = listingResponse.data.listing

    const businessResponse = await axios.get(
      `${API_URL}/businesses/${listing.value.business_id}`
    )

    business.value = businessResponse.data.business
    await checkFavourite()
    await checkConsumerRole()
  } catch (error) {
    console.error('Error fetching listing details:', error)

    if (error.response && error.response.status === 404) {
      errorMessage.value = 'This listing is unavailable or has expired.'
    } else if (error.response && error.response.data && error.response.data.error) {
      errorMessage.value = error.response.data.error
    } else {
      errorMessage.value = 'Unable to retrieve listing details.'
    }
  }

  loading.value = false
}


async function getHeaders() {
  const token = await getToken.value()
  return {
    Authorization: `Bearer ${token}`
  }
}

async function checkConsumerRole() {
  try {
    const response = await axios.get(`${API_URL}/users/me`, {
      headers: await getHeaders()
    })
    isConsumer.value = response.data.user.role === 'CONSUMER'
  } catch (error) {
    console.error('Error checking user role:', error)
    isConsumer.value = false
  }
}

function openReserveModal() {
  reserveQuantity.value = 1
  reservationError.value = ''
  reservationSuccess.value = false
  showReserveModal.value = true
}

function closeReserveModal() {
  if (!reserving.value) showReserveModal.value = false
}

async function reserveListing() {
  const quantity = Number(reserveQuantity.value)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > listing.value.quantity_available) {
    reservationError.value = 'Choose a quantity within the available stock.'
    return
  }
  if (reserving.value) return

  reserving.value = true
  reservationError.value = ''

  try {
    await axios.post(
      `${API_URL}/listings/${listing.value._id}/reservations`,
      { quantity: quantity },
      { headers: await getHeaders() }
    )

    listing.value.quantity_available = listing.value.quantity_available - quantity
    reservationSuccess.value = true
  } catch (error) {
    reservationError.value =
      (error.response && error.response.data && error.response.data.error) ||
      'Unable to reserve this listing. Please try again.'
  } finally {
    reserving.value = false
  }
}

async function checkFavourite() {
  try {
    const headers = await getHeaders()
    const response = await axios.get(
      `${API_URL}/users/me/favourites/listings`,
      { headers: headers }
    )

    canFavourite.value = true
    isFavourite.value = response.data.listings.some(function (item) {
      return item._id === listing.value._id
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
        `${API_URL}/users/me/favourites/listings/${listing.value._id}`,
        { headers: headers }
      )
      isFavourite.value = false
      favouriteMessage.value = 'Removed from favourites.'
    } else {
      await axios.put(
        `${API_URL}/users/me/favourites/listings/${listing.value._id}`,
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

onMounted(getListingDetails)
</script>

<template>
  <main class="listing-detail-page">
    <p v-if="loading" class="state-card" aria-live="polite">
      Loading listing details…
    </p>

    <section v-else-if="errorMessage" class="state-card error-state" role="alert">
      <h1>Listing unavailable</h1>
      <p>{{ errorMessage }}</p>
      <RouterLink to="/businesses">Browse businesses</RouterLink>
    </section>

    <div v-else-if="listing" class="page-content">
      <nav class="breadcrumbs" aria-label="Breadcrumb">
        <RouterLink to="/businesses">Businesses</RouterLink>
        <span aria-hidden="true">/</span>
        <RouterLink
          v-if="business"
          :to="{ name: 'business-profile', params: { businessId: business._id } }"
        >
          {{ business.name }}
        </RouterLink>
        <span aria-hidden="true">/</span>
        <span>{{ listing.title }}</span>
      </nav>

      <div class="detail-grid">
        <section class="listing-panel">
          <div class="image-wrapper">
            <img
              :src="primaryImage"
              :alt="imageAlt"
              class="listing-image"
              @error="imageFailed = true"
            />
            <span class="type-badge">
              {{ listing.listing_type === 'BUNDLE' ? 'Bundle' : 'Item' }}
            </span>
          </div>

          <div class="listing-copy">
            <p class="business-name">
              {{ business ? business.name : 'RescueBite business' }}
            </p>
            <h1>{{ listing.title }}</h1>
            <p class="description">
              {{ listing.description || 'No description provided.' }}
            </p>

            <section v-if="listing.listing_type === 'BUNDLE'" class="bundle-section">
              <h2>Bundle contents</h2>
              <ul>
                <li
                  v-for="item in listing.bundle_contents"
                  :key="`${item.name}-${item.quantity}`"
                >
                  <span>{{ item.name }}</span>
                  <strong>× {{ item.quantity }}</strong>
                </li>
              </ul>
            </section>
          </div>
        </section>

        <aside class="summary-card">
          <div class="price-row">
            <div>
              <span>Rescue price</span>
              <strong>{{ formatPrice(listing.rescue_price_sgd) }}</strong>
            </div>
            <div class="original-price">
              <del>{{ formatPrice(listing.original_price_sgd) }}</del>
              <small v-if="savingsPercentage !== null">Save {{ savingsPercentage }}%</small>
            </div>
          </div>

          <p class="availability">
            <span aria-hidden="true"></span>
            {{ listing.quantity_available }} available
          </p>

          <button
            v-if="isConsumer && listing.quantity_available > 0"
            type="button"
            class="favourite-button"
            @click="openReserveModal"
          >
            Reserve listing
          </button>
          <section class="summary-section">
            <h2>Collection window</h2>
            <p><strong>From:</strong> {{ formatDate(listing.collection_start_at) }}</p>
            <p><strong>Until:</strong> {{ formatDate(listing.collection_end_at) }}</p>
          </section>

          <section v-if="business" class="summary-section">
            <h2>Pickup location</h2>
            <p><strong>{{ business.name }}</strong></p>
            <p>{{ business.address }}</p>
            <p>Singapore {{ business.postal_code }}</p>
            <p v-if="business.pickup_instructions" class="pickup-instructions">
              {{ business.pickup_instructions }}
            </p>
          </section>

          <button v-if="canFavourite" class="favourite-button" @click="toggleFavourite">
            {{ isFavourite ? 'Remove from favourites' : 'Save listing' }}
          </button>
          <p v-if="favouriteMessage" class="favourite-message">
            {{ favouriteMessage }}
          </p>

          <RouterLink
            v-if="business"
            :to="{ name: 'business-profile', params: { businessId: business._id } }"
            class="back-button"
          >
            ← Back to {{ business.name }}
          </RouterLink>
        </aside>
      </div>
    </div>

    <div v-if="showReserveModal" class="reserve-backdrop" @click.self="closeReserveModal">
      <form
        class="reserve-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reserve-title"
        @submit.prevent="reserveListing"
        @keydown.esc="closeReserveModal"
      >
        <h2 id="reserve-title">{{ reservationSuccess ? 'Reservation confirmed' : `Reserve ${listing.title}` }}</h2>
        <div v-if="reservationSuccess" role="status">
          <p>Reserved successfully. You can view your reservation in My Orders.</p>
          <div class="reserve-actions">
            <button type="button" class="btn btn-outline-secondary" @click="closeReserveModal">Close</button>
            <RouterLink :to="{ name: 'my-orders' }" class="btn btn-success">View My Orders</RouterLink>
          </div>
        </div>
        <template v-else>
          <p class="reserve-collection-details">Collect by {{ formatDate(listing.collection_end_at) }}.</p>
          <label for="reserve-quantity">Quantity</label>
          <input
            id="reserve-quantity"
            v-model.number="reserveQuantity"
            type="number"
            min="1"
            :max="listing.quantity_available"
            required
            autofocus
          />
          <p v-if="reservationError" class="reserve-error" role="alert">{{ reservationError }}</p>
          <div class="reserve-actions">
            <button type="button" :disabled="reserving" @click="closeReserveModal" class="btn btn-outline-danger">Cancel</button>
            <button type="submit" :disabled="reserving" class="favourite-button">
              {{ reserving ? 'Reserving...' : 'Confirm reservation' }}
            </button>
          </div>
        </template>
      </form>
    </div>
  </main>
</template>

<style scoped>
/* Page Layout */
.listing-detail-page {
  min-height: 100vh;
  padding: 32px 40px;
  padding-bottom: 60px;
  background-color: #faf8f1;
  color: #183f2d;
}

.page-content {
  max-width: 1150px;
  margin: 0 auto;
}

/* Breadcrumb Navigation */
.breadcrumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 22px;
  color: #758179;
  font-size: 13px;
}

.breadcrumbs a {
  color: #256b45;
  text-decoration: none;
}

.breadcrumbs a:hover {
  text-decoration: underline;
}

.detail-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 26px;
  align-items: start;
}

/* Main Listing Panel */
.listing-panel,
.summary-card,
.state-card {
  border: 1px solid #dfe6df;
  border-radius: 18px;
  background-color: white;
}

/* Listing Image */
.image-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  height: 400px;
  border-radius: 18px 18px 0 0;
  background-color: #edf1eb;
}

.listing-image {
  max-width: 100%;
  max-height: 100%;
  background-color: #f4f4f1;
}

.type-badge {
  position: absolute;
  top: 18px;
  left: 18px;
  padding: 6px 11px;
  border-radius: 999px;
  color: #1d573b;
  background-color: rgba(255, 255, 255, 0.93);
  font-size: 11px;
  font-weight: 800;
}

/* Listing Information */
.listing-copy {
  padding: 30px;
}

.business-name {
  margin: 0 0 7px;
  color: #6d8975;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

h1 {
  margin: 0;
  color: #1b4d34;
  font-size: 42px;
  line-height: 1.1;
}

.description {
  margin: 15px 0 0;
  color: #5d6f63;
  font-size: 16px;
  line-height: 1.65;
}

/* Bundle Contents */
.bundle-section {
  margin-top: 28px;
  padding-top: 24px;
  border-top: 1px solid #e7ebe6;
}

.bundle-section h2,
.summary-section h2 {
  margin: 0 0 14px;
  color: #27563c;
  font-size: 19px;
}

.bundle-section ul {
  display: grid;
  gap: 9px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bundle-section li {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding: 11px 13px;
  border-radius: 9px;
  color: #52655a;
  background-color: #f4f7f1;
}

/* Price and Pickup Summary */
.summary-card {
  padding: 24px;
}

.price-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
}

.price-row > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.price-row span {
  color: #77847b;
  font-size: 12px;
}

.price-row strong {
  color: #256b45;
  font-size: 32px;
}

.original-price {
  align-items: flex-end;
}

.original-price del {
  color: #88948c;
  font-size: 14px;
}

.original-price small {
  padding: 4px 7px;
  border-radius: 6px;
  color: #8a5520;
  background-color: #fff0d7;
  font-weight: 700;
}

.availability {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 18px 0 4px;
  padding: 10px 12px;
  border-radius: 8px;
  color: #315f43;
  background-color: #edf6e8;
  font-size: 13px;
  font-weight: 700;
}

.availability > span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #4d9a5c;
}

/* Collection and Pickup Details */
.summary-section {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid #e7ebe6;
}

.summary-section p {
  margin: 6px 0;
  color: #5d6d63;
  font-size: 13px;
  line-height: 1.5;
}

.summary-section .pickup-instructions {
  margin-top: 12px;
  padding: 10px;
  border-radius: 8px;
  background-color: #f5f7f2;
}

.favourite-button {
  width: 100%;
  margin-top: 22px;
  padding: 11px 14px;
  border: 1px solid #256b45;
  border-radius: 8px;
  color: white;
  background-color: #256b45;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.favourite-button:hover {
  background-color: #1b5034;
}

.favourite-message {
  margin: 8px 0 0;
  color: #4c6756;
  text-align: center;
}

.reserve-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.5);
}

.reserve-dialog {
  width: 100%;
  max-width: 430px;
  padding: 24px;
  border-radius: 12px;
  background: white;
}

.reserve-collection-details {
  padding: 12px 14px;
  border: 1px solid #c9e3f3;
  border-radius: 10px;
  color: #18506b;
  background-color: #eaf6fd;
}

.reserve-dialog label,
.reserve-dialog input {
  display: block;
  width: 100%;
  margin-bottom: 10px;
}

.reserve-actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}

.reserve-actions > * {
  width: auto;
  min-height: 44px;
  margin: 0;
  padding: 11px 14px;
  font-size: 13px;
  font-weight: 700;
}

.reserve-actions > :first-child {
  flex: 1;
}

.reserve-actions > :last-child {
  flex: 2;
}

.reserve-error {
  color: #b42318;
}

.back-button {
  display: block;
  margin-top: 22px;
  padding: 11px 14px;
  border: 1px solid #256b45;
  border-radius: 8px;
  color: #256b45;
  font-size: 13px;
  font-weight: 700;
  text-align: center;
  text-decoration: none;
}

.back-button:hover {
  background-color: #eef5eb;
}

/* Loading and Error States */
.state-card {
  width: 100%;
  max-width: 600px;
  margin: 55px auto;
  padding: 30px;
  color: #5d6f63;
}

.error-state h1 {
  font-size: 30px;
}

.error-state a {
  display: inline-block;
  margin-top: 10px;
  color: #256b45;
  font-weight: 700;
}

/* Responsive Layout */
@media (max-width: 820px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .listing-detail-page {
    padding-left: 14px;
    padding-right: 14px;
  }

  h1 {
    font-size: 32px;
  }

  .image-wrapper {
    height: 260px;
  }

  .listing-copy,
  .summary-card {
    padding: 20px;
  }
}
</style>
