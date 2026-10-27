<script setup>
import { computed, ref } from 'vue'
import { collectionWindow, formatPrice, savingsPercent } from '../../formatters.js'

const props = defineProps({
  listing: {
    type: Object,
    required: true
  },
  // Shown above the title when the parent knows the business
  businessName: {
    type: String,
    default: ''
  },
  // Position in the list, used to rotate the tile colours
  index: {
    type: Number,
    default: 0
  },
  selected: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['select'])

const imageFailed = ref(false)
const tileTones = ['', 'dark', 'khaki']

const photoUrl = computed(() => {
  if (imageFailed.value) return ''
  if (
    props.listing.images &&
    props.listing.images.length > 0 &&
    props.listing.images[0].url
  ) {
    return props.listing.images[0].url
  }
  return ''
})

const tileClass = computed(() => {
  if (photoUrl.value) return 'photo'
  return tileTones[props.index % tileTones.length]
})

const tileStyle = computed(() => {
  if (!photoUrl.value) return {}
  return { backgroundImage: 'url("' + photoUrl.value + '")' }
})

// The first word of the title stands in for a photo
const tileWord = computed(() => {
  const words = (props.listing.title || '').trim().split(' ')
  return words[0]
})

const savings = computed(() => {
  const percent = savingsPercent(props.listing.original_price_sgd, props.listing.rescue_price_sgd)
  return percent === null ? '' : percent + '%'
})

const windowLabel = computed(() => {
  return collectionWindow(props.listing.collection_start_at, props.listing.collection_end_at)
})

// Hidden photo loader so a broken image URL falls back to the word tile
function onImageError() {
  imageFailed.value = true
}
</script>

<template>
  <article class="card rb-card" :class="{ selected: selected }" @mouseenter="emit('select', listing._id)">
    <div class="rb-tile card-tile" :class="tileClass" :style="tileStyle">
      <img v-if="photoUrl" :src="photoUrl" alt="" class="photo-probe" @error="onImageError" />
      <span class="rb-tag rb-tag-dark">
        {{ listing.listing_type === 'BUNDLE' ? 'Bundle' : 'Item' }}
      </span>
      <span class="rb-tag rb-tag-light">{{ listing.quantity_available }} left</span>
      <span v-if="!photoUrl" class="rb-tile-word" aria-hidden="true">{{ tileWord }}</span>
    </div>

    <div class="card-body d-flex flex-column gap-2 p-4">
      <p v-if="businessName" class="rb-label meta">{{ businessName }}</p>
      <h3 class="card-title">{{ listing.title }}</h3>
      <p class="card-text">{{ listing.description || 'No description provided.' }}</p>
      <p class="rb-pickup mt-2">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>
        <span><span class="visually-hidden">Pickup: </span>{{ windowLabel }}</span>
      </p>
    </div>

    <div class="card-footer d-flex align-items-end justify-content-between gap-3 px-4 py-3">
      <p class="prices">
        <strong>{{ formatPrice(listing.rescue_price_sgd) }}</strong>
        <del class="rb-mono">{{ formatPrice(listing.original_price_sgd) }}</del>
        <span v-if="savings" class="rb-mono saving">−{{ savings }}</span>
      </p>

      <RouterLink
        :to="{ name: 'listing-detail', params: { listingId: listing._id } }"
        class="rb-pill rb-pill-dark rb-pill-sm"
        :aria-label="'View details for ' + listing.title"
      >
        View
      </RouterLink>
    </div>
  </article>
</template>

<style scoped>
.card-tile {
  height: 220px;
}

.card-tile .rb-tile-word {
  font-size: 72px;
}

/* Only used to detect a broken photo URL */
.photo-probe {
  display: none;
}

.meta {
  font-size: 12px;
  line-height: 18px;
}

.prices {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
  margin: 0;
}

.prices strong {
  color: #000;
  font-family: 'Anton', Impact, sans-serif;
  font-size: 34px;
  font-weight: 400;
  line-height: 34px;
}

.prices del {
  color: #5f5330;
  font-size: 14px;
}

.saving {
  color: #8a6200;
  font-size: 13px;
}
</style>
