/**
 * @file postcss.config.js
 * @description إعدادات PostCSS — Tailwind + Autoprefixer
 *
 * لماذا هذا الملف:
 * - يفعّل Tailwind CSS.
 * - يضيف بادئات المتصفحات تلقائياً.
 */

export default {
  plugins: {
    // ✅ Tailwind CSS
    tailwindcss: {},

    // ✅ Autoprefixer: يضيف -webkit-, -moz-, -ms- تلقائياً
    autoprefixer: {},
  },
};