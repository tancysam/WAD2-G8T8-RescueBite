<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@clerk/vue'
import axios from 'axios'
import { API_URL } from '@/config'
import DisplayHeading from '@/components/DisplayHeading.vue'
import { collectionWindow, formatPrice } from '@/formatters'

const router = useRouter()
const { getToken } = useAuth()

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
const manualMode = ref(false)

const step = ref(1)

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
  status: 'ACTIVE'
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

// Selected Business and Confirmation Summary
const selectedBusiness = computed(() => {
  for (const business of businesses.value) {
    if (business._id === selectedBusinessId.value) return business
  }
  return null
})

const selectedCategoryName = computed(() => {
  for (const category of categories.value) {
    if (category._id === listing.value.categoryId) return category.name
  }
  return 'No category yet'
})

const pickupLabel = computed(() => {
  if (listing.value.collectionStartAt === '' || listing.value.collectionEndAt === '') {
    return 'Set a collection window'
  }
  return collectionWindow(listing.value.collectionStartAt, listing.value.collectionEndAt)
})

const suggestText = computed(() => {
  if (saving.value) return 'Generating...'
  if (createdListingId.value !== '' && imageAttached.value) return 'Retry suggestions'
  if (createdListingId.value !== '') return 'Retry image upload'
  return 'Generate suggestions'
})

