/**
 * @file ReportsPage.jsx
 * @description
 * Hub التقارير — بطاقات لكل مجموعة.
 *
 * المرحلة الحالية: المالية فقط متاحة.
 * الباقي (مبيعات/عملاء/موردين/مخزون) "قيد التطوير".
 */

import { Link } from 'react-router-dom';
import { Wallet, TrendingUp, Users, Truck, Package, BarChart3 } from 'lucide-react';

const GROUPS = [
  {
    title: 'التقارير المالية',
    description:
      'ميزان المراجعة، الحركات النقدية، أرصدة الصناديق، الشيكات، المصروفات، الإيرادات - المصروفات',
    icon: Wallet,
    color: 'blue',
    to: '/reports/finance',
    count: 6,
    available: true,
  },
  {
    title: 'تقارير المبيعات',
    description: 'الفواتير، حسب الصنف، حسب المندوب، العمولات، البونص',
    icon: TrendingUp,
    color: 'green',
    to: '/reports/sales',
    count: 7,
    available: true,
  },
  {
    title: 'تقارير العملاء',
    description: 'كشوف الحساب، أعمار الديون',
    icon: Users,
    color: 'orange',
    to: '/reports/customers',
    count: 2,
    available: true,
  },
  {
    title: 'تقارير الموردين',
    description: 'كشوف الحساب، الأرصدة',
    icon: Truck,
    color: 'purple',
    to: '/reports/suppliers',
    count: 2,
    available: true,
  },
  {
    title: 'تقارير المخزون',
    description: 'الأرصدة، الدفعات القاربة، تحت الحد الأدنى',
    icon: Package,
    color: 'red',
    to: '/reports/inventory',
    count: 3,
    available: true,
  },
];

const COLOR_CLASSES = {
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  green: 'bg-green-50 text-green-700 border-green-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  red: 'bg-red-50 text-red-700 border-red-200',
};

export default function ReportsPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 size={24} className="text-primary-700" />
          <h1 className="text-2xl font-bold text-neutral-900">مركز التقارير</h1>
        </div>
        <p className="text-sm text-neutral-500">
          اختر مجموعة التقارير للاطلاع على التقارير التفصيلية والتصدير (Excel / PDF).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {GROUPS.map((g) => {
          const Icon = g.icon;
          const colorClass = COLOR_CLASSES[g.color] || COLOR_CLASSES.blue;

          const content = (
            <>
              <div className="flex items-start justify-between mb-3">
                <div
                  className={`w-12 h-12 rounded-xl border flex items-center justify-center ${colorClass}`}
                >
                  <Icon size={22} />
                </div>
                <span className="inline-block px-2 py-0.5 bg-neutral-100 text-neutral-600 text-[11px] font-medium rounded-full">
                  {g.count} تقارير
                </span>
              </div>
              <h3 className="text-base font-semibold text-neutral-900 mb-1">{g.title}</h3>
              <p className="text-xs text-neutral-500 leading-relaxed mb-3">
                {g.description}
              </p>
              {g.available ? (
                <span className="text-[11px] text-primary-600 font-medium">
                  متاح الآن ←
                </span>
              ) : (
                <span className="text-[11px] text-orange-600 font-medium">
                  ⏳ قيد التطوير
                </span>
              )}
            </>
          );

          if (g.available) {
            return (
              <Link
                key={g.to}
                to={g.to}
                className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                {content}
              </Link>
            );
          }

          return (
            <div
              key={g.to}
              className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm opacity-60 cursor-not-allowed"
            >
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}