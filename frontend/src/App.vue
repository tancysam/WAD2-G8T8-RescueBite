<script setup>
import { computed, ref, watch } from 'vue'
import { Show, UserButton } from '@clerk/vue'
import { useRoute } from 'vue-router'
import { RouterView, RouterLink } from 'vue-router'
import ProfileGate from './components/ProfileGate.vue'
import NotificationBell from './components/notifications/NotificationBell.vue'

const route = useRoute()
const isLanding = computed(() => route.meta.isLanding)
const isFullScreen = computed(() => route.name === 'explore')
const pageKey = computed(() => route.name === 'register' ? 'login' : route.name)
const profileRole = ref(null)
const menuOpen = ref(false)

watch(() => route.meta.requiresAuth, (requiresAuth) => {
  if (!requiresAuth) profileRole.value = null
})
</script>

<template>
  <div :class="isFullScreen ? 'd-flex flex-column vh-100' : ''">
    <span class="rb-progress" aria-hidden="true"></span>
    <header v-if="!isLanding" class="navbar-rb px-3 px-lg-4">
      <RouterLink to="/auth/complete" class="logo fs-2">RescueBite<span class="logo-dot rb-dot">.</span></RouterLink>

      <div class="account order-lg-3">
        <Show when="signed-in">
          <NotificationBell />
          <UserButton />
        </Show>
        <button
          type="button"
          class="menu-button d-lg-none"
          :aria-expanded="menuOpen"
          aria-controls="primary-nav"
          @click="menuOpen = !menuOpen"
        >{{ menuOpen ? 'Close' : 'Menu' }}</button>
      </div>

      <nav
        id="primary-nav"
        class="nav-links col-12 col-lg-auto order-lg-2"
        :class="menuOpen ? 'd-flex flex-column flex-lg-row' : 'd-none d-lg-flex'"
        aria-label="Primary"
        @click="menuOpen = false"
      >
        <RouterLink v-if="profileRole === 'CONSUMER'" to="/explore">
          Explore
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
        <RouterLink v-if="profileRole === 'BUSINESS'" to="/business-dashboard">
          Dashboard
        </RouterLink>
        <RouterLink v-if="profileRole === 'BUSINESS'" to="/business-listings">
          Manage listings
        </RouterLink>
        <RouterLink v-if="profileRole === 'BUSINESS'" to="/business-orders">
          My orders
        </RouterLink>
        <RouterLink v-if="profileRole === 'BUSINESS'" to="/myBusinesses">
          Businesses
        </RouterLink>
      </nav>
    </header>

    <ProfileGate v-if="route.meta.requiresAuth" @role-change="profileRole = $event">
      <RouterView v-slot="{ Component }">
        <Transition name="rise" mode="out-in" appear>
          <component :is="Component" :key="pageKey" />
        </Transition>
      </RouterView>
    </ProfileGate>
    <RouterView v-else v-slot="{ Component }">
      <Transition name="rise" mode="out-in" appear>
        <component :is="Component" :key="pageKey" />
      </Transition>
    </RouterView>
  </div>
</template>

<style scoped>
.navbar-rb {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px 32px;
  padding-top: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #ddd9c5;
  background-color: #fbf9f1;
}

.logo {
  color: #000;
  font-family: 'Anton', Impact, sans-serif;
  line-height: 1;
  letter-spacing: .01em;
  text-decoration: none;
  text-transform: uppercase;
}

.logo-dot {
  color: #f4b30c;
}

.nav-links {
  flex-wrap: wrap;
  gap: 8px 32px;
  font-family: 'Archivo', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.nav-links a {
  padding: 6px 0;
  border-bottom: 2px solid transparent;
  color: #191200;
  text-decoration: none;
  transition: border-color .25s;
}

.nav-links a:hover,
.nav-links a.router-link-active {
  border-bottom-color: #f4b30c;
}

.account {
  display: flex;
  align-items: center;
  gap: 10px;
}

.menu-button {
  min-height: 44px;
  padding: 0 14px;
  border: 2px solid #f4b30c;
  border-radius: 140px;
  color: #191200;
  background-color: transparent;
  font-family: 'Archivo', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: .06em;
  text-transform: uppercase;
}
</style>
