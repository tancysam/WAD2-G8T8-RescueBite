<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import axios from 'axios'
import { useAuth } from '@clerk/vue'
import placeholderImage from '../../assets/placeholder.jpg'
import PickupMap from '../../components/listings/PickupMap.vue'

const API_URL = 'http://localhost:8000/api'
const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
const { getToken } = useAuth()

const reservations = ref([])
const selectedStatus = ref('ALL')
const reviewForms = ref({})
const loading = ref(true)
const errorMessage = ref('')
const successMessage = ref('')
const selectedReservation = ref(null)
const collectionReservation = ref(null)
const collectionCode = ref('')
const collectionLoading = ref(false)
const collectionError = ref('')
const collectionStatusError = ref('')
const reservationToCancel = ref(null)
const cancelling = ref(false)
const cancelError = ref('')
const failedImages = ref({})
let collectionCheckTimer = null
let checkingCollection = false

const collectionQrUrl = computed(function () {
  if (!collectionCode.value) return ''
  return 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=' + encodeURIComponent(collectionCode.value)
  // send collectionCode to goQR for encoding to QR image
})

const filteredReservations = computed(function () {
  if (selectedStatus.value === 'ALL') {
    return reservations.value.filter(function (reservation) {
      return reservation.status !== 'CANCELLED'
    })
  }

  return reservations.value.filter(function (reservation) {
    return reservation.status === selectedStatus.value
  })
})

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

async function getHeaders() {
  const token = await getToken.value()
  return {
    Authorization: `Bearer ${token}`
  }
}

async function getReservations() {
  loading.value = true
  errorMessage.value = ''

  try {
    const headers = await getHeaders()
    const response = await axios.get(
      `${API_URL}/users/me/reservations`,
      { headers: headers }
    )

    reservations.value = newestFirst(response.data.reservations)

    for (const reservation of reservations.value) {
      reviewForms.value[reservation._id] = {
        rating: 5,
        comment: ''
      }
    }
  } catch (error) {
    if (error.response && error.response.data && error.response.data.error) {
      errorMessage.value = error.response.data.error
    } else {
      errorMessage.value = 'Unable to load your reservation history.'
    }
  }

  loading.value = false
}

async function submitReview(reservation) {
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const headers = await getHeaders()
    const form = reviewForms.value[reservation._id]
    const response = await axios.post(
      `${API_URL}/reservations/${reservation._id}/review`,
      {
        rating: form.rating,
        comment: form.comment
      },
      { headers: headers }
    )

    reservation.review = response.data.review
    successMessage.value = 'Your review has been submitted.'
  } catch (error) {
    if (error.response && error.response.data && error.response.data.error) {
      errorMessage.value = error.response.data.error
    } else {
      errorMessage.value = 'Unable to submit your review.'
    }
  }
}

async function showCollectionCode(reservation) {
  stopCollectionChecks()
  collectionReservation.value = reservation
  collectionCode.value = ''
  collectionError.value = ''
  collectionStatusError.value = ''
  collectionLoading.value = true

  try {
    const response = await axios.get(`${API_URL}/reservations/collection-code`, {
      headers: await getHeaders(),
      params: { reservationId: reservation._id }
    })
    if (collectionReservation.value === reservation) {
      collectionCode.value = response.data.collectionCode
      // set the collectionCode
      stopCollectionChecks()
      collectionCheckTimer = setInterval(() => checkCollectionStatus(reservation), 5000)
      // check for status every 5s
    }
  } catch (error) {
    if (collectionReservation.value === reservation) {
      collectionError.value =
        (error.response && error.response.data && error.response.data.error) ||
        'Unable to load your collection code.'
    }
  } finally {
    if (collectionReservation.value === reservation) collectionLoading.value = false
  }
}

function stopCollectionChecks() {
  if (collectionCheckTimer !== null) clearInterval(collectionCheckTimer)
  collectionCheckTimer = null
}

