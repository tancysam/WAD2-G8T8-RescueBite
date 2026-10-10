
import { createRouter, createWebHistory } from 'vue-router'

import AllBusinessesView from '../views/business/AllBusinessesView.vue'
import BusinessProfileView from '../views/business/BusinessProfileView.vue'

const routes = [
  {
    path: '/',
    redirect: '/businesses'
  },
  {
    path: '/businesses',
    name: 'all-businesses',
    component: AllBusinessesView
  },
  {
    path: '/businesses/:businessId',
    name: 'business-profile',
    component: BusinessProfileView,
    props: true
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
