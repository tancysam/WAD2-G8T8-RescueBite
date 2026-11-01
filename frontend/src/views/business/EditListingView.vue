<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@clerk/vue'
import axios from 'axios'
import { API_URL } from '@/config'
import DisplayHeading from '@/components/DisplayHeading.vue'
import { formatPrice } from '@/formatters'

const route = useRoute()
const router = useRouter()
const { getToken } = useAuth()

// Edit Listing Page Data
const business = ref(null)
const categories = ref([])
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')

const listing = ref({
  listingType: 'ITEM',
  categoryId: '',
  title: '',
  description: '',
  originalPriceSgd: '',
  rescuePriceSgd: '',
  quantityAvailable: '',
  collectionStartAt: '',
  collectionEndAt: '',
  bundleContents: [],
  bundleEligible: false,
  status: 'DRAFT'
})

// Price Card Preview
const rescuePriceLabel = computed(() => {
  if (listing.value.rescuePriceSgd === '' || listing.value.rescuePriceSgd === null) return 'S$—'
  return formatPrice(listing.value.rescuePriceSgd)
})

const savingsPercentage = computed(() => {
  const original = Number(listing.value.originalPriceSgd)
  const rescue = Number(listing.value.rescuePriceSgd)
  if (!(original > 0) || listing.value.rescuePriceSgd === '' || !(rescue >= 0) || rescue >= original) return null
  return Math.round((1 - rescue / original) * 100)
})

function pad(number) {
  return number.toString().padStart(2, '0')
}

function toDateTimeLocal(value) {
  const date = new Date(value)

  return date.getFullYear() + '-' +
    pad(date.getMonth() + 1) + '-' +
    pad(date.getDate()) + 'T' +
    pad(date.getHours()) + ':' +
    pad(date.getMinutes())
}

// Load Listing Information
async function loadPage() {
  loading.value = true
  errorMessage.value = ''

  try {
    const token = await getToken.value()
    const headers = { Authorization: 'Bearer ' + token }

    const ownedResponse = await axios.get(
      API_URL + '/users/me/businesses',
      { headers: headers }
    )

    for (const item of ownedResponse.data.businesses) {
      if (item.status === 'ACTIVE' && item._id === route.params.businessId) {
        business.value = item
      }
    }

    if (business.value === null) {
      loading.value = false
      return
    }

    const categoryResponse = await axios.get(API_URL + '/categories')
    categories.value = categoryResponse.data.categories

    const listingResponse = await axios.get(
      API_URL + '/businesses/' + route.params.businessId + '/managed-listings',
      { headers: headers }
    )

    let selectedListing = null

    for (const item of listingResponse.data.listings) {
      if (item._id === route.params.listingId) {
        selectedListing = item
      }
    }

    if (selectedListing === null) {
      errorMessage.value = 'Listing not found or access denied.'
      loading.value = false
      return
    }

    if (selectedListing.status === 'EXPIRED' || selectedListing.status === 'REMOVED') {
      errorMessage.value = 'Expired or removed listings cannot be edited.'
      loading.value = false
      return
    }

    const contents = []

    if (Array.isArray(selectedListing.bundle_contents)) {
      for (const item of selectedListing.bundle_contents) {
        contents.push({
          name: item.name,
          quantity: item.quantity
        })
      }
    }

    listing.value = {
      listingType: selectedListing.listing_type,
      categoryId: selectedListing.category_id,
      title: selectedListing.title,
      description: selectedListing.description || '',
      originalPriceSgd: selectedListing.original_price_sgd,
      rescuePriceSgd: selectedListing.rescue_price_sgd,
      quantityAvailable: selectedListing.quantity_available,
      collectionStartAt: toDateTimeLocal(selectedListing.collection_start_at),
      collectionEndAt: toDateTimeLocal(selectedListing.collection_end_at),
      bundleContents: contents,
      bundleEligible: selectedListing.bundle_eligible || false,
      status: selectedListing.status
    }
  } catch (error) {
    console.error('Error loading listing:', error)

    if (error.response && error.response.data && error.response.data.error) {
      errorMessage.value = error.response.data.error
    } else {
      errorMessage.value = 'Unable to load this listing.'
    }
  }

  loading.value = false
}

// Bundle Contents
function changeListingType() {
  if (listing.value.listingType === 'ITEM') {
    listing.value.bundleContents = []
  } else if (listing.value.bundleContents.length === 0) {
    addBundleItem()
  }
}

