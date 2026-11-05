<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { useAuth } from '@clerk/vue'
import DisplayHeading from '../../components/DisplayHeading.vue'
import PickupMap from '../../components/listings/PickupMap.vue'
import { dayLabel, formatPrice, shortTime } from '../../formatters.js'
import { newCheckoutRequestId, paymentAmount } from '../../payments.js'
import { API_URL } from '@/config'

const props = defineProps({
  profileRole: { type: String, default: null }
})

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
const isConsumer = computed(() => props.profileRole === 'CONSUMER')
const showReserveModal = ref(false)
const reserveQuantity = ref(1)
const reserving = ref(false)
const reservationError = ref('')
const reservationSuccess = ref(false)
const reservedQuantity = ref(0)
const checkoutUrl = ref('')
const amountDue = ref('')
const checkoutRequestId = ref('')
const canRetryReservation = ref(false)
const bundleOptions = ref([])
const bundleLoading = ref(false)
const bundleError = ref('')
const selectedBundleId = ref('')
const bundleSuccess = ref(false)
const bundleRequestId = ref('')
const bundleAttempt = ref(false)
const bundlePending = ref(false)

const confetti = [
  { dx: 72, dy: -44, colour: '#f4b30c' },
  { dx: -64, dy: -52, colour: '#000' },
  { dx: 84, dy: 28, colour: '#000' },
  { dx: -76, dy: 40, colour: '#f4b30c' },
  { dx: 8, dy: -86, colour: '#f4b30c' },
  { dx: -6, dy: 82, colour: '#bbb283' },
  { dx: 52, dy: 72, colour: '#f4b30c' },
  { dx: -44, dy: -84, colour: '#bbb283' }
]

const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

const photoUrl = computed(() => {
  if (imageFailed.value) return ''
  if (
    listing.value &&
    listing.value.images &&
    listing.value.images.length > 0 &&
    listing.value.images[0].url
  ) {
    return listing.value.images[0].url
  }
  return ''
})

const tileStyle = computed(() => {
  if (!photoUrl.value) return {}
  return { backgroundImage: 'url("' + photoUrl.value + '")' }
})

const tileWord = computed(() => {
  if (!listing.value) return ''
  return listing.value.title.trim().split(' ')[0]
})

const savingsPercentage = computed(() => {
  if (!listing.value) return null

  const originalPrice = Number(listing.value.original_price_sgd)
  const rescuePrice = Number(listing.value.rescue_price_sgd)

  if (!(originalPrice > 0) || rescuePrice < 0) return null
  return Math.round(((originalPrice - rescuePrice) / originalPrice) * 100)
})

const totalPrice = computed(() => {
  if (!listing.value) return formatPrice(0)
  return formatPrice(Number(listing.value.rescue_price_sgd) * reserveQuantity.value)
})


const selectedBundle = computed(() => {
  for (const option of bundleOptions.value) {
    if (option._id === selectedBundleId.value) return option
  }
  return null
})

const bundleTotal = computed(() => {
  if (!listing.value || !selectedBundle.value) return formatPrice(0)

  const total =
    Number(listing.value.rescue_price_sgd) +
    Number(selectedBundle.value.rescue_price_sgd)

  return formatPrice(Math.round(total * 90) / 100)
})

function discountedBundlePrice(option) {
  return formatPrice(Math.round(Number(option.rescue_price_sgd) * 90) / 100)
}

function bundleImage(option) {
  if (option.images && option.images.length > 0) return option.images[0].url
  return ''
}

const pickupCoordinates = computed(() => {
  if (!business.value || !business.value.location || !business.value.location.coordinates) return null
  const coordinates = business.value.location.coordinates
  if (coordinates.length !== 2) return null
  return coordinates
})

function formatDate(value) {
  const date = new Date(value)
  if (!(Number(date) > 0)) return 'Time unavailable'

  return date.toLocaleDateString('en-GB') + ' ' + shortTime(value)
}

