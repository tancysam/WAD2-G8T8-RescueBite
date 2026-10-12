import { createApp } from 'vue'
import { clerkPlugin } from '@clerk/vue'
import './style.css'
import App from './App.vue'
import router from './router'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!publishableKey) {
  throw new Error('VITE_CLERK_PUBLISHABLE_KEY is required to start the frontend')
}

createApp(App)
  .use(clerkPlugin, {
    publishableKey,
    afterSignOutUrl: '/login',
    signInUrl: '/login',
    signUpUrl: '/register'
  })
  .use(router)
  .mount('#app')
