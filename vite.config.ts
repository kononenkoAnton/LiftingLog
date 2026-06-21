import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      // The hand-written public/manifest.webmanifest + icons stay the source of
      // truth — the plugin only adds the service worker + its registration.
      manifest: false,
      // New deploys take over automatically (no "reload to update" prompt).
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        // Precache the built app shell so it loads offline. Supabase API calls
        // are cross-origin and pass straight through to the network (no stale
        // auth/data cached). Large install-only assets aside, this stays lean.
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,wav,mp3}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: { globals: true, environment: 'node' },
})