async function checkCollectionStatus(reservation) {
  if (checkingCollection || collectionReservation.value !== reservation) return
  checkingCollection = true

  try {
    const response = await axios.get(`${API_URL}/users/me/reservations`, {
      headers: await getHeaders()
    })
    if (collectionReservation.value !== reservation) return

    const updated = response.data.reservations.find(function (item) {
      return item._id === reservation._id
    })
    if (!updated) {
      collectionStatusError.value = 'Unable to update collection status. Please refresh My Orders.'
      return
    }

    collectionStatusError.value = ''
    if (updated.status !== 'RESERVED') {
      reservation.status = updated.status
      reservation.collected_at = updated.collected_at
      stopCollectionChecks()
      if (updated.status !== 'COLLECTED') {
        collectionError.value = 'This reservation is no longer available for collection.'
      }
    }
  } catch (error) {
    if (collectionReservation.value === reservation) {
      collectionStatusError.value = 'Unable to update collection status. Please refresh My Orders.'
    }
  } finally {
    checkingCollection = false
  }
}

function closeCollectionCode() {
  stopCollectionChecks()
  collectionReservation.value = null
  collectionCode.value = ''
  collectionError.value = ''
  collectionStatusError.value = ''
}

function openCancelConfirmation(reservation) {
  reservationToCancel.value = reservation
  cancelError.value = ''
}

function closeCancelConfirmation() {
  if (!cancelling.value) reservationToCancel.value = null
}

async function confirmCancellation() {
  if (!reservationToCancel.value || cancelling.value) return

  cancelling.value = true
  cancelError.value = ''
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const response = await axios.post(
      `${API_URL}/reservations/${reservationToCancel.value._id}/cancel`,
      {},
      { headers: await getHeaders() }
    )
    reservationToCancel.value.status = 'CANCELLED'
    reservationToCancel.value = null
    if (response.data.stockRestorationPending) {
      errorMessage.value = 'Reservation cancelled, but the listing quantity needs review by the business.'
    } else if (response.data.message === 'Reservation is already cancelled') {
      successMessage.value = 'This reservation was already cancelled.'
    } else {
      successMessage.value = 'Reservation cancelled. The listing quantity has been restored.'
    }
  } catch (error) {
    cancelError.value =
      (error.response && error.response.data && error.response.data.error) ||
      'Unable to cancel this reservation. Please try again.'
  } finally {
    cancelling.value = false
  }
}

function formatDate(value) {
  if (!value) return 'Not available'

  const date = new Date(value)
  return date.toLocaleDateString('en-SG') + ' ' + date.toLocaleTimeString('en-SG')
}

function formatPrice(value) {
  return '$' + Number(value).toFixed(2)
}

function totalPrice(reservation) {
  return formatPrice(
    reservation.listing_snapshot.rescue_unit_price_sgd * reservation.quantity
  )
}

function pickupCoordinates(reservation) {
  const coordinates = reservation.pickup_coordinates
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return ''
  return coordinates[1] + ',' + coordinates[0]
}

function directionsUrl(reservation) {
  return 'https://www.google.com/maps/dir/?api=1&destination=' + pickupCoordinates(reservation)
}

onMounted(getReservations)
onUnmounted(closeCollectionCode)
</script>

