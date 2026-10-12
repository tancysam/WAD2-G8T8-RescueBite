
import { watch } from 'vue'
import { useAuth } from '@clerk/vue'
import { createRouter, createWebHistory } from 'vue-router'

import LandingView from '../views/LandingView.vue'
import AllBusinessesView from '../views/business/AllBusinessesView.vue'
import BusinessProfileView from '../views/business/BusinessProfileView.vue'

const routes = [
  {
    path: '/',
    name: 'landing',
    component: LandingView,
    meta: { isLanding: true },
    beforeEnter: (to) => to.query.mode === 'register'
      ? { name: 'register', hash: to.hash }
      : { name: 'login' }
  },
  {
    // Clerk uses nested paths for password and verification steps.
    path: '/login/:pathMatch(.*)*',
    name: 'login',
    component: LandingView,
    meta: { isLanding: true }
  },
  {
    // Clerk owns the verification steps under this path. Keep rendering the
    // same landing page for /register/verify-email-address and page reloads.
    path: '/register/:pathMatch(.*)*',
    name: 'register',
    component: LandingView,
    meta: { isLanding: true }
  },
  {
    path: '/businesses',
    name: 'all-businesses',
    component: AllBusinessesView,
    meta: { requiresAuth: true } // protect front end /businesses route 
  },
  {
    path: '/businesses/:businessId',
    name: 'business-profile',
    component: BusinessProfileView,
    props: true,
    meta: { requiresAuth: true } // protect front end /businesses route 
  },
  {
  path: '/businesses/:businessId/edit',
  name: 'edit-business',
  component: () => import('../views/business/EditBusinessView.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true

  const { isLoaded, isSignedIn } = useAuth()

  // Clerk may still be restoring a session after a direct visit or refresh.
  if (!isLoaded.value) {
    await new Promise((resolve) => {
      const stop = watch(isLoaded, (loaded) => {
        if (loaded) {
          stop()
          resolve()
        }
      })
    })
  }

  return isSignedIn.value ? true : { name: 'login' }
})

export default router
