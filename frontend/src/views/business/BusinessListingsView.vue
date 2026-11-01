<script setup>
import { computed, onMounted, ref } from 'vue'
import axios from 'axios'
import { useAuth } from '@clerk/vue'
import DisplayHeading from '../../components/DisplayHeading.vue'
import BusinessListingCard from '../../components/business/BusinessListingCard.vue'
import { API_URL } from '@/config'

const { getToken } = useAuth()

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
  <main class="listings-page">
    <section class="container-xxl px-4 pt-5">
      <div class="d-flex flex-wrap align-items-end justify-content-between gap-4">
        <div>
          <p class="rb-script rb-kicker fs-3">what’s on the shelf</p>
          <DisplayHeading :size="144">Manage listings</DisplayHeading>
          <p v-if="selectedBusiness" class="rb-label mt-2">Listings for {{ selectedBusiness.name }}</p>
        </div>
        <div class="d-flex flex-wrap align-items-center gap-3">
          <label v-if="businesses.length > 1" for="businessId" class="rb-label d-flex align-items-center gap-2">
            Business
            <select
              id="businessId"
              v-model="selectedBusinessId"
              class="rb-select"
              @change="changeBusiness"
            >
              <option v-for="item in businesses" :key="item._id" :value="item._id">
                {{ item.name }}
              </option>
            </select>
          </label>
          <RouterLink
            v-if="selectedBusiness"
            :to="{ name: 'business-listing-create' }"
            class="rb-pill rb-pill-dark"
          >
            + Create listing
          </RouterLink>
        </div>
      </div>
    </section>

    <section class="container-xxl px-4 pt-5 pb-5">
      <p v-if="loading" class="rb-label">Loading your listings…</p>

      <p v-else-if="errorMessage" class="rb-note error" role="alert">
        {{ errorMessage }}
      </p>

      <div v-else-if="businesses.length === 0" class="rb-note">
        <span>You do not have an active business yet.</span>
        <RouterLink to="/register-business" class="rb-pill rb-pill-dark rb-pill-sm">Register a business</RouterLink>
      </div>

      <template v-else>
        <div v-if="listingToRemove" class="rb-note mb-4" role="alert">
          <div>
            <p class="mb-0">
              Remove <strong>{{ listingToRemove.title }}</strong>? Customers will no longer see it.
            </p>
            <p v-if="removeError" class="remove-error mb-0 mt-2">{{ removeError }}</p>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <button
              type="button"
              class="rb-pill rb-pill-dark rb-pill-sm"
              :disabled="removing"
              @click="confirmRemove"
            >
              {{ removing ? 'Removing…' : 'Confirm remove' }}
            </button>
            <button
              type="button"
              class="rb-pill rb-pill-line rb-pill-sm"
              :disabled="removing"
              @click="cancelRemove"
            >
              Cancel
            </button>
          </div>
        </div>

        <div class="rb-chip-row" role="group" aria-label="Filter by status">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            type="button"
            class="rb-chip"
            :class="{ active: activeTab === tab.key }"
            :aria-pressed="activeTab === tab.key"
            @click="activeTab = tab.key"
          >
            {{ tab.label }} <span class="ms-1">{{ counts[tab.key] }}</span>
          </button>
        </div>

        <div v-if="visibleListings.length === 0" class="rb-empty mt-4">
          <p class="rb-display display-6 mb-2">Nothing here yet</p>
          <p class="mb-0">No listings in this tab.</p>
        </div>

        <TransitionGroup tag="div" name="stag" appear v-else class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-4 mt-1">
          <div v-for="(listing, index) in visibleListings" :key="listing._id" :style="{ '--i': index }" class="col d-flex">
            <BusinessListingCard
              class="w-100"
              :listing="listing"
              :index="index"
              :category-name="categoryName(listing.category_id)"
              :business-id="selectedBusinessId"
              @request-remove="askToRemove"
            />
          </div>
        </TransitionGroup>
      </template>
    </section>
  </main>
</template>

<style scoped>
.remove-error {
  color: #8a1c1c;
}
</style>
