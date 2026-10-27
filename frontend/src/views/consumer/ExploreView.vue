<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import axios from 'axios'
import CustomerListingCard from '@/components/listings/CustomerListingCard.vue'
import { useRouter } from 'vue-router'
import { API_URL } from '@/config'

const router = useRouter()

// Google Maps
const mapElement = ref(null)
const mapBounds = ref(null)

// Listings
const listings = ref([])
const listingsLoading = ref(false)
const listingsError = ref('')

// Search, type filter and sort for the listing grid
const searchText = ref('')
const typeFilter = ref('ALL')
const sortBy = ref('NEAREST')
const selectedListingId = ref('')

const typeFilters = [
    { value: 'ALL', label: 'All' },
    { value: 'BUNDLE', label: 'Bundles' },
    { value: 'ITEM', label: 'Items' }
]

function savingOf(listing) {
    const original = Number(listing.original_price_sgd)
    if (!(original > 0)) return 0
    return (original - Number(listing.rescue_price_sgd)) / original
}

// True when listing a should come before listing b
function comesBefore(a, b) {
    if (sortBy.value === 'ENDING') {
        return new Date(a.collection_end_at) < new Date(b.collection_end_at)
    }
    return savingOf(a) > savingOf(b)
}

const shownListings = computed(() => {
    const search = searchText.value.trim().toUpperCase()

    const matches = listings.value.filter((listing) => {
        if (typeFilter.value !== 'ALL' && listing.listing_type !== typeFilter.value) return false
        if (search === '') return true
        const text = (listing.title + ' ' + (listing.description || '')).toUpperCase()
        return text.includes(search)
    })

    // The API already returns the nearest listings first
    if (sortBy.value === 'NEAREST') return matches

    const sorted = []
    for (const listing of matches) {
        const position = sorted.findIndex((other) => comesBefore(listing, other))
        if (position === -1) {
            sorted.push(listing)
        } else {
            sorted.splice(position, 0, listing)
        }
    }
    return sorted
})

const countLabel = computed(() => {
    const count = shownListings.value.length
    return count + (count === 1 ? ' listing' : ' listings')
})

