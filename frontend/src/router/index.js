
import { watch } from 'vue'
import { useAuth } from '@clerk/vue'
import { createRouter, createWebHistory } from 'vue-router'

import LandingView from '../views/LandingView.vue'
import AuthCompleteView from '../views/AuthCompleteView.vue'
import AllBusinessesView from '../views/business/AllBusinessesView.vue'
import BusinessProfileView from '../views/business/BusinessProfileView.vue'
import BusinessDashboardView from '../views/business/BusinessDashboardView.vue'
import BusinessOrdersView from '../views/business/BusinessOrdersView.vue'
import RegisterBusinessView from '../views/business/RegisterBusinessView.vue'
import ListingDetailView from '../views/listings/ListingDetailView.vue'
import BusinessListingsView from '../views/business/BusinessListingsView.vue'
import CreateListingView from '../views/business/CreateListingView.vue'
import EditListingView from '../views/business/EditListingView.vue'
import FavouritesView from '../views/consumer/FavouritesView.vue'
import MyOrdersView from '../views/consumer/MyOrdersView.vue'

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
    path: '/auth/complete',
    name: 'auth-complete',
    component: AuthCompleteView,
    meta: { requiresAuth: true }
  },
  {
    path: '/businesses',
    name: 'all-businesses',
    component: AllBusinessesView,
    meta: { requiresAuth: true }
  },
  {
    path: '/businesses/:businessId',
    name: 'business-profile',
    component: BusinessProfileView,
    props: true,
    meta: { requiresAuth: true }
  },
  {
    path: '/listings/:listingId',
    name: 'listing-detail',
    component: ListingDetailView,
    meta: { requiresAuth: true }
  },
  {
    path: '/favourites',
    name: 'favourites',
    component: FavouritesView,
    meta: { requiresAuth: true, requiredRole: 'CONSUMER' }
  },
  {
    path: '/my-orders',
    name: 'my-orders',
    component: MyOrdersView,
    meta: { requiresAuth: true, requiredRole: 'CONSUMER' }
  },
  {
    path: '/businesses/:businessId/edit',
    name: 'edit-business',
    component: () => import('../views/business/EditBusinessView.vue'),
    meta: { requiresAuth: true, requiredRole: 'BUSINESS' }
  },
  {
    path: '/business-dashboard',
    name: 'business-dashboard',
    component: BusinessDashboardView,
    meta: { requiresAuth: true, requiredRole: 'BUSINESS' }
  },
  {
    path: '/business-orders',
    name: 'business-orders',
    component: BusinessOrdersView,
    meta: { requiresAuth: true, requiredRole: 'BUSINESS' }
  },
  // Business Listing Routes
  {
    path: '/business-listings',
    name: 'business-listings',
    component: BusinessListingsView,
    meta: { requiresAuth: true, requiredRole: 'BUSINESS' }
  },
  {
    path: '/business-listings/create',
    name: 'business-listing-create',
    component: CreateListingView,
    meta: { requiresAuth: true, requiredRole: 'BUSINESS' }
  },
  {
    path: '/business-listings/:businessId/:listingId/edit',
    name: 'business-listing-edit',
    component: EditListingView,
    meta: { requiresAuth: true, requiredRole: 'BUSINESS' }
  },
  {
    path: '/register-business',
    name: 'Register Business',
    component: RegisterBusinessView,
    meta: { requiresAuth: true, requiredRole: 'BUSINESS'}
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
