<script setup>
import { computed, onMounted, ref } from 'vue'
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
const failedImages = ref({})

const filteredReservations = computed(function () {
  if (selectedStatus.value === 'ALL') {
    return reservations.value
  }

  return reservations.value.filter(function (reservation) {
    return reservation.status === selectedStatus.value
  })
})

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

    reservations.value = response.data.reservations

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

    <p v-if="successMessage" class="success">{{ successMessage }}</p>
    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
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

        <button type="button" class="primary-button" @click="selectedReservation = reservation">
          View details
        </button>

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

.empty-message,
.success,
.error {
  padding: 14px;
  border-radius: 8px;
}

.empty-message {
  background-color: #f1f6ef;
}

.success {
  color: #256b45;
  background-color: #e1f2e5;
}

.error {
  color: #b42318;
  background-color: #fff0ee;
}

@media (max-width: 600px) {
  .orders-page {
    padding: 18px;
  }

  .page-heading,
  .order-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .order-details {
    gap: 12px;
  }

}
</style>
