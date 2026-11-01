<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@clerk/vue'
import axios from 'axios'
import { API_URL } from '@/config'
import DisplayHeading from '@/components/DisplayHeading.vue'
import { formatPrice } from '@/formatters'

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

// Selected Business and Form State
const selectedBusiness = computed(() => {
  for (const business of businesses.value) {
    if (business._id === selectedBusinessId.value) return business
  }
  return null
})

const formLocked = computed(() => {
  return createdListingId.value !== '' &&
    !suggestionsReady.value &&
    !manualMode.value
})

const submitText = computed(() => {
  if (saving.value) return 'Saving...'
  if (manualMode.value && createdListingId.value !== '') return 'Save manual details'
  if (manualMode.value) return 'Create listing manually'
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

// Manual Listing Entry
function enterManualMode() {
  errorMessage.value = ''
  informationMessage.value = 'Enter the listing details manually. ' +
    'The selected image will still be saved with the listing.'
  manualMode.value = true
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
    bundleEligible: listing.value.bundleEligible,
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
    bundleEligible: listing.value.bundleEligible,
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

// Create or Update Listing Without AI
async function saveManualListing() {
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
    console.error('Error saving manual listing:', error)

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

// Create Draft and Generate Suggestions
async function createListing() {
  errorMessage.value = ''
  informationMessage.value = ''

  if (manualMode.value) {
    await saveManualListing()
    return
  }

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
          error.response.data.error + '. You can retry or enter the details manually.'
      } else {
        errorMessage.value = 'The listing and image were saved, but AI suggestions failed. ' +
          'You can retry or enter the details manually.'
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

    <form v-else class="row g-5 mt-0" @submit.prevent="createListing">
      <section class="col-lg-7 d-flex flex-column gap-5">
        <div class="d-flex flex-column gap-3">
          <p v-if="errorMessage" class="rb-note error" role="alert">
            {{ errorMessage }}
          </p>

          <p v-if="informationMessage" class="rb-note">
            <span>
              {{ informationMessage }}
              <template v-if="listing.listingType === 'BUNDLE'">
                Enter the quantity for every suggested bundle item.
              </template>
            </span>
          </p>

          <p v-if="!suggestionsReady && !manualMode" class="section-note">
            Select a business, listing type and image, then enter the original price,
            available quantity and collection times. AI can suggest the title, description,
            category and rescue price.
          </p>

          <p v-if="manualMode" class="section-note">
            Complete the listing details below. AI suggestions will not be requested.
          </p>
        </div>

        <!-- Listing Image and Business -->
        <section>
          <h2 class="rb-display display-6 section-title">Photo &amp; shopfront</h2>

          <div class="d-flex flex-column gap-4">
            <div class="field">
              <label for="listingImage" class="rb-label">Listing image</label>
              <input
                id="listingImage"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
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
          </div>
        </section>

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
              :disabled="formLocked"
                @change="changeListingType"
              >
                <option value="" disabled>Select listing type</option>
                <option value="ITEM">Single item</option>
                <option value="BUNDLE">Bundle</option>
              </select>
            </div>

            <div class="col-12 col-md-6 field">
              <label for="categoryId" class="rb-label">Category</label>
              <select
                id="categoryId"
                v-model="listing.categoryId"
                :required="manualMode || suggestionsReady"
                :disabled="formLocked"
              >
                <option value="" disabled>
                  {{ manualMode ? 'Select a category' : 'Let AI suggest' }}
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
                :placeholder="manualMode ? 'Enter listing title' : 'Let AI suggest a title'"
                :required="manualMode || suggestionsReady"
                :disabled="formLocked"
              />
            </div>

            <div class="col-12 field">
              <label for="description" class="rb-label">Description</label>
              <textarea
                id="description"
                v-model.trim="listing.description"
                rows="3"
                :placeholder="manualMode ? 'Enter a description' : 'Let AI suggest a description'"
              :disabled="formLocked"
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
                :disabled="formLocked"
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
                :disabled="formLocked"
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
                :disabled="formLocked"
                  />
                </div>
                <div class="col-5 col-md-2">
                  <button
                    type="button"
                    class="rb-pill rb-pill-sm remove-button w-100"
                :disabled="formLocked"
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
                :disabled="formLocked"
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
                :required="manualMode || suggestionsReady"
                :disabled="formLocked"
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
                :disabled="formLocked"
              />
            </div>
            <div class="col-6 field">
              <label for="status" class="rb-label">Listing status</label>
              <select
                id="status"
                v-model="listing.status"
                :disabled="formLocked"
              >
                <option value="ACTIVE">Active</option>
                <option value="DRAFT">Draft</option>
              </select>
            </div>
          </div>

          <div class="card-block">
            <label class="check-row" for="bundleEligible">
              <input
                id="bundleEligible"
                v-model="listing.bundleEligible"
                type="checkbox"
                :disabled="formLocked"
              />
              Allow this listing in 10% partner bundles
            </label>
            <p class="check-note">
              Customers may pair it with a nearby business during the same pickup time.
            </p>
          </div>

          <div class="d-flex flex-column gap-3 card-block">
            <button type="submit" class="rb-pill rb-pill-dark w-100" :disabled="saving">
              {{ submitText }}
            </button>
            <button
              v-if="!suggestionsReady && !manualMode"
              type="button"
              class="rb-pill secondary-button w-100"
              :disabled="saving"
              @click="enterManualMode"
            >
              Enter details manually
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
                :disabled="formLocked"
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
                :disabled="formLocked"
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
