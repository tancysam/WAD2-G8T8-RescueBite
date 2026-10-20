<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@clerk/vue'
import axios from 'axios'
import BusinessForm from '@/components/business/BusinessForm.vue'
import { API_URL } from '@/config'

const route = useRoute()
const router = useRouter()
const { getToken } = useAuth()
const businessId = route.params.businessId

const business = ref(null)
const loading = ref(true)
const saving = ref(false)
const deleting = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

async function getBusiness() {
  try {
    loading.value = true
    errorMessage.value = ''

    const token = await getToken.value()
    const response = await axios.get(`${API_URL}/businesses/ownedBusinesses`, {
      headers: { Authorization: `Bearer ${token}` }
    })

    const data = response.data.businesses.find(b => b._id === businessId)
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
      pickupInstructions: data.pickup_instructions ?? '',
      longitude: data.location?.coordinates?.[0] ?? '',
      latitude: data.location?.coordinates?.[1] ?? ''
    }
  } catch (error) {
    console.error('Error fetching business:', error)
    errorMessage.value = error.response?.data?.error || 'Failed to load business details.'
  } finally {
    loading.value = false
  }
}

async function updateBusiness(data) {
  try {
    saving.value = true
    errorMessage.value = ''
    successMessage.value = ''

    const token = await getToken.value()
    await axios.patch(`${API_URL}/businesses/${businessId}`, data, {
      headers: { Authorization: `Bearer ${token}` }
    })

    successMessage.value = 'Business updated successfully!'
    router.push(`/businesses/${businessId}`)
  } catch (error) {
    console.error('Error updating business:', error)
    errorMessage.value = error.response?.data?.error || 'Failed to update business.'
  } finally {
    saving.value = false
  }
}

// Retains the original direct DELETE request (no confirmation).
async function deleteBusiness() {
  try {
    deleting.value = true
    errorMessage.value = ''

    const token = await getToken.value()
    await axios.delete(`${API_URL}/businesses/${businessId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })

    router.push('/businesses')
  } catch (error) {
    console.error('Error deleting business:', error)
    errorMessage.value = error.response?.data?.error || 'Failed to delete business.'
  } finally {
    deleting.value = false
  }
}

onMounted(getBusiness)
</script>

<template>
  <main class="business-page">
    <div class="page-heading">
      <RouterLink to="/myBusinesses" class="back-link" style="margin-bottom: 10px;">← Back to Businesses</RouterLink>
      <h1>Edit Business</h1>
      <p>Update your business details and collection information.</p>
    </div>

    <p v-if="loading" class="loading-message">Loading business details...</p>
    <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
    <p v-if="successMessage" class="success-message">{{ successMessage }}</p>

    <BusinessForm
      v-if="!loading && business"
      :initial-business="business"
      :is-editing="true"
      :saving="saving"
      @submit="updateBusiness"
      @cancel="router.push('/businesses')"
    />

    <div v-if="!loading && business" class="delete-section">
      <div>
        <h3>Delete Business</h3>
        <p>Delete this business from your account.</p>
      </div>
      <button class="delete-button" type="button" :disabled="deleting" @click="deleteBusiness">
        {{ deleting ? 'Deleting...' : 'Delete Business' }}
      </button>
    </div>
  </main>
</template>

<style scoped>
.business-page { max-width: 1000px; margin: 0 auto; padding: 30px; }
.page-heading { margin-bottom: 25px; }
.page-heading h1 { color: #256b45; font-size: 30px; font-weight: 700; margin-bottom: 8px; }
.page-heading p { color: #666; margin: 0; }
.loading-message { color: #777; font-size: 14px; }
.error-message, .success-message { padding: 12px; border-radius: 8px; margin-bottom: 20px; }
.error-message { color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; }
.success-message { color: #256b45; background: #e8f5e9; border: 1px solid #a5d6a7; }
.delete-section {
  margin-top: 30px; padding: 24px; background: white;
  border: 1px solid #fecaca; border-radius: 12px;
  display: flex; justify-content: space-between; align-items: center; gap: 20px;
}
.delete-section h3 { color: #b91c1c; font-size: 18px; font-weight: 600; margin-bottom: 8px; }
.delete-section p { color: #666; font-size: 14px; margin: 0; }
.delete-button {
  background: #dc2626; color: white; padding: 11px 20px; border: none;
  border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
}
.delete-button:hover:not(:disabled) { background: #b91c1c; }
.delete-button:disabled { opacity: .6; cursor: not-allowed; }
.back-link { display: inline-block; margin-top: 25px; color: #256b45; font-size: 14px; font-weight: 600; text-decoration: none; }
.back-link:hover { text-decoration: underline; }
@media (max-width: 600px) {
  .business-page { padding: 16px; }
  .delete-section { flex-direction: column; align-items: stretch; }
  .delete-button { width: 100%; }
}
</style>
