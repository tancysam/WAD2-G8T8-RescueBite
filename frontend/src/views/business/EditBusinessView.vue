<script setup>
import { useRoute } from 'vue-router'

const route = useRoute()
const businessId = route.params.businessId
</script>

<template>
  <main>
    <h1>Edit Business</h1>
    <p>Business ID: {{ businessId }}</p>
  </main>
</template>