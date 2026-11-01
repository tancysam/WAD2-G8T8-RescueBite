
<script setup>
import DisplayHeading from '../../components/DisplayHeading.vue'
import BusinessTile from '../../components/business/BusinessTile.vue'
import { ref, onMounted, computed, watch } from 'vue'
import axios from 'axios'
import { useUser, useAuth } from '@clerk/vue'
import { API_URL } from '@/config'

const { user, isLoaded } = useUser()
const { getToken } = useAuth()

const userRole = ref(null)
const isBusiness = computed(() => userRole.value === 'BUSINESS')

const myBusinesses = ref([])
const myBusinessLoading = ref(false)
const myBusinessError = ref('')


async function getUserRole() {
  if (!user.value) return

  try {
    const token = await getToken.value()

    const response = await axios.get(
      `${API_URL}/users/me`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    userRole.value = response.data.user.role

    console.log('Current User Role:', userRole.value)

    if (isBusiness.value) {
      await getMyBusiness()
    }

  } catch (error) {
    console.error('Error fetching user role:', error)
  }
}
async function getMyBusiness() {
  myBusinessLoading.value = true
  myBusinessError.value = ''

  try {
    const token = await getToken.value()

    const response = await axios.get(
      `${API_URL}/users/me/businesses`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    myBusinesses.value = response.data.businesses

    console.log('My Businesses:', myBusinesses.value)

  } catch (error) {
    console.error('Error fetching my business:', error)

    myBusinessError.value =
      (error.response && error.response.data && error.response.data.error) ||
      'Unable to retrieve your business.'
  } finally {
    myBusinessLoading.value = false
  }
}


onMounted(getMyBusiness)

watch(
  [user, isLoaded],
  () => {
    if (isLoaded.value && user.value) {
      getUserRole()
    } else {
      userRole.value = null
      myBusinesses.value = []
    }
  },
  { immediate: true }
)
</script>

<template>
  <main class="businesses-page">
    <template v-if="isBusiness">
      <section class="container-xxl px-4 pt-5">
        <div class="d-flex flex-wrap align-items-end justify-content-between gap-4">
          <div>
            <p class="rb-script rb-kicker fs-3">your shopfronts</p>
            <DisplayHeading :size="144">My businesses</DisplayHeading>
          </div>
          <RouterLink to="/register-business" class="rb-pill rb-pill-dark">+ Register business</RouterLink>
        </div>
      </section>

      <section class="container-xxl px-4 pt-5 pb-5">
        <p v-if="myBusinessLoading" class="rb-label">Loading your businesses…</p>

        <p v-else-if="myBusinessError" class="rb-note error" role="alert">
          {{ myBusinessError }}
        </p>

        <TransitionGroup tag="div" name="stag" appear v-else-if="myBusinesses.length > 0" class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-4">
          <div v-for="(business, index) in myBusinesses" :key="business._id" :style="{ '--i': index }" class="col d-flex">
            <BusinessTile :business="business" :index="index" show-status>
              <RouterLink
                :to="{ name: 'business-profile', params: { businessId: business._id } }"
                class="rb-pill rb-pill-dark rb-pill-sm"
              >
                Preview
              </RouterLink>
              <RouterLink
                :to="{ name: 'edit-business', params: { businessId: business._id } }"
                class="rb-pill rb-pill-line rb-pill-sm"
              >
                Edit
              </RouterLink>
            </BusinessTile>
          </div>
        </TransitionGroup>

        <div v-else class="rb-empty">
          <p class="rb-display display-6 mb-2">No businesses yet</p>
          <p class="mb-4">You do not have any businesses registered to your account yet.</p>
          <RouterLink to="/register-business" class="rb-pill rb-pill-dark">Register a business</RouterLink>
        </div>
      </section>
    </template>
  </main>
</template>

