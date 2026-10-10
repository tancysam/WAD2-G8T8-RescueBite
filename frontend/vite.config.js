import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', 'VITE_')

  return {
    plugins: [vue()],
    define: {
      'import.meta.env.VITE_GOOGLE_MAPS_API_KEY':
        JSON.stringify(env.VITE_GOOGLE_MAPS_API_KEY)
    }
  }
})