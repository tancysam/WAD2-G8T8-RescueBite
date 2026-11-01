
<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import DisplayHeading from '../../components/DisplayHeading.vue'
import BusinessTile from '../../components/business/BusinessTile.vue'
import axios from 'axios'
import { useUser, useAuth } from '@clerk/vue'
import { API_URL } from '@/config'

const { user, isLoaded } = useUser()
const { getToken } = useAuth()

const userRole = ref(null)
const isBusiness = computed(() => userRole.value === 'BUSINESS')

const businesses = ref([])
const loading = ref(true)
const errorMessage = ref('')

const searchQuery = ref('')

async function getUserRole() {
  if (!user.value) return

  try {
    const token = await getToken.value()

    const response = await axios.get(
      `${API_URL}/users/me`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    userRole.value = response.data.user.role

    console.log('Current User Role:', userRole.value)

    if (isBusiness.value) {
      await getMyBusiness()
    }

  } catch (error) {
    console.error('Error fetching user role:', error)
  }
}

async function getBusinesses() {
  loading.value = true
  errorMessage.value = ''

  try {
    const response = await axios.get(
      `${API_URL}/businesses`
    )

    businesses.value = response.data.businesses

  } catch (error) {
    console.error('Error fetching businesses:', error)

    errorMessage.value =
      (error.response && error.response.data && error.response.data.error) ||
      'Unable to retrieve businesses.'
  } finally {
    loading.value = false
  }
}

const filteredBusinesses = computed(() => {
  return businesses.value.filter((business) => {
    return business.name.toLowerCase().includes(searchQuery.value.toLowerCase())
  })
})

onMounted(getBusinesses)

watch(
  [user, isLoaded],
  () => {
    if (isLoaded.value && user.value) {
      getUserRole()
    } else {
      userRole.value = null
      myBusinesses.value = []
    }
  },
  { immediate: true }
)
</script>

<template>
  <main class="businesses-page">
    <section class="container-xxl px-4 pt-5">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-4">
        <div>
          <p class="rb-script rb-kicker fs-3">who’s rescuing</p>
          <DisplayHeading :size="144">Businesses</DisplayHeading>
        </div>
      </div>

      <div class="filter-bar">
        <label class="search-field">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5f5330" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
          <span class="visually-hidden">Search businesses</span>
          <input v-model="searchQuery" type="search" placeholder="Bakeries, cafés, hawker stalls…" />
        </label>
      </div>
    </section>

    <section class="container-xxl px-4 pt-4 pb-5">
      <p v-if="loading" class="rb-label">Loading businesses…</p>

      <p v-else-if="errorMessage" class="rb-note error" role="alert">
        {{ errorMessage }}
      </p>

      <div v-else-if="filteredBusinesses.length === 0" class="rb-empty">
        <p class="rb-display display-6 mb-2">Nothing here yet</p>
        <p class="mb-0">No businesses found. Try another search.</p>
      </div>

      <TransitionGroup tag="div" name="stag" appear v-else class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-4">
        <div v-for="(business, index) in filteredBusinesses" :key="business._id" :style="{ '--i': index }" class="col d-flex">
          <BusinessTile :business="business" :index="index">
            <RouterLink
              :to="{ name: 'business-profile', params: { businessId: business._id } }"
              class="rb-pill rb-pill-dark rb-pill-sm"
            >
              View business
            </RouterLink>
          </BusinessTile>
        </div>
      </TransitionGroup>
    </section>
  </main>
</template>

<style scoped>
.filter-bar {
  margin-top: 32px;
  padding: 16px 0;
  border-top: 2px solid #000;
  border-bottom: 1px solid #ddd9c5;
}

.search-field {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 560px;
  height: 52px;
  padding: 0 24px;
  border: 1px solid #ddd9c5;
  border-radius: 140px;
  background-color: #f6f4ed;
}

.search-field input {
  flex: 1;
  min-width: 0;
  border: 0;
  color: #191200;
  background: transparent;
  font-size: 16px;
}
</style>
