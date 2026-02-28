// vite.config.js — Build & dev server configuration
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Allow Netlify deploy preview subdomains (scoped, not blanket allow-all)
    allowedHosts: ['.netlify.app'],
  },
})
