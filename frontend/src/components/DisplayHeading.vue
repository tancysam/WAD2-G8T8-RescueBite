<script setup>
defineProps({
  size: {
    type: Number,
    default: 144
  },
  delay: {
    type: Number,
    default: 0
  }
})
</script>

<template>
  <h1 class="rb-display display-1 heading d-xl-none">
    <span class="rb-mask"><span :style="{ animationDelay: delay + 's' }"><slot></slot></span></span>
  </h1>
  <h1 class="rb-display heading d-none d-xl-block" :style="{ fontSize: size + 'px' }">
    <span class="rb-mask"><span :style="{ animationDelay: delay + 's' }"><slot></slot></span></span>
  </h1>
</template>

<style scoped>
.heading {
  margin-top: 4px;
  line-height: .9;
}
</style>
