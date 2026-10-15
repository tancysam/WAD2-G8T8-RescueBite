<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@clerk/vue'
import axios from 'axios'

const router = useRouter()
const { getToken } = useAuth()

const API_URL = 'http://localhost:8000/api'

// Create Listing Page Data
const businesses = ref([])
const selectedBusinessId = ref('')
const categories = ref([])
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const informationMessage = ref('')
const imageFile = ref(null)
const createdListingId = ref('')
const uploadedImageKey = ref('')
const attachedImageId = ref('')
const imageAttached = ref(false)
const suggestionsReady = ref(false)

const listing = ref({
  listingType: '',
  categoryId: '',
  title: '',
  description: '',
  originalPriceSgd: '',
  rescuePriceSgd: '',
  quantityAvailable: '',
  collectionStartAt: '',
  collectionEndAt: '',
  bundleContents: [],
  status: 'ACTIVE'
})

// Selected Business and Form State
const selectedBusiness = computed(() => {
  for (const business of businesses.value) {
    if (business._id === selectedBusinessId.value) return business
  }
  return null
})

const formLocked = computed(() => {
  return createdListingId.value !== '' && !suggestionsReady.value
})

const submitText = computed(() => {
  if (saving.value) return 'Saving...'
  if (suggestionsReady.value) return 'Save suggested changes'
  if (createdListingId.value !== '' && imageAttached.value) {
    return 'Retry AI suggestions'
  }
  if (createdListingId.value !== '') return 'Retry image upload'
  return 'Generate suggestions'
})

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
      if (item.status === 'ACTIVE') businesses.value.push(item)
    }

    if (businesses.value.length === 1) {
      selectedBusinessId.value = businesses.value[0]._id
    }

    if (businesses.value.length > 0) {
      const categoryResponse = await axios.get(API_URL + '/categories')
      categories.value = categoryResponse.data.categories
    }
  } catch (error) {
    console.error('Error preparing listing form:', error)

    if (error.response && error.response.data && error.response.data.error) {
      errorMessage.value = error.response.data.error
    } else {
      errorMessage.value = 'Unable to prepare the listing form.'
    }
  }

  loading.value = false
}

