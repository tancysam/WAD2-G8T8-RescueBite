<script setup>
import { computed, ref } from 'vue'
import { collectionWindow } from '../../formatters.js'

const props = defineProps({
  listing: {
    type: Object,
    required: true
  },
  categoryName: {
    type: String,
    required: true
  },
  businessId: {
    type: String,
    required: true
  },
  // Position in the list, used to rotate the tile colours
  index: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['request-remove'])

// Listing Image
const imageFailed = ref(false)

const tileTones = ['', 'dark', 'khaki']

const windowLabel = computed(() => {
  return collectionWindow(props.listing.collection_start_at, props.listing.collection_end_at)
})

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
  return (props.listing.title || '').trim().split(' ')[0]
})

// Listing Information Formatting
function formatPrice(value) {
  const price = Number(value)
  if (!(price >= 0)) return 'S$0.00'
  return 'S$' + price.toFixed(2)
}

function statusLabel(status) {
  if (status === 'DRAFT') return 'Draft'
  if (status === 'ACTIVE') return 'Active'
  if (status === 'SOLD_OUT') return 'Sold out'
  if (status === 'EXPIRED') return 'Expired'
  return 'Removed'
}

function statusClass(status) {
  return status.toLowerCase()
}

function canEdit() {
  return props.listing.status !== 'EXPIRED' && props.listing.status !== 'REMOVED'
}

function canRemove() {
  return props.listing.status !== 'REMOVED'
}

// Remove Listing Event
function requestRemove() {
  emit('request-remove', props.listing)
}
</script>

<template>
  <article class="card rb-card w-100">
    <div class="rb-tile card-tile" :class="tileClass" :style="tileStyle">
      <img v-if="photoUrl" :src="photoUrl" alt="" class="photo-probe" @error="imageFailed = true" />
      <span class="rb-tag rb-tag-dark">{{ listing.listing_type === 'BUNDLE' ? 'Bundle' : 'Item' }}</span>
      <span class="rb-tag rb-tag-light">{{ listing.quantity_available }} left</span>
      <span v-if="!photoUrl" class="rb-tile-word" aria-hidden="true">{{ tileWord }}</span>
    </div>

    <div class="card-body d-flex flex-column gap-2 p-4">
      <div class="d-flex justify-content-between align-items-start gap-3">
        <div>
          <p class="rb-label meta">{{ categoryName }}</p>
          <h2 class="card-title mt-1">{{ listing.title }}</h2>
        </div>
        <span class="rb-status" :class="statusClass(listing.status)">
          {{ statusLabel(listing.status) }}
        </span>
      </div>

      <p class="card-text">{{ listing.description || 'No description provided.' }}</p>

      <ul
        v-if="listing.listing_type === 'BUNDLE' && listing.bundle_contents.length > 0"
        class="list-group list-group-flush bundle-list"
      >
        <li
          v-for="item in listing.bundle_contents"
          :key="item.name + '-' + item.quantity"
          class="list-group-item d-flex justify-content-between px-0"
        >
          <span>{{ item.name }}</span>
          <span class="rb-mono">× {{ item.quantity }}</span>
        </li>
      </ul>

      <p class="rb-pickup mt-2">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>
        <span><span class="visually-hidden">Pickup: </span>{{ windowLabel }}</span>
      </p>
    </div>

    <div class="card-footer d-flex flex-wrap align-items-center justify-content-between gap-3 px-4 py-3">
      <p class="prices">
        <strong>{{ formatPrice(listing.rescue_price_sgd) }}</strong>
        <del class="rb-mono">{{ formatPrice(listing.original_price_sgd) }}</del>
      </p>
      <div class="d-flex flex-wrap gap-2">
        <RouterLink
          v-if="canEdit()"
          :to="{
            name: 'business-listing-edit',
            params: { businessId: businessId, listingId: listing._id }
          }"
          class="rb-pill rb-pill-dark rb-pill-sm"
        >
          Edit
        </RouterLink>
        <button
          v-if="canRemove()"
          type="button"
          class="rb-pill rb-pill-text rb-pill-sm"
          @click="requestRemove"
        >
          Remove
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.card-tile {
  height: 200px;
}

.photo-probe {
  display: none;
}

.meta {
  font-size: 12px;
  line-height: 18px;
}

.bundle-list .list-group-item {
  border-color: #ddd9c5;
  color: #191200;
  background-color: transparent;
  font-size: 15px;
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
  font-size: 28px;
  font-weight: 400;
  line-height: 1;
}

.prices del {
  color: #5f5330;
  font-size: 14px;
}
</style>
