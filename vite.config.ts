import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'СПИД — учёт топлива',
        short_name: 'СПИД',
        description: 'Учёт пробега и расхода топлива автопарка',
        lang: 'ru',
        start_url: './',
        display: 'standalone',
        background_color: '#f4f5f7',
        theme_color: '#1f4e8c',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png}']
      }
    })
  ],
  test: {
    environment: 'node'
  }
} as any);
