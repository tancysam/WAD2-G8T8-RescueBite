<script setup>
// Page headline in the display face. Below the xl breakpoint it uses
// Bootstrap's responsive display-1 size; from xl up it uses `size` pixels.
defineProps({
  size: {
    type: Number,
    default: 144
  }
})
</script>

<template>
  <h1 class="rb-display display-1 heading d-xl-none"><slot></slot></h1>
  <h1 class="rb-display heading d-none d-xl-block" :style="{ fontSize: size + 'px' }"><slot></slot></h1>
</template>

<style scoped>
.heading {
  margin-top: 4px;
  line-height: .9;
}
</style>
