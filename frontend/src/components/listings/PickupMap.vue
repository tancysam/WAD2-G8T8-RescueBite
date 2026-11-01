<script setup>
import { onMounted, ref } from 'vue'
import { importLibrary } from '@googlemaps/js-api-loader'

const props = defineProps({
  coordinates: { type: Array, required: true },
  name: { type: String, required: true }
})

const mapElement = ref(null)
const errorMessage = ref('')

onMounted(async function () {
  try {
    const position = { lat: props.coordinates[1], lng: props.coordinates[0] }
    const { Map } = await importLibrary('maps')
    const { AdvancedMarkerElement } = await importLibrary('marker')
    const map = new Map(mapElement.value, {
      center: position,
      zoom: 16,
      mapId: 'DEMO_MAP_ID'
    })
    new AdvancedMarkerElement({ map, position, title: props.name })
  } catch (error) {
    errorMessage.value = 'Unable to load the map.'
  }
})
</script>

<template>
  <div ref="mapElement" class="pickup-map" :aria-label="'Map of ' + name"></div>
  <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
</template>

<style scoped>
.pickup-map {
  width: 100%;
  height: 260px;
  margin: 16px 0;
  border-radius: 28px;
}
</style>
