import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages project site: served from /<repo-name>/, not the domain root.
  base: '/Surtsey_Neural_CA_webdemo/',
  plugins: [react()],
})
