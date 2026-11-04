import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { recipeApiPlugin } from './server/recipeApiPlugin'

export default defineConfig({
  plugins: [react(), tailwindcss(), recipeApiPlugin()],
  server: {
    port: 5173,
  },
})
