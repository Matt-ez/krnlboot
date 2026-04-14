import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/register': 'http://localhost:3001',
      '/login':    'http://localhost:3001',
      '/teams':    'http://localhost:3001',
      '/matches':  'http://localhost:3001',
      '/predictions': 'http://localhost:3001',
      '/dashboard': 'http://localhost:3001',
    }
  }
})
