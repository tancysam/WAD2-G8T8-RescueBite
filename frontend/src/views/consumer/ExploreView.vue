<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import axios from 'axios'
import CustomerListingCard from '@/components/listings/CustomerListingCard.vue'

const API_URL = 'http://localhost:8000/api'

// Google Maps
const mapElement = ref(null)
const mapBounds = ref(null)

// Listings
const listings = ref([])
const listingsLoading = ref(false)
const listingsError = ref('')

// Map and request management
let map = null
let mapListener = null
let searchTimeout = null
let latestRequest = 0
let isDestroyed = false

// Google Maps API
setOptions({
    key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY
})

// Initialise Google Maps
async function initMap() {
    try {
        const { Map } = await importLibrary('maps')

        if (isDestroyed || !mapElement.value) return

        map = new Map(mapElement.value, {
            center: { lat: 1.3521, lng: 103.8198 },
            zoom: 15
        })

        // Listen for completed map movements
        mapListener = map.addListener('idle', () => {
            const bounds = map.getBounds()

            if (bounds) {
                const newBounds = bounds.toJSON()

                // Only update if boundaries actually changed
                const oldBounds = mapBounds.value

                if (
                    !oldBounds ||
                    Math.abs(newBounds.north - oldBounds.north) > 0.000001 ||
                    Math.abs(newBounds.south - oldBounds.south) > 0.000001 ||
                    Math.abs(newBounds.east - oldBounds.east) > 0.000001 ||
                    Math.abs(newBounds.west - oldBounds.west) > 0.000001
                ) {
                    mapBounds.value = newBounds
                }
            }
        })

        // Get user's current location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    if (isDestroyed || !map) return

                    const userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    }

                    map.setCenter(userLocation)
                    map.setZoom(15)
                },
                (error) => {
                    console.log('Unable to get location:', error.message)
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000
                }
            )
        }

    } catch (error) {
        console.error('Google Maps error:', error)
    }
}

// Retrieve listings within the map area
async function getVisibleListings() {
    if (!mapBounds.value) return

    const requestId = ++latestRequest

    listingsLoading.value = true
    listingsError.value = ''

    const { north, south, east, west } = mapBounds.value

    // Calculate centre
    const lat = (north + south) / 2
    const lng = (east + west) / 2

    // Calculate radius based on visible map height
    const radiusKm = Math.min(
        50,
        Math.max(0.1, (north - south) * 111 / 2)
    )

    try {
        const response = await axios.get(
            `${API_URL}/listings`,
            {
                params: {
                    lat,
                    lng,
                    radiusKm,
                    limit: 100
                }
            }
        )

        if (isDestroyed || requestId !== latestRequest) return

        listings.value = response.data.listings || []

        console.log('Visible listings:', listings.value)

    } catch (error) {
        if (isDestroyed || requestId !== latestRequest) return

        console.error('Error fetching listings:', error)

        listingsError.value =
            error.response?.data?.error ||
            'Unable to retrieve listings.'

    } finally {
        if (!isDestroyed && requestId === latestRequest) {
            listingsLoading.value = false
        }
    }
}

// Watch map boundaries
watch(mapBounds, () => {
    // Invalidate any older response immediately
    latestRequest++

    // Cancel any previous scheduled search
    if (searchTimeout) {
        clearTimeout(searchTimeout)
    }

    // Wait briefly before fetching
    searchTimeout = setTimeout(() => {
        getVisibleListings()
    }, 300)
})

// When component loads
onMounted(() => {
    isDestroyed = false
    initMap()
})

// Cleanup when leaving the page
onUnmounted(() => {
    isDestroyed = true
    latestRequest++

    if (searchTimeout) {
        clearTimeout(searchTimeout)
    }

    if (mapListener) {
        mapListener.remove()
    }

    map = null
    mapListener = null
})
</script>

<template>
    <div class="explore-page">
        <h1>Find Your Next Meal</h1>

        <div class="main-container">

            <!-- Left: Listings -->
            <div class="listings-container">
                <h2>Available Listings</h2>

                <p v-if="listingsLoading" class="loading-message">
                    Updating listings...
                </p>

                <p v-if="listingsError" class="error">
                    {{ listingsError }}
                </p>

                <div
                    v-if="listings.length > 0"
                    class="listing-grid"
                >
                    <CustomerListingCard
                        v-for="listing in listings"
                        :key="listing._id"
                        :listing="listing"
                    />
                </div>

                <p
                    v-else-if="!listingsLoading && !listingsError"
                    class="empty-message"
                >
                    No available listings in this area.
                </p>
            </div>

            <!-- Right: Google Maps -->
            <div class="map-container">
                <div ref="mapElement" class="map"></div>
            </div>

        </div>
    </div>
</template>

<style scoped>
.explore-page {
    height: calc(100dvh - 70px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.explore-page h1 {
    margin: 20px 30px;
}

.main-container {
    display: flex;
    flex: 1;
    min-height: 0;
    width: 100%;
    gap: 30px;
    overflow: hidden;
}

/* Listings */

.listings-container {
    flex: 1;
    min-width: 0;
    min-height: 0;
    margin-left: 30px;
    overflow-y: auto;
}

.listings-container h2 {
    margin-bottom: 20px;
}

.listing-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
}

.loading-message {
    color: #666;
    margin-bottom: 12px;
}

.empty-message {
    padding: 30px 15px;
    text-align: center;
    color: #777;
}

.error {
    color: red;
    margin-bottom: 12px;
}

/* Google Maps */

.map-container {
    flex: 1;
    min-width: 0;
    min-height: 0;
    margin-right: 20px;
    border-radius: 15px;
    overflow: hidden;
}

.map {
    width: 100%;
    height: 750px;
}

/* Mobile */

@media (max-width: 768px) {
    .main-container {
        flex-direction: column;
        gap: 20px;
    }

    .listings-container {
        width: calc(100% - 40px);
        margin: 0 20px;
    }

    .listing-grid {
        grid-template-columns: 1fr;
    }

    .map-container {
        width: calc(100% - 40px);
        margin: 0 20px;
        position: static;
    }

    .map {
        height: 400px;
    }
}
</style>