function changeQuantity(step) {
  const next = reserveQuantity.value + step
  if (next < 1 || next > listing.value.quantity_available) return
  reserveQuantity.value = next
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
    loading.value = false
    checkFavourite()
    loadBundleOptions()
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

async function loadBundleOptions() {
  bundleOptions.value = []
  selectedBundleId.value = ''
  bundleError.value = ''

  if (!isConsumer.value || !listing.value.bundle_eligible) return

  bundleLoading.value = true
  try {
    const response = await axios.get(
      `${API_URL}/listings/${listing.value._id}/bundle-options`,
      { headers: await getHeaders() }
    )
    bundleOptions.value = response.data.listings || []
  } catch (error) {
    bundleOptions.value = []
    bundleError.value = 'Unable to load nearby bundle options.'
  } finally {
    bundleLoading.value = false
  }
}

function selectBundleOption(optionId) {
  bundleRequestId.value = ''
  if (selectedBundleId.value === optionId) {
    selectedBundleId.value = ''
  } else {
    selectedBundleId.value = optionId
  }
}

async function reserveBundle() {
  if (!selectedBundleId.value || reserving.value) return

  reserving.value = true
  reservationError.value = ''
  reservationSuccess.value = false
  bundleSuccess.value = false
  bundlePending.value = false
  bundleAttempt.value = true
  canRetryReservation.value = false
  showReserveModal.value = true

  if (!bundleRequestId.value) bundleRequestId.value = newCheckoutRequestId()

  try {
    const response = await axios.post(
      `${API_URL}/reservations/bundle`,
      {
        listingId: listing.value._id,
        partnerListingId: selectedBundleId.value,
        checkoutRequestId: bundleRequestId.value
      },
      { headers: await getHeaders() }
    )

    if (response.data.status !== 'READY') {
      bundlePending.value = true
      reservationError.value =
        response.data.message || 'We are still confirming your bundle. Please try again in a moment.'
      canRetryReservation.value = true
      return
    }

    bundleRequestId.value = ''
    listing.value.quantity_available = listing.value.quantity_available - 1
    bundleSuccess.value = true
    reservationSuccess.value = true
  } catch (error) {
    const unknownOutcome = !error.response || error.response.status >= 500
    if (!unknownOutcome) {
      bundleRequestId.value = ''
    }
    canRetryReservation.value = unknownOutcome
    bundlePending.value = unknownOutcome

    reservationError.value =
      (error.response && error.response.data && error.response.data.error) ||
      'We could not confirm this bundle. Please try again.'
  } finally {
    reserving.value = false
  }
}

async function openReserveModal() {
  reservationError.value = ''
  reservationSuccess.value = false
  bundleAttempt.value = false
  bundlePending.value = false
  checkoutUrl.value = ''
  amountDue.value = ''
  checkoutRequestId.value = newCheckoutRequestId()
  canRetryReservation.value = false
  showReserveModal.value = true
  await reserveListing()
}

async function retryReservation() {
  reservationError.value = ''
  if (bundleAttempt.value) {
    await reserveBundle()
    return
  }
  await reserveListing()
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
    const response = await axios.post(
      `${API_URL}/listings/${listing.value._id}/reservations`,
      { quantity: quantity, checkoutRequestId: checkoutRequestId.value },
      { headers: await getHeaders() }
    )

    checkoutUrl.value = response.data.checkoutUrl || ''
    amountDue.value = paymentAmount(response.data.reservation)

    listing.value.quantity_available = listing.value.quantity_available - quantity
    reservedQuantity.value = quantity
    reserveQuantity.value = 1
    reservationSuccess.value = true
  } catch (error) {
    reservationError.value =
      (error.response && error.response.data && error.response.data.error) ||
      'Unable to reserve this listing. Please try again.'
    canRetryReservation.value = !error.response || error.response.status === 503
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
  <main class="listing-detail-page container-xxl px-4 pt-4 pb-5">
    <p v-if="loading" class="rb-label state-card" aria-live="polite">
      Loading listing details…
    </p>

    <section v-else-if="errorMessage" class="state-card" role="alert">
      <h1 class="rb-display display-5 state-title">Listing unavailable</h1>
      <p>{{ errorMessage }}</p>
      <RouterLink to="/businesses" class="rb-pill rb-pill-dark">Browse businesses</RouterLink>
    </section>

    <div v-else-if="listing">
      <RouterLink
        v-if="business"
        :to="{ name: 'business-profile', params: { businessId: business._id } }"
        class="rb-label back-link"
      >
        ← Back to {{ business.name }}
      </RouterLink>
      <nav class="rb-label breadcrumbs" aria-label="Breadcrumb">
        <RouterLink to="/businesses">Businesses</RouterLink>
        <span aria-hidden="true">/</span>
        <template v-if="business">
          <RouterLink :to="{ name: 'business-profile', params: { businessId: business._id } }">
            {{ business.name }}
          </RouterLink>
          <span aria-hidden="true">/</span>
        </template>
        <span aria-current="page" class="current">{{ listing.title }}</span>
      </nav>

      <div class="row g-5 mt-0">
        <section class="col-lg-7">
          <div class="rb-tile hero-tile" :class="{ photo: photoUrl }" :style="tileStyle">
            <img v-if="photoUrl" :src="photoUrl" alt="" class="photo-probe" @error="imageFailed = true" />
            <span class="rb-tag rb-tag-dark hero-tag">
              {{ listing.listing_type === 'BUNDLE' ? 'Bundle' : 'Item' }}
            </span>
            <span v-if="!photoUrl" class="rb-tile-word display-1 hero-word d-xl-none" aria-hidden="true">{{ tileWord }}</span>
            <span v-if="!photoUrl" class="rb-tile-word hero-word hero-word-xl d-none d-xl-block" aria-hidden="true">{{ tileWord }}</span>
          </div>

          <p class="rb-label business-line">
            {{ business ? business.name : 'RescueBite business' }}
          </p>
          <div class="listing-title"><DisplayHeading :size="104">{{ listing.title }}</DisplayHeading></div>
          <p class="description">
            {{ listing.description || 'No description provided.' }}
          </p>

          <section v-if="listing.listing_type === 'BUNDLE' && listing.bundle_contents.length > 0" class="bundle-section">
            <h2 class="rb-display display-6 section-title">What’s inside</h2>
            <ul>
              <li
                v-for="item in listing.bundle_contents"
                :key="`${item.name}-${item.quantity}`"
              >
                <span class="rb-display item-name">{{ item.name }}</span>
                <span class="rb-mono">× {{ item.quantity }}</span>
              </li>
            </ul>
          </section>
        </section>

        <aside class="col-lg-5 d-flex flex-column gap-4">
          <div class="price-card p-4 p-md-5">
            <p class="rb-label price-label">Rescue price</p>
            <p class="rb-display display-1 price">{{ formatPrice(listing.rescue_price_sgd) }}</p>
            <div class="d-flex flex-wrap align-items-center gap-3 mt-2">
              <del class="rb-mono">{{ formatPrice(listing.original_price_sgd) }}</del>
              <span v-if="savingsPercentage !== null" class="save-tag">Save {{ savingsPercentage }}%</span>
            </div>
            <p class="rb-label availability">
              {{ listing.quantity_available }} available
            </p>

            <template v-if="isConsumer && listing.quantity_available > 0">
              <div class="quantity-row">
                <span id="qty-label" class="rb-label price-label">Quantity</span>
                <div class="d-flex align-items-center gap-3" role="group" aria-labelledby="qty-label">
                  <button type="button" class="step step-line" aria-label="Decrease quantity" @click="changeQuantity(-1)">−</button>
                  <output class="rb-display qty" aria-live="polite"><span :key="reserveQuantity" class="rb-bump">{{ reserveQuantity }}</span></output>
                  <button type="button" class="step step-dark" aria-label="Increase quantity" @click="changeQuantity(1)">+</button>
                </div>
              </div>
              <div class="total-row rb-label price-label">
                <span>Total</span>
                <span :key="totalPrice" class="rb-display total rb-bump">{{ totalPrice }}</span>
              </div>
            </template>

            <div class="d-flex flex-column gap-3 mt-4">
              <button
                v-if="isConsumer && listing.quantity_available > 0"
                type="button"
                class="rb-pill rb-pill-dark w-100"
                :disabled="reserving"
                @click="openReserveModal"
              >
                {{ reserving ? 'Reserving…' : 'Reserve listing' }}
              </button>
              <p v-if="bundleLoading" class="rb-label" role="status">Loading nearby bundle options…</p>
              <p v-else-if="bundleError" class="rb-note error" role="alert">{{ bundleError }}</p>
              <p v-else-if="isConsumer && listing.bundle_eligible && bundleOptions.length === 0" class="rb-label">No nearby bundle options available.</p>
              <section v-else-if="bundleOptions.length > 0" class="partner-bundle">
                <p class="rb-label mb-1">Nearby bundle deal</p>
                <h2 class="rb-display bundle-heading">Add another rescue and save 10%</h2>
                <p class="bundle-note">
                  Choose one nearby item. You will collect each order from its own business.
                </p>
                <p class="bundle-count">
                  {{ bundleOptions.length }} {{ bundleOptions.length === 1 ? 'option' : 'options' }} available
                </p>

                <div class="bundle-options">
                  <button
                    v-for="option in bundleOptions"
                    :key="option._id"
                    type="button"
                    :class="['bundle-option', { selected: selectedBundleId === option._id }]"
                    :aria-pressed="selectedBundleId === option._id"
                    @click="selectBundleOption(option._id)"
                  >
                    <img
                      v-if="bundleImage(option)"
                      :src="bundleImage(option)"
                      :alt="option.title"
                      class="bundle-photo"
                    />
                    <div v-else class="bundle-photo bundle-placeholder">
                      {{ option.title.trim().split(' ')[0] }}
                    </div>

                    <div class="bundle-option-info">
                      <span class="bundle-check" aria-hidden="true">
                        <span class="bundle-check-symbol">
                          {{ selectedBundleId === option._id ? '✓' : '+' }}
                        </span>
                      </span>
                      <span class="bundle-business">{{ option.business_name }}</span>
                      <strong>{{ option.title }}</strong>
                      <span class="bundle-time">
                        {{ shortTime(option.collection_start_at) }}–{{ shortTime(option.collection_end_at) }}
                      </span>
                      <span v-if="option.business_address" class="bundle-address">
                        {{ option.business_address }}<template v-if="option.business_postal_code">, Singapore {{ option.business_postal_code }}</template>
                      </span>
                      <span class="bundle-prices">
                        <s>{{ formatPrice(option.rescue_price_sgd) }}</s>
                        <strong class="bundle-price">{{ discountedBundlePrice(option) }}</strong>
                      </span>
                    </div>
                  </button>
                </div>

                <div v-if="selectedBundle" class="bundle-summary">
                  <div>
                    <span>2 items after 10% off</span>
                    <button
                      type="button"
                      class="bundle-remove"
                      @click="selectedBundleId = ''"
                    >
                      Remove added item
                    </button>
                  </div>
                  <strong>{{ bundleTotal }}</strong>
                </div>

                <button
                  type="button"
                  class="rb-pill rb-pill-dark w-100"
                  :class="{ 'bundle-submit-disabled': !selectedBundleId || reserving }"
                  :disabled="!selectedBundleId || reserving"
                  @click="reserveBundle"
                >
                  {{ reserving ? 'Reserving both…' : 'Reserve both items' }}
                </button>
                <p class="bundle-qr-note">You will receive two pickup QR codes.</p>
              </section>
              <button
                v-if="canFavourite"
                type="button"
                class="rb-pill save-button w-100"
                :aria-pressed="isFavourite"
                @click="toggleFavourite"
              >
                <svg :key="'heart-' + isFavourite" class="rb-pop" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" :fill="isFavourite ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"></path></svg>
                {{ isFavourite ? 'Saved' : 'Save listing' }}
              </button>
            </div>
            <p v-if="favouriteMessage" class="favourite-message" aria-live="polite">
              {{ favouriteMessage }}
            </p>
          </div>

          <section class="px-1">
            <h2 class="rb-label">Collection window</h2>
            <div class="row g-3 mt-0">
              <div class="col-6">
                <div class="time-card">
                  <p class="rb-label">From</p>
                  <p class="rb-display time">{{ shortTime(listing.collection_start_at) }}</p>
                  <p class="rb-label day">{{ dayLabel(listing.collection_start_at) }}</p>
                </div>
              </div>
              <div class="col-6">
                <div class="time-card">
                  <p class="rb-label">Until</p>
                  <p class="rb-display time">{{ shortTime(listing.collection_end_at) }}</p>
                  <p class="rb-label day">{{ dayLabel(listing.collection_end_at) }}</p>
                </div>
              </div>
            </div>
          </section>

          <section v-if="business" class="px-1">
            <h2 class="rb-label">Pickup location</h2>
            <PickupMap
              v-if="pickupCoordinates && mapsApiKey"
              :coordinates="pickupCoordinates"
              :name="business.name"
            />
            <p class="rb-display pickup-name">{{ business.name }}</p>
            <p class="address">{{ business.address }}<br />Singapore {{ business.postal_code }}</p>
            <p v-if="business.pickup_instructions" class="pickup-instructions">
              {{ business.pickup_instructions }}
            </p>
          </section>
        </aside>
      </div>
    </div>

    <Transition name="pop">
      <div v-if="showReserveModal" class="rb-backdrop" @click.self="closeReserveModal">
        <div
          class="rb-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reserve-title"
          @keydown.esc="closeReserveModal"
        >
          <template v-if="reservationSuccess && bundleSuccess">
            <p class="rb-script rb-kicker fs-3">bundle saved</p>
            <h2 id="reserve-title" class="rb-display display-4 done-title">Both items are held</h2>
            <p class="done-copy" role="status">
              The 10% discount has been applied to both listings. Pay for both orders in My Orders.
              Each business will have its own pickup QR code once both orders are paid. If you
              cancel one order, both are cancelled.
            </p>
            <RouterLink :to="{ name: 'my-orders' }" class="rb-pill rb-pill-dark mt-3">
              Go to My Orders
            </RouterLink>
          </template>
          <template v-else-if="reservationSuccess && checkoutUrl">
            <p class="rb-script rb-kicker fs-3">almost there</p>
            <h2 id="reserve-title" class="rb-display display-4 done-title">Pay to confirm</h2>
            <p class="done-copy" role="status">
              {{ reservedQuantity }} × {{ listing.title }} is held for you for 30 minutes.
              Pay {{ amountDue || 'the rescue price' }} on Stripe's secure checkout page to confirm it.
            </p>
            <div class="d-flex flex-wrap gap-3 mt-4">
              <a :href="checkoutUrl" class="rb-pill rb-pill-dark">Pay {{ amountDue }} with Stripe</a>
              <RouterLink :to="{ name: 'my-orders' }" class="rb-pill rb-pill-line">Pay later</RouterLink>
            </div>
            <p class="pay-note">You can also finish payment from My Orders before the 30 minutes are up.</p>
          </template>
          <template v-else-if="reservationSuccess">
            <div class="confetti" aria-hidden="true">
                <span v-for="piece in confetti" :key="piece.dx + piece.dy" class="rb-burst" :style="{ '--dx': piece.dx + 'px', '--dy': piece.dy + 'px', background: piece.colour }"></span>
              </div>
              <p class="rb-script rb-kicker fs-3" style="animation: rb-stamp .7s cubic-bezier(.34,1.56,.64,1) .3s backwards, rb-sway 5s ease-in-out 1s infinite">nice one!</p>
            <h2 id="reserve-title" class="rb-display display-2 done-title">Reserved.</h2>
            <p class="done-copy" role="status">
              {{ reservedQuantity }} × {{ listing.title }}{{ business ? ' from ' + business.name : '' }}.
              Collect by {{ formatDate(listing.collection_end_at) }} and show your QR at the counter.
            </p>
            <div class="d-flex flex-wrap gap-3 mt-4">
              <RouterLink :to="{ name: 'my-orders' }" class="rb-pill rb-pill-dark">View my orders</RouterLink>
              <button type="button" class="rb-pill rb-pill-line" autofocus @click="closeReserveModal">Close</button>
            </div>
          </template>
          <template v-else-if="reserving">
            <h2 id="reserve-title" class="rb-display display-4 done-title">Reserving…</h2>
          </template>
          <template v-else>
            <h2 id="reserve-title" class="rb-display display-4 done-title">{{ bundlePending ? 'Still confirming' : 'Not reserved' }}</h2>
            <p class="reserve-error" role="alert">{{ reservationError }}</p>
            <div class="d-flex flex-wrap gap-3 mt-3">
              <button v-if="canRetryReservation" type="button" class="rb-pill rb-pill-dark" @click="retryReservation">Try again</button>
              <button type="button" class="rb-pill rb-pill-line" autofocus @click="closeReserveModal">Close</button>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </main>
</template>

<style scoped>
.state-card {
  padding: 64px 32px;
  border-radius: 28px;
  background-color: #f6f4ed;
  text-align: center;
}

.state-title {
  margin-bottom: 12px;
}

.breadcrumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.breadcrumbs a {
  text-decoration: none;
  transition: color .25s;
}

.breadcrumbs a:hover {
  color: #8a6200;
}

.breadcrumbs .current {
  color: #191200;
}

.hero-tile {
  height: 360px;
  padding: 24px;
}

.photo-probe {
  display: none;
}

.hero-tag {
  top: 24px;
  left: 24px;
  padding: 10px 16px;
  font-size: 13px;
  line-height: 13px;
}

.hero-word {
  line-height: .8;
}

.hero-word-xl {
  font-size: 200px;
}

.business-line {
  margin-top: 32px;
  font-family: 'Archivo', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: .06em;
  color: #191200;
}

.listing-title {
  margin-top: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.description {
  max-width: 640px;
  margin: 24px 0 0;
  font-size: 18px;
  line-height: 30px;
}

.bundle-section {
  max-width: 720px;
  margin-top: 48px;
}

.section-title {
  margin-bottom: 20px;
  line-height: 1.1;
}

.bundle-section ul {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bundle-section li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 64px;
  padding: 12px 24px;
  border-radius: 28px;
  background-color: #f6f4ed;
}

.item-name {
  font-size: 22px;
  line-height: 1.1;
}

.small-note {
  margin-top: 16px;
  font-size: 12px;
}

.price-card {
  position: relative;
  color: #000;
  background-color: #f4b30c;
}

.price-card .rb-label,
.price-label {
  color: #000;
}

.price {
  margin-top: 8px;
  line-height: .95;
}

.price-card del {
  font-size: 16px;
}

.save-tag {
  padding: 8px 14px;
  border-radius: 140px;
  color: #f4b30c;
  background-color: #000;
  font-family: 'Archivo', system-ui, sans-serif;
  font-size: 13px;
  line-height: 13px;
  text-transform: uppercase;
}

.availability {
  position: absolute;
  top: 24px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 8px 14px;
  border-radius: 140px;
  background-color: #000;
  font-size: 13px;
  line-height: 13px;
}

.price-card .availability {
  color: #f4b30c;
}

.quantity-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 2px solid #000;
}

.step {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  font-family: 'Archivo', system-ui, sans-serif;
  font-size: 22px;
  line-height: 1;
}

.step-line {
  border: 2px solid #000;
  color: #000;
  background-color: transparent;
}

.step-dark {
  border: 0;
  color: #f4b30c;
  background-color: #000;
}

.qty {
  min-width: 32px;
  font-size: 40px;
  line-height: 1;
  text-align: center;
}

.total-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 20px;
}

.total {
  font-size: 32px;
  letter-spacing: 0;
}

.save-button {
  color: #000;
  background-color: transparent;
}

.save-button:hover {
  color: #f4b30c;
  background-color: #000;
}

.favourite-message {
  margin: 12px 0 0;
  font-size: 14px;
}

.time-card {
  padding: 16px;
  border-radius: 28px;
  background-color: #f6f4ed;
}

.time {
  margin-top: 6px;
  font-size: 28px;
  line-height: 1;
}

.day {
  margin-top: 6px;
  color: #191200;
  font-size: 12px;
}

.pickup-name {
  margin-top: 16px;
  font-size: 28px;
  line-height: 32px;
}

.address {
  margin: 6px 0 0;
  font-size: 16px;
  line-height: 24px;
}

.pickup-instructions {
  margin: 16px 0 0;
  padding: 16px 20px;
  border: 2px solid #f4b30c;
  border-radius: 28px;
  font-size: 15px;
  line-height: 22px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  margin-bottom: 8px;
  color: #191200;
}

.partner-bundle {
  padding: 20px;
  border-radius: 28px;
  color: #191200;
  background-color: #fbf9f1;
}

.price-card .partner-bundle .rb-label {
  color: #5f5330;
}

.bundle-submit-disabled,
.bundle-submit-disabled:hover,
.bundle-submit-disabled:focus {
  color: #5f5330;
  background-color: #e8e6d7;
  border-color: #d8d3c0;
  cursor: default;
}

.bundle-heading {
  margin: 0;
  font-size: 28px;
  line-height: 32px;
}

.bundle-note,
.bundle-count,
.bundle-qr-note {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 19px;
}

.bundle-count {
  margin-top: 12px;
  color: #5f5330;
  text-transform: uppercase;
}

.bundle-options {
  display: grid;
  gap: 12px;
  max-height: 370px;
  margin: 10px -6px 16px 0;
  padding: 6px 10px 8px 2px;
  overflow-y: auto;
}

.bundle-option {
  display: grid;
  grid-template-columns: 92px 1fr;
  overflow: hidden;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 28px;
  color: #191200;
  text-align: left;
  background-color: #f6f4ed;
  transition: background-color .25s, border-color .25s;
}

.bundle-option:hover {
  border-color: #f4b30c;
}

.bundle-option.selected {
  border-color: #000;
  color: #000;
  background-color: #f4b30c;
}

.bundle-photo {
  width: 92px;
  height: 100%;
  min-height: 100px;
  object-fit: cover;
  background-color: #e8e6d7;
}

.bundle-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  font-family: 'Anton', Impact, sans-serif;
  font-size: 18px;
  text-transform: uppercase;
  text-align: center;
}

