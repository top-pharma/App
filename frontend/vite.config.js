/**
 * @file vite.config.js
 * @description إعدادات Vite + React + PWA + Proxy للـ Backend
 *
 * ✅ الخيار A (2026-11-09):
 * - تبسيط manifest.icons: استخدام /logo.png فقط (بدل 8 ملفات icons/*.png)
 * - تبسيط includeAssets: لا icons/*.png
 * - devOptions.enabled: false (مؤقتاً — لمسح Service Worker cache)
 *
 * لماذا هذا الملف:
 * - يحدد إعدادات التطوير والبناء.
 * - يفعّل PWA (Service Worker + Manifest).
 * - يوجّه طلبات /api إلى Backend في التطوير.
 * - يحسّن البناء (code splitting).
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// ⚠️ Vite يعمل في بيئة Node.js — لا يمكن استخدام import.meta.url مباشرة
// لهذا نستخدم process.cwd() لحساب المسار الجذري.
const rootDir = process.cwd();

export default defineConfig({
  // ═══════════════════════════════════════════════
  // 1. Plugins
  // ═══════════════════════════════════════════════
  plugins: [
    // ✅ React (Fast Refresh + JSX)
    react(),

    // ✅ PWA: Service Worker + Manifest + Offline
    VitePWA({
      // ✅ يُحدَّث تلقائياً عند توفر نسخة جديدة
      registerType: 'autoUpdate',

      // ⚠️ مؤقتاً — لمسح Service Worker cache (مشكلة الأيقونات)
      // بعد اختبار الأيقونات — أعدها إلى true (أو اتركها false — لن تؤثر على الإنتاج)
      devOptions: {
        enabled: false,
      },

      // ✅ تبسيط: logo.png فقط (يُستخدم لكل الأحجام)
      includeAssets: [
        'favicon.ico',
        'robots.txt',
        'logo.png',
      ],

      // ✅ إعدادات Manifest
      manifest: {
        name: 'نظام إدارة شركة الأدوية',
        short_name: 'Pharma System',
        description: 'نظام إدارة شركة أدوية سودانية — مخزون، مبيعات، موردين',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#1E40AF',
        categories: ['business', 'productivity'],
        // ✅ تبسيط: logo.png فقط (بدل 8 ملفات icons/*.png)
        icons: [
          {
            src: '/logo.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/logo.png',
            sizes: 'any',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      // ✅ Workbox: استراتيجيات الـ caching
      workbox: {
        // ✅ أنواع الملفات التي تُخزَّن مسبقاً
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],

        // ✅ حد أقصى لحجم الملف (2 MB)
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,

        // ✅ لا تتدخل في طلبات /api (تُدار عبر axios)
        navigateFallbackDenylist: [/^\/api/],

        // ✅ استراتيجيات runtime
        runtimeCaching: [
          {
            // ✅ صور: Cache First
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 يوماً
              },
            },
          },
          {
            // ✅ خطوط: Cache First
            urlPattern: /\.(?:woff|woff2|ttf|otf|eot)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 365 * 24 * 60 * 60, // سنة
              },
            },
          },
          {
            // ✅ API: Network First (مع fallback للـ cache)
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 24 * 60 * 60, // يوم
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],

  // ═══════════════════════════════════════════════
  // 2. Resolve (Aliases)
  // ═══════════════════════════════════════════════
  resolve: {
    alias: {
      // ✅ @/ → src/
      '@': path.resolve(rootDir, 'src'),
      '@api': path.resolve(rootDir, 'src/api'),
      '@context': path.resolve(rootDir, 'src/context'),
      '@hooks': path.resolve(rootDir, 'src/hooks'),
      '@utils': path.resolve(rootDir, 'src/utils'),
      '@routes': path.resolve(rootDir, 'src/routes'),
      '@components': path.resolve(rootDir, 'src/components'),
      '@pages': path.resolve(rootDir, 'src/pages'),
    },
  },

  // ═══════════════════════════════════════════════
  // 3. Server (Development)
  // ═══════════════════════════════════════════════
  server: {
    port: 5173,
    host: true,
    strictPort: false,
    open: false,

    // ✅ Proxy: يوجّه /api إلى Backend
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        // ⚠️ لا نعيد كتابة المسار — Backend يستخدم /api
      },
    },
  },

  // ═══════════════════════════════════════════════
  // 4. Preview (بعد البناء)
  // ═══════════════════════════════════════════════
  preview: {
    port: 4173,
    host: true,
    strictPort: false,
  },

  // ═══════════════════════════════════════════════
  // 5. Build
  // ═══════════════════════════════════════════════
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    target: 'es2020',
    chunkSizeWarningLimit: 1000,

    // ✅ تقسيم الحزم (code splitting)
    rollupOptions: {
      output: {
        manualChunks: {
          // ✅ React
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // ✅ الرسوم البيانية
          'charts-vendor': ['recharts'],
          // ✅ النماذج
          'forms-vendor': ['react-hook-form', 'zod'],
          // ✅ Axios + date-fns
          'utils-vendor': ['axios', 'date-fns'],
          // ✅ الأيقونات
          'icons-vendor': ['lucide-react'],
        },
      },
    },
  },

  // ═══════════════════════════════════════════════
  // 6. Optimize
  // ═══════════════════════════════════════════════
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'axios',
      'zod',
      'react-hook-form',
    ],
  },
});