<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@clerk/vue'
import axios from 'axios'
import BusinessForm from '@/components/business/BusinessForm.vue'

const router = useRouter()
const { getToken } = useAuth()
const API_URL = 'http://localhost:8000/api'
const saving = ref(false)
const errorMessage = ref('')

async function registerBusiness(data) {
  try {
    saving.value = true
    errorMessage.value = ''

    const token = await getToken.value()
    await axios.post(`${API_URL}/businesses`, data, {
      headers: { Authorization: `Bearer ${token}` }
    })
    
    router.push('/businesses')
  } catch (error) {
    console.error('Error registering business:', error)
    errorMessage.value = error.response?.data?.error || 'Failed to register business.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="business-page">
    <div class="page-heading">
      <h1>Register Business</h1>
      <p>Add your business details to get started.</p>
    </div>

    <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

    <BusinessForm
      :saving="saving"
      @submit="registerBusiness"
      @cancel="router.push('/businesses')"
    />
  </main>
</template>

<style scoped>
.business-page { max-width: 1000px; margin: 0 auto; padding: 30px; }
.page-heading { margin-bottom: 25px; }
.page-heading h1 { color: #256b45; font-size: 30px; font-weight: 700; margin-bottom: 8px; }
.page-heading p { color: #666; margin: 0; }
.error-message {
  color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca;
  padding: 12px; border-radius: 8px; margin-bottom: 20px;
}
@media (max-width: 600px) { .business-page { padding: 16px; } }
</style>