// Bundle Contents
function changeListingType() {
  if (listing.value.listingType === 'ITEM' || listing.value.listingType === '') {
    listing.value.bundleContents = []
  } else if (
    listing.value.listingType === 'BUNDLE' &&
    listing.value.bundleContents.length === 0
  ) {
    addBundleItem()
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

// Listing Image Selection
function selectImage(event) {
  errorMessage.value = ''
  imageFile.value = null

  if (!event.target.files || event.target.files.length === 0) return

  const file = event.target.files[0]

  if (
    file.type !== 'image/jpeg' &&
    file.type !== 'image/png' &&
    file.type !== 'image/webp'
  ) {
    errorMessage.value = 'Choose a JPEG, PNG or WebP image.'
    event.target.value = ''
    return
  }

  if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
    errorMessage.value = 'The listing image must be larger than 0 bytes and no more than 5 MB.'
    event.target.value = ''
    return
  }

  imageFile.value = file
}

// Listing Validation
function validateListing() {
  const collectionStart = new Date(listing.value.collectionStartAt)
  const collectionEnd = new Date(listing.value.collectionEndAt)

  if (selectedBusinessId.value === '') {
    errorMessage.value = 'Select the business creating this listing.'
    return false
  }

  if (listing.value.listingType !== 'ITEM' && listing.value.listingType !== 'BUNDLE') {
    errorMessage.value = 'Review and select the listing type.'
    return false
  }

  if (listing.value.categoryId === '') {
    errorMessage.value = 'Review and select a category.'
    return false
  }

  if (listing.value.title.trim() === '') {
    errorMessage.value = 'Review and enter a listing title.'
    return false
  }

  if (Number(listing.value.rescuePriceSgd) <= 0) {
    errorMessage.value = 'Review and enter a rescue price greater than zero.'
    return false
  }

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

function validateRequiredDetails() {
  const collectionStart = new Date(listing.value.collectionStartAt)
  const collectionEnd = new Date(listing.value.collectionEndAt)

  if (selectedBusinessId.value === '') {
    errorMessage.value = 'Select the business creating this listing.'
    return false
  }

  if (listing.value.listingType !== 'ITEM' && listing.value.listingType !== 'BUNDLE') {
    errorMessage.value = 'Select whether this listing is a single item or bundle.'
    return false
  }

  if (imageFile.value === null) {
    errorMessage.value = 'Select a listing image for AI suggestions.'
    return false
  }

  if (Number(listing.value.originalPriceSgd) <= 0) {
    errorMessage.value = 'Enter an original price greater than zero.'
    return false
  }

  if (Number(listing.value.quantityAvailable) <= 0) {
    errorMessage.value = 'Enter at least one item available.'
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

  if (collectionEnd <= new Date()) {
    errorMessage.value = 'The collection end must be in the future.'
    return false
  }

  if (categories.value.length === 0) {
    errorMessage.value = 'No listing category is available for the draft.'
    return false
  }

  return true
}

// Listing Request Data
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

function prepareListingData() {
  return {
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
}

function prepareDraftData() {
  const draftBundleContents = []

  if (listing.value.listingType === 'BUNDLE') {
    draftBundleContents.push({
      name: 'AI suggestion pending',
      quantity: 1
    })
  }

  return {
    listingType: listing.value.listingType,
    categoryId: categories.value[0]._id,
    title: 'AI suggestion pending',
    description: '',
    originalPriceSgd: Number(listing.value.originalPriceSgd),
    rescuePriceSgd: Number(listing.value.originalPriceSgd),
    quantityAvailable: Number(listing.value.quantityAvailable),
    collectionStartAt: new Date(listing.value.collectionStartAt).toISOString(),
    collectionEndAt: new Date(listing.value.collectionEndAt).toISOString(),
    bundleContents: draftBundleContents,
    status: 'DRAFT'
  }
}

// S3 Image Upload
async function uploadListingImage(listingId, token) {
  if (imageFile.value === null) return
  if (imageAttached.value) return

  if (uploadedImageKey.value === '') {
    const uploadResponse = await axios.post(
      API_URL + '/listings/' + listingId + '/image-upload-url',
      {
        mimeType: imageFile.value.type,
        fileSize: imageFile.value.size
      },
      {
        headers: {
          Authorization: 'Bearer ' + token
        }
      }
    )

    await axios.put(
      uploadResponse.data.uploadUrl,
      imageFile.value,
      {
        headers: uploadResponse.data.headers
      }
    )

    uploadedImageKey.value = uploadResponse.data.s3ObjectKey
  }

  const imageResponse = await axios.post(
    API_URL + '/listings/' + listingId + '/images',
    {
      s3ObjectKey: uploadedImageKey.value,
      mimeType: imageFile.value.type,
      sortOrder: 0
    },
    {
      headers: {
        Authorization: 'Bearer ' + token
      }
    }
  )

  attachedImageId.value = imageResponse.data.image._id
  imageAttached.value = true
}

// AI Listing Suggestions
function applySuggestions(suggestions) {
  listing.value.title = suggestions.title
  listing.value.description = suggestions.description

  if (suggestions.categoryId !== null) {
    listing.value.categoryId = suggestions.categoryId
  }

  if (suggestions.rescuePriceSgd !== null) {
    listing.value.rescuePriceSgd = suggestions.rescuePriceSgd
  }

  listing.value.bundleContents = []

  if (
    listing.value.listingType === 'BUNDLE' &&
    Array.isArray(suggestions.bundleContents)
  ) {
    for (const item of suggestions.bundleContents) {
      listing.value.bundleContents.push({
        name: item.name,
        quantity: ''
      })
    }
  }

  suggestionsReady.value = true
  informationMessage.value = 'AI suggestions have been added to the form. ' +
    'Review every field before saving.'
}

async function requestSuggestions(token) {
  const suggestionResponse = await axios.post(
    API_URL + '/listings/' + createdListingId.value + '/ai-suggestions',
    {
      imageId: attachedImageId.value
    },
    {
      headers: {
        Authorization: 'Bearer ' + token
      }
    }
  )

  applySuggestions(suggestionResponse.data.suggestions)
}

// Save Reviewed AI Suggestions
async function saveSuggestedChanges() {
  errorMessage.value = ''

  if (!validateListing()) return

  saving.value = true

  try {
    const token = await getToken.value()

    // PATCH is used because this is the update method provided by the backend.
    await axios.patch(
      API_URL + '/listings/' + createdListingId.value,
      prepareListingData(),
      {
        headers: {
          Authorization: 'Bearer ' + token
        }
      }
    )

    router.push({ name: 'business-listings' })
  } catch (error) {
    console.error('Error saving AI suggestions:', error)

    if (error.response && error.response.data && error.response.data.error) {
      errorMessage.value = error.response.data.error
    } else {
      errorMessage.value = 'Unable to save the suggested listing changes.'
    }
  }

  saving.value = false
}

// Create Draft and Generate Suggestions
async function createListing() {
  errorMessage.value = ''
  informationMessage.value = ''

  if (suggestionsReady.value) {
    await saveSuggestedChanges()
    return
  }

  if (createdListingId.value === '' && !validateRequiredDetails()) return

  saving.value = true
  let currentStep = 'create'

  try {
    const token = await getToken.value()

    if (createdListingId.value === '') {
      const createResponse = await axios.post(
        API_URL + '/businesses/' + selectedBusinessId.value + '/listings',
        prepareDraftData(),
        {
          headers: {
            Authorization: 'Bearer ' + token
          }
        }
      )

      createdListingId.value = createResponse.data.listing._id
    }

    currentStep = 'image'
    await uploadListingImage(createdListingId.value, token)

    currentStep = 'suggestions'
    await requestSuggestions(token)
  } catch (error) {
    console.error('Error creating listing:', error)

    if (currentStep === 'suggestions') {
      if (error.response && error.response.data && error.response.data.error) {
        errorMessage.value = 'The listing and image were saved, but AI suggestions failed: ' +
          error.response.data.error + '. You can retry or keep the original listing.'
      } else {
        errorMessage.value = 'The listing and image were saved, but AI suggestions failed. ' +
          'You can retry or keep the original listing.'
      }
    } else if (currentStep === 'image') {
      if (error.response && error.response.data && error.response.data.error) {
        errorMessage.value = 'The listing was created, but the image upload failed: ' +
          error.response.data.error + '. Use the button below to retry.'
      } else {
        errorMessage.value = 'The listing was created, but the image upload failed. ' +
          'Use the button below to retry.'
      }
    } else if (error.response && error.response.data && error.response.data.error) {
      errorMessage.value = error.response.data.error
    } else {
      errorMessage.value = 'Unable to create the listing.'
    }
  }

  saving.value = false
}

onMounted(loadPage)
</script>

<template>
  <main class="listing-form-page container py-4 py-md-5">
    <!-- Create Listing Header -->
    <header class="mb-4">
      <h1 class="page-title">Create listing</h1>
      <p v-if="selectedBusiness" class="text-muted mb-0">
        Create a new listing for {{ selectedBusiness.name }}
      </p>
      <p v-else class="text-muted mb-0">
        Select which business will own this listing
      </p>
    </header>

    <p v-if="loading" class="text-muted">Preparing the listing form...</p>

    <div v-else-if="businesses.length === 0" class="alert alert-warning" role="alert">
      You need an active business before creating a listing.
    </div>

    <form v-else class="form-card" @submit.prevent="createListing">
      <div v-if="errorMessage" class="alert alert-danger" role="alert">
        {{ errorMessage }}
      </div>

      <div v-if="informationMessage" class="alert alert-info" role="alert">
        {{ informationMessage }}
        <span v-if="listing.listingType === 'BUNDLE'">
          Enter the quantity for every suggested bundle item.
        </span>
      </div>

      <p v-if="!suggestionsReady" class="text-muted">
        Select a business, listing type and image, then enter the original price,
        available quantity and collection times. AI can suggest the title, description,
        category and rescue price.
      </p>

      <div class="row g-3">
        <!-- Listing Image -->
        <!-- Business Selector -->
        <div class="col-12">
          <label for="listingImage" class="form-label">Listing image</label>
          <input
            id="listingImage"
            type="file"
            class="form-control"
            accept="image/jpeg,image/png,image/webp"
            required
            :disabled="createdListingId !== ''"
            @change="selectImage"
          />
          <p class="form-text mb-0">JPEG, PNG or WebP. Maximum file size: 5 MB.</p>
          <p v-if="imageFile" class="small text-success mb-0">
            Selected: {{ imageFile.name }}
          </p>
        </div>

        <div class="col-12">
          <label for="businessId" class="form-label">Business</label>
          <select
            id="businessId"
            v-model="selectedBusinessId"
            class="form-select"
            required
            :disabled="createdListingId !== ''"
          >
            <option value="" disabled>Select a business</option>
            <option
              v-for="item in businesses"
              :key="item._id"
              :value="item._id"
            >
              {{ item.name }}
            </option>
          </select>
        </div>

        <!-- Listing Information -->
        <div class="col-12 col-md-6">
          <label for="listingType" class="form-label">Listing type</label>
          <select
            id="listingType"
            v-model="listing.listingType"
            class="form-select"
            required
            :disabled="formLocked"
            @change="changeListingType"
          >
            <option value="" disabled>Select listing type</option>
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
            :disabled="formLocked"
          >
            <option value="" disabled>Let AI suggest</option>
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
            placeholder="Let AI suggest a title"
            :disabled="formLocked"
          />
        </div>

        <div class="col-12">
          <label for="description" class="form-label">Description</label>
          <textarea
            id="description"
            v-model.trim="listing.description"
            class="form-control"
            rows="3"
            placeholder="Let AI suggest a description"
            :disabled="formLocked"
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
            :disabled="formLocked"
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
            :disabled="formLocked"
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
            :disabled="formLocked"
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
            :disabled="formLocked"
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
            :disabled="formLocked"
          />
        </div>

        <div class="col-12 col-md-6">
          <label for="status" class="form-label">Listing status</label>
          <select
            id="status"
            v-model="listing.status"
            class="form-select"
            :disabled="formLocked"
          >
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
          </select>
        </div>
      </div>

      <!-- Bundle Contents -->
      <section v-if="listing.listingType === 'BUNDLE'" class="bundle-section mt-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h2 class="h5 mb-0">Bundle contents</h2>
          <button
            type="button"
            class="btn btn-outline-success btn-sm"
            :disabled="formLocked"
            @click="addBundleItem"
          >
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
              :disabled="formLocked"
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
              :disabled="formLocked"
            />
          </div>
          <div class="col-4 col-md-2">
            <button
              type="button"
              class="btn btn-outline-danger w-100"
              :disabled="formLocked"
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
          {{ submitText }}
        </button>
        <RouterLink :to="{ name: 'business-listings' }" class="btn btn-outline-secondary">
          Cancel
        </RouterLink>
      </div>
    </form>
  </main>
</template>

<style scoped>
/* Create Listing Form */
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