function businessNameFor(listing) {
    let businessId = listing.business_id
    if (businessId && businessId._id) businessId = businessId._id
    const business = businesses.value.find((item) => item._id === businessId)
    return business ? business.name : ''
}

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
let isOpeningInfoWindow = false

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
            // Whole of Singapore until the user's location is known
            zoom: 12,
            mapId: '13484fcc455d81ef9c7b2de5'
        })

        infoWindow = new InfoWindow()

        // display pins when map is ready
        updateBusinessMarkers()

        // Listen for completed map movements
        mapListener = map.addListener('idle', () => {

            if (isOpeningInfoWindow) {
                isOpeningInfoWindow = false
                return
            }
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

            isOpeningInfoWindow = true

            const content = document.createElement('div')
            const name = document.createElement('h3')
            const address = document.createElement('p')
            const button = document.createElement('button')

            name.textContent = business.name
            address.textContent = business.address
            button.textContent = 'See More'
            button.className = 'rb-pill rb-pill-dark rb-pill-sm'

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

    // Radius covers the longer side of the visible map, so listings near the
    // left and right edges of a wide map are included too
    const halfHeightKm = (north - south) * 111 / 2
    const halfWidthKm = (east - west) * 111 / 2
    const radiusKm = Math.min(50, Math.max(0.1, halfHeightKm, halfWidthKm))

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
    <div class="explore-page d-flex flex-column flex-grow-1">
        <!-- Search, filters and the panel toggle -->
        <section class="filter-bar d-flex flex-wrap align-items-center gap-3 px-3 px-lg-4 py-3">
            <label class="search-field">
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5f5330" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
                <span class="visually-hidden">Search listings</span>
                <input v-model="searchText" type="search" placeholder="Croissants, bento, kopi…" />
            </label>

            <button
                type="button"
                class="rb-pill rb-pill-dark rb-pill-sm order-1 order-lg-2 ms-lg-auto"
                data-bs-toggle="collapse"
                data-bs-target="#listings-panel"
                aria-controls="listings-panel"
                aria-expanded="true"
            >
                Listings <span class="ms-1">{{ shownListings.length }}</span>
            </button>

            <div class="filter-controls text-nowrap order-2 order-lg-1">
            <div class="d-flex gap-2" role="group" aria-label="Listing type">
                <button
                    v-for="filter in typeFilters"
                    :key="filter.value"
                    type="button"
                    class="rb-chip"
                    :class="{ active: typeFilter === filter.value }"
                    :aria-pressed="typeFilter === filter.value"
                    @click="typeFilter = filter.value"
                >{{ filter.label }}</button>
            </div>

            <label class="rb-label d-flex align-items-center gap-2">
                <span class="d-none d-sm-inline">Sort</span>
                <span class="visually-hidden">Sort listings</span>
                <select v-model="sortBy" class="rb-select">
                    <option value="NEAREST">Closest</option>
                    <option value="ENDING">Ending soon</option>
                    <option value="SAVING">Biggest saving</option>
                </select>
            </label>

            </div>
        </section>

        <!-- Map fills the rest of the screen; the listings slide over it from the right -->
        <section class="map-area" aria-label="Map of listings">
            <div ref="mapElement" class="map"></div>

            <div id="listings-panel" class="collapse collapse-horizontal show listings-collapse">
                <aside class="panel-inner" aria-labelledby="listings-heading">
                    <div class="panel-head d-flex align-items-center justify-content-between gap-3">
                        <div>
                            <h1 id="listings-heading" class="rb-display panel-title">Listings</h1>
                            <p class="rb-label mb-0">{{ countLabel }} in the map area</p>
                        </div>
                        <button
                            type="button"
                            class="rb-close"
                            data-bs-toggle="collapse"
                            data-bs-target="#listings-panel"
                            aria-controls="listings-panel"
                            aria-label="Hide listings"
                        >×</button>
                    </div>

                    <div class="panel-body">
                        <p v-if="listingsLoading" class="rb-label mb-3" aria-live="polite">
                            Updating listings…
                        </p>

                        <p v-if="listingsError" class="rb-note error mb-3" role="alert">
                            {{ listingsError }}
                        </p>

                        <div v-if="shownListings.length > 0" class="d-flex flex-column gap-3">
                            <CustomerListingCard
                                v-for="(listing, index) in shownListings"
                                :key="listing._id"
                                :listing="listing"
                                :index="index"
                                :business-name="businessNameFor(listing)"
                                :selected="selectedListingId === listing._id"
                                @select="selectedListingId = $event"
                            />
                        </div>

                        <div v-else-if="!listingsLoading && !listingsError" class="rb-empty">
                            <p class="rb-display display-6 mb-2">Nothing here yet</p>
                            <p class="mb-0">No available listings in this area. Try another filter or move the map.</p>
                        </div>
                    </div>
                </aside>
            </div>
        </section>
    </div>
</template>

<style scoped>
.explore-page {
    min-height: 0;
    overflow: hidden;
}

.filter-bar {
    border-bottom: 2px solid #000;
    background-color: #fbf9f1;
}

/* Chips, sort and the panel toggle stay on one row and scroll sideways on narrow screens */
.filter-controls {
    display: flex;
    flex: 0 1 auto;
    align-items: center;
    gap: 12px;
    min-width: 0;
    overflow-x: auto;
}

.search-field {
    display: flex;
    flex: 1 1 160px;
    align-items: center;
    gap: 12px;
    max-width: 480px;
    min-width: 0;
    height: 48px;
    padding: 0 20px;
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

/* The map takes all the space left under the filter bar */
.map-area {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background-color: #e8e6d7;
}

.map {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
}

/* Listings panel pinned to the right edge of the map */
.listings-collapse {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 2;
}

.panel-inner {
    display: flex;
    flex-direction: column;
    width: 340px;
    height: 100%;
    border-left: 2px solid #000;
    background-color: #fbf9f1;
}

.panel-head {
    padding: 16px 20px;
    border-bottom: 1px solid #ddd9c5;
}

.panel-title {
    margin: 0;
    font-size: 32px;
    line-height: 1;
}

.panel-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px 20px;
}
</style>
