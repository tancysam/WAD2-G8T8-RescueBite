<script setup>
import { computed, ref } from 'vue'
import placeholderImage from '../../assets/placeholder.jpg'

const props = defineProps({
  listing: {
    type: Object,
    required: true
  }
})

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

function formatPrice(value) {
  const price = Number(value)
  if (isNaN(price)) return '$0.00'
  return '$' + price.toFixed(2)
}

function formatDate(value) {
  const date = new Date(value)
  if (isNaN(date)) return 'Collection time unavailable'

  return date.toLocaleDateString('en-GB') + ' ' + date.toLocaleTimeString('en-US')
}

const collectionWindow = computed(() => {
  return formatDate(props.listing.collection_start_at) +
    ' - ' +
    formatDate(props.listing.collection_end_at)
})
</script>

<template>
  <article class="listing-card">
    <div class="image-wrapper">
      <img
        :src="primaryImage"
        :alt="imageAlt"
        class="listing-image"
        @error="imageFailed = true"
      />
      <span class="type-badge">
        {{ listing.listing_type === 'BUNDLE' ? 'Bundle' : 'Item' }}
      </span>
    </div>

    <div class="listing-content">
      <div class="title-row">
        <h3>{{ listing.title }}</h3>
        <span class="stock">{{ listing.quantity_available }} left</span>
      </div>

      <p class="description">
        {{ listing.description || 'No description provided.' }}
      </p>

      <p class="collection-time">
        <span aria-hidden="true">◷</span>
        {{ collectionWindow }}
      </p>

      <div class="card-footer">
        <p class="prices">
          <strong>{{ formatPrice(listing.rescue_price_sgd) }}</strong>
          <del>{{ formatPrice(listing.original_price_sgd) }}</del>
        </p>

        <RouterLink
          :to="{ name: 'listing-detail', params: { listingId: listing._id } }"
          class="view-button"
        >
          View details
        </RouterLink>
      </div>
    </div>
  </article>
</template>

<style scoped>
/* Listing Card */
.listing-card {
  display: flex;
  flex-direction: column;
  border: 1px solid #dfe6df;
  border-radius: 14px;
  background-color: white;
}

/* Listing Image */
.image-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  height: 200px;
  border-radius: 14px 14px 0 0;
  background-color: #eef2ec;
}

.listing-image {
  max-width: 100%;
  max-height: 100%;
  background-color: #f4f4f1;
}

.type-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 5px 9px;
  border-radius: 999px;
  color: #1d573b;
  background-color: rgba(255, 255, 255, 0.92);
  font-size: 11px;
  font-weight: 700;
}

/* Listing Information */
.listing-content {
  display: flex;
  flex-direction: column;
  padding: 18px;
}

.title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

h3 {
  margin: 0;
  color: #1c4f36;
  font-size: 20px;
  line-height: 1.25;
}

.stock {
  padding: 4px 7px;
  border-radius: 6px;
  color: #4d6657;
  background-color: #edf3ea;
  font-size: 11px;
  font-weight: 700;
}

.description {
  margin: 10px 0 16px;
  color: #637269;
  font-size: 14px;
  line-height: 1.5;
}

.collection-time {
  display: flex;
  gap: 7px;
  margin-top: auto;
  margin-bottom: 16px;
  color: #4c6756;
  font-size: 13px;
  line-height: 1.45;
}

/* Pricing and Details Link */
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 15px;
  border-top: 1px solid #e9ede8;
}

.prices {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
}

.prices strong {
  color: #256b45;
  font-size: 20px;
}

.prices del {
  color: #8b978f;
  font-size: 12px;
}

.view-button {
  padding: 9px 12px;
  border-radius: 8px;
  color: white;
  background-color: #256b45;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
}

.view-button:hover {
  background-color: #1b5034;
}
</style>
