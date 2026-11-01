/**
 * @file ProtectedRoute.jsx
 * @description
 * مكوّن حماية المسارات (Route Guard) — Phase D.
 *
 * ⚠️ Phase D — إضافات:
 * - `requiredPermissions`: فحص صلاحيات دقيقة (RBAC).
 * - `forbiddenRedirect`: توجيه بدل صفحة 403 (اختياري).
 * - إجبار تغيير كلمة المرور عند mustChangePassword (Phase C — محفوظ).
 *
 * الأوضاع المدعومة:
 *  1. Layout Route:  <Route element={<ProtectedRoute />}> ... </Route>
 *  2. Wrapper:       <ProtectedRoute><Dashboard /></ProtectedRoute>
 *
 * الاستخدامات:
 *  - <ProtectedRoute>                     // مصادقة فقط
 *  - <ProtectedRoute requiredRoles={['admin']}>  // RBAC بالأدوار
 *  - <ProtectedRoute requiredPermissions={['users.view']}>  // RBAC بالصلاحيات
 *  - <ProtectedRoute requiredPermissions={['a','b']}>       // AND (كلها مطلوبة)
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth.js';
import Loading from '../components/UI/Loading.jsx';

// ═══════════════════════════════════════════════
// 1. صفحة "غير مصرح" (403)
// ═══════════════════════════════════════════════
function ForbiddenPage({ message, detail, userRole }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
      <div className="bg-white rounded-lg border border-neutral-200 p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-danger-50 text-danger-700 flex items-center justify-center mx-auto mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-neutral-900 mb-2">
          {message || 'لا تملك الصلاحية'}
        </h2>
        <p className="text-sm text-neutral-600 mb-6">
          {detail || 'هذه الصفحة تتطلب صلاحيات لا تملكها.'}
          {userRole && (
            <>
              <br />
              دورك الحالي: <strong>{userRole}</strong>.
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="px-4 py-2 rounded-md bg-primary-800 text-white text-sm font-medium hover:bg-primary-900 transition-colors"
        >
          العودة للصفحة السابقة
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// 2. ProtectedRoute
// ═══════════════════════════════════════════════
function ProtectedRoute({
  children,
  requiredRoles,
  requiredPermissions,
  redirectTo = '/login',
  forbiddenRedirect = null, // ← إن مُرِّر، يُوجّه بدل إظهار 403
}) {
  const { isAuthenticated, loading, userRole, user, hasPermission } = useAuth();
  const location = useLocation();

  // ─── 1. أثناء التحميل ───
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <Loading size="lg" text="جاري التحقق من الجلسة..." />
      </div>
    );
  }

  // ─── 2. غير مسجّل → إعادة توجيه ───
  if (!isAuthenticated) {
    return (
      <Navigate
        to={redirectTo}
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  // ─── 2.5. ⚠️ إجبار تغيير كلمة المرور (Phase C) ───
  if (user?.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  // ─── 3. فحص الأدوار (requiredRoles) ───
  if (Array.isArray(requiredRoles) && requiredRoles.length > 0) {
    if (!requiredRoles.includes(userRole)) {
      if (forbiddenRedirect) {
        return <Navigate to={forbiddenRedirect} replace />;
      }
      return (
        <ForbiddenPage
          message="لا تملك الصلاحية"
          detail={`هذه الصفحة مخصّصة لـ: ${requiredRoles.join(', ')}.`}
          userRole={userRole}
        />
      );
    }
  }

  // ─── 4. فحص الصلاحيات (requiredPermissions) ───
  if (Array.isArray(requiredPermissions) && requiredPermissions.length > 0) {
    // AND — يجب أن يملك كل الصلاحيات المطلوبة
    const hasAll = requiredPermissions.every((perm) => hasPermission(perm));

    if (!hasAll) {
      if (forbiddenRedirect) {
        return <Navigate to={forbiddenRedirect} replace />;
      }
      return (
        <ForbiddenPage
          message="لا تملك الصلاحية"
          detail={`هذه الصفحة تتطلب: ${requiredPermissions.join(', ')}.`}
          userRole={userRole}
        />
      );
    }
  }

  // ─── 5. ✅ اجتياز كل الفحوصات ───
  return children || <Outlet />;
}

// ═══════════════════════════════════════════════
// 3. PublicRoute (بلا تغيير)
// ═══════════════════════════════════════════════
export function PublicRoute({ children, redirectTo = '/' }) {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  return children || <Outlet />;
}

export default ProtectedRoute;