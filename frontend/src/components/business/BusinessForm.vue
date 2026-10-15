
<script setup>
import { ref, onMounted } from 'vue'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'

const props = defineProps({
  initialBusiness: {
    type: Object,
    default: () => ({})
  },
  isEditing: {
    type: Boolean,
    default: false
  },
  saving: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['submit', 'cancel'])

const business = ref({
  name: props.initialBusiness.name ?? '',
  description: props.initialBusiness.description ?? '',
  phone: props.initialBusiness.phone ?? '',
  address: props.initialBusiness.address ?? '',
  postalCode: props.initialBusiness.postalCode ?? '',
  pickupInstructions: props.initialBusiness.pickupInstructions ?? '',
  longitude: props.initialBusiness.longitude ?? '',
  latitude: props.initialBusiness.latitude ?? ''
})

const addressSearch = ref(null)
const addressLoading = ref(true)
const locationProcessing = ref(false)
const locationChanged = ref(false)
const locationError = ref('')
const locationWarning = ref('')
const showPostalInput = ref(false)

// Initialize Google Maps
onMounted(async () => {
  try {
    setOptions({
      key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
      v: 'weekly'
    })

    const { PlaceAutocompleteElement } =
      await importLibrary('places')

    const autocomplete = new PlaceAutocompleteElement({
      includedRegionCodes: ['sg']
    })

    // Display existing address when editing
    autocomplete.placeholder =
      props.isEditing && business.value.address
        ? business.value.address
        : 'Search for your business address'

    // Force light theme
    autocomplete.style.colorScheme = 'light'

    addressSearch.value.appendChild(autocomplete)

    // When user selects a Google Maps location
    autocomplete.addEventListener('gmp-select', async (event) => {
      locationProcessing.value = true
      locationError.value = ''
      locationWarning.value = ''
      locationChanged.value = false
      showPostalInput.value = false

      try {
        const place = event.placePrediction.toPlace()

        await place.fetchFields({
          fields: [
            'displayName',
            'formattedAddress',
            'location',
            'addressComponents'
          ]
        })

        // Check that Google returned a valid location
        if (!place.location || !place.formattedAddress) {
          locationError.value =
            'Please select a valid business address.'
          return
        }

        // Retrieve place name and formatted address
        const placeName = place.displayName || ''
        const address = place.formattedAddress

        // Include place name without duplicating it
        const fullAddress =
          placeName &&
          !address.toLowerCase().includes(placeName.toLowerCase())
            ? `${placeName}, ${address}`
            : address

        // Retrieve postal code from Google
        let postal = place.addressComponents?.find(
          component => component.types.includes('postal_code')
        )?.longText || ''

        // Fallback: extract postal code from formatted address
        if (!postal) {
          const match = address.match(
            /(?:Singapore|S)\s*(\d{6})\b/i
          )

          postal = match ? match[1] : ''
        }

        // Save selected location details
        business.value.address = fullAddress
        business.value.postalCode = postal
        business.value.latitude = place.location.lat()
        business.value.longitude = place.location.lng()

        locationChanged.value = true

        // Ask user for postal code only when necessary
        if (!postal) {
          showPostalInput.value = true
          locationWarning.value =
            'Postal code not found automatically. Please enter it below.'
        }

      } catch (error) {
        console.error('Error retrieving Google Maps location:', error)
        locationError.value =
          'Failed to retrieve the selected address.'
      } finally {
        locationProcessing.value = false
      }
    })

  } catch (error) {
    console.error('Google Maps autocomplete error:', error)
    locationError.value =
      'Failed to load Google address search.'
  } finally {
    addressLoading.value = false
  }
})

// Submit form
function submitForm() {
  locationError.value = ''
  locationWarning.value = ''

  if (locationProcessing.value) return

  // Registration requires a Google Maps selection
  if (!props.isEditing && !locationChanged.value) {
    locationError.value =
      'Please select your address from Google Maps.'
    return
  }

  // Validate postal code when registering or changing location
  if (!props.isEditing || locationChanged.value) {
    const postal = business.value.postalCode.trim()

    if (!/^\d{6}$/.test(postal)) {
      showPostalInput.value = true
      locationError.value =
        'Please enter a valid 6-digit Singapore postal code.'
      return
    }

    business.value.postalCode = postal

    // Ensure valid coordinates are available
    const latitude = Number(business.value.latitude)
    const longitude = Number(business.value.longitude)

    if (
      business.value.latitude === '' ||
      business.value.longitude === '' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      locationError.value =
        'Please select a valid location from Google Maps.'
      return
    }
  }

  // Prepare business data
  const data = {
    name: business.value.name,
    description: business.value.description,
    phone: business.value.phone,
    address: business.value.address,
    postalCode: business.value.postalCode,
    pickupInstructions: business.value.pickupInstructions
  }

  // Include coordinates only for registration or location changes
  if (!props.isEditing || locationChanged.value) {
    data.location = {
      type: 'Point',
      coordinates: [
        Number(business.value.longitude),
        Number(business.value.latitude)
      ]
    }
  }

  emit('submit', data)
}
</script>

<template>
  <div class="business-form-card">

    <div class="business-form-header">
      <h2>Business Information</h2>
      <p>
        {{ isEditing
          ? 'Edit the details of your business.'
          : 'Fill in the details of your business.' }}
      </p>
    </div>

    <form
      class="business-form-body"
      @submit.prevent="submitForm"
    >
      <div class="row g-4">

        <!-- Business Name -->
        <div class="col-12">
          <label for="business-name">
            Business Name *
          </label>

          <input
            id="business-name"
            v-model="business.name"
            type="text"
            placeholder="Enter business name"
            required
          />
        </div>

        <!-- Description -->
        <div class="col-12">
          <label for="business-description">
            Description
          </label>

          <textarea
            id="business-description"
            v-model="business.description"
            rows="4"
            placeholder="Describe your business"
          ></textarea>
        </div>

        <!-- Phone -->
        <div class="col-12">
          <label for="business-phone">
            Phone Number
          </label>

          <input
            id="business-phone"
            v-model="business.phone"
            type="text"
            placeholder="Enter phone number"
          />
        </div>

        <!-- Business Location -->
        <div class="col-12">
          <h3 class="section-title">
            Business Location
          </h3>

          <p class="section-description">
            {{ isEditing
              ? 'Your existing location will be retained unless you select a new address.'
              : 'Select your business address from Google Maps.' }}
          </p>
        </div>

        <!-- Google Maps Address Search -->
        <div class="col-12">
          <label>
            {{ isEditing
              ? 'Change Business Address'
              : 'Search Business Address *' }}
          </label>

          <p v-if="addressLoading" class="field-hint">
            Loading address search...
          </p>

          <div
            ref="addressSearch"
            class="address-search"
          ></div>

          <p v-if="locationProcessing" class="field-hint">
            Retrieving location details...
          </p>

          <p
            v-else-if="locationChanged"
            class="location-success"
          >
            New address selected successfully.
          </p>

          <p
            v-else-if="isEditing && business.address"
            class="field-hint"
          >
            Current address: {{ business.address }}
          </p>

          <p v-if="locationWarning" class="field-hint">
            {{ locationWarning }}
          </p>

          <p v-if="locationError" class="location-error">
            {{ locationError }}
          </p>
        </div>

        <!-- Manual Postal Code Fallback -->
        <div
          v-if="showPostalInput"
          class="col-12"
        >
          <label for="postal-code">
            Postal Code *
          </label>

          <input
            id="postal-code"
            v-model="business.postalCode"
            type="text"
            inputmode="numeric"
            maxlength="6"
            placeholder="Enter 6-digit postal code"
            required
          />

          <p class="field-hint">
            Google Maps could not automatically determine
            the postal code for this location.
          </p>
        </div>

        <!-- Collection Details -->
        <div class="col-12">
          <h3 class="section-title">
            Collection Details
          </h3>
        </div>

        <!-- Pickup Instructions -->
        <div class="col-12">
          <label for="pickup-instructions">
            Pickup Instructions
          </label>

          <textarea
            id="pickup-instructions"
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
          @click="emit('cancel')"
        >
          Cancel
        </button>

        <button
          type="submit"
          class="submit-button"
          :disabled="saving || addressLoading || locationProcessing"
        >
          {{ saving
            ? (isEditing ? 'Saving...' : 'Registering...')
            : (isEditing ? 'Save Changes' : 'Register Business') }}
        </button>

      </div>

    </form>
  </div>
</template>

<style scoped>
.business-form-card {
  background: white;
  border: 1px solid #ddd;
  border-radius: 12px;
  overflow: hidden;
}

.business-form-header {
  background: #e8f5e9;
  padding: 24px;
}

.business-form-header h2 {
  color: #256b45;
  font-size: 22px;
  font-weight: 600;
  margin-bottom: 6px;
}

.business-form-header p {
  color: #555;
  margin: 0;
  font-size: 14px;
}

.business-form-body {
  padding: 30px;
}

label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

input,
textarea {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #ccc;
  border-radius: 8px;
  font-size: 14px;
  background: white;
  box-sizing: border-box;
}

input:focus,
textarea:focus {
  outline: none;
  border-color: #256b45;
  box-shadow: 0 0 0 2px rgba(37, 107, 69, .1);
}

textarea {
  resize: vertical;
}

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

.address-search {
  width: 100%;
}

.address-search :deep(gmp-place-autocomplete) {
  width: 100%;
  display: block;
  color-scheme: light;
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
}

.location-error {
  color: #b91c1c;
  font-size: 13px;
  margin-top: 8px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #eee;
}

.submit-button,
.cancel-button {
  padding: 11px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.submit-button {
  background: #256b45;
  color: white;
  border: 1px solid #256b45;
}

.submit-button:hover:not(:disabled) {
  background: #1b5034;
}

.submit-button:disabled {
  opacity: .6;
  cursor: not-allowed;
}

.cancel-button {
  background: white;
  color: #256b45;
  border: 1px solid #256b45;
}

.cancel-button:hover {
  background: #e8f5e9;
}

@media (max-width: 600px) {
  .business-form-body {
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
