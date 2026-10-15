
<script setup>
import { computed, ref, watch } from 'vue'
import { Show, UserButton } from '@clerk/vue'
import { useRoute } from 'vue-router'
import { RouterView, RouterLink } from 'vue-router'
import ProfileGate from './components/ProfileGate.vue'

const route = useRoute()
const isLanding = computed(() => route.meta.isLanding)
const profileRole = ref(null)

watch(() => route.meta.requiresAuth, (requiresAuth) => {
  if (!requiresAuth) profileRole.value = null
})
</script>

<template>
  <header v-if="!isLanding" class="navbar">
    <RouterLink to="/auth/complete" class="logo">
      <span class="logo-mark" aria-hidden="true">✳</span>
      <span>RescueBite</span>
    </RouterLink>

    <nav>
      <RouterLink to="/auth/complete">
        Home
      </RouterLink>
      <RouterLink v-if="profileRole === 'CONSUMER'" to="/businesses">
        Businesses
      </RouterLink>
      <RouterLink v-if="profileRole === 'CONSUMER'" to="/favourites">
        Favourites
      </RouterLink>
      <RouterLink v-if="profileRole === 'CONSUMER'" to="/my-orders">
        My orders
      </RouterLink>
      <!-- Business Listing Navigation -->
      <RouterLink v-if="profileRole === 'BUSINESS'" to="/business-listings">
        Manage listings
      </RouterLink>
      <RouterLink v-if="profileRole === 'BUSINESS'" to="/business-orders">
        My orders
      </RouterLink>
      <RouterLink v-if="profileRole === 'BUSINESS'" to="/businesses">
        Businesses
      </RouterLink>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </nav>
  </header>

  <ProfileGate v-if="route.meta.requiresAuth" @role-change="profileRole = $event">
    <RouterView />
  </ProfileGate>
  <RouterView v-else />
</template>

<style scoped>
.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px clamp(20px, 5vw, 76px);
  background-color: #164936;
}

.logo {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: 22px;
  font-weight: 700;
  color: white;
  text-decoration: none;
}

.logo-mark {
  display: grid;
  place-items: center;
  width: 31px;
  height: 31px;
  border-radius: 10px;
  color: #164936;
  background: #cbe879;
  font-size: 25px;
  line-height: 1;
}

nav {
  display: flex;
  align-items: center;
  gap: 22px;
}

nav a {
  color: white;
  text-decoration: none;
}

nav a:hover {
  text-decoration: underline;
}
</style>
