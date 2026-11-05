<script setup>
// Card for one business: a coloured top with its name, then its details.
// Pages put their own buttons in the default slot.
defineProps({
  business: {
    type: Object,
    required: true
  },
  // Position in the list, used to rotate the top colour
  index: {
    type: Number,
    default: 0
  },
  showStatus: {
    type: Boolean,
    default: false
  }
})

const tones = ['', 'dark', 'khaki']

function firstWord(name) {
  return (name || '').trim().split(' ')[0]
}
</script>

<template>
  <article class="card rb-card w-100">
    <div class="rb-tile tile-top" :class="tones[index % tones.length]">
      <span v-if="showStatus" class="rb-status tile-status" :class="business.status.toLowerCase()">{{ business.status }}</span>
      <span class="rb-tile-word" aria-hidden="true">{{ firstWord(business.name) }}</span>
    </div>

    <div class="card-body d-flex flex-column gap-2 p-4">
      <h2 class="card-title">{{ business.name }}</h2>
      <p class="card-text">{{ business.description || 'No description available.' }}</p>
      <p class="rb-pickup mt-2">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"></path><circle cx="12" cy="9.5" r="2.5"></circle></svg>
        <span>{{ business.address }}<template v-if="business.postal_code"><br />Singapore {{ business.postal_code }}</template></span>
      </p>
    </div>

    <div class="card-footer d-flex flex-wrap gap-2 px-4 py-3">
      <slot></slot>
    </div>
  </article>
</template>

<style scoped>
.tile-top {
  height: 180px;
}

.tile-status {
  position: absolute;
  top: 16px;
  left: 16px;
  background-color: #fbf9f1;
}

.rb-tile-word {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}
</style>
