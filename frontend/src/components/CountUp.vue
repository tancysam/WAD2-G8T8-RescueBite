<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { prefersReducedMotion } from '../motion.js'

const props = defineProps({
  value: {
    type: Number,
    required: true
  },
  decimals: {
    type: Number,
    default: 0
  },
  prefix: {
    type: String,
    default: ''
  },
  suffix: {
    type: String,
    default: ''
  },
  duration: {
    type: Number,
    default: 1200
  }
})

const shown = ref(0)
const el = ref(null)
let frame = null
let observer = null

function format(number) {
  return props.prefix +
    number.toLocaleString('en-US', {
      minimumFractionDigits: props.decimals,
      maximumFractionDigits: props.decimals
    }) +
    props.suffix
}

function run(target) {
  const start = performance.now()
  function step(now) {
    const progress = Math.min(1, (now - start) / props.duration)
    const eased = 1 - Math.pow(1 - progress, 3)
    shown.value = target * eased
    if (progress < 1) frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
}

onMounted(() => {
  const target = Number(props.value) || 0
  if (prefersReducedMotion() || target === 0) {
    shown.value = target
    return
  }
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      observer.disconnect()
      run(target)
    }
  }, { threshold: 0.4 })
  observer.observe(el.value)
})

onUnmounted(() => {
  if (frame) cancelAnimationFrame(frame)
  if (observer) observer.disconnect()
})
</script>

<template>
  <span ref="el">{{ format(shown) }}</span>
</template>