<template>
  <main class="orders-page">
    <div class="page-heading">
      <div>
        <h1>My orders</h1>
        <p>View your upcoming pickups and collection history.</p>
      </div>

      <label>
        Status
        <select v-model="selectedStatus">
          <option value="ALL">All</option>
          <option value="RESERVED">Reserved</option>
          <option value="COLLECTED">Collected</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="EXPIRED">Expired</option>
        </select>
      </label>
    </div>

    <div v-if="successMessage" class="alert alert-success alert-dismissible" role="status">
      {{ successMessage }}
      <button type="button" class="btn-close" aria-label="Dismiss message" @click="successMessage = ''"></button>
    </div>
    <div v-if="errorMessage" class="alert alert-danger alert-dismissible" role="alert">
      {{ errorMessage }}
      <button type="button" class="btn-close" aria-label="Dismiss message" @click="errorMessage = ''"></button>
    </div>
    <p v-if="loading">Loading your orders...</p>

    <p v-else-if="filteredReservations.length === 0" class="empty-message">
      No reservations found for this status.
    </p>

    <section v-else class="orders-list">
      <article
        v-for="reservation in filteredReservations"
        :key="reservation._id"
        class="order-card"
      >
        <div class="order-heading">
          <div>
            <p class="business-name">{{ reservation.listing_snapshot.business_name }}</p>
            <h2>{{ reservation.listing_snapshot.title }}</h2>
          </div>
          <span :class="['status', reservation.status.toLowerCase()]">
            {{ reservation.status }}
          </span>
        </div>

        <div class="order-details d-flex flex-column-reverse flex-sm-row">
          <div class="order-text">
            <p><strong>Quantity:</strong> {{ reservation.quantity }}</p>
            <p><strong>Total:</strong> {{ totalPrice(reservation) }}</p>
            <p><strong>Pickup:</strong> {{ reservation.listing_snapshot.pickup_address }}</p>
            <p>
              <strong>Collection window:</strong>
              {{ formatDate(reservation.listing_snapshot.collection_start_at) }}
              to {{ formatDate(reservation.listing_snapshot.collection_end_at) }}
            </p>
          </div>
          <img
            :src="failedImages[reservation._id] ? placeholderImage : (reservation.thumbnail_url || placeholderImage)"
            :alt="reservation.thumbnail_url ? reservation.listing_snapshot.title : ''"
            class="order-thumbnail align-self-center align-self-sm-start"
            @error="failedImages[reservation._id] = true"
          />
        </div>

        <div class="d-flex flex-wrap gap-2">
          <button
            v-if="reservation.status === 'RESERVED'"
            type="button"
            class="primary-button"
            @click="showCollectionCode(reservation)"
          >Show collection QR</button>
          <button type="button" class="btn btn-outline-success" @click="selectedReservation = reservation">
            View details
          </button>
          <button
            v-if="reservation.status === 'RESERVED'"
            type="button"
            class="btn btn-outline-danger"
            @click="openCancelConfirmation(reservation)"
          >Cancel order</button>
        </div>

        <div v-if="reservation.status === 'COLLECTED'" class="review-section">
          <div v-if="reservation.review">
            <h3>Your review</h3>
            <p class="stars">{{ '★'.repeat(reservation.review.rating) }}</p>
            <p>{{ reservation.review.comment || 'No comment added.' }}</p>
          </div>

          <form v-else @submit.prevent="submitReview(reservation)">
            <h3>Leave a review</h3>

            <label>
              Rating
              <select v-model.number="reviewForms[reservation._id].rating">
                <option :value="5">5 - Excellent</option>
                <option :value="4">4 - Good</option>
                <option :value="3">3 - Average</option>
                <option :value="2">2 - Poor</option>
                <option :value="1">1 - Very poor</option>
              </select>
            </label>

            <label>
              Comment
              <textarea
                v-model.trim="reviewForms[reservation._id].comment"
                rows="3"
                maxlength="500"
                placeholder="Share your collection experience"
              ></textarea>
            </label>

            <button type="submit" class="primary-button">Submit review</button>
          </form>
        </div>
      </article>
    </section>

    <div v-if="collectionReservation" class="details-backdrop" @click.self="closeCollectionCode">
      <div class="details-dialog cancel-dialog" role="dialog" aria-modal="true" aria-labelledby="collection-title" @keydown.esc="closeCollectionCode">
        <div class="d-flex justify-content-between align-items-start gap-3 mb-3">
          <h2 id="collection-title" class="mb-0">Collection QR code</h2>
          <button type="button" class="btn-close" aria-label="Close collection code" autofocus @click="closeCollectionCode"></button>
        </div>
        <p v-if="collectionLoading" role="status">Loading your collection QR...</p>
        <p v-else-if="collectionError" class="alert alert-danger" role="alert">{{ collectionError }}</p>
        <div v-else class="text-center">
          <div class="collection-qr-frame">
            <img
              :src="collectionQrUrl"
              :alt="collectionReservation.status === 'COLLECTED' ? 'Collection QR code (no longer valid)' : 'Collection QR code'"
              width="250"
              height="250"
              class="img-fluid"
              @error="collectionError = 'Unable to generate your collection QR.'"
            />
            <div v-if="collectionReservation.status === 'COLLECTED'" class="collection-qr-overlay" aria-hidden="true">
              <div class="collection-qr-stamp">
                <span class="collection-qr-line"></span>
                <span class="collection-qr-tick">✓</span>
                <span class="collection-qr-line"></span>
              </div>
              <strong class="collection-qr-word">COLLECTED</strong>
            </div>
          </div>
          <p v-if="collectionReservation.status === 'COLLECTED'" class="mt-3 mb-0" role="status">Listing collected. You may close this.</p>
          <p v-else class="mt-3 mb-0">Show this QR code to the business when you collect your order.</p>
          <p v-if="collectionStatusError" class="alert alert-warning mt-3 mb-0" role="alert">{{ collectionStatusError }}</p>
        </div>
      </div>
    </div>

    <div v-if="selectedReservation" class="details-backdrop" @click.self="selectedReservation = null">
      <div class="details-dialog" role="dialog" aria-modal="true" aria-labelledby="details-title" @keydown.esc="selectedReservation = null">
        <div class="d-flex justify-content-between align-items-start gap-3 mb-4">
          <div>
            <p class="small text-uppercase text-secondary fw-semibold mb-1">Reservation details</p>
            <h2 id="details-title" class="mb-1">{{ selectedReservation.listing_snapshot.title }}</h2>
            <p class="text-secondary mb-0">{{ selectedReservation.listing_snapshot.business_name }}</p>
          </div>
          <button type="button" class="btn btn-light border rounded-circle flex-shrink-0" aria-label="Close details" autofocus @click="selectedReservation = null">×</button>
        </div>

        <section class="card border-0 bg-light mb-3" aria-label="Reservation summary">
          <div class="card-body">
            <div class="row g-3">
              <div class="col-sm-4">
                <p class="small text-secondary mb-1">Status</p>
                <span :class="['status', selectedReservation.status.toLowerCase()]">{{ selectedReservation.status }}</span>
              </div>
              <div class="col-sm-4">
                <p class="small text-secondary mb-1">Quantity</p>
                <p class="fw-semibold mb-0">{{ selectedReservation.quantity }}</p>
              </div>
              <div class="col-sm-4">
                <p class="small text-secondary mb-1">Total price</p>
                <p class="fw-semibold mb-0">{{ totalPrice(selectedReservation) }}</p>
              </div>
              <div class="col-12">
                <p class="small text-secondary mb-1">Pick up by</p>
                <p class="fw-semibold mb-0">{{ formatDate(selectedReservation.listing_snapshot.collection_end_at) }}</p>
              </div>
              <div class="col-12">
                <p class="small text-secondary mb-1">Pickup address</p>
                <p class="fw-semibold mb-0">{{ selectedReservation.listing_snapshot.pickup_address }}</p>
              </div>
            </div>
          </div>
        </section>

        <div class="alert alert-info mb-3">
          <h3 class="h6 fw-semibold mb-1">Pickup instructions</h3>
          <p class="mb-0">{{ selectedReservation.pickup_instructions || 'No pickup instructions provided.' }}</p>
        </div>

        <h3 class="h6 fw-semibold mb-2">Pickup location</h3>
        <PickupMap
          v-if="pickupCoordinates(selectedReservation) && mapsApiKey"
          :coordinates="selectedReservation.pickup_coordinates"
          :name="selectedReservation.listing_snapshot.business_name"
        />
        <p v-else class="text-secondary">Map unavailable for this pickup location.</p>
        <a
          v-if="pickupCoordinates(selectedReservation)"
          :href="directionsUrl(selectedReservation)"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-success w-100 fw-semibold"
        >Get directions</a>
      </div>
    </div>

    <div v-if="reservationToCancel" class="details-backdrop" @click.self="closeCancelConfirmation">
      <div class="details-dialog cancel-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-title" @keydown.esc="closeCancelConfirmation">
        <div class="d-flex justify-content-between align-items-start gap-3 mb-3">
          <h2 id="cancel-title" class="mb-0">Cancel this reservation?</h2>
          <button type="button" class="btn-close" aria-label="Close confirmation" :disabled="cancelling" @click="closeCancelConfirmation"></button>
        </div>
        <p>You will release {{ reservationToCancel.quantity }} unit(s) of {{ reservationToCancel.listing_snapshot.title }} for others to reserve.</p>
        <p v-if="cancelError" class="alert alert-danger" role="alert">{{ cancelError }}</p>
        <div class="d-flex flex-column flex-sm-row justify-content-end gap-2">
          <button type="button" class="btn btn-outline-secondary" :disabled="cancelling" autofocus @click="closeCancelConfirmation">Keep order</button>
          <button type="button" class="btn btn-danger" :disabled="cancelling" @click="confirmCancellation">
            {{ cancelling ? 'Cancelling...' : 'Yes, cancel order' }}
          </button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.orders-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 32px;
}

