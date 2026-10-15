<script setup>
import { computed, onMounted, ref } from 'vue'
import axios from 'axios'
import { useAuth } from '@clerk/vue'

const API_URL = 'http://localhost:8000/api'
const { getToken } = useAuth()

const reservations = ref([])
const selectedStatus = ref('ALL')
const reviewForms = ref({})
const loading = ref(true)
const errorMessage = ref('')
const successMessage = ref('')

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

        <div class="order-details">
          <p><strong>Quantity:</strong> {{ reservation.quantity }}</p>
          <p><strong>Total:</strong> {{ totalPrice(reservation) }}</p>
          <p><strong>Pickup:</strong> {{ reservation.listing_snapshot.pickup_address }}</p>
          <p>
            <strong>Collection window:</strong>
            {{ formatDate(reservation.listing_snapshot.collection_start_at) }}
            to {{ formatDate(reservation.listing_snapshot.collection_end_at) }}
          </p>
        </div>

        <RouterLink
          v-if="reservation.listing_id"
          :to="{ name: 'listing-detail', params: { listingId: reservation.listing_id } }"
          class="primary-button"
        >
          View listing
        </RouterLink>

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
  margin: 18px 0;
  padding: 16px;
  border-radius: 9px;
  background-color: #f5f7f3;
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
}
</style>
