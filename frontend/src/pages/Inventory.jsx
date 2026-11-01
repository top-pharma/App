/**
 * @file InventoryPage.jsx
 * @description
 * صفحة مركزية لقسم المخزون — تعرض بطاقات لكل قسم فرعي.
 *
 * لماذا هذا الملف؟
 * - يحافظ على بساطة Sidebar (عنصر واحد "المخزون").
 * - يوفّر تجربة تنقّل واضحة داخل قسم المخزون.
 * - يُحدَّث تدريجياً مع بناء كل قسم فرعي في المرحلة 1.
 */

import { Link } from 'react-router-dom';
import {
  Building2,
  Layers,
  Package,
  ShoppingBag,
  Tag,
  Truck,
} from 'lucide-react';

// ═══════════════════════════════════════════════
// 1. الأقسام الفرعية
// ═══════════════════════════════════════════════
const INVENTORY_SECTIONS = Object.freeze([
  {
    key: 'categories',
    label: 'التصنيفات',
    description: 'إدارة تصنيفات الأصناف (أدوية، مستحضرات، مكمّلات...)',
    icon: Tag,
    path: '/inventory/categories',
    available: true,
    color: 'bg-primary-50 text-primary-800',
  },
  {
    key: 'warehouses',
    label: 'المخازن',
    description: 'إدارة المخازن (رئيسي + فروع)',
    icon: Building2,
    path: '/inventory/warehouses',
    available: true,
    color: 'bg-info-50 text-info-700',
  },
  {
    key: 'items',
    label: 'الأصناف',
    description: 'إدارة الأصناف الدوائية والوحدات والباركود',
    icon: Package,
    path: '/inventory/items',
    available: true,
    color: 'bg-success-50 text-success-700',
  },
  {
    key: 'stock',
    label: 'المخزون',
    description: 'الدفعات + تواريخ الانتهاء (FEFO)',
    icon: Layers,
    path: '/inventory/stock',
    available: true,
    color: 'bg-warning-50 text-warning-700',
  },
  {
    key: 'suppliers',
    label: 'الموردون',
    description: 'سجل الموردين وبيانات الاتصال',
    icon: Truck,
    path: '/inventory/suppliers',
    available: true,
    color: 'bg-danger-50 text-danger-700',
  },
  {
    key: 'customers',
    label: 'الصيدليات',
    description: 'كل العملاء صيدليات (عرض دائم)',
    icon: ShoppingBag,
    path: '/inventory/customers',
    available: true,
    color: 'bg-neutral-100 text-neutral-700',
  },
]);

// ═══════════════════════════════════════════════
// 2. المكون
// ═══════════════════════════════════════════════
function InventoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">المخزون</h1>
        <p className="text-sm text-neutral-500 mt-1">
          إدارة التصنيفات والمخازن والأصناف والموردين والصيدليات
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {INVENTORY_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isAvailable = section.available;

          const CardContent = (
            <div
              className={`
                group h-full bg-white rounded-lg border border-neutral-200 p-5
                transition-all duration-200
                ${
                  isAvailable
                    ? 'hover:border-primary-300 hover:shadow-md cursor-pointer'
                    : 'opacity-70 cursor-not-allowed'
                }
              `}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center ${section.color}`}
                >
                  <Icon size={24} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-neutral-900">
                      {section.label}
                    </h3>
                    {!isAvailable && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500">
                        قريباً
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-neutral-500 mt-1 leading-relaxed">
                    {section.description}
                  </p>
                </div>
              </div>
            </div>
          );

          return isAvailable ? (
            <Link key={section.key} to={section.path} className="block">
              {CardContent}
            </Link>
          ) : (
            <div key={section.key}>{CardContent}</div>
          );
        })}
      </div>
    </div>
  );
}

export default InventoryPage;