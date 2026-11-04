<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { API_URL } from '@/config'
import { useAuth } from '@clerk/vue'

const hasUnread = ref(false)
const notifications = ref([])
const showNotifications = ref(false)
const page = ref(1)
const hasMore = ref(false)
const loading = ref(false)
const { getToken } = useAuth()

async function getNotifications() {
  if (loading.value) return

  loading.value = true

  try {
    const token = await getToken.value()
    const response = await axios.get(API_URL + '/notifications', {
      headers: { Authorization: `Bearer ${token}` },
      params: { page: page.value }
    })

    const newNotifications = response.data.shownNotifications

    const existingIds = new Set(notifications.value.map(n => n._id))
    notifications.value.push(
      ...newNotifications.filter(n => !existingIds.has(n._id))
    )

    hasMore.value = response.data.hasMore
    return newNotifications
  } catch (error) {
    console.error(error.response?.data?.error || error.message)
    return null
  } finally {
    loading.value = false
  }
}

async function markNotificationsAsRead(newNotifications) {
  const notificationIds = newNotifications
    .filter(n => !n.is_read)
    .map(n => n._id)

  if (notificationIds.length === 0) return

  try {
    const token = await getToken.value()

    await axios.patch(
      API_URL + '/notifications/read',
      { notificationIds },
      { headers: { Authorization: `Bearer ${token}` } }
    )

    for (const notification of notifications.value) {
      if (notificationIds.includes(notification._id)) {
        notification.is_read = true
      }
    }

    await checkUnreadStatus()
  } catch (error) {
    console.error(error.response?.data?.error || error.message)
  }
}

async function checkUnreadStatus() {
  try {
    const token = await getToken.value()
    const response = await axios.get(API_URL + '/notifications/unread', {
      headers: { Authorization: `Bearer ${token}` }
    })

    hasUnread.value = response.data.hasUnread
  } catch (error) {
    console.error(error.response?.data?.error || error.message)
  }
}

async function toggleNotifications() {
  if (loading.value) return

  showNotifications.value = !showNotifications.value

  if (showNotifications.value) {
    page.value = 1
    notifications.value = []
    hasMore.value = false

    await checkUnreadStatus()
    const newNotifications = await getNotifications()

    if (newNotifications) {
      await markNotificationsAsRead(newNotifications)
    }
  }
}

async function loadMore() {
  if (loading.value || !hasMore.value) return

  page.value++

  const newNotifications = await getNotifications()

  if (newNotifications) {
    await markNotificationsAsRead(newNotifications)
  } else {
    page.value--
  }
}

async function clearAllNotifications() {
  try {
    const token = await getToken.value()

    await axios.delete(API_URL + '/notifications', {
      headers: { Authorization: `Bearer ${token}` }
    })

    notifications.value = []
    hasMore.value = false
    hasUnread.value = false
  } catch (error) {
    console.error(error.response?.data?.error || error.message)
  }
}

onMounted(checkUnreadStatus)
</script>

<template>
  <div class="notification-container">
    <button
      type="button"
      class="notification-button"
      :aria-label="hasUnread ? 'Notifications, unread' : 'Notifications'"
      @click="toggleNotifications"
    >
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path></svg>
        <span v-if="hasUnread" class="notification-dot rb-live"></span>
    </button>
    <div v-if="showNotifications" class="notification-popup">
      <h3 class="rb-label">Notifications</h3>
      <p v-if="notifications.length===0">
        No notifications
      </p>
      <div v-for="notif in notifications" :key="notif._id" class="notification-item">
        <p>{{ notif.message }}</p>
      </div>
      <button
        v-if="hasMore"
        type="button"
        class="rb-pill rb-pill-line rb-pill-sm"
        @click="loadMore" :disabled="loading"
      >
        Show More
      </button>
      <button
        v-if="notifications.length > 0"
        type="button"
        class="rb-pill rb-pill-text rb-pill-sm"
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
    width: 44px;
    height: 44px;
    border: 1px solid #ddd9c5;
    border-radius: 50%;
    color: #000;
    background: transparent;
    cursor: pointer;
}

.notification-dot {
    position: absolute;
    top: 8px;
    right: 9px;
    width: 10px;
    height: 10px;
    border: 2px solid #fbf9f1;
    border-radius: 50%;
    background-color: #f4b30c;
}

.notification-popup {
    position: absolute;
    top: 100%;
    margin-top: 8px;
    right: 0;
    z-index: 1000;
    width: 320px;
    padding: 20px 24px;
    border: 2px solid #000;
    color: #191200;
    background: #fbf9f1;
}

.notification-popup h3 {
    margin-bottom: 8px;
}

.notification-item {
    padding: 12px 0;
    border-bottom: 1px solid #ddd9c5;
}

.notification-item p {
    margin: 0;
    font-size: 15px;
    line-height: 22px;
}

.notification-popup button {
    margin-top: 12px;
    margin-right: 8px;
}
</style>
