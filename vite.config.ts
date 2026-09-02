import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['wappen-dornbirn.svg', 'icon-192.svg', 'icon-512.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Bekleidungsverwaltung Stadtpolizei Dornbirn',
        short_name: 'Bekleidung',
        lang: 'de',
        description: 'Interne Verwaltung von Dienstbekleidung',
        theme_color: '#1e3a8a',
        background_color: '#1e3a8a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
})
