<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@clerk/vue'
import axios from 'axios'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'

const route = useRoute()
const router = useRouter()
const { getToken } = useAuth()

const businessId = route.params.businessId
const API_URL = 'http://localhost:8000/api'

const business = ref({
  name: '',
  description: '',
  phone: '',
  address: '',
  postalCode: '',
  pickupInstructions: '',
  longitude: '',
  latitude: ''
})

const loading = ref(true)
const saving = ref(false)
const deleting = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

function emptyIfNull(value) {
  return value === null || value === undefined ? '' : value
}

const addressSearch = ref(null)
const addressLoading = ref(true)
const locationChanged = ref(false)
const locationProcessing = ref(false)

// Google Maps configuration
setOptions({
  key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  v: 'weekly'
})

// Load existing business details
async function getBusiness() {
  try {
    loading.value = true
    errorMessage.value = ''

    const token = await getToken.value()

    const response = await axios.get(
      `${API_URL}/businesses/ownedBusinesses`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    const data = response.data.businesses.find(
      b => b._id === businessId
    )

    if (!data) {
      errorMessage.value = 'Business not found or access denied.'
      return false
    }

    business.value = {
      name: emptyIfNull(data.name),
      description: emptyIfNull(data.description),
      phone: emptyIfNull(data.phone),
      address: emptyIfNull(data.address),
      postalCode: emptyIfNull(data.postal_code),
      pickupInstructions: emptyIfNull(data.pickup_instructions)
      name: data.name ?? '',
      description: data.description ?? '',
      phone: data.phone ?? '',
      address: data.address ?? '',
      postalCode: data.postal_code ?? '',
      pickupInstructions: data.pickup_instructions ?? '',
      longitude: data.location?.coordinates?.[0] ?? '',
      latitude: data.location?.coordinates?.[1] ?? ''
    }

    return true

  } catch (error) {
    console.error('Error fetching business:', error)

    errorMessage.value =
      (error.response && error.response.data && error.response.data.error) ||
      'Failed to load business details.'

    return false
  } finally {
    loading.value = false
  }
}

// Initialize Google Places Autocomplete
async function initializeGoogleMaps() {
  try {
    addressLoading.value = true

    const { PlaceAutocompleteElement } =
      await importLibrary('places')

    const autocomplete = new PlaceAutocompleteElement({
      includedRegionCodes: ['sg']
    })

    autocomplete.placeholder = business.value.address || 'Search for a business address'

    addressSearch.value.appendChild(autocomplete)

    autocomplete.addEventListener('gmp-select', async (event) => {
      try {
        locationProcessing.value = true
        errorMessage.value = ''
        successMessage.value = ''

        const place = event.placePrediction.toPlace()

        await place.fetchFields({
          fields: [
            'formattedAddress',
            'location',
            'addressComponents'
          ]
        })

        if (!place.location || !place.formattedAddress) {
          errorMessage.value = 'No valid address or coordinates found.'
          return
        }

        const postalComponent = place.addressComponents?.find(
          component => component.types.includes('postal_code')
        )

        const postalCode = postalComponent?.longText || ''

        if (!postalCode) {
          errorMessage.value =
            'No postal code found. Please select another address.'
          return
        }

        // Update all location-related fields together
        business.value.address = place.formattedAddress
        business.value.postalCode = postalCode
        business.value.latitude = place.location.lat()
        business.value.longitude = place.location.lng()

        // Track whether a new location was selected
        locationChanged.value = true

      } catch (error) {
        console.error('Error retrieving location:', error)
        errorMessage.value = 'Failed to retrieve location details.'
      } finally {
        locationProcessing.value = false
      }
    })

  } catch (error) {
    console.error('Google Maps error:', error)
    errorMessage.value = 'Failed to load Google address search.'
  } finally {
    addressLoading.value = false
  }
}

// Save edited business details
async function updateBusiness() {
  try {
    saving.value = true
    errorMessage.value = ''
    successMessage.value = ''

    const token = await getToken.value()

    // Preserve existing fields
    const data = {
      name: business.value.name,
      description: business.value.description,
      phone: business.value.phone,
      address: business.value.address,
      postalCode: business.value.postalCode,
      pickupInstructions: business.value.pickupInstructions
    }

    // Only update coordinates if location was changed
    if (locationChanged.value) {
      if (
        !business.value.address ||
        !business.value.postalCode ||
        business.value.latitude === '' ||
        business.value.longitude === ''
      ) {
        errorMessage.value =
          'Please select a valid Singapore business address.'
        return
      }

      data.location = {
        type: 'Point',
        coordinates: [
          Number(business.value.longitude),
          Number(business.value.latitude)
        ]
      }
    }

    await axios.patch(
      `${API_URL}/businesses/${businessId}`,
      data,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    successMessage.value = 'Business updated successfully!'

    // Location is now saved
    locationChanged.value = false

  } catch (error) {
    console.error('Error updating business:', error)

    errorMessage.value =
      (error.response && error.response.data && error.response.data.error) ||
      'Failed to update business.'
  } finally {
    saving.value = false
  }
}

// Delete business
// NOTE: This performs permanent deletion using DELETE.
async function deleteBusiness() {
  try {
    deleting.value = true
    errorMessage.value = ''

    const token = await getToken.value()

    await axios.delete(
      `${API_URL}/businesses/${businessId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    router.push('/businesses')

  } catch (error) {
    console.error('Error deleting business:', error)

    errorMessage.value =
      error.response?.data?.error ||
      'Failed to delete business.'
  } finally {
    deleting.value = false
  }
}

onMounted(async () => {
  const found = await getBusiness()

  if (found) {
    // Wait for the form to render after loading
    await import('vue').then(({ nextTick }) => nextTick())
    await initializeGoogleMaps()
  }
})
</script>

<template>
  <main class="edit-page">

    <div class="page-heading">
      <h1>Edit Business</h1>
      <p>Update your business details and collection information.</p>
    </div>

    <p v-if="loading" class="loading-message">
      Loading business details...
    </p>

    <p v-if="errorMessage" class="error-message">
      {{ errorMessage }}
    </p>

    <p v-if="successMessage" class="success-message">
      {{ successMessage }}
    </p>

    <div v-if="!loading && business.name" class="form-card">

      <div class="card-header">
        <h2>Business Information</h2>
        <p>Edit the details of your business.</p>
      </div>

      <div class="card-body">

        <form @submit.prevent="updateBusiness">

          <div class="row g-4">

            <!-- Business Name -->
            <div class="col-12">
              <label for="name">Business Name *</label>
              <input
                id="name"
                v-model="business.name"
                type="text"
                placeholder="Enter business name"
                required
              />
            </div>

            <!-- Description -->
            <div class="col-12">
              <label for="description">Description</label>
              <textarea
                id="description"
                v-model="business.description"
                rows="4"
                placeholder="Describe your business"
              ></textarea>
            </div>

            <!-- Phone -->
            <div class="col-12">
              <label for="phone">Phone Number</label>
              <input
                id="phone"
                v-model="business.phone"
                type="text"
                placeholder="Enter phone number"
              />
            </div>

            <!-- Business Location -->
            <div class="col-12">
              <h3 class="section-title">Business Location</h3>
              <p class="section-description">
                Search for a new address using Google Maps if you
                wish to change your business location.
                Otherwise, your existing location will be retained.
              </p>
            </div>

            <!-- Google Address Search -->
            <div class="col-12">
              <label>Change Business Address</label>

              <p v-if="addressLoading" class="loading-message">
                Loading address search...
              </p>

              <div
                ref="addressSearch"
                class="address-search"
              ></div>

              <p v-if="locationProcessing" class="field-hint">
                Retrieving location details...
              </p>

              <p v-else-if="locationChanged" class="location-success">
                New business location selected.
              </p>
            </div>

            <!-- Collection Details -->
            <div class="col-12">
              <h3 class="section-title">Collection Details</h3>
            </div>

            <!-- Pickup Instructions -->
            <div class="col-12">
              <label for="pickupInstructions">
                Pickup Instructions
              </label>

              <textarea
                id="pickupInstructions"
                v-model="business.pickupInstructions"
                rows="4"
                placeholder="Provide instructions for customers collecting orders"
              ></textarea>
            </div>

          </div>

          <!-- Action Buttons -->
          <div class="form-actions">

            <button
              type="button"
              class="cancel-button"
              @click="router.push('/businesses')"
            >
              Cancel
            </button>

            <button
              type="submit"
              class="submit-button"
              :disabled="saving || locationProcessing"
            >
              {{ saving ? 'Saving...' : 'Save Changes' }}
            </button>

          </div>

        </form>

      </div>
    </div>

    <!-- Delete Business -->
    <div v-if="!loading && business.name" class="delete-section">
      <div>
        <h3>Delete Business</h3>
        <p>
          Delete this business from your account.
        </p>
      </div>

      <button
        type="button"
        class="delete-button"
        :disabled="deleting"
        @click="deleteBusiness"
      >
        {{ deleting ? 'Deleting...' : 'Delete Business' }}
      </button>
    </div>

    <!-- Back Link -->
    <RouterLink to="/businesses" class="back-link">
      ← Back to Businesses
    </RouterLink>

  </main>
</template>

<style scoped>
.edit-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 30px;
}

/* Page Heading */
.page-heading {
  margin-bottom: 25px;
}

.page-heading h1 {
  color: #256b45;
  font-size: 30px;
  font-weight: 700;
  margin-bottom: 8px;
}

.page-heading p {
  color: #666;
  margin: 0;
}

/* Form Card */
.form-card {
  background: white;
  border: 1px solid #ddd;
  border-radius: 12px;
  overflow: hidden;
}

/* Card Header */
.card-header {
  background-color: #e8f5e9;
  padding: 24px;
}

.card-header h2 {
  color: #256b45;
  font-size: 22px;
  font-weight: 600;
  margin-bottom: 6px;
}

.card-header p {
  color: #555;
  margin: 0;
  font-size: 14px;
}

/* Card Body */
.card-body {
  padding: 30px;
}

/* Form Labels */
label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

/* Inputs */
input,
textarea {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #ccc;
  border-radius: 8px;
  font-size: 14px;
  background-color: white;
  box-sizing: border-box;
}

input:focus,
textarea:focus {
  outline: none;
  border-color: #256b45;
  box-shadow: 0 0 0 2px rgba(37, 107, 69, 0.1);
}

textarea {
  resize: vertical;
}

/* Section Headings */
.section-title {
  color: #256b45;
  font-size: 18px;
  font-weight: 600;
  margin: 5px 0 0;
  padding-bottom: 10px;
  border-bottom: 1px solid #ddd;
}

.section-description {
  color: #777;
  font-size: 13px;
  margin: 8px 0 0;
}

/* Google Address Autocomplete */
.address-search {
  width: 100%;
}

.address-search :deep(gmp-place-autocomplete) {
  width: 100%;
  display: block;
}

.field-hint {
  color: #777;
  font-size: 13px;
  margin-top: 8px;
}

.location-success {
  color: #256b45;
  font-size: 13px;
  margin-top: 8px;
  font-weight: 500;
}

/* Messages */
.error-message {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.success-message {
  color: #256b45;
  background: #e8f5e9;
  border: 1px solid #a5d6a7;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.loading-message {
  color: #777;
  font-size: 14px;
}

/* Form Buttons */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #eee;
}

.submit-button {
  background-color: #256b45;
  color: white;
  border: 1px solid #256b45;
  padding: 11px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.submit-button:hover:not(:disabled) {
  background-color: #1b5034;
}

.submit-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.cancel-button {
  background-color: white;
  color: #256b45;
  border: 1px solid #256b45;
  padding: 11px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.cancel-button:hover {
  background-color: #e8f5e9;
}

/* Delete Section */
.delete-section {
  margin-top: 30px;
  padding: 24px;
  background: #fff;
  border: 1px solid #fecaca;
  border-radius: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}

.delete-section h3 {
  color: #b91c1c;
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
}

.delete-section p {
  color: #666;
  font-size: 14px;
  margin: 0;
}

.delete-button {
  background-color: #dc2626;
  color: white;
  padding: 11px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.delete-button:hover:not(:disabled) {
  background-color: #b91c1c;
}

.delete-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Back Link */
.back-link {
  display: inline-block;
  margin-top: 25px;
  color: #256b45;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
}

.back-link:hover {
  text-decoration: underline;
}

/* Mobile */
@media (max-width: 600px) {
  .edit-page {
    padding: 16px;
  }

  .card-body {
    padding: 20px;
  }

  .form-actions {
    flex-direction: column;
  }

  .submit-button,
  .cancel-button {
    width: 100%;
  }

  .delete-section {
    flex-direction: column;
    align-items: stretch;
  }

  .delete-button {
    width: 100%;
  }
}
</style>