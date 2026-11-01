<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import DisplayHeading from '@/components/DisplayHeading.vue'
import axios from 'axios'
import { useAuth } from '@clerk/vue'
import { collectionWindow, formatPrice, shortTime, dayLabel } from '../../formatters.js'
import { canCollect, needsPayment, paymentAmount, paymentLabel, paymentStatusOf } from '../../payments.js'
import PickupMap from '../../components/listings/PickupMap.vue'
import { API_URL } from '@/config'

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
const checkoutLinks = ref({})
const payingId = ref('')
let collectionCheckTimer = null
let checkingCollection = false

const collectionQrUrl = computed(function () {
  if (!collectionCode.value) return ''
  return 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=' + encodeURIComponent(collectionCode.value)
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

const statusTabs = [
  { value: 'ALL', label: 'All' },
  { value: 'RESERVED', label: 'Reserved' },
  { value: 'COLLECTED', label: 'Collected' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'EXPIRED', label: 'Expired' }
]

const stars = [1, 2, 3, 4, 5]
const tileTones = ['', 'dark', 'khaki', 'sand']

const statusCounts = computed(function () {
  const counts = { ALL: 0, RESERVED: 0, COLLECTED: 0, CANCELLED: 0, EXPIRED: 0 }
  for (const reservation of reservations.value) {
    counts[reservation.status] = counts[reservation.status] + 1
    if (reservation.status !== 'CANCELLED') counts.ALL = counts.ALL + 1
  }
  return counts
})

const hasUnpaid = computed(function () {
  return reservations.value.some(function (reservation) {
    return needsPayment(reservation)
  })
})

const nextPickup = computed(function () {
  let next = null
  for (const reservation of reservations.value) {
    if (reservation.status !== 'RESERVED') continue
    if (
      next === null ||
      new Date(reservation.listing_snapshot.collection_start_at) < new Date(next.listing_snapshot.collection_start_at)
    ) {
      next = reservation
    }
  }
  return next
})

function tileClass(reservation, index) {
  if (reservation.thumbnail_url && !failedImages.value[reservation._id]) return 'photo'
  return tileTones[index % tileTones.length]
}

function tileStyle(reservation) {
  if (!reservation.thumbnail_url || failedImages.value[reservation._id]) return {}
  return { backgroundImage: 'url("' + reservation.thumbnail_url + '")' }
}

function tileWord(reservation) {
  return reservation.listing_snapshot.title.trim().split(' ')[0]
}

function windowOf(reservation) {
  return collectionWindow(
    reservation.listing_snapshot.collection_start_at,
    reservation.listing_snapshot.collection_end_at
  )
}

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
      stopCollectionChecks()
      collectionCheckTimer = setInterval(() => checkCollectionStatus(reservation), 5000)
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
    if (response.data.payment) reservationToCancel.value.payment = response.data.payment
    reservationToCancel.value = null
    if (response.data.payment && response.data.message) {
      successMessage.value = response.data.message
    } else if (response.data.stockRestorationPending) {
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

async function startPayment(reservation) {
  if (payingId.value) return
  payingId.value = reservation._id
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const response = await axios.post(
      `${API_URL}/reservations/checkout`,
      { reservationId: reservation._id },
      { headers: await getHeaders() }
    )
    if (response.data.payment) reservation.payment = response.data.payment
    if (response.data.checkoutUrl) {
      checkoutLinks.value[reservation._id] = response.data.checkoutUrl
    } else {
      errorMessage.value = 'This reservation can no longer be paid. Refresh to see its latest status.'
    }
  } catch (error) {
    errorMessage.value =
      (error.response && error.response.data && error.response.data.error) ||
      'Checkout is unavailable right now. Please try again.'
  } finally {
    payingId.value = ''
  }
}

function formatDate(value) {
  if (!value) return 'Not available'
  return dayLabel(value) + ' ' + shortTime(value)
}

function totalPrice(reservation) {
  return formatPrice(
    reservation.listing_snapshot.rescue_unit_price_sgd * reservation.quantity
  )
}

function bundleItems(reservation) {
  if (!reservation.bundle_group_id) return []

  return reservations.value.filter(function (item) {
    return item.bundle_group_id === reservation.bundle_group_id
  })
}

function bundlePosition(reservation) {
  return bundleItems(reservation).findIndex(function (item) {
    return item._id === reservation._id
  }) + 1
}

function bundleTotal(reservation) {
  const total = bundleItems(reservation).reduce(function (sum, item) {
    return sum + item.listing_snapshot.rescue_unit_price_sgd * item.quantity
  }, 0)

  return formatPrice(total)
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
    <section class="container-xxl px-4 pt-5">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-4">
        <div>
          <p class="rb-script rb-kicker fs-3">your rescues</p>
          <DisplayHeading :size="160">My orders</DisplayHeading>
        </div>
      </div>
    </section>

    <section v-if="nextPickup" class="container-xxl px-4 mt-5">
      <div class="next-pickup p-4 p-md-5 d-flex flex-wrap align-items-center justify-content-between gap-4">
        <div class="d-flex flex-wrap align-items-center gap-4">
          <p class="rb-label next-label"><span class="dot rb-live" aria-hidden="true"></span>Next pickup</p>
          <p class="rb-display display-5 next-time">{{ windowOf(nextPickup) }}</p>
          <p class="next-copy">
            {{ nextPickup.listing_snapshot.title }} × {{ nextPickup.quantity }}<br />
            {{ nextPickup.listing_snapshot.business_name }}
          </p>
        </div>
        <a v-if="needsPayment(nextPickup) && checkoutLinks[nextPickup._id]" :href="checkoutLinks[nextPickup._id]" class="rb-pill rb-pill-dark">Pay {{ paymentAmount(nextPickup) }} with Stripe</a>
        <button
          v-else-if="needsPayment(nextPickup)"
          type="button"
          class="rb-pill rb-pill-dark"
          :disabled="payingId === nextPickup._id"
          @click="startPayment(nextPickup)"
        >{{ payingId === nextPickup._id ? 'Opening checkout…' : 'Complete payment' }}</button>
        <button v-else type="button" class="rb-pill rb-pill-dark" @click="showCollectionCode(nextPickup)">Show collection QR</button>
      </div>
    </section>

    <section class="container-xxl px-4 pt-5 pb-5">
      <div class="status-tabs d-flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        <button
          v-for="tab in statusTabs"
          :key="tab.value"
          type="button"
          class="rb-chip"
          :class="{ active: selectedStatus === tab.value }"
          :aria-pressed="selectedStatus === tab.value"
          @click="selectedStatus = tab.value"
        >{{ tab.label }} <span class="count">{{ statusCounts[tab.value] }}</span></button>
      </div>

      <div v-if="successMessage" class="rb-note mt-4" role="status">
        <span>{{ successMessage }}</span>
        <button type="button" class="btn-close" aria-label="Dismiss message" @click="successMessage = ''"></button>
      </div>
      <div v-if="errorMessage" class="rb-note error mt-4" role="alert">
        <span>{{ errorMessage }}</span>
        <button type="button" class="btn-close" aria-label="Dismiss message" @click="errorMessage = ''"></button>
      </div>

      <div v-if="!loading && hasUnpaid" class="rb-note mt-4">
        <span>Just paid? Stripe can take a minute to confirm your payment.</span>
        <button type="button" class="rb-pill rb-pill-line rb-pill-sm" @click="getReservations">Refresh</button>
      </div>

      <p v-if="loading" class="rb-label mt-4">Loading your orders…</p>

      <div v-else-if="filteredReservations.length === 0" class="empty-state mt-4">
        <p class="rb-display display-6 empty-title">Nothing here yet</p>
        <p class="mb-0">No reservations found for this status.</p>
      </div>

      <TransitionGroup tag="div" name="stag" appear v-else class="orders-list">
        <article
          v-for="(reservation, index) in filteredReservations"
          :key="reservation._id" :style="{ '--i': index }"
          class="order-row d-flex flex-wrap gap-4"
          :class="{ 'bundle-order': reservation.bundle_group_id }"
        >
          <div v-if="reservation.bundle_group_id" class="bundle-banner">
            <div>
              <p class="rb-label bundle-label">Bundle order</p>
              <p class="bundle-copy">
                Item {{ bundlePosition(reservation) }} of {{ bundleItems(reservation).length }}
                · 10% discount applied
              </p>
            </div>
            <div class="bundle-total">
              <span class="rb-label">Bundle total</span>
              <strong>{{ bundleTotal(reservation) }}</strong>
            </div>
          </div>

          <div class="rb-tile order-thumb" :class="tileClass(reservation, index)" :style="tileStyle(reservation)">
            <img
              v-if="reservation.thumbnail_url && !failedImages[reservation._id]"
              :src="reservation.thumbnail_url"
              alt=""
              class="photo-probe"
              @error="failedImages[reservation._id] = true"
            />
            <span v-else class="rb-tile-word thumb-word" aria-hidden="true">{{ tileWord(reservation) }}</span>
          </div>

          <div class="order-body d-flex flex-column gap-3">
            <div class="d-flex flex-wrap align-items-start justify-content-between gap-3">
              <div>
                <p class="rb-label">{{ reservation.listing_snapshot.business_name }}</p>
                <h2 class="rb-display display-6 order-title">{{ reservation.listing_snapshot.title }}</h2>
              </div>
              <div class="d-flex flex-wrap gap-2">
                <span :class="['rb-status', reservation.status.toLowerCase()]">{{ reservation.status }}</span>
                <span v-if="reservation.bundle_group_id" class="rb-status bundle-badge">Part of bundle</span>
                <span v-if="paymentLabel(reservation)" :class="['rb-status', paymentLabel(reservation).tone]">{{ paymentLabel(reservation).text }}</span>
              </div>
            </div>

            <dl class="row g-3 order-facts">
              <div class="col-6 col-md-3"><dt class="rb-label">Quantity</dt><dd>{{ reservation.quantity }}</dd></div>
              <div class="col-6 col-md-3"><dt class="rb-label">Total</dt><dd>{{ totalPrice(reservation) }}</dd></div>
              <div class="col-12 col-md-3"><dt class="rb-label">Pickup</dt><dd>{{ reservation.listing_snapshot.pickup_address }}</dd></div>
              <div class="col-12 col-md-3"><dt class="rb-label">Collection window</dt><dd>{{ windowOf(reservation) }}</dd></div>
            </dl>

            <div class="d-flex flex-wrap gap-3">
              <button
                v-if="reservation.status === 'RESERVED' && canCollect(reservation)"
                type="button"
                class="rb-pill rb-pill-dark"
                @click="showCollectionCode(reservation)"
              >Show collection QR</button>
              <a
                v-if="needsPayment(reservation) && checkoutLinks[reservation._id]"
                :href="checkoutLinks[reservation._id]"
                class="rb-pill rb-pill-dark"
              >Pay {{ paymentAmount(reservation) }} with Stripe</a>
              <button
                v-else-if="needsPayment(reservation)"
                type="button"
                class="rb-pill rb-pill-dark"
                :disabled="payingId === reservation._id"
                @click="startPayment(reservation)"
              >{{ payingId === reservation._id ? 'Opening checkout…' : 'Complete payment' }}</button>
              <button type="button" class="rb-pill rb-pill-line" @click="selectedReservation = reservation">
                View details
              </button>
              <button
                v-if="reservation.status === 'RESERVED'"
                type="button"
                class="rb-pill rb-pill-text"
                @click="openCancelConfirmation(reservation)"
              >Cancel order</button>
            </div>

            <template v-if="reservation.status === 'COLLECTED'">
              <Transition name="slide-down" mode="out-in">
                <div v-if="reservation.review" class="review-card">
                  <p class="rb-label">Your review</p>
                  <p class="star-row" :aria-label="reservation.review.rating + ' out of 5'">
                    <svg
                      v-for="star in stars.slice(0, reservation.review.rating)"
                      :key="star"
                      aria-hidden="true"
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    ><path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9Z"></path></svg>
                  </p>
                  <p class="mb-0">{{ reservation.review.comment || 'No comment added.' }}</p>
                </div>

                <form v-else class="review-form" @submit.prevent="submitReview(reservation)">
                  <p class="rb-display review-title">How was it?</p>
                  <div class="d-flex gap-1" role="group" aria-label="Rating">
                    <button
                      v-for="star in stars"
                      :key="star"
                      type="button"
                      class="star-button"
                      :aria-label="star + (star === 1 ? ' star' : ' stars')"
                      :aria-pressed="reviewForms[reservation._id].rating === star"
                      @click="reviewForms[reservation._id].rating = star"
                    >
                      <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" :fill="star <= reviewForms[reservation._id].rating ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9Z"></path></svg>
                    </button>
                  </div>

                  <div class="d-flex flex-column gap-2">
                    <label :for="'review-' + reservation._id" class="rb-label">Comment (optional)</label>
                    <textarea
                      :id="'review-' + reservation._id"
                      v-model.trim="reviewForms[reservation._id].comment"
                      rows="3"
                      maxlength="500"
                      placeholder="Share your collection experience"
                    ></textarea>
                  </div>

                  <div><button type="submit" class="rb-pill rb-pill-dark">Submit review</button></div>
                </form>
              </Transition>
            </template>
          </div>
        </article>
      </TransitionGroup>
    </section>

    <Transition name="pop">
      <div v-if="collectionReservation" class="rb-backdrop" @click.self="closeCollectionCode">
        <div class="rb-dialog qr-dialog" role="dialog" aria-modal="true" aria-labelledby="collection-title" @keydown.esc="closeCollectionCode">
          <div class="d-flex justify-content-between align-items-center gap-3">
            <p class="rb-label">{{ collectionReservation.listing_snapshot.business_name }}</p>
            <button type="button" class="rb-close" aria-label="Close collection code" autofocus @click="closeCollectionCode">×</button>
          </div>
          <h2 id="collection-title" class="rb-display display-6 qr-title">{{ collectionReservation.listing_snapshot.title }}</h2>

          <p v-if="collectionLoading" class="rb-label mt-4" role="status">Loading your collection QR…</p>
          <p v-else-if="collectionError" class="rb-note error mt-4" role="alert">{{ collectionError }}</p>
          <template v-else>
            <div class="qr-frame">
              <img
                :src="collectionQrUrl"
                :alt="collectionReservation.status === 'COLLECTED' ? 'Collection QR code (no longer valid)' : 'Collection QR code'"
                width="224"
                height="224"
                class="qr-image rb-wipe"
                @error="collectionError = 'Unable to generate your collection QR.'"
              />
              <span v-if="collectionReservation.status !== 'COLLECTED'" class="rb-scan" aria-hidden="true"></span>
              <div v-if="collectionReservation.status === 'COLLECTED'" class="qr-overlay" aria-hidden="true">
                <span class="qr-tick">✓</span>
                <strong class="rb-display qr-word">Collected</strong>
              </div>
            </div>
            <p v-if="collectionReservation.status === 'COLLECTED'" class="qr-copy" role="status">Listing collected. You may close this.</p>
            <p v-else class="qr-copy">Show this at the counter. Staff scan it to confirm your pickup.</p>
            <p v-if="collectionStatusError" class="rb-note mt-3" role="alert">{{ collectionStatusError }}</p>
            <p class="rb-label qr-meta">{{ collectionReservation.quantity }} · {{ windowOf(collectionReservation) }}</p>
          </template>
        </div>
      </div>
    </Transition>

    <Transition name="pop">
      <div v-if="selectedReservation" class="rb-backdrop" @click.self="selectedReservation = null">
        <div class="rb-dialog" role="dialog" aria-modal="true" aria-labelledby="details-title" @keydown.esc="selectedReservation = null">
          <div class="d-flex justify-content-between align-items-start gap-3 mb-4">
            <div>
              <p class="rb-label mb-1">Reservation details</p>
              <h2 id="details-title" class="rb-display display-6 dialog-title">{{ selectedReservation.listing_snapshot.title }}</h2>
              <p class="rb-label mt-1">{{ selectedReservation.listing_snapshot.business_name }}</p>
            </div>
            <button type="button" class="rb-close" aria-label="Close details" autofocus @click="selectedReservation = null">×</button>
          </div>

          <section class="detail-panel mb-3" aria-label="Reservation summary">
            <div class="row g-3">
              <div class="col-sm-4">
                <p class="rb-label mb-1">Status</p>
                <span :class="['rb-status', selectedReservation.status.toLowerCase()]">{{ selectedReservation.status }}</span>
              </div>
              <div class="col-sm-4">
                <p class="rb-label mb-1">Quantity</p>
                <p class="fw-semibold mb-0">{{ selectedReservation.quantity }}</p>
              </div>
              <div class="col-sm-4">
                <p class="rb-label mb-1">Total price</p>
                <p class="fw-semibold mb-0">{{ totalPrice(selectedReservation) }}</p>
              </div>
              <div class="col-12">
                <p class="rb-label mb-1">Pick up by</p>
                <p class="fw-semibold mb-0">{{ formatDate(selectedReservation.listing_snapshot.collection_end_at) }}</p>
              </div>
              <div class="col-12">
                <p class="rb-label mb-1">Pickup address</p>
                <p class="fw-semibold mb-0">{{ selectedReservation.listing_snapshot.pickup_address }}</p>
              </div>
            </div>
          </section>

          <div class="instructions mb-3">
            <p class="rb-label mb-1">Pickup instructions</p>
            <p class="mb-0">{{ selectedReservation.pickup_instructions || 'No pickup instructions provided.' }}</p>
          </div>

          <p class="rb-label mb-2">Pickup location</p>
          <PickupMap
            v-if="pickupCoordinates(selectedReservation) && mapsApiKey"
            :coordinates="selectedReservation.pickup_coordinates"
            :name="selectedReservation.listing_snapshot.business_name"
          />
          <p v-else>Map unavailable for this pickup location.</p>
          <a
            v-if="pickupCoordinates(selectedReservation)"
            :href="directionsUrl(selectedReservation)"
            target="_blank"
            rel="noopener noreferrer"
            class="rb-pill rb-pill-dark w-100"
          >Get directions</a>
        </div>
      </div>
    </Transition>

    <Transition name="pop">
      <div v-if="reservationToCancel" class="rb-backdrop" @click.self="closeCancelConfirmation">
        <div class="rb-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-title" @keydown.esc="closeCancelConfirmation">
          <div class="d-flex justify-content-between align-items-start gap-3 mb-3">
            <h2 id="cancel-title" class="rb-display display-6 dialog-title">Cancel this reservation?</h2>
            <button type="button" class="rb-close" aria-label="Close confirmation" :disabled="cancelling" @click="closeCancelConfirmation">×</button>
          </div>
          <p>You will release {{ reservationToCancel.quantity }} unit(s) of {{ reservationToCancel.listing_snapshot.title }} for others to reserve.</p>
          <p v-if="paymentStatusOf(reservationToCancel) === 'PAID'" class="rb-note">
            You paid {{ paymentAmount(reservationToCancel) }}. It will be refunded to your card.
          </p>
          <p v-if="cancelError" class="rb-note error" role="alert">{{ cancelError }}</p>
          <div class="d-flex flex-column flex-sm-row justify-content-end gap-3">
            <button type="button" class="rb-pill rb-pill-line" :disabled="cancelling" autofocus @click="closeCancelConfirmation">Keep order</button>
            <button type="button" class="rb-pill rb-pill-dark" :disabled="cancelling" @click="confirmCancellation">
              {{ cancelling ? 'Cancelling…' : 'Yes, cancel order' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </main>
</template>

<style scoped>
.intro {
  max-width: 340px;
  font-size: 14px;
}

.next-pickup {
  color: #000;
  background-color: #f4b30c;
}

.next-label {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #000;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: #000;
}

.next-time {
  margin: 0;
  line-height: 1;
}

.next-copy {
  margin: 0;
  font-size: 18px;
  line-height: 27px;
}

.status-tabs {
  padding-bottom: 24px;
  border-bottom: 2px solid #000;
}

.count {
  margin-left: 4px;
}

.rb-note {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 0;
  padding: 16px 24px;
  border: 2px solid #f4b30c;
  border-radius: 28px;
}

.rb-note.error {
  border-color: #ff7a7a;
  background-color: #ff7a7a;
}

.empty-state {
  padding: 48px 24px;
  border-radius: 28px;
  color: #5f5330;
  background-color: #f6f4ed;
  text-align: center;
}

.empty-title {
  margin-bottom: 8px;
}

.order-row {
  padding: 24px 0;
  border-bottom: 1px solid #ddd9c5;
}

.bundle-order {
  margin: 16px 0;
  padding: 0 24px 24px;
  border: 2px solid #f4b30c;
  border-radius: 28px;
  background-color: #fffaf0;
}

.bundle-banner {
  display: flex;
  flex: 1 0 100%;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin: 0 -24px;
  padding: 16px 24px;
  border-radius: 25px 25px 0 0;
  color: #000;
  background-color: #f4b30c;
}

.bundle-label,
.bundle-copy {
  margin: 0;
}

.bundle-copy {
  margin-top: 4px;
  font-size: 16px;
}

.bundle-total {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  text-align: right;
}

.bundle-total strong {
  font-size: 22px;
}

.bundle-badge {
  color: #f4b30c;
  background-color: #000;
}

.order-thumb {
  flex: 0 0 160px;
  width: 160px;
  height: 160px;
  padding: 16px;
}

.photo-probe {
  display: none;
}

.thumb-word {
  font-size: 48px;
  line-height: .85;
}

.order-body {
  flex: 999 1 280px;
  min-width: 0;
}

.order-title {
  margin: 6px 0 0;
  line-height: 1.05;
}

.order-facts {
  margin: 0;
}

.order-facts dd {
  margin: 4px 0 0;
  font-size: 16px;
  line-height: 24px;
}

.review-card {
  padding: 20px;
  border-radius: 28px;
  background-color: #f6f4ed;
}

.star-row {
  display: flex;
  gap: 4px;
  margin: 8px 0;
  color: #8a6200;
}

.review-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border: 2px solid #f4b30c;
  border-radius: 28px;
}

.review-title {
  font-size: 28px;
  line-height: 32px;
}

.star-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  color: #8a6200;
  background: transparent;
}

.review-form textarea {
  padding: 16px 24px;
  border: 1px solid #ddd9c5;
  border-radius: 28px;
  color: #191200;
  background-color: #fbf9f1;
  font-size: 16px;
  line-height: 24px;
}

.qr-dialog {
  max-width: 480px;
  text-align: center;
}

.qr-title,
.dialog-title {
  margin-top: 8px;
  line-height: 1.05;
}

.qr-frame {
  position: relative;
  display: inline-block;
  margin-top: 24px;
  padding: 20px;
  background-color: #f4b30c;
}

.qr-image {
  display: block;
  padding: 12px;
  background-color: #fbf9f1;
}

.qr-overlay {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background-color: rgba(251, 249, 241, .82);
}

.qr-tick {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  color: #f4b30c;
  background-color: #000;
  font-size: 30px;
}

.qr-word {
  font-size: 40px;
}

.qr-copy {
  margin: 20px 0 0;
  color: #5f5330;
  font-size: 16px;
  line-height: 24px;
}

.qr-meta {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #ddd9c5;
  color: #191200;
}

.detail-panel {
  padding: 20px 24px;
  border-radius: 28px;
  background-color: #f6f4ed;
}

.instructions {
  padding: 16px 20px;
  border: 2px solid #f4b30c;
  border-radius: 28px;
}
</style>
