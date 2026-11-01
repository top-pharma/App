/**
 * @file main.jsx
 * @description نقطة الدخول لتطبيق React
 *
 * لماذا هذا الملف:
 * - يربط React بـ DOM (#root).
 * - يُغلّف App بـ AppProviders (Context API).
 * - يفعّل StrictMode (للتطوير).
 * - يستورد index.css (Tailwind).
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App.jsx';
import { AppProviders } from './context/AppProviders.jsx';
import './index.css';

// ═══════════════════════════════════════════════
// 1. نقطة التركيب (Mount Point)
// ═══════════════════════════════════════════════
const rootElement = document.getElementById('root');

if (!rootElement) {
  // ⚠️ إذا لم يوجد #root → لا يمكن تشغيل التطبيق
  throw new Error('عنصر #root غير موجود في index.html');
}

// ═══════════════════════════════════════════════
// 2. إنشاء Root
// ═══════════════════════════════════════════════
const root = ReactDOM.createRoot(rootElement);

// ═══════════════════════════════════════════════
// 3. التركيب
// ═══════════════════════════════════════════════
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProviders>
        <App />
      </AppProviders>
    </BrowserRouter>
  </React.StrictMode>
);