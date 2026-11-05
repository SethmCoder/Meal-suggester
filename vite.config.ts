import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { recipeApiPlugin } from './server/recipeApiPlugin'
import { smsApiPlugin } from './server/smsApiPlugin'

export default defineConfig({
  plugins: [react(), tailwindcss(), recipeApiPlugin(), smsApiPlugin()],
  server: {
    port: 5173,
  },
})
