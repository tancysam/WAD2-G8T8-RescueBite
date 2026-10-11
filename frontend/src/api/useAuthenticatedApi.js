import axios from 'axios'
import { useAuth } from '@clerk/vue'

const API_BASE_URL = 'http://localhost:8000/api'

// Call this from a Vue setup function so useAuth can access the Clerk plugin.
export function useAuthenticatedApi() {
  const { getToken } = useAuth()
  const api = axios.create({ baseURL: API_BASE_URL })

  api.interceptors.request.use(async (config) => {
    const token = await getToken()

    if (!token) {
      throw new Error('Sign in before making a protected API request')
    }

    config.headers.set('Authorization', `Bearer ${token}`)
    return config
  })

  return api
}
