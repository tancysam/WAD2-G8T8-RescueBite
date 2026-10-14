<script setup>
import { computed, ref } from 'vue'
import placeholderImage from '../../assets/placeholder.jpg'

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
  }
})

const emit = defineEmits(['request-remove'])

// Listing Image
const imageFailed = ref(false)

const primaryImage = computed(() => {
  if (imageFailed.value) return placeholderImage
  if (
    props.listing.images &&
    props.listing.images.length > 0 &&
    props.listing.images[0].url
  ) {
    return props.listing.images[0].url
  }
  return placeholderImage
})

const imageAlt = computed(() => {
  if (props.listing.images && props.listing.images.length > 0) {
    return props.listing.title
  }
  return ''
})

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

// Listing Information Formatting
function pad(number) {
  return number.toString().padStart(2, '0')
}

function formatDate(value) {
  const date = new Date(value)
  return date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear()
}

function formatTime(value) {
  const date = new Date(value)
  return pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function formatPrice(value) {
  const price = Number(value)
  if (isNaN(price)) return 'S$0.00'
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
  if (status === 'ACTIVE') return 'text-bg-success'
  if (status === 'DRAFT') return 'text-bg-warning'
  if (status === 'SOLD_OUT') return 'text-bg-primary'
  return 'text-bg-secondary'
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
  <article class="card h-100 listing-card">
    <!-- Listing Image -->
    <div class="listing-image-wrapper">
      <img
        :src="primaryImage"
        :alt="imageAlt"
        class="listing-image"
        @error="imageFailed = true"
      />
    </div>

    <!-- Listing Information -->
    <div class="card-body d-flex flex-column">
      <div class="d-flex justify-content-between align-items-start gap-3 mb-3">
        <div>
          <p class="text-muted small mb-1">
            {{ categoryName }} - {{ listing.listing_type === 'BUNDLE' ? 'Bundle' : 'Item' }}
          </p>
          <h2 class="h5 mb-0">{{ listing.title }}</h2>
        </div>
        <span class="badge" :class="statusClass(listing.status)">
          {{ statusLabel(listing.status) }}
        </span>
      </div>

      <p class="text-muted mb-3">
        {{ listing.description || 'No description provided.' }}
      </p>

      <ul
        v-if="listing.listing_type === 'BUNDLE' && listing.bundle_contents.length > 0"
        class="list-group list-group-flush mb-3"
      >
        <li
          v-for="item in listing.bundle_contents"
          :key="item.name + '-' + item.quantity"
          class="list-group-item px-0 py-1 d-flex justify-content-between"
        >
          <span>{{ item.name }}</span>
          <span>x {{ item.quantity }}</span>
        </li>
      </ul>

      <div class="row g-2 small mb-3">
        <div class="col-6">
          <span class="text-muted d-block">Rescue price</span>
          <strong>{{ formatPrice(listing.rescue_price_sgd) }}</strong>
        </div>
        <div class="col-6">
          <span class="text-muted d-block">Original price</span>
          <span>{{ formatPrice(listing.original_price_sgd) }}</span>
        </div>
        <div class="col-6">
          <span class="text-muted d-block">Quantity</span>
          <span>{{ listing.quantity_available }}</span>
        </div>
        <div class="col-6">
          <span class="text-muted d-block">Collection date</span>
          <span>{{ formatDate(listing.collection_start_at) }}</span>
        </div>
      </div>

      <p class="small mb-3">
        <strong>Collection:</strong>
        {{ formatTime(listing.collection_start_at) }} -
        {{ formatTime(listing.collection_end_at) }}
      </p>

      <!-- Listing Actions -->
      <div class="d-flex gap-2 mt-auto">
        <RouterLink
          v-if="canEdit()"
          :to="{
            name: 'business-listing-edit',
            params: { businessId: businessId, listingId: listing._id }
          }"
          class="btn btn-outline-success"
        >
          Edit
        </RouterLink>
        <button
          v-if="canRemove()"
          type="button"
          class="btn btn-outline-danger"
          @click="requestRemove"
        >
          Remove
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
/* Business Listing Card */
.listing-card {
  border: 1px solid #d9e6dc;
  border-left: 5px solid #256b45;
  border-radius: 12px;
  background-color: white;
}

.listing-card h2 {
  color: #164936;
}

/* Listing Image */
.listing-image-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  border-radius: 12px 12px 0 0;
  background-color: #eef2ec;
}

.listing-image {
  max-width: 100%;
  max-height: 100%;
}
</style>