const submitText = computed(() => {
  if (saving.value) return 'Saving...'
  if (listing.value.status === 'DRAFT') return 'Save as draft'
  return 'Publish listing'
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
  if (listing.value.listingType === 'ITEM') {
    listing.value.bundleContents = []
  } else if (listing.value.bundleContents.length === 0) {
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

// Page Navigation
function validatePhotoAndBusiness() {
  if (imageFile.value === null) {
    errorMessage.value = 'Select a listing image.'
    return false
  }

  if (selectedBusinessId.value === '') {
    errorMessage.value = 'Select the business creating this listing.'
    return false
  }

  return true
}

function enterManualMode() {
  errorMessage.value = ''
  if (!validatePhotoAndBusiness()) return

  manualMode.value = true
  informationMessage.value = 'Enter the listing details below. ' +
    'The selected image will be saved with the listing.'
  step.value = 2
}

function backToPhoto() {
  errorMessage.value = ''
  step.value = 1
}

// Listing Validation
function validateListing() {
  const collectionStart = new Date(listing.value.collectionStartAt)
  const collectionEnd = new Date(listing.value.collectionEndAt)

  if (listing.value.listingType !== 'ITEM' && listing.value.listingType !== 'BUNDLE') {
    errorMessage.value = 'Select whether this listing is a single item or bundle.'
    return false
  }

  if (listing.value.categoryId === '') {
    errorMessage.value = 'Select a category.'
    return false
  }

  if (listing.value.title.trim() === '') {
    errorMessage.value = 'Enter a listing title.'
    return false
  }

  if (Number(listing.value.originalPriceSgd) <= 0) {
    errorMessage.value = 'Enter an original price greater than zero.'
    return false
  }

  if (Number(listing.value.rescuePriceSgd) <= 0) {
    errorMessage.value = 'Enter a rescue price greater than zero.'
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
    bundleEligible: listing.value.bundleEligible,
    status: listing.value.status
  }
}


function prepareDraftData() {
  const now = new Date()
  const start = new Date(now.getTime() + 60 * 60 * 1000)
  const end = new Date(now.getTime() + 2 * 60 * 60 * 1000)

  return {
    listingType: 'ITEM',
    categoryId: categories.value[0]._id,
    title: 'AI suggestion pending',
    description: '',
    originalPriceSgd: 1,
    rescuePriceSgd: 1,
    quantityAvailable: 0,
    collectionStartAt: start.toISOString(),
    collectionEndAt: end.toISOString(),
    bundleContents: [],
    bundleEligible: false,
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

  if (suggestions.listingType !== null) {
    listing.value.listingType = suggestions.listingType
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
  manualMode.value = false
  informationMessage.value = 'AI suggestions have been added below. ' +
    'Review every field, then set the prices, stock and collection window.'
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

// Create Draft and Generate Suggestions
async function generateSuggestions() {
  errorMessage.value = ''
  informationMessage.value = ''

  if (!validatePhotoAndBusiness()) return

  if (categories.value.length === 0) {
    errorMessage.value = 'No listing category is available for the draft.'
    return
  }

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

    step.value = 2
  } catch (error) {
    console.error('Error generating suggestions:', error)

    if (currentStep === 'suggestions') {
      if (error.response && error.response.data && error.response.data.error) {
        errorMessage.value = 'The image was saved, but AI suggestions failed: ' +
          error.response.data.error + '. You can retry or enter the details manually.'
      } else {
        errorMessage.value = 'The image was saved, but AI suggestions failed. ' +
          'You can retry or enter the details manually.'
      }
    } else if (currentStep === 'image') {
      if (error.response && error.response.data && error.response.data.error) {
        errorMessage.value = 'The draft was created, but the image upload failed: ' +
          error.response.data.error + '. Use the button below to retry.'
      } else {
        errorMessage.value = 'The draft was created, but the image upload failed. ' +
          'Use the button below to retry.'
      }
    } else if (error.response && error.response.data && error.response.data.error) {
      errorMessage.value = error.response.data.error
    } else {
      errorMessage.value = 'Unable to create the listing draft.'
    }
  }

  saving.value = false
}

// Save the Confirmed Listing
async function saveListing() {
  errorMessage.value = ''

  if (!validateListing()) return

  saving.value = true
  let currentStep = 'create'

  try {
    const token = await getToken.value()

    if (createdListingId.value === '') {
      const draftData = prepareListingData()
      draftData.status = 'DRAFT'

      const createResponse = await axios.post(
        API_URL + '/businesses/' + selectedBusinessId.value + '/listings',
        draftData,
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

    currentStep = 'update'

    
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
    console.error('Error saving listing:', error)

    if (currentStep === 'image') {
      if (error.response && error.response.data && error.response.data.error) {
        errorMessage.value = 'The listing details were saved, but the image upload failed: ' +
          error.response.data.error + '. Use the button below to retry.'
      } else {
        errorMessage.value = 'The listing details were saved, but the image upload failed. ' +
          'Use the button below to retry.'
      }
    } else if (error.response && error.response.data && error.response.data.error) {
      errorMessage.value = error.response.data.error
    } else {
      errorMessage.value = 'Unable to save the listing.'
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
      <p class="rb-script rb-kicker fs-3">something new to rescue</p>
      <DisplayHeading :size="128">Create listing</DisplayHeading>
    </header>

    <p v-if="loading" class="rb-label mt-4">Preparing the listing form…</p>

    <div v-else-if="businesses.length === 0" class="rb-note mt-4">
      <span>You need an active business before creating a listing.</span>
      <RouterLink to="/register-business" class="rb-pill rb-pill-dark rb-pill-sm">
        Register a business
      </RouterLink>
    </div>

    <!-- Page 1: Photo and Business -->
    <section v-else-if="step === 1" class="step-page mt-5 d-flex flex-column gap-5">
      <p class="rb-label step-count">Step 1 of 2</p>

      <p v-if="errorMessage" class="rb-note error" role="alert">
        {{ errorMessage }}
      </p>

      <section>
        <h2 class="rb-display display-6 section-title">Photo &amp; shopfront</h2>

        <div class="d-flex flex-column gap-4">
          <div class="field">
            <label for="listingImage" class="rb-label">Listing image</label>
            <input
              id="listingImage"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              :disabled="createdListingId !== ''"
              @change="selectImage"
            />
            <p class="hint">JPEG, PNG or WebP. Maximum file size: 5 MB.</p>
            <p v-if="imageFile" class="hint">Selected: {{ imageFile.name }}</p>
          </div>

          <div class="field">
            <label for="businessId" class="rb-label">Business</label>
            <select
              id="businessId"
              v-model="selectedBusinessId"
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
        </div>
      </section>

      <!-- Choose How to Fill In the Details -->
      <section>
        <h2 class="rb-display display-6 section-title">Fill in the details</h2>

        <div class="row g-4">
          <div class="col-12 col-md-6">
            <button
              type="button"
              class="choice-card choice-ai w-100"
              :disabled="saving"
              @click="generateSuggestions"
            >
              <span class="rb-label">Let AI help</span>
              <span class="choice-title">{{ suggestText }}</span>
              <span class="choice-copy">
                AI reads your photo and suggests the title, description, category
                and listing type. You review everything on the next page.
              </span>
            </button>
          </div>

          <div class="col-12 col-md-6">
            <button
              type="button"
              class="choice-card choice-manual w-100"
              :disabled="saving"
              @click="enterManualMode"
            >
              <span class="rb-label">Do it yourself</span>
              <span class="choice-title">Enter details manually</span>
              <span class="choice-copy">
                Skip the suggestions and fill in every field yourself on the next page.
              </span>
            </button>
          </div>
        </div>
      </section>
    </section>

    <!-- Page 2: Listing Details and Confirmation -->
    <form v-else class="step-page mt-5 d-flex flex-column gap-5" @submit.prevent="saveListing">
      <div class="d-flex flex-column gap-3">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-3">
          <p class="rb-label step-count">Step 2 of 2</p>
          <button type="button" class="rb-pill rb-pill-text rb-pill-sm" @click="backToPhoto">
            ← Photo &amp; shopfront
          </button>
        </div>

        <p class="section-note">
          {{ imageFile ? imageFile.name : 'No image' }}
          <template v-if="selectedBusiness"> · {{ selectedBusiness.name }}</template>
        </p>

        <p v-if="informationMessage" class="rb-note">
          <span>
            {{ informationMessage }}
            <template v-if="suggestionsReady && listing.listingType === 'BUNDLE'">
              Enter the quantity for every suggested bundle item.
            </template>
          </span>
        </p>
      </div>

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
            <select id="categoryId" v-model="listing.categoryId" required>
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

      <!-- Pricing and Stock -->
      <section>
        <h2 class="rb-display display-6 section-title">Price &amp; stock</h2>

        <div class="row g-4">
          <div class="col-6 col-md-3 field">
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
          <div class="col-6 col-md-3 field">
            <label for="rescuePrice" class="rb-label">Rescue price (S$)</label>
            <input
              id="rescuePrice"
              v-model.number="listing.rescuePriceSgd"
              type="number"
              min="0.01"
              step="0.01"
              required
            />
          </div>
          <div class="col-6 col-md-3 field">
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
          <div class="col-6 col-md-3 field">
            <label for="status" class="rb-label">Listing status</label>
            <select id="status" v-model="listing.status">
              <option value="ACTIVE">Active</option>
              <option value="DRAFT">Draft</option>
            </select>
          </div>

          <div class="col-12">
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
        </div>
      </section>

      <!-- Collection Window -->
      <section>
        <h2 class="rb-display display-6 section-title">Collection window</h2>
        <div class="row g-3">
          <div class="col-12 col-md-6">
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
          <div class="col-12 col-md-6">
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

      <!-- Confirm and Upload -->
      <section class="price-card p-4 p-md-5">
        <p class="rb-label">Confirm your listing</p>

        <div class="row g-4 align-items-end">
          <div class="col-12 col-lg-6">
            <p class="rb-display display-1 price">{{ rescuePriceLabel }}</p>
            <div v-if="savingsPercentage !== null" class="d-flex flex-wrap align-items-center gap-3 mt-2">
              <del>{{ formatPrice(listing.originalPriceSgd) }}</del>
              <span class="save-tag">Save {{ savingsPercentage }}%</span>
            </div>
          </div>

          <dl class="col-12 col-lg-6 summary">
            <div>
              <dt class="rb-label">Title</dt>
              <dd>{{ listing.title || 'No title yet' }}</dd>
            </div>
            <div>
              <dt class="rb-label">Type</dt>
              <dd>
                {{ listing.listingType === 'BUNDLE' ? 'Bundle' : 'Single item' }} ·
                {{ selectedCategoryName }}
              </dd>
            </div>
            <div>
              <dt class="rb-label">Stock</dt>
              <dd>{{ listing.quantityAvailable === '' ? 0 : listing.quantityAvailable }} available</dd>
            </div>
            <div>
              <dt class="rb-label">Pickup</dt>
              <dd>{{ pickupLabel }}</dd>
            </div>
          </dl>
        </div>

        <div class="card-block d-flex flex-column gap-3">
          <p v-if="errorMessage" class="rb-note error" role="alert">
            {{ errorMessage }}
          </p>

          <div class="d-flex flex-column flex-md-row gap-3">
            <button type="submit" class="rb-pill rb-pill-dark flex-fill" :disabled="saving">
              {{ submitText }}
            </button>
            <RouterLink to="/business-listings" class="rb-pill rb-pill-text flex-fill">
              Cancel
            </RouterLink>
          </div>
        </div>
      </section>
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
  padding: 0 24px 0 6px;
  line-height: 50px;
}

.field input[type="file"]::file-selector-button {
  height: 40px;
  line-height: 40px;
  vertical-align: middle;
  margin-right: 16px;
  padding: 0 20px;
  border: none;
  border-radius: 140px;
  color: #fff;
  background-color: #191200;
  font-size: 14px;
  cursor: pointer;
}

.field input[type="file"]:disabled::file-selector-button {
  opacity: .5;
  cursor: not-allowed;
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

.step-page {
  max-width: 960px;
}

.step-count {
  margin: 0;
  color: #8a6200;
}

.choice-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  padding: 28px;
  border: 2px solid #000;
  border-radius: 28px;
  color: #000;
  text-align: left;
  transition: transform .25s, background-color .25s;
}

.choice-card:hover:not(:disabled) {
  transform: translateY(-3px);
}

.choice-card:disabled {
  opacity: .6;
  cursor: not-allowed;
}

.choice-ai {
  background-color: #f4b30c;
}

.choice-manual {
  background-color: transparent;
}

.choice-manual:hover:not(:disabled) {
  background-color: #f6f4ed;
}

.choice-title {
  font-size: 24px;
  line-height: 30px;
}

.choice-copy {
  font-size: 15px;
  line-height: 22px;
}

.summary {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
}

.summary dt {
  color: #000;
}

.summary dd {
  margin: 2px 0 0;
  font-size: 16px;
  line-height: 22px;
}
</style>
