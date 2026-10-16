<script setup>
    import {ref, onMounted} from 'vue'
    import {setOptions, importLibrary} from '@googlemaps/js-api-loader'

    // ref for html div containing the map
    const mapElement = ref(null)

    //load gmaps
    setOptions({ key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY })

    async function initMap() {
        const {Map} = await importLibrary('maps')

        const map = new Map(mapElement.value, {center: {lat: 1.3521, lng: 103.8198}, zoom: 14})

        // trying to get the user's position
        if (navigator.geolocation){
            navigator.geolocation.getCurrentPosition((position) =>{
                const userLocation = {lat: position.coords.latitude, lng: position.coords.longitude}
                map.setCenter(userLocation)
                map.setZoom(14)
            }, (error) => {
                console.log("Unable to get location:", error.message)
            }, {enableHighAccuracy: true, timeout: 10000})
        }
    }

    onMounted(()=>{initMap()})
</script>

<template>
    <div>
        <h1>Find Your Next Meal</h1>

        <div>
            <div ref="mapElement" class="map"></div>
        </div>
    </div>
</template>

<style scoped>
    .map {
        width: 100%;
        height: 500px;
    }
</style>