.bundle-option-info {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  padding: 14px 42px 14px 14px;
}

.bundle-check {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 2px solid #000;
  border-radius: 50%;
  align-items: center;
  justify-content: center;
}

.bundle-check-symbol {
  display: block;
  font-size: 19px;
  font-weight: 500;
  line-height: 1;
  transform: translateY(-1px);
}

.bundle-business {
  padding-right: 30px;
  color: #5f5330;
  font-size: 11px;
  text-transform: uppercase;
}

.bundle-time {
  font-size: 12px;
}

.bundle-address {
  color: #5f5330;
  font-size: 11px;
  line-height: 15px;
}

.bundle-prices {
  display: flex;
  flex-wrap: wrap;
  gap: 0 8px;
}

.bundle-summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin: 0 0 14px;
  padding-top: 14px;
  border-top: 2px solid #000;
}

.bundle-summary > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bundle-remove {
  width: fit-content;
  padding: 0;
  border: 0;
  color: #191200;
  font-size: 12px;
  text-decoration: underline;
  background: transparent;
}

.bundle-qr-note {
  text-align: center;
}

.done-title {
  margin-top: 4px;
  line-height: .95;
}

.done-copy {
  margin: 20px 0 0;
  font-size: 18px;
  line-height: 27px;
}

.confetti {
  position: absolute;
  top: 96px;
  right: 88px;
  width: 0;
  height: 0;
}

.pay-note {
  margin: 16px 0 0;
  color: #5f5330;
  font-size: 14px;
  line-height: 20px;
}

.reserve-error {
  margin: 20px 0 0;
  padding: 16px 20px;
  border-radius: 28px;
  color: #000;
  background-color: #ff7a7a;
}
</style>