function changeStatus() {
  if (listing.value.status === 'SOLD_OUT') {
    listing.value.quantityAvailable = 0
  }
}

function addBundleItem() {
  listing.value.bundleContents.push({
    name: '',
    quantity: 1
  })
}

function removeBundleItem(index) {
  listing.value.bundleContents.splice(index, 1)
}

// Listing Validation
function validateListing() {
  const collectionStart = new Date(listing.value.collectionStartAt)
  const collectionEnd = new Date(listing.value.collectionEndAt)

  if (Number(listing.value.rescuePriceSgd) > Number(listing.value.originalPriceSgd)) {
    errorMessage.value = 'Rescue price cannot be higher than the original price.'
    return false
  }

  if (isNaN(collectionStart) || isNaN(collectionEnd)) {
    errorMessage.value = 'Enter a valid collection start and end time.'
    return false
  }

  if (collectionStart >= collectionEnd) {
    errorMessage.value = 'Collection start must be before collection end.'
    return false
  }

  if (listing.value.status === 'ACTIVE' && collectionEnd <= new Date()) {
    errorMessage.value = 'An active listing must end in the future.'
    return false
  }

  if (
    listing.value.status === 'ACTIVE' &&
    Number(listing.value.quantityAvailable) <= 0
  ) {
    errorMessage.value = 'An active listing must have at least one item available.'
    return false
  }

  if (
    listing.value.listingType === 'BUNDLE' &&
    listing.value.bundleContents.length === 0
  ) {
    errorMessage.value = 'Add at least one item to the bundle.'
    return false
  }

  for (const item of listing.value.bundleContents) {
    if (item.name.trim() === '' || Number(item.quantity) <= 0) {
      errorMessage.value = 'Every bundle item needs a name and positive quantity.'
      return false
    }
  }

  return true
}

function prepareBundleContents() {
  const contents = []

  if (listing.value.listingType === 'BUNDLE') {
    for (const item of listing.value.bundleContents) {
      contents.push({
        name: item.name.trim(),
        quantity: Number(item.quantity)
      })
    }
  }

  return contents
}

// Update Listing
async function updateListing() {
  errorMessage.value = ''

  if (!validateListing()) return

  saving.value = true

  const data = {
    listingType: listing.value.listingType,
    categoryId: listing.value.categoryId,
    title: listing.value.title.trim(),
    description: listing.value.description.trim(),
    originalPriceSgd: Number(listing.value.originalPriceSgd),
    rescuePriceSgd: Number(listing.value.rescuePriceSgd),
    quantityAvailable: Number(listing.value.quantityAvailable),
    collectionStartAt: new Date(listing.value.collectionStartAt).toISOString(),
    collectionEndAt: new Date(listing.value.collectionEndAt).toISOString(),
    bundleContents: prepareBundleContents(),
    bundleEligible: listing.value.bundleEligible,
    status: listing.value.status
  }

  try {
    const token = await getToken.value()

    // PATCH is used because this is the update method provided by the backend.
    await axios.patch(
      API_URL + '/listings/' + route.params.listingId,
      data,
      {
        headers: {
          Authorization: 'Bearer ' + token
        }
      }
    )

    router.push({ name: 'business-listings' })
  } catch (error) {
    console.error('Error updating listing:', error)

    if (error.response && error.response.data && error.response.data.error) {
      errorMessage.value = error.response.data.error
    } else {
      errorMessage.value = 'Unable to update the listing.'
    }
  }

  saving.value = false
}

onMounted(loadPage)
</script>

