<script setup>
import { onMounted, ref } from 'vue'
import axios from 'axios'
import { useAuth } from '@clerk/vue'
import placeholderImage from '../../assets/placeholder.jpg'

const API_URL = 'http://localhost:8000/api'
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

function getListingImage(listing) {
  if (listing.images && listing.images.length > 0 && listing.images[0].url) {
    return listing.images[0].url
  }
  return placeholderImage
}

function formatPrice(value) {
  return '$' + Number(value).toFixed(2)
}

onMounted(getFavourites)
</script>

<template>
  <main class="favourites-page">
    <h1>My favourites</h1>
    <p class="page-intro">Your saved businesses and food listings.</p>

    <p v-if="loading">Loading favourites...</p>
    <p v-else-if="errorMessage" class="error">{{ errorMessage }}</p>

    <div v-else>
      <section class="favourite-section">
        <h2>Businesses</h2>

        <p v-if="businesses.length === 0" class="empty-message">
          You have not saved any businesses yet.
        </p>

        <div v-else class="card-grid">
          <article v-for="business in businesses" :key="business._id" class="card">
            <h3>{{ business.name }}</h3>
            <p>{{ business.description || 'No description available.' }}</p>
            <p>{{ business.address }}</p>

            <div class="actions">
              <RouterLink
                :to="{ name: 'business-profile', params: { businessId: business._id } }"
                class="primary-button"
              >
                View business
              </RouterLink>
              <button class="secondary-button" @click="removeBusiness(business._id)">
                Remove
              </button>
            </div>
          </article>
        </div>
      </section>

      <section class="favourite-section">
        <h2>Listings</h2>

        <p v-if="listings.length === 0" class="empty-message">
          You have not saved any listings yet.
        </p>

        <div v-else class="card-grid">
          <article v-for="listing in listings" :key="listing._id" class="card listing-card">
            <img :src="getListingImage(listing)" :alt="listing.title" />
            <div class="card-content">
              <h3>{{ listing.title }}</h3>
              <p>{{ listing.description || 'No description available.' }}</p>
              <p class="price">{{ formatPrice(listing.rescue_price_sgd) }}</p>

              <div class="actions">
                <RouterLink
                  :to="{ name: 'listing-detail', params: { listingId: listing._id } }"
                  class="primary-button"
                >
                  View listing
                </RouterLink>
                <button class="secondary-button" @click="removeListing(listing._id)">
                  Remove
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.favourites-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px;
}

h1,
h2,
h3 {
  color: #256b45;
}

.page-intro {
  margin-bottom: 30px;
  color: #666;
}

.favourite-section {
  margin-bottom: 40px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.card {
  overflow: hidden;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 12px;
  background-color: white;
}

.listing-card {
  padding: 0;
}

.listing-card img {
  width: 100%;
  height: 180px;
  object-fit: cover;
}

.card-content {
  padding: 20px;
}

.card h3 {
  margin-top: 0;
}

.card p {
  color: #666;
  line-height: 1.5;
}

.price {
  font-size: 20px;
  font-weight: bold;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}

.primary-button,
.secondary-button {
  padding: 9px 13px;
  border: 1px solid #256b45;
  border-radius: 8px;
  font-size: 14px;
  text-decoration: none;
  cursor: pointer;
}

.primary-button {
  color: white;
  background-color: #256b45;
}

.secondary-button {
  color: #256b45;
  background-color: white;
}

.empty-message {
  padding: 22px;
  border-radius: 10px;
  background-color: #f1f6ef;
  color: #666;
}

.error {
  color: #b42318;
}

@media (max-width: 850px) {
  .card-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 550px) {
  .favourites-page {
    padding: 18px;
  }

  .card-grid {
    grid-template-columns: 1fr;
  }
}
</style>
