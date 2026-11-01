/**
 * @file Header.jsx
 * @description الترويسة العلوية (Header)
 */

import { useEffect, useRef, useState } from 'react';

import { LogOut, Menu, Settings, User as UserIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth.js';
import { ROUTES, ROLE_LABELS_AR } from '../../utils/constants.js';

/**
 * الترويسة العلوية
 * @param {Object} props
 * @param {Function} props.onMenuClick - دالة فتح القائمة الجانبية
 * @returns {JSX.Element}
 */
function Header({ onMenuClick }) {
  const { user, userName, userRole, logout } = useAuth();
  const navigate = useNavigate();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // ═══════════════════════════════════════════════
  // 1. إغلاق القائمة عند النقر خارجها
  // ═══════════════════════════════════════════════
  useEffect(() => {
    if (!isMenuOpen) {
      return undefined;
    }

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  // ═══════════════════════════════════════════════
  // 2. تسجيل الخروج
  // ═══════════════════════════════════════════════
  const handleLogout = async () => {
    setIsMenuOpen(false);
    await logout();
    navigate(ROUTES.LOGIN, { replace: true });
  };

  // ✅ الحرف الأول من الاسم
  const initial = userName?.charAt(0) || user?.email?.charAt(0) || '؟';

  // ✅ اسم الدور بالعربي
  const roleNameAr = ROLE_LABELS_AR[userRole] || userRole || '—';

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-neutral-200 shadow-sm">
      <div className="h-full px-4 flex items-center justify-between gap-4">
        {/* ✅ اليمين: زر القائمة + الشعار */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-md text-neutral-600 hover:bg-neutral-100 transition-colors"
            aria-label="فتح القائمة"
          >
            <Menu size={22} />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <img
              src="/logo.png"
              alt="شعار الشركة"
              className="w-9 h-9 object-contain flex-shrink-0"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            <div className="hidden sm:block min-w-0">
              <h1 className="text-base font-bold text-neutral-900 truncate">
                نظام إدارة شركة الأدوية
              </h1>
            </div>
          </div>
        </div>

        {/* ✅ اليسار: قائمة المستخدم */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="flex items-center gap-2 p-1.5 rounded-md hover:bg-neutral-100 transition-colors"
            aria-label="قائمة المستخدم"
            aria-expanded={isMenuOpen}
          >
            <div className="w-9 h-9 rounded-full bg-primary-800 text-white flex items-center justify-center font-bold text-sm">
              {initial}
            </div>
            <div className="hidden md:block text-right">
              <p className="text-sm font-medium text-neutral-900 truncate max-w-[150px]">
                {userName || 'مستخدم'}
              </p>
              <p className="text-xs text-neutral-500 truncate">
                {roleNameAr}
              </p>
            </div>
          </button>

          {/* ✅ القائمة المنسدلة */}
          {isMenuOpen && (
            <div className="absolute left-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 animate-slide-up">
              <div className="px-4 py-3 border-b border-neutral-200">
                <p className="text-sm font-medium text-neutral-900 truncate">
                  {userName || 'مستخدم'}
                </p>
                <p className="text-xs text-neutral-500 truncate">
                  {user?.email || '—'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors text-right"
              >
                <UserIcon size={16} />
                <span>الملف الشخصي</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors text-right"
              >
                <Settings size={16} />
                <span>الإعدادات</span>
              </button>

              <div className="border-t border-neutral-200 my-1" />

              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-danger-600 hover:bg-danger-50 transition-colors text-right"
              >
                <LogOut size={16} />
                <span>تسجيل الخروج</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;