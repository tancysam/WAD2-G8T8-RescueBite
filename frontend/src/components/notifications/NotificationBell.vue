<script setup>
import { ref, onMounted } from 'vue'
import {Bell} from '@lucide/vue'
import axios from 'axios'
import { useAuth } from '@clerk/vue'

const hasUnread = ref(false)
const notifications = ref([])
const showNotifications = ref(false);
const page = ref(1)
const hasMore = ref(false)
const { getToken } = useAuth()

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
    await axios.delete('http://localhost:8000/api/notifications',
      {headers: {Authorization: `Bearer ${token}`}})
    
    notifications.value = []
    hasMore.value = false
  } catch (error) {
    console.error(error.response?.data?.error || error.message)
  }
}

onMounted(async () => {
  await getNotifications()

  try {
    const token = await getToken.value()
    const response = await axios.get('http://localhost:8000/api/notifications/unread',
      {headers: {Authorization: `Bearer ${token}`}})
    hasUnread.value = response.data.hasUnread
  } catch (error) {
    console.error(error.response?.data?.error || error.message)
  }
})
</script>

<template>
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
</template>

<style scoped>
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