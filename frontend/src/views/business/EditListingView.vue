<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@clerk/vue'
import axios from 'axios'

const route = useRoute()
const router = useRouter()
const { getToken } = useAuth()

const API_URL = 'http://localhost:8000/api'

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
  status: 'DRAFT'
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
  <main class="listing-form-page container py-4 py-md-5">
    <!-- Edit Listing Header -->
    <header class="mb-4">
      <h1 class="page-title">Edit listing</h1>
      <p v-if="business" class="text-muted mb-0">
        Update a listing for {{ business.name }}
      </p>
    </header>

    <p v-if="loading" class="text-muted">Loading the listing...</p>

    <div v-else-if="errorMessage && !listing.title" class="alert alert-danger" role="alert">
      {{ errorMessage }}
    </div>

    <form v-else class="form-card" @submit.prevent="updateListing">
      <div v-if="errorMessage" class="alert alert-danger" role="alert">
        {{ errorMessage }}
      </div>

      <div class="row g-3">
        <div class="col-12 col-md-6">
          <label for="listingType" class="form-label">Listing type</label>
          <select
            id="listingType"
            v-model="listing.listingType"
            class="form-select"
            required
            @change="changeListingType"
          >
            <option value="ITEM">Single item</option>
            <option value="BUNDLE">Bundle</option>
          </select>
        </div>

        <div class="col-12 col-md-6">
          <label for="categoryId" class="form-label">Category</label>
          <select
            id="categoryId"
            v-model="listing.categoryId"
            class="form-select"
            required
          >
            <option value="" disabled>Select a category</option>
            <option
              v-for="category in categories"
              :key="category._id"
              :value="category._id"
            >
              {{ category.name }}
            </option>
          </select>
        </div>

        <div class="col-12">
          <label for="title" class="form-label">Title</label>
          <input
            id="title"
            v-model.trim="listing.title"
            type="text"
            class="form-control"
            required
          />
        </div>

        <div class="col-12">
          <label for="description" class="form-label">Description</label>
          <textarea
            id="description"
            v-model.trim="listing.description"
            class="form-control"
            rows="3"
          ></textarea>
        </div>

        <div class="col-12 col-md-4">
          <label for="originalPrice" class="form-label">Original price (S$)</label>
          <input
            id="originalPrice"
            v-model.number="listing.originalPriceSgd"
            type="number"
            class="form-control"
            min="0.01"
            step="0.01"
            required
          />
        </div>

        <div class="col-12 col-md-4">
          <label for="rescuePrice" class="form-label">Rescue price (S$)</label>
          <input
            id="rescuePrice"
            v-model.number="listing.rescuePriceSgd"
            type="number"
            class="form-control"
            min="0"
            step="0.01"
            required
          />
        </div>

        <div class="col-12 col-md-4">
          <label for="quantity" class="form-label">Quantity available</label>
          <input
            id="quantity"
            v-model.number="listing.quantityAvailable"
            type="number"
            class="form-control"
            min="0"
            step="1"
            required
          />
        </div>

        <div class="col-12 col-md-6">
          <label for="collectionStart" class="form-label">Collection starts</label>
          <input
            id="collectionStart"
            v-model="listing.collectionStartAt"
            type="datetime-local"
            class="form-control"
            required
          />
        </div>

        <div class="col-12 col-md-6">
          <label for="collectionEnd" class="form-label">Collection ends</label>
          <input
            id="collectionEnd"
            v-model="listing.collectionEndAt"
            type="datetime-local"
            class="form-control"
            required
          />
        </div>

        <div class="col-12 col-md-6">
          <label for="status" class="form-label">Listing status</label>
          <select
            id="status"
            v-model="listing.status"
            class="form-select"
            required
            @change="changeStatus"
          >
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="SOLD_OUT">Sold out</option>
          </select>
        </div>
      </div>

      <!-- Bundle Contents -->
      <section v-if="listing.listingType === 'BUNDLE'" class="bundle-section mt-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h2 class="h5 mb-0">Bundle contents</h2>
          <button type="button" class="btn btn-outline-success btn-sm" @click="addBundleItem">
            Add item
          </button>
        </div>

        <div
          v-for="(item, index) in listing.bundleContents"
          :key="index"
          class="row g-2 align-items-end mb-2"
        >
          <div class="col-12 col-md-7">
            <label :for="'bundleName' + index" class="form-label">Item name</label>
            <input
              :id="'bundleName' + index"
              v-model.trim="item.name"
              type="text"
              class="form-control"
              required
            />
          </div>
          <div class="col-8 col-md-3">
            <label :for="'bundleQuantity' + index" class="form-label">Quantity</label>
            <input
              :id="'bundleQuantity' + index"
              v-model.number="item.quantity"
              type="number"
              class="form-control"
              min="1"
              step="1"
              required
            />
          </div>
          <div class="col-4 col-md-2">
            <button
              type="button"
              class="btn btn-outline-danger w-100"
              @click="removeBundleItem(index)"
            >
              Remove
            </button>
          </div>
        </div>
      </section>

      <!-- Form Actions -->
      <div class="d-flex gap-2 mt-4">
        <button type="submit" class="btn btn-success" :disabled="saving">
          {{ saving ? 'Saving...' : 'Save changes' }}
        </button>
        <RouterLink :to="{ name: 'business-listings' }" class="btn btn-outline-secondary">
          Cancel
        </RouterLink>
      </div>
    </form>
  </main>
</template>

<style scoped>
/* Edit Listing Form */
.listing-form-page {
  color: #173d2c;
}

.page-title {
  margin: 0 0 4px;
  color: #164936;
  font-size: 38px;
}

.form-card {
  max-width: 900px;
  padding: 24px;
  border: 1px solid #d9e6dc;
  border-radius: 12px;
  background-color: white;
}

.bundle-section {
  padding-top: 20px;
  border-top: 1px solid #d9e6dc;
}
</style>