.page-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 28px;
}

h1,
h2,
h3 {
  color: #256b45;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #44544a;
  font-weight: bold;
}

select,
textarea {
  padding: 10px;
  border: 1px solid #bbb;
  border-radius: 7px;
  font: inherit;
}

.orders-list {
  display: grid;
  gap: 20px;
}

.order-card {
  padding: 24px;
  border: 1px solid #ddd;
  border-radius: 12px;
  background-color: white;
}

.order-heading {
  display: flex;
  justify-content: space-between;
  gap: 18px;
}

.business-name {
  margin-bottom: 5px;
  color: #68776d;
}

.status {
  height: fit-content;
  padding: 6px 10px;
  border-radius: 20px;
  background-color: #eee;
  font-size: 12px;
  font-weight: bold;
}

.status.reserved {
  color: #815b00;
  background-color: #fff2c7;
}

.status.collected {
  color: #256b45;
  background-color: #e1f2e5;
}

.collection-qr-frame {
  position: relative;
  display: inline-block;
}

.collection-qr-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #256b45;
  background: rgba(225, 242, 229, 0.75);
}

.collection-qr-stamp {
  display: flex;
  align-items: center;
  gap: 10px;
}

.collection-qr-line {
  width: 42px;
  border-top: 3px solid #256b45;
}

