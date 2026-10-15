<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@clerk/vue'
import axios from 'axios'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'

const router = useRouter()
const { getToken } = useAuth()

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

const saving = ref(false)
const errorMessage = ref('')
const addressSearch = ref(null)
const addressLoading = ref(true)

setOptions({
  key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  v: 'weekly'
})

onMounted(async () => {
  try {
    const { PlaceAutocompleteElement } =
      await importLibrary('places')

    const autocomplete = new PlaceAutocompleteElement({
      includedRegionCodes: ['sg']
    })

    addressSearch.value.appendChild(autocomplete)

    autocomplete.addEventListener('gmp-select', async (event) => {
      try {
        // Clear previous location before processing selection
        business.value.address = ''
        business.value.postalCode = ''
        business.value.latitude = ''
        business.value.longitude = ''

        const place = event.placePrediction.toPlace()

        await place.fetchFields({
          fields: [
            'formattedAddress',
            'location',
            'addressComponents'
          ]
        })

        if (!place.location) {
          errorMessage.value = 'No coordinates found for this address.'
          return
        }

        // Automatically populate address
        business.value.address = place.formattedAddress || ''

        // Automatically populate coordinates
        business.value.latitude = place.location.lat()
        business.value.longitude = place.location.lng()

        // Automatically populate postal code
        const postalComponent = place.addressComponents?.find(
          component => component.types.includes('postal_code')
        )

        business.value.postalCode =
          postalComponent?.longText || ''

        errorMessage.value = ''

      } catch (error) {
        console.error('Error retrieving location:', error)
        errorMessage.value = 'Failed to retrieve location details.'
      }
    })

  } catch (error) {
    console.error('Google Maps error:', error)
    errorMessage.value = 'Failed to load Google address search.'
  } finally {
    addressLoading.value = false
  }
})

// Register a new business
async function registerBusiness() {
  if (
    !business.value.address ||
    !business.value.postalCode ||
    business.value.latitude === '' ||
    business.value.longitude === ''
  ) {
    errorMessage.value =
      'Please select a valid Singapore business address with a postal code.'
    return
  }

  try {
    saving.value = true
    errorMessage.value = ''

    const token = await getToken.value()

    const data = {
      name: business.value.name,
      description: business.value.description,
      phone: business.value.phone,
      address: business.value.address,
      postalCode: business.value.postalCode,
      pickupInstructions: business.value.pickupInstructions,
      location: {
        type: 'Point',
        coordinates: [
          Number(business.value.longitude),
          Number(business.value.latitude)
        ]
      }
    }

    await axios.post(
      `${API_URL}/businesses`,
      data,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    router.push('/businesses')

  } catch (error) {
    console.error('Error registering business:', error)

    errorMessage.value =
      (error.response && error.response.data && error.response.data.error) ||
      'Failed to register business.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="register-page">

    <div class="page-heading">
      <h1>Register Business</h1>
      <p>Add your business details to get started.</p>
    </div>

    <div class="form-card">

      <div class="card-header">
        <h2>Business Information</h2>
        <p>Fill in the details of your business.</p>
      </div>

      <div class="card-body">

        <p v-if="errorMessage" class="error-message">
          {{ errorMessage }}
        </p>

        <form @submit.prevent="registerBusiness">

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
                Search for your business address using Google Maps.
              </p>
            </div>

            <!-- Google Address Search -->
            <div class="col-12">
              <label>Search Business Address *</label>

              <p v-if="addressLoading" class="loading-message">
                Loading address search...
              </p>

              <div
                ref="addressSearch"
                class="address-search"
              ></div>
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
              :disabled="saving || addressLoading"
            >
              {{ saving ? 'Registering...' : 'Register Business' }}
            </button>

          </div>

        </form>
      </div>
    </div>
  </main>
</template>

<style scoped>
.register-page {
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
  color-scheme: light;
  background-color: white;
  border: 1px solid #ccc;
  border-radius: 8px;
}

/* Error */
.error-message {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.loading-message {
  color: #777;
  font-size: 14px;
}

/* Buttons */
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

/* Mobile */
@media (max-width: 600px) {
  .register-page {
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
}
</style>