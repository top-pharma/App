/**
 * @file tailwind.config.js
 * @description إعدادات Tailwind CSS — ألوان، خطوط، RTL
 *
 * لماذا هذا الملف:
 * - يحدد نظام الألوان (أساسي + دلالي).
 * - يحدد الخطوط العربية.
 * - يفعّل دعم RTL.
 * - يضيف أنماط مخصصة للأدوية/الفواتير.
 */

/** @type {import('tailwindcss').Config} */
export default {
  // ═══════════════════════════════════════════════
  // 1. المحتوى (Content)
  // ═══════════════════════════════════════════════
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],

  // ═══════════════════════════════════════════════
  // 2. الوضع الداكن (معطّل — قيد "البساطة")
  // ═══════════════════════════════════════════════
  darkMode: 'class', // يمكن تفعيله لاحقاً

  // ═══════════════════════════════════════════════
  // 3. Theme
  // ═══════════════════════════════════════════════
  theme: {
    extend: {
      // ✅ الألوان
      colors: {
        // ✅ الأساسي (Primary) — أزرق داكن
        primary: {
          50:  '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF', // اللون الأساسي
          900: '#1E3A8A',
          950: '#172554',
        },

        // ✅ النجاح (Success) — أخضر
        success: {
          50:  '#F0FDF4',
          100: '#DCFCE7',
          200: '#BBF7D0',
          300: '#86EFAC',
          400: '#4ADE80',
          500: '#22C55E',
          600: '#16A34A', // للاستخدام الأساسي
          700: '#15803D',
          800: '#166534',
          900: '#14532D',
        },

        // ✅ التحذير (Warning) — برتقالي
        warning: {
          50:  '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#F97316',
          600: '#EA580C', // للاستخدام الأساسي
          700: '#C2410C',
          800: '#9A3412',
          900: '#7C2D12',
        },

        // ✅ الخطر (Danger) — أحمر
        danger: {
          50:  '#FEF2F2',
          100: '#FEE2E2',
          200: '#FECACA',
          300: '#FCA5A5',
          400: '#F87171',
          500: '#EF4444',
          600: '#DC2626', // للاستخدام الأساسي
          700: '#B91C1C',
          800: '#991B1B',
          900: '#7F1D1D',
        },

        // ✅ معلومات (Info) — سماوي
        info: {
          50:  '#F0F9FF',
          100: '#E0F2FE',
          200: '#BAE6FD',
          300: '#7DD3FC',
          400: '#38BDF8',
          500: '#0EA5E9',
          600: '#0284C7',
          700: '#0369A1',
          800: '#075985',
          900: '#0C4A6E',
        },

        // ✅ الرمادي (Neutral)
        neutral: {
          50:  '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
          950: '#020617',
        },
      },

      // ✅ الخطوط
      fontFamily: {
        // الخط الأساسي (عربي)
        sans: ['Tajawal', 'Cairo', 'system-ui', 'sans-serif'],
        // للعناوين
        display: ['Cairo', 'Tajawal', 'system-ui', 'sans-serif'],
        // للأرقام (اختياري)
        mono: ['Inter', 'monospace'],
      },

      // ✅ أحجام الخطوط
      fontSize: {
        'xs':   ['0.75rem',  { lineHeight: '1rem' }],
        'sm':   ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem',     { lineHeight: '1.5rem' }],
        'lg':   ['1.125rem', { lineHeight: '1.75rem' }],
        'xl':   ['1.25rem',  { lineHeight: '1.75rem' }],
        '2xl':  ['1.5rem',   { lineHeight: '2rem' }],
        '3xl':  ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl':  ['2.25rem',  { lineHeight: '2.5rem' }],
      },

      // ✅ المسافات
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },

      // ✅ نصف قطر الحدود
      borderRadius: {
        'sm': '0.25rem',
        'DEFAULT': '0.5rem',
        'md': '0.75rem',
        'lg': '1rem',
        'xl': '1.5rem',
      },

      // ✅ الظلال
      boxShadow: {
        'sm': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'DEFAULT': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'md': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        'lg': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        'xl': '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
      },

      // ✅ الحركات (Animations)
      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-out': {
          '0%':   { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'slide-in-right': {
          '0%':   { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-in-left': {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-up': {
          '0%':   { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        'spin-slow': {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'fade-in':        'fade-in 0.2s ease-in-out',
        'fade-out':       'fade-out 0.2s ease-in-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'slide-in-left':  'slide-in-left 0.3s ease-out',
        'slide-up':       'slide-up 0.3s ease-out',
        'spin-slow':      'spin-slow 2s linear infinite',
      },

      // ✅ z-index
      zIndex: {
        '60': '60',
        '70': '70',
        '80': '80',
        '90': '90',
        '100': '100',
      },
    },
  },

  // ═══════════════════════════════════════════════
  // 4. Plugins
  // ═══════════════════════════════════════════════
  plugins: [
    // ✅ دعم RTL عبر Logical Properties
    // ملاحظة: Tailwind 3.4+ يدعم logical properties تلقائياً
    // (ms-, me-, ps-, pe-, start-, end-)
  ],

  // ═══════════════════════════════════════════════
  // 5. Core Plugins
  // ═══════════════════════════════════════════════
  corePlugins: {
    // ✅ تعطيل preflight إذا كان يتعارض مع RTL
    // (نتركه مفعّلاً — Tailwind 3.4 يتعامل مع RTL جيداً)
    preflight: true,
  },
};