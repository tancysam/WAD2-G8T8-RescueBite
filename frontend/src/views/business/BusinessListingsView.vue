<script setup>
import { computed, onMounted, ref } from 'vue'
import axios from 'axios'
import { useAuth } from '@clerk/vue'
import BusinessListingCard from '../../components/business/BusinessListingCard.vue'
import { API_URL } from '@/config'

const { getToken } = useAuth()

// Business Listing Data
const businesses = ref([])
const selectedBusinessId = ref('')
const listings = ref([])
const categories = ref([])
const loading = ref(true)
const errorMessage = ref('')
const activeTab = ref('ALL')
const listingToRemove = ref(null)
const removing = ref(false)
const removeError = ref('')

const tabs = [
  { key: 'ALL', label: 'All' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'SOLD_OUT', label: 'Sold out' },
  { key: 'EXPIRED', label: 'Expired' },
  { key: 'REMOVED', label: 'Removed' }
]

// Selected Business and Listing Filters
const selectedBusiness = computed(() => {
  for (const business of businesses.value) {
    if (business._id === selectedBusinessId.value) return business
  }
  return null
})

const counts = computed(() => {
  const result = {
    ALL: 0,
    DRAFT: 0,
    ACTIVE: 0,
    SOLD_OUT: 0,
    EXPIRED: 0,
    REMOVED: 0
  }

  for (const listing of listings.value) {
    result.ALL = result.ALL + 1
    if (result[listing.status] !== undefined) {
      result[listing.status] = result[listing.status] + 1
    }
  }

  return result
})

const visibleListings = computed(() => {
  if (activeTab.value === 'ALL') return listings.value
  return listings.value.filter((listing) => listing.status === activeTab.value)
})

function categoryName(categoryId) {
  for (const category of categories.value) {
    if (category._id === categoryId) return category.name
  }
  return 'Uncategorised'
}

// Load Businesses and Listings
async function loadListings() {
  loading.value = true
  errorMessage.value = ''

  try {
    const token = await getToken.value()
    const headers = { Authorization: 'Bearer ' + token }

    const ownedResponse = await axios.get(
      API_URL + '/users/me/businesses',
      { headers: headers }
    )

    for (const item of ownedResponse.data.businesses) {
      if (item.status === 'ACTIVE') businesses.value.push(item)
    }

    if (businesses.value.length === 0) {
      loading.value = false
      return
    }

    selectedBusinessId.value = businesses.value[0]._id

    const categoryResponse = await axios.get(API_URL + '/categories')
    categories.value = categoryResponse.data.categories

    const listingResponse = await axios.get(
      API_URL + '/businesses/' + selectedBusinessId.value + '/managed-listings',
      { headers: headers }
    )

    listings.value = listingResponse.data.listings
  } catch (error) {
    console.error('Error loading business listings:', error)

    if (error.response && error.response.data && error.response.data.error) {
      errorMessage.value = error.response.data.error
    } else {
      errorMessage.value = 'Unable to load your listings.'
    }
  }

  loading.value = false
}

// Change Selected Business
async function changeBusiness() {
  loading.value = true
  errorMessage.value = ''
  listings.value = []
  listingToRemove.value = null

  try {
    const token = await getToken.value()

    const listingResponse = await axios.get(
      API_URL + '/businesses/' + selectedBusinessId.value + '/managed-listings',
      {
        headers: {
          Authorization: 'Bearer ' + token
        }
      }
    )

    listings.value = listingResponse.data.listings
  } catch (error) {
    console.error('Error changing business:', error)

    if (error.response && error.response.data && error.response.data.error) {
      errorMessage.value = error.response.data.error
    } else {
      errorMessage.value = 'Unable to load listings for this business.'
    }
  }

  loading.value = false
}

// Remove Listing
function askToRemove(listing) {
  listingToRemove.value = listing
  removeError.value = ''
}

function cancelRemove() {
  listingToRemove.value = null
  removeError.value = ''
}

