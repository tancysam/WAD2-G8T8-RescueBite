
<script setup>
import { computed } from 'vue'
import { Show, UserButton } from '@clerk/vue'
import { useRoute } from 'vue-router'
import { RouterView, RouterLink } from 'vue-router'
import ProfileGate from './components/ProfileGate.vue'

const route = useRoute()
const isLanding = computed(() => route.meta.isLanding)
</script>

<template>
  <header v-if="!isLanding" class="navbar">
    <RouterLink to="/" class="logo">
      <span class="logo-mark" aria-hidden="true">✳</span>
      <span>RescueBite</span>
    </RouterLink>

    <nav>
      <RouterLink to="/businesses">
        Businesses
      </RouterLink>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </nav>
  </header>

  <ProfileGate v-if="route.meta.requiresAuth">
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