<template>
  <main class="listing-form-page container-xxl px-4 pt-4 pb-5">
    <RouterLink to="/business-listings" class="rb-label back-link">← Back to listings</RouterLink>

    <header class="header-copy">
      <p class="rb-script rb-kicker fs-3">tweak the details</p>
      <DisplayHeading :size="128">Edit listing</DisplayHeading>
    </header>

    <p v-if="loading" class="rb-label mt-4">Loading the listing…</p>

    <p v-else-if="errorMessage && !listing.title" class="rb-note error mt-4" role="alert">
      {{ errorMessage }}
    </p>

    <form v-else class="row g-5 mt-0" @submit.prevent="updateListing">
      <section class="col-lg-7 d-flex flex-column gap-5">
        <p v-if="errorMessage" class="rb-note error" role="alert">
          {{ errorMessage }}
        </p>

        <!-- Listing Information -->
        <section>
          <h2 class="rb-display display-6 section-title">The basics</h2>

          <div class="row g-4">
            <div class="col-12 col-md-6 field">
              <label for="listingType" class="rb-label">Listing type</label>
              <select
                id="listingType"
                v-model="listing.listingType"
                required
                @change="changeListingType"
              >
                <option value="ITEM">Single item</option>
                <option value="BUNDLE">Bundle</option>
              </select>
            </div>

            <div class="col-12 col-md-6 field">
              <label for="categoryId" class="rb-label">Category</label>
              <select
                id="categoryId"
                v-model="listing.categoryId"
                required
              >
                <option value="" disabled>
                  Select a category
                </option>
                <option
                  v-for="category in categories"
                  :key="category._id"
                  :value="category._id"
                >
                  {{ category.name }}
                </option>
              </select>
            </div>

            <div class="col-12 field">
              <label for="title" class="rb-label">Title</label>
              <input
                id="title"
                v-model.trim="listing.title"
                type="text"
                placeholder="Enter listing title"
                required
              />
            </div>

            <div class="col-12 field">
              <label for="description" class="rb-label">Description</label>
              <textarea
                id="description"
                v-model.trim="listing.description"
                rows="3"
                placeholder="Enter a description"
              ></textarea>
            </div>
          </div>
        </section>
        <!-- Bundle Contents -->
        <section v-if="listing.listingType === 'BUNDLE'">
          <div class="section-head">
            <h2 class="rb-display display-6 section-title">What’s inside</h2>
            <button
              type="button"
              class="rb-pill rb-pill-line rb-pill-sm"
              @click="addBundleItem"
            >
              + Add item
            </button>
          </div>

          <ul class="bundle-list">
            <li v-for="(item, index) in listing.bundleContents" :key="index">
              <div class="row g-3 align-items-end">
                <div class="col-12 col-md-7 field">
                  <label :for="'bundleName' + index" class="rb-label">Item name</label>
                  <input
                    :id="'bundleName' + index"
                    v-model.trim="item.name"
                    type="text"
                    required
                  />
                </div>
                <div class="col-7 col-md-3 field">
                  <label :for="'bundleQuantity' + index" class="rb-label">Quantity</label>
                  <input
                    :id="'bundleQuantity' + index"
                    v-model.number="item.quantity"
                    type="number"
                    min="1"
                    step="1"
                    required
                  />
                </div>
                <div class="col-5 col-md-2">
                  <button
                    type="button"
                    class="rb-pill rb-pill-sm remove-button w-100"
                    @click="removeBundleItem(index)"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </section>

      <aside class="col-lg-5 d-flex flex-column gap-4">
        <!-- Pricing, Status and Actions -->
        <div class="price-card p-4 p-md-5">
          <p class="rb-label">Rescue price</p>
          <p class="rb-display display-1 price">{{ rescuePriceLabel }}</p>
          <div v-if="savingsPercentage !== null" class="d-flex flex-wrap align-items-center gap-3 mt-2">
            <del>{{ formatPrice(listing.originalPriceSgd) }}</del>
            <span class="save-tag">Save {{ savingsPercentage }}%</span>
          </div>

          <div class="row g-3 card-block">
            <div class="col-6 field">
              <label for="originalPrice" class="rb-label">Original price (S$)</label>
              <input
                id="originalPrice"
                v-model.number="listing.originalPriceSgd"
                type="number"
                min="0.01"
                step="0.01"
                required
              />
            </div>
            <div class="col-6 field">
              <label for="rescuePrice" class="rb-label">Rescue price (S$)</label>
              <input
                id="rescuePrice"
                v-model.number="listing.rescuePriceSgd"
                type="number"
                min="0"
                step="0.01"
                required
              />
            </div>
            <div class="col-6 field">
              <label for="quantity" class="rb-label">Quantity available</label>
              <input
                id="quantity"
                v-model.number="listing.quantityAvailable"
                type="number"
                min="0"
                step="1"
                required
              />
            </div>
            <div class="col-6 field">
              <label for="status" class="rb-label">Listing status</label>
              <select
                id="status"
                v-model="listing.status"
                required
                @change="changeStatus"
              >
                <option value="ACTIVE">Active</option>
                <option value="DRAFT">Draft</option>
                <option value="SOLD_OUT">Sold out</option>
              </select>
            </div>
          </div>

          <div class="card-block">
            <label class="check-row" for="bundleEligible">
              <input
                id="bundleEligible"
                v-model="listing.bundleEligible"
                type="checkbox"
              />
              Allow this listing in 10% partner bundles
            </label>
            <p class="check-note">
              Customers may pair it with a nearby business during the same pickup time.
            </p>
          </div>

          <div class="d-flex flex-column gap-3 card-block">
            <button type="submit" class="rb-pill rb-pill-dark w-100" :disabled="saving">
              {{ saving ? 'Saving…' : 'Save changes' }}
            </button>
            <RouterLink to="/business-listings" class="rb-pill rb-pill-text w-100">
              Cancel
            </RouterLink>
          </div>
        </div>

        <!-- Collection Window -->
        <section class="px-1">
          <h2 class="rb-label">Collection window</h2>
          <div class="row g-3 mt-0">
            <div class="col-6">
              <div class="time-card">
                <label for="collectionStart" class="rb-label">From</label>
                <input
                  id="collectionStart"
                  v-model="listing.collectionStartAt"
                  type="datetime-local"
                  required
                />
              </div>
            </div>
            <div class="col-6">
              <div class="time-card">
                <label for="collectionEnd" class="rb-label">Until</label>
                <input
                  id="collectionEnd"
                  v-model="listing.collectionEndAt"
                  type="datetime-local"
                  required
                />
              </div>
            </div>
          </div>
        </section>
      </aside>
    </form>
  </main>