async function confirmRemove() {
  if (listingToRemove.value === null) return

  removing.value = true
  removeError.value = ''

  try {
    const token = await getToken.value()

    await axios.delete(
      API_URL + '/listings/' + listingToRemove.value._id,
      {
        headers: {
          Authorization: 'Bearer ' + token
        }
      }
    )

    for (const listing of listings.value) {
      if (listing._id === listingToRemove.value._id) {
        listing.status = 'REMOVED'
      }
    }

    listingToRemove.value = null
  } catch (error) {
    console.error('Error removing listing:', error)

    if (error.response && error.response.data && error.response.data.error) {
      removeError.value = error.response.data.error
    } else {
      removeError.value = 'Unable to remove this listing.'
    }
  }

  removing.value = false
}

onMounted(loadListings)
</script>

<template>
  <main class="listings-page container py-4 py-md-5">
    <!-- Business Listings Header -->
    <header class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
      <div>
        <h1 class="page-title">Manage listings</h1>
        <p v-if="selectedBusiness" class="text-muted mb-0">
          Listings for {{ selectedBusiness.name }}
        </p>
      </div>

      <RouterLink
        v-if="selectedBusiness"
        :to="{ name: 'business-listing-create' }"
        class="btn btn-success"
      >
        Create listing
      </RouterLink>
    </header>

    <p v-if="loading" class="text-muted">Loading your listings...</p>

    <div v-else-if="errorMessage" class="alert alert-danger" role="alert">
      {{ errorMessage }}
    </div>

    <div v-else-if="businesses.length === 0" class="alert alert-warning" role="alert">
      You do not have an active business yet.
      <RouterLink to="/register-business" class="alert-link">
        Register a business
      </RouterLink>
    </div>

    <section v-else>
      <!-- Business Selector -->
      <div class="row mb-4">
        <div class="col-12 col-md-6">
          <label for="businessId" class="form-label">Business</label>
          <select
            id="businessId"
            v-model="selectedBusinessId"
            class="form-select"
            @change="changeBusiness"
          >
            <option
              v-for="item in businesses"
              :key="item._id"
              :value="item._id"
            >
              {{ item.name }}
            </option>
          </select>
        </div>
      </div>

      <div v-if="listingToRemove" class="alert alert-warning" role="alert">
        <p class="mb-2">
          Remove <strong>{{ listingToRemove.title }}</strong>? Customers will no longer see it.
        </p>
        <p v-if="removeError" class="text-danger mb-2">{{ removeError }}</p>
        <div class="d-flex gap-2">
          <button
            type="button"
            class="btn btn-danger btn-sm"
            :disabled="removing"
            @click="confirmRemove"
          >
            {{ removing ? 'Removing...' : 'Confirm remove' }}
          </button>
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            :disabled="removing"
            @click="cancelRemove"
          >
            Cancel
          </button>
        </div>
      </div>

      <!-- Listing Status Tabs -->
      <ul class="nav nav-tabs flex-nowrap overflow-auto mb-4">
        <li v-for="tab in tabs" :key="tab.key" class="nav-item">
          <button
            type="button"
            class="nav-link text-nowrap"
            :class="{ active: activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            {{ tab.label }} ({{ counts[tab.key] }})
          </button>
        </li>
      </ul>

      <p v-if="visibleListings.length === 0" class="text-muted">
        No listings in this tab.
      </p>

      <!-- Business Listing Cards -->
      <div v-else class="row g-3">
        <div
          v-for="listing in visibleListings"
          :key="listing._id"
          class="col-12 col-lg-6"
        >
          <BusinessListingCard
            :listing="listing"
            :category-name="categoryName(listing.category_id)"
            :business-id="selectedBusinessId"
            @request-remove="askToRemove"
          />
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
/* Business Listings Page */
.listings-page {
  color: #173d2c;
}

.page-title {
  margin: 0 0 4px;
  color: #164936;
  font-size: 38px;
}

.nav-tabs .nav-link {
  color: #256b45;
}

.nav-tabs .nav-link.active {
  color: #164936;
  font-weight: 600;
}
</style>
