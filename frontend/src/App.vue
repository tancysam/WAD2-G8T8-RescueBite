
<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { Show, UserButton } from '@clerk/vue'
import { useRoute } from 'vue-router'
import { RouterView, RouterLink } from 'vue-router'
import ProfileGate from './components/ProfileGate.vue'
import {Bell} from '@lucide/vue'
import axios from 'axios'
import { useAuth } from '@clerk/vue'

const route = useRoute()
const isLanding = computed(() => route.meta.isLanding)
const profileRole = ref(null)
const hasUnread = ref(false)
const notifications = ref([])
const showNotifications = ref(false);
const page = ref(1)
const hasMore = ref(false)
const { getToken } = useAuth()

watch(() => route.meta.requiresAuth, (requiresAuth) => {
  if (!requiresAuth) profileRole.value = null
})

async function getNotifications() {
  try {
    const token = await getToken.value()
    const response = await axios.get('http://localhost:8000/api/notifications', 
      {headers:{Authorization: `Bearer ${token}`}, params: {page: page.value}})
    notifications.value.push(...response.data.notifications)
    hasMore.value = response.data.hasMore
  } catch (error) {
    console.error(error.response?.data?.error || error.message)
  }
}

async function markNotificationsAsRead() {
  try {
    const token = await getToken.value()
    const notificationIds = notifications.value.slice(-5).map(notif => notif._id)
    if (notificationIds.length===0) return
    await axios.patch('http://localhost:8000/api/notifications/read',
      {notificationIds}, {headers: {Authorization: `Bearer ${token}`}})
  } catch (error) {
    console.error(error.response?.data?.error || error.message)
  }
}

async function toggleNotifications() {
  showNotifications.value = !showNotifications.value
  if (showNotifications.value) {
    page.value = 1
    notifications.value=[]

    await getNotifications()
    await markNotificationsAsRead()
  }
}

async function clearAllNotifications() {
  try {
    const token = await getToken.value()
    await axios.delete('http://localhost:8000/api/notifications/read',
      {headers: {Authorization: `Bearer ${token}`}})
    
    notifications.value = []
    hasMore.value = false
  } catch (error) {
    console.error(error.response?.data?.error || error.message)
  }
}

onMounted(getNotifications)
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
      <!-- Business Listing Navigation -->
      <RouterLink v-if="profileRole === 'BUSINESS'" to="/business-listings">
        Manage listings
      </RouterLink>
      <RouterLink v-if="profileRole === 'BUSINESS'" to="/business-orders">
        My orders
      </RouterLink>
      <RouterLink v-if="profileRole === 'BUSINESS'" to="/myBusinesses">
        Businesses
      </RouterLink>
      <div class="notification-container">
        <button 
          class="notification-button"
          @click="toggleNotifications"
        >
            <Bell :size="24" color="white" fill="white"/>
            <span v-if="hasUnread" class="notification-dot"></span>
        </button>
        <div v-if="showNotifications" class="notification-popup">
          <h3>Notifications</h3>
          <p v-if="notifications.length===0">
            No notifications
          </p>
          <div v-for="notif in notifications" :key="notif._id" class="notification-item">
            <p>{{ notif.message }}</p>
          </div>
          <button
            v-if="hasMore"
            @click="page++; getNotifications().then(markNotificationsAsRead)"
          >
            Show More
          </button>
          <button
            v-if="notifications.length > 0"
            @click="clearAllNotifications"
          >
            Clear All
          </button>
        </div>
      </div>


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

.notification-container {
    position: relative;
}

.notification-button {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    background: none;
    border: none;
    cursor: pointer;
}

.notification-dot {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 9px;
    height: 9px;
    background-color: red;
    border-radius: 50%;
}

.notification-popup {
    position: absolute;
    top: 100%;
    right: 0;
    width: 300px;
    padding: 15px;
    background: white;
    color: black;
    border: 1px solid #ddd;
    border-radius: 10px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
}

.notification-item {
    padding: 10px 0;
    border-bottom: 1px solid #eee;
}

.notification-popup button {
  cursor: pointer;
}
</style>
