<script setup>
import { onMounted, ref } from 'vue'
import DisplayHeading from '../../components/DisplayHeading.vue'
import BusinessTile from '../../components/business/BusinessTile.vue'
import CustomerListingCard from '../../components/listings/CustomerListingCard.vue'
import axios from 'axios'
import { useAuth } from '@clerk/vue'
import { API_URL } from '@/config'

const { getToken } = useAuth()

const businesses = ref([])
const listings = ref([])
const loading = ref(true)
const errorMessage = ref('')

async function getHeaders() {
  const token = await getToken.value()
  return {
    Authorization: `Bearer ${token}`
  }
}

async function getFavourites() {
  loading.value = true
  errorMessage.value = ''

  try {
    const headers = await getHeaders()
    const businessResponse = await axios.get(
      `${API_URL}/users/me/favourites/businesses`,
      { headers: headers }
    )
    const listingResponse = await axios.get(
      `${API_URL}/users/me/favourites/listings`,
      { headers: headers }
    )

    businesses.value = businessResponse.data.businesses
    listings.value = listingResponse.data.listings
  } catch (error) {
    if (error.response && error.response.data && error.response.data.error) {
      errorMessage.value = error.response.data.error
    } else {
      errorMessage.value = 'Unable to load your favourites.'
    }
  }

  loading.value = false
}

async function removeBusiness(businessId) {
  try {
    const headers = await getHeaders()
    await axios.delete(
      `${API_URL}/users/me/favourites/businesses/${businessId}`,
      { headers: headers }
    )

    businesses.value = businesses.value.filter(function (business) {
      return business._id !== businessId
    })
  } catch (error) {
    errorMessage.value = 'Unable to remove this business.'
  }
}

async function removeListing(listingId) {
  try {
    const headers = await getHeaders()
    await axios.delete(
      `${API_URL}/users/me/favourites/listings/${listingId}`,
      { headers: headers }
    )

    listings.value = listings.value.filter(function (listing) {
      return listing._id !== listingId
    })
  } catch (error) {
    errorMessage.value = 'Unable to remove this listing.'
  }
}

onMounted(getFavourites)
</script>

<template>
  <main class="favourites-page">
    <section class="container-xxl px-4 pt-5">
      <p class="rb-script rb-kicker fs-3">saved for later</p>
      <DisplayHeading :size="144">My favourites</DisplayHeading>
    </section>

    <section class="container-xxl px-4 pt-5 pb-5">
      <p v-if="loading" class="rb-label">Loading favourites…</p>
      <p v-else-if="errorMessage" class="rb-note error" role="alert">{{ errorMessage }}</p>

      <template v-else>
        <section class="favourite-section" aria-labelledby="saved-listings">
          <div class="section-head">
            <h2 id="saved-listings" class="rb-display display-6 mb-0">Listings</h2>
            <span class="rb-label">{{ listings.length }} saved</span>
          </div>

          <div v-if="listings.length === 0" class="rb-empty mt-4">
            <p class="mb-3">You have not saved any listings yet.</p>
            <RouterLink to="/explore" class="rb-pill rb-pill-dark">Find food nearby</RouterLink>
          </div>

          <TransitionGroup tag="div" name="stag" appear v-else class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-4 mt-1">
            <div v-for="(listing, index) in listings" :key="listing._id" :style="{ '--i': index }" class="col d-flex flex-column gap-2">
              <CustomerListingCard class="flex-grow-1" :listing="listing" :index="index" />
              <button type="button" class="rb-pill rb-pill-text rb-pill-sm align-self-start" @click="removeListing(listing._id)">
                Remove from favourites
              </button>
            </div>
          </TransitionGroup>
        </section>

        <section class="favourite-section" aria-labelledby="saved-businesses">
          <div class="section-head">
            <h2 id="saved-businesses" class="rb-display display-6 mb-0">Businesses</h2>
            <span class="rb-label">{{ businesses.length }} saved</span>
          </div>

          <div v-if="businesses.length === 0" class="rb-empty mt-4">
            <p class="mb-3">You have not saved any businesses yet.</p>
            <RouterLink to="/businesses" class="rb-pill rb-pill-dark">Browse businesses</RouterLink>
          </div>

          <TransitionGroup tag="div" name="stag" appear v-else class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-4 mt-1">
            <div v-for="(business, index) in businesses" :key="business._id" :style="{ '--i': index }" class="col d-flex">
              <BusinessTile :business="business" :index="index">
                <RouterLink
                  :to="{ name: 'business-profile', params: { businessId: business._id } }"
                  class="rb-pill rb-pill-dark rb-pill-sm"
                >
                  View business
                </RouterLink>
                <button type="button" class="rb-pill rb-pill-text rb-pill-sm" @click="removeBusiness(business._id)">
                  Remove
                </button>
              </BusinessTile>
            </div>
          </TransitionGroup>
        </section>
      </template>
    </section>
  </main>
</template>

<style scoped>
.favourite-section + .favourite-section {
  margin-top: 64px;
}

.section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 2px solid #000;
}
</style>
