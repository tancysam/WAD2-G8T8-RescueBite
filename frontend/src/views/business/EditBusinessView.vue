<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@clerk/vue'
import axios from 'axios'
import BusinessForm from '@/components/business/BusinessForm.vue'
import DisplayHeading from '@/components/DisplayHeading.vue'
import { API_URL } from '@/config'

const route = useRoute()
const router = useRouter()
const { getToken } = useAuth()
const businessId = route.params.businessId

const business = ref(null)
const loading = ref(true)
const saving = ref(false)
const deleting = ref(false)
const confirmingDelete = ref(false)
const confirmText = ref('')
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

function startDelete() {
  confirmingDelete.value = true
  confirmText.value = ''
}

function cancelDelete() {
  confirmingDelete.value = false
  confirmText.value = ''
}

function nameMatches() {
  return confirmText.value.trim().toLowerCase() === business.value.name.trim().toLowerCase()
}

async function deleteBusiness() {
  if (!nameMatches()) return
  try {
    deleting.value = true
    errorMessage.value = ''

    const token = await getToken.value()
    await axios.delete(`${API_URL}/businesses/${businessId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })

    router.push('/myBusinesses')
  } catch (error) {
    console.error('Error deleting business:', error)
    errorMessage.value = error.response?.data?.error || 'Failed to delete business.'
    cancelDelete()
  } finally {
    deleting.value = false
  }
}

onMounted(getBusiness)
</script>

<template>
  <main class="edit-business container-xxl px-4 pt-4 pb-5">
    <RouterLink to="/myBusinesses" class="rb-label back-link">← Back to my businesses</RouterLink>

    <header class="header-copy">
      <p class="rb-script rb-kicker fs-3">touch up your shopfront</p>
      <DisplayHeading :size="128">Edit business</DisplayHeading>
    </header>

    <p v-if="loading" class="rb-label mt-4">Loading business details…</p>
    <p v-if="errorMessage" class="rb-note error mt-4" role="alert">{{ errorMessage }}</p>
    <p v-if="successMessage" class="rb-note mt-4">{{ successMessage }}</p>

    <BusinessForm
      v-if="!loading && business"
      class="mt-4"
      :initial-business="business"
      :is-editing="true"
      :saving="saving"
      @submit="updateBusiness"
      @cancel="router.push('/myBusinesses')"
    >
      <template v-slot:aside>
        <section class="px-1">
          <h2 class="rb-label">Delete business</h2>
          <p class="delete-copy">Remove this business from your account.</p>
          <button v-if="!confirmingDelete" class="rb-pill delete-button w-100" type="button" @click="startDelete">
            Delete business
          </button>
          <div v-else class="delete-confirm" role="alertdialog" aria-label="Confirm business deletion">
            <p class="delete-copy">
              This will remove <strong>{{ business.name }}</strong>, all of its listings and its
              customer favourites. This cannot be undone. Type the business name to confirm.
            </p>
            <input
              v-model="confirmText"
              class="form-control mb-3"
              type="text"
              :placeholder="business.name"
              aria-label="Type the business name to confirm"
              autocomplete="off"
            />
            <button
              class="rb-pill delete-button w-100 mb-2"
              type="button"
              :disabled="deleting || !nameMatches()"
              @click="deleteBusiness"
            >
              {{ deleting ? 'Deleting…' : 'Permanently delete' }}
            </button>
            <button class="rb-pill w-100" type="button" :disabled="deleting" @click="cancelDelete">Cancel</button>
          </div>
        </section>
      </template>
    </BusinessForm>
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


.delete-copy {
  margin: 8px 0 16px;
  font-size: 16px;
  line-height: 24px;
}

.delete-button {
  color: #191200;
  background-color: transparent;
  border-color: #ff7a7a;
}

.delete-button:disabled {
  opacity: .4;
  cursor: not-allowed;
}


</style>
