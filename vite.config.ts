import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'apple-touch-icon.png',
          'icon.svg',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: '/',
          name: 'Radio Corrientes Viva – Central de Noticias IA',
          short_name: 'RCV Noticias',
          description:
            'Central automatizada de producción periodística, síntesis de voz IA y emisión para Radio Corrientes Viva.',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          categories: ['news', 'radio', 'productivity'],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          navigateFallback: null,
          runtimeCaching: [
            {
              urlPattern: /^\/api\/status/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-status-cache',
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 5, // 5 minutes
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio to prevent WebSocket closed errors
      hmr: false,
      watch: null,
      host: '0.0.0.0',
      allowedHosts: true as const,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
