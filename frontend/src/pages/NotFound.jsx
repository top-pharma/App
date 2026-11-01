/**
 * @file NotFoundPage.jsx
 * @description صفحة 404 — Phase 2.5.
 */

import { Link } from 'react-router-dom';
import { Home, AlertTriangle } from 'lucide-react';

function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4" dir="rtl">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-warning-50 text-warning-700 mb-6">
          <AlertTriangle size={48} />
        </div>
        <h1 className="text-6xl font-bold text-neutral-900 mb-2">404</h1>
        <p className="text-xl font-bold text-neutral-900 mb-2">
          الصفحة غير موجودة
        </p>
        <p className="text-sm text-neutral-600 mb-8 max-w-md mx-auto">
          المسار الذي تبحث عنه غير موجود أو تم نقله.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary-800 text-white rounded-md hover:bg-primary-900 font-medium transition-colors"
        >
          <Home size={18} />
          العودة للصفحة الرئيسية
        </Link>
      </div>
    </div>
  );
}

export default NotFoundPage;