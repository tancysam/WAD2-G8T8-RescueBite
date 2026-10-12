
<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '@clerk/vue'
import axios from 'axios'

const route = useRoute()
const { getToken } = useAuth()

const businessId = route.params.businessId
const API_URL = 'http://localhost:8000/api'

const business = ref({
  name: '',
  description: '',
  phone: '',
  address: '',
  postalCode: '',
  pickupInstructions: ''
})

const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

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
      return
    }

    business.value = {
      name: data.name ?? '',
      description: data.description ?? '',
      phone: data.phone ?? '',
      address: data.address ?? '',
      postalCode: data.postal_code ?? '',
      pickupInstructions: data.pickup_instructions ?? ''
    }

  } catch (error) {
    console.error('Error fetching business:', error)

    errorMessage.value =
      error.response?.data?.error ||
      'Failed to load business details.'
  } finally {
    loading.value = false
  }
}

// Save edited business details
async function updateBusiness() {
  try {
    saving.value = true
    errorMessage.value = ''
    successMessage.value = ''

    const token = await getToken.value()

    await axios.patch(
      `${API_URL}/businesses/${businessId}`, business.value,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    successMessage.value = 'Business updated successfully!'

  } catch (error) {
    console.error('Error updating business:', error)

    errorMessage.value =
      error.response?.data?.error ||
      'Failed to update business.'
  } finally {
    saving.value = false
  }
}

onMounted(getBusiness)
</script>

<template>
  <main>
    <h1>Edit Business</h1>

    <p v-if="loading">Loading business details...</p>

    <p v-if="errorMessage">{{ errorMessage }}</p>
    <p v-if="successMessage">{{ successMessage }}</p>

    <form
      v-if="!loading && business.name"
      @submit.prevent="updateBusiness"
    >

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

      <button type="submit" :disabled="saving">
        {{ saving ? 'Saving...' : 'Save Changes' }}
      </button>

    </form>
  </main>
</template>
