
<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@clerk/vue'
import axios from 'axios'

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

// Register a new business
async function registerBusiness() {
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
  <main>
    <h1>Register Business</h1>

    <p v-if="errorMessage">{{ errorMessage }}</p>

    <form @submit.prevent="registerBusiness">

      <div>
        <label for="name">Business Name:</label>
        <input
          id="name"
          v-model="business.name"
          type="text"
          required
        />
      </div>

      <div>
        <label for="description">Description:</label>
        <textarea
          id="description"
          v-model="business.description"
        ></textarea>
      </div>

      <div>
        <label for="phone">Phone:</label>
        <input
          id="phone"
          v-model="business.phone"
          type="text"
        />
      </div>

      <div>
        <label for="address">Address:</label>
        <input
          id="address"
          v-model="business.address"
          type="text"
          required
        />
      </div>

      <div>
        <label for="postalCode">Postal Code:</label>
        <input
          id="postalCode"
          v-model="business.postalCode"
          type="text"
          required
        />
      </div>

      <div>
        <label for="pickupInstructions">
          Pickup Instructions:
        </label>
        <textarea
          id="pickupInstructions"
          v-model="business.pickupInstructions"
        ></textarea>
      </div>

      <div>
        <label for="longitude">Longitude:</label>
        <input
          id="longitude"
          v-model="business.longitude"
          type="number"
          step="any"
          min="-180"
          max="180"
          required
        />
      </div>

      <div>
        <label for="latitude">Latitude:</label>
        <input
          id="latitude"
          v-model="business.latitude"
          type="number"
          step="any"
          min="-90"
          max="90"
          required
        />
      </div>

      <button type="submit" :disabled="saving">
        {{ saving ? 'Registering...' : 'Register Business' }}
      </button>

      <button
        type="button"
        @click="router.push('/businesses')"
      >
        Cancel
      </button>

    </form>
  </main>
</template>
