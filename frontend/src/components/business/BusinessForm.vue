
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
  <form class="row g-5 mt-0" @submit.prevent="submitForm">
    <section class="col-lg-7 d-flex flex-column gap-5">
      <!-- Business Details -->
      <section>
        <h2 class="rb-display display-6 section-title">The basics</h2>

        <div class="d-flex flex-column gap-4">
          <div class="field">
            <label for="business-name" class="rb-label">Business name *</label>
            <input
              id="business-name"
              v-model="business.name"
              type="text"
              placeholder="Enter business name"
              required
            />
          </div>

          <div class="field">
            <label for="business-description" class="rb-label">Description</label>
            <textarea
              id="business-description"
              v-model="business.description"
              rows="4"
              placeholder="Describe your business"
            ></textarea>
          </div>

          <div class="field">
            <label for="business-phone" class="rb-label">Phone number</label>
            <input
              id="business-phone"
              v-model="business.phone"
              type="text"
              placeholder="Enter phone number"
            />
          </div>
        </div>
      </section>

      <!-- Business Location -->
      <section>
        <h2 class="rb-display display-6 section-title">Where to find you</h2>
        <p class="section-note">
          {{ isEditing
            ? 'Your existing location will be retained unless you select a new address.'
            : 'Select your business address from Google Maps.' }}
        </p>

        <div class="d-flex flex-column gap-4">
          <div class="field">
            <span class="rb-label">
              {{ isEditing ? 'Change business address' : 'Search business address *' }}
            </span>

            <p v-if="addressLoading" class="hint">Loading address search…</p>
            <div ref="addressSearch" class="address-search"></div>

            <p v-if="locationProcessing" class="hint">Retrieving location details…</p>
            <p v-else-if="locationChanged" class="hint selected">New address selected.</p>
            <p v-else-if="isEditing && business.address" class="hint">
              Current address: {{ business.address }}
            </p>

            <p v-if="locationWarning" class="hint">{{ locationWarning }}</p>
            <p v-if="locationError" class="rb-note error mt-2" role="alert">{{ locationError }}</p>
          </div>

          <!-- Manual Postal Code Fallback -->
          <div v-if="showPostalInput" class="field">
            <label for="postal-code" class="rb-label">Postal code *</label>
            <input
              id="postal-code"
              v-model="business.postalCode"
              type="text"
              inputmode="numeric"
              maxlength="6"
              placeholder="Enter 6-digit postal code"
              required
            />
            <p class="hint">
              Google Maps could not automatically determine the postal code for this location.
            </p>
          </div>
        </div>
      </section>

      <!-- Collection Details -->
      <section>
        <h2 class="rb-display display-6 section-title">Collection</h2>

        <div class="field">
          <label for="pickup-instructions" class="rb-label">Pickup instructions</label>
          <textarea
            id="pickup-instructions"
            v-model="business.pickupInstructions"
            rows="4"
            placeholder="Provide instructions for customers collecting orders"
          ></textarea>
        </div>
      </section>
    </section>

    <aside class="col-lg-5 d-flex flex-column gap-4">
      <!-- Shopfront Preview and Actions -->
      <div class="shopfront-card p-4 p-md-5">
        <p class="rb-label">Your shopfront</p>
        <p class="rb-display shopfront-name">{{ business.name || 'Your business' }}</p>
        <p class="shopfront-line">{{ business.address || 'No address selected yet' }}</p>
        <p v-if="business.phone" class="shopfront-line">{{ business.phone }}</p>

        <div class="d-flex flex-column gap-3 actions">
          <button
            type="submit"
            class="rb-pill rb-pill-dark w-100"
            :disabled="saving || addressLoading || locationProcessing"
          >
            {{ saving
              ? (isEditing ? 'Saving…' : 'Registering…')
              : (isEditing ? 'Save changes' : 'Register business') }}
          </button>
          <button type="button" class="rb-pill cancel-button w-100" @click="emit('cancel')">
            Cancel
          </button>
        </div>
      </div>

      <section v-if="business.pickupInstructions" class="px-1">
        <h2 class="rb-label">Pickup instructions</h2>
        <p class="pickup-instructions">{{ business.pickupInstructions }}</p>
      </section>

      <slot name="aside"></slot>
    </aside>
  </form>
</template>

<style scoped>
.section-title {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 2px solid #000;
  line-height: 1.1;
}

.section-note {
  margin: -4px 0 20px;
  font-size: 16px;
  line-height: 24px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field input {
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


.address-search :deep(gmp-place-autocomplete) {
  width: 100%;
  display: block;
  color-scheme: light;
}

.hint {
  margin: 0;
  color: #5f5330;
  font-size: 14px;
  line-height: 20px;
}

.hint.selected {
  color: #8a6200;
}

.shopfront-card {
  color: #000;
  background-color: #f4b30c;
}

.shopfront-card .rb-label {
  color: #000;
}

.shopfront-name {
  margin: 8px 0 12px;
  font-size: 56px;
  line-height: .95;
}

.shopfront-line {
  margin: 4px 0 0;
  font-size: 16px;
  line-height: 24px;
}

.actions {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 2px solid #000;
}


.cancel-button {
  color: #000;
  background-color: transparent;
}

.cancel-button:hover {
  color: #f4b30c;
  background-color: #000;
}

.pickup-instructions {
  margin: 8px 0 0;
  padding: 16px 20px;
  border: 2px solid #f4b30c;
  border-radius: 28px;
  font-size: 15px;
  line-height: 22px;
}
</style>
