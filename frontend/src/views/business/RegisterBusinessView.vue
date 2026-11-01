<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@clerk/vue'
import axios from 'axios'
import BusinessForm from '@/components/business/BusinessForm.vue'
import DisplayHeading from '@/components/DisplayHeading.vue'
import { API_URL } from '@/config'

const router = useRouter()
const { getToken } = useAuth()
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
    
    router.push('/myBusinesses')
  } catch (error) {
    console.error('Error registering business:', error)
    errorMessage.value = error.response?.data?.error || 'Failed to register business.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="register-business container-xxl px-4 pt-4 pb-5">
    <RouterLink to="/myBusinesses" class="rb-label back-link">← Back to my businesses</RouterLink>

    <header class="header-copy">
      <p class="rb-script rb-kicker fs-3">open a new shopfront</p>
      <DisplayHeading :size="128">Register business</DisplayHeading>
    </header>

    <p v-if="errorMessage" class="rb-note error mt-4" role="alert">{{ errorMessage }}</p>

    <BusinessForm
      class="mt-4"
      :saving="saving"
      @submit="registerBusiness"
      @cancel="router.push('/myBusinesses')"
    />
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

</style>