</template>

<style scoped>
.back-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: #191200;
  text-decoration: none;
  transition: color .25s;
}

.back-link:hover {
  color: #8a6200;
}

.header-copy {
  max-width: 900px;
  margin-top: 16px;
}


.section-title {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 2px solid #000;
  line-height: 1.1;
}

.section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 2px solid #000;
}

.section-head .section-title {
  margin: 0;
  padding: 0;
  border: 0;
}

.section-note {
  margin: 0;
  font-size: 16px;
  line-height: 24px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field input,
.field select {
  width: 100%;
  height: 52px;
  padding: 0 24px;
  border: 1px solid #ddd9c5;
  border-radius: 140px;
  color: #191200;
  background-color: #f6f4ed;
  font-size: 16px;
}

.field textarea {
  padding: 16px 24px;
  border: 1px solid #ddd9c5;
  border-radius: 28px;
  color: #191200;
  background-color: #f6f4ed;
  font-size: 16px;
  line-height: 24px;
}

.field input[type="file"] {
  padding: 0 24px 0 0;
  line-height: 50px;
}




.hint {
  margin: 0;
  color: #5f5330;
  font-size: 14px;
  line-height: 20px;
}

.bundle-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bundle-list li {
  padding: 16px 20px;
  border-radius: 28px;
  background-color: #f6f4ed;
}

.bundle-list .field input {
  background-color: #fbf9f1;
}

.remove-button {
  color: #191200;
  background-color: transparent;
  border-color: #ff7a7a;
}


.price-card {
  color: #000;
  background-color: #f4b30c;
}

.price-card .rb-label {
  color: #000;
}

.price {
  margin-top: 8px;
  line-height: .95;
}

.save-tag {
  padding: 8px 14px;
  border-radius: 140px;
  color: #f4b30c;
  background-color: #000;
  font-size: 13px;
  line-height: 13px;
  text-transform: uppercase;
}

.price-card .field input,
.price-card .field select {
  border-color: #000;
  background-color: #fbf9f1;
}


.card-block {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 2px solid #000;
}

.check-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: 0;
  font-size: 15px;
  line-height: 22px;
}

.check-row input {
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
  margin-top: 1px;
}

.check-note {
  margin: 6px 0 0 34px;
  font-size: 13px;
  line-height: 19px;
}

.secondary-button {
  color: #000;
  background-color: transparent;
}

.secondary-button:hover {
  color: #f4b30c;
  background-color: #000;
}


.time-card {
  height: 100%;
  padding: 16px;
  border-radius: 28px;
  background-color: #f6f4ed;
}

.time-card input {
  width: 100%;
  margin-top: 8px;
  padding: 8px 0;
  border: 0;
  border-bottom: 2px solid #000;
  color: #191200;
  background: transparent;
  font-size: 15px;
}

</style>
