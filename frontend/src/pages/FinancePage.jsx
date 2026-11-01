/**
 * FinancePage.jsx
 *
 * الصفحة الرئيسية لقسم المالية (Hub).
 * تعرض بطاقات تنقّل لكل صفحة مالية + إحصائيات سريعة.
 */

import { Link } from 'react-router-dom';
import {
  Wallet,
  Building2,
  Receipt,
  FileText,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import { useCashFundsContext } from '../context/CashFundsContext.jsx';
import { useBankAccountsContext } from '../context/BankAccountsContext.jsx';
import { useChecksContext } from '../context/ChecksContext.jsx';
import Card from '../components/UI/Card.jsx';
import { formatCurrency } from '../utils/formatters.js';

const FinancePage = () => {
  const { funds, defaultFund } = useCashFundsContext();
  const { accounts, activeAccount } = useBankAccountsContext();
  const { upcoming, overdue, checks } = useChecksContext();

  const totalCashBalance = funds.reduce((sum, f) => sum + (f.balance || 0), 0);
  const bankBalance = activeAccount?.balance || 0;
  const pendingChecksCount = checks.filter((c) => c.status === 'pending').length;

  const cards = [
    {
      title: 'الصناديق النقدية',
      description: 'إدارة الخزائن النقدية',
      icon: Wallet,
      color: 'bg-blue-500',
      path: '/finance/cash-funds',
      stat: `${formatCurrency(totalCashBalance)} SDG`,
      statLabel: 'إجمالي الرصيد',
    },
    {
      title: 'الحساب البنكي',
      description: 'إدارة الحساب البنكي',
      icon: Building2,
      color: 'bg-green-500',
      path: '/finance/bank-accounts',
      stat: activeAccount ? `${formatCurrency(bankBalance)} SDG` : 'لا يوجد',
      statLabel: activeAccount ? 'رصيد البنك' : 'حساب',
    },
    {
      title: 'الشيكات',
      description: 'إدارة الشيكات الواردة والصادرة',
      icon: FileText,
      color: 'bg-purple-500',
      path: '/finance/checks',
      stat: `${pendingChecksCount} شيك`,
      statLabel: 'معلّق',
    },
    {
      title: 'الحركات النقدية',
      description: 'سجل الحركات النقدية',
      icon: Receipt,
      color: 'bg-orange-500',
      path: '/finance/cash-transactions',
      stat: '',
      statLabel: 'عرض السجل',
    },
    {
      title: 'القيود المحاسبية',
      description: 'القيود المدينة والدائنة',
      icon: TrendingUp,
      color: 'bg-indigo-500',
      path: '/finance/accounting-entries',
      stat: '',
      statLabel: 'عرض القيود',
    },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">المالية</h1>
        <p className="text-gray-600 mt-1">إدارة الصناديق والبنك والشيكات والقيود</p>
      </div>

      {/* تنبيهات سريعة */}
      {(upcoming.length > 0 || overdue.length > 0) && (
        <div className="mb-6 space-y-2">
          {overdue.length > 0 && (
            <Link
              to="/finance/checks?status=pending&overdue=true"
              className="flex items-center gap-3 p-4 bg-red-50 border border-red-300 rounded-lg hover:bg-red-100 transition"
            >
              <AlertCircle className="text-red-600" size={24} />
              <div>
                <p className="font-semibold text-red-800">
                  {overdue.length} شيك متأخر
                </p>
                <p className="text-sm text-red-600">يحتاج مراجعة عاجلة</p>
              </div>
            </Link>
          )}
          {upcoming.length > 0 && (
            <Link
              to="/finance/checks?status=pending"
              className="flex items-center gap-3 p-4 bg-yellow-50 border border-yellow-300 rounded-lg hover:bg-yellow-100 transition"
            >
              <AlertCircle className="text-yellow-600" size={24} />
              <div>
                <p className="font-semibold text-yellow-800">
                  {upcoming.length} شيك مستحق خلال 7 أيام
                </p>
                <p className="text-sm text-yellow-600">تحضير للتحصيل</p>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* بطاقات التنقل */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.path}
              to={card.path}
              className="block p-6 bg-white border border-gray-200 rounded-xl hover:shadow-lg hover:border-blue-400 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-lg ${card.color}`}>
                  <Icon className="text-white" size={24} />
                </div>
                {card.stat && (
                  <div className="text-left">
                    <p className="text-lg font-bold text-gray-900">{card.stat}</p>
                    <p className="text-xs text-gray-500">{card.statLabel}</p>
                  </div>
                )}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{card.title}</h3>
              <p className="text-sm text-gray-600">{card.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default FinancePage;