.collection-qr-tick {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  color: white;
  background: #256b45;
  font-size: 30px;
}

.collection-qr-word {
  padding: 2px 8px;
  border-bottom: 3px solid #256b45;
  font-size: 23px;
}

.order-details {
  align-items: flex-start;
  gap: 16px;
  margin: 18px 0;
  padding: 16px;
  border-radius: 9px;
  background-color: #f5f7f3;
}

.order-text {
  flex: 1;
  min-width: 0;
}

.order-thumbnail {
  width: 200px;
  height: 150px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}

.details-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.55);
}

.details-dialog {
  width: 100%;
  max-width: 620px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px;
  border-radius: 12px;
  background: white;
}

.cancel-dialog {
  max-width: 430px;
}

.order-details p {
  margin-bottom: 8px;
}

.review-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #ddd;
}

.review-section form {
  display: grid;
  gap: 15px;
}

.stars {
  color: #e0a100;
  font-size: 22px;
}

.primary-button {
  display: inline-block;
  width: fit-content;
  padding: 10px 15px;
  border: none;
  border-radius: 8px;
  color: white;
  background-color: #256b45;
  font-size: 14px;
  text-decoration: none;
  cursor: pointer;
}

.empty-message {
  padding: 14px;
  border-radius: 8px;
  background-color: #f1f6ef;
}

@media (max-width: 600px) {
  .orders-page {
    padding: 18px;
  }

  .page-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .order-details {
    gap: 12px;
  }

}
</style>
