<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import axios from 'axios'
import CustomerListingCard from '@/components/listings/CustomerListingCard.vue'
import {useRouter} from 'vue-router'

const API_URL = 'http://localhost:8000/api'
const router = useRouter()

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
// for the map pins on the map
const businesses = ref([])
const businessMarkers = []
let AdvancedMarkerElement = null
let infoWindow = null

// Google Maps API
setOptions({
    key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY
})

// Initialise Google Maps
async function initMap() {
    try {
        const { Map, InfoWindow } = await importLibrary('maps')
        const markerLibrary = await importLibrary('marker')

        // for the map pin
        AdvancedMarkerElement = markerLibrary.AdvancedMarkerElement

        if (isDestroyed || !mapElement.value) return

        map = new Map(mapElement.value, {
            center: { lat: 1.3521, lng: 103.8198 },
            zoom: 15,
            mapId: '13484fcc455d81ef9c7b2de5'
        })

        infoWindow = new InfoWindow()

        // display pins when map is ready
        updateBusinessMarkers()

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

async function getBusinesses(){
    try {
        const response = await axios.get(`${API_URL}/businesses`)
        console.log('Full API response:', response.data)
        if (isDestroyed) return
        
            businesses.value = response.data.businesses || []
            console.log('Businesses retrieved:', businesses.value)
            updateBusinessMarkers()

    } catch (error) {
        console.error('Error fetching businesses:', error)
    }
}

// for removing map pins when they are no longer within map bounds
function clearBusinessMarkers() {
    if (infoWindow){infoWindow.close()}
    for (const marker of businessMarkers) {marker.map=null}
    businessMarkers.length=0
}

function updateBusinessMarkers() {
    if (!map || !AdvancedMarkerElement) return
    clearBusinessMarkers()
    if (!mapBounds.value) return

    const { north, south, east, west } = mapBounds.value

    for (const business of businesses.value) {
        //skip getting coordinates for businesses that dont have coords
        if (!business.location?.coordinates) continue
        const [lng, lat] = business.location.coordinates

        // checks if coordinate values are infinite
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue

        // Check whether business is within map boundaries
        const withinBounds = lat >= south && lat <= north &&
            (west <= east ? lng >= west && lng <= east : lng >= west || lng <= east)

        if (!withinBounds) continue

        // Check if business has available listings
        const hasListings =  listings.value.some((listing)=>{
            const businessId = listing.business_id?._id || listing.business_id
            return String(businessId) === String(business._id)})

        if (!hasListings) continue

        const marker = new AdvancedMarkerElement({
            map: map,
            position: { lat, lng },
            title: business.name,
            gmpClickable: true
        })

        marker.addListener('click', ()=>{
            const content = document.createElement('div')
            const name = document.createElement('h3')
            const address = document.createElement('p')
            const button = document.createElement('button')

            name.textContent = business.name
            address.textContent = business.address
            button.textContent = 'See More'
            button.className = 'btn btn-success'

            button.addEventListener('click', ()=>{router.push(`/businesses/${business._id}`)})

            content.append(name, address, button)

            infoWindow.setContent(content)
            infoWindow.open({ map, anchor: marker })
        })

        businessMarkers.push(marker)
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
    const radiusKm = Math.min(50,Math.max(0.1, (north - south) * 111 / 2))

    try {
        const response = await axios.get(`${API_URL}/listings`,{params: {lat, lng, radiusKm, limit:100}})

        if (isDestroyed || requestId !== latestRequest) return

        listings.value = response.data.listings || []

        console.log('Visible listings:', listings.value)

        updateBusinessMarkers()

    } catch (error) {
        if (isDestroyed || requestId !== latestRequest) return

        console.error('Error fetching listings:', error)

        listingsError.value = error.response?.data?.error || 'Unable to retrieve listings.'

        listings.value = []
        clearBusinessMarkers()

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
    getBusinesses()
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

    if (infoWindow) {
        infoWindow.close()
    }

    clearBusinessMarkers()

    map = null
    mapListener = null
    infoWindow = null
    AdvancedMarkerElement = null
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