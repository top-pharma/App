/**
 * CashSelector.jsx
 *
 * قائمة منسدلة لاختيار الصندوق (أو البنك).
 * تُستخدم في InvoiceForm و CheckForm و PurchaseReceiptForm.
 */

import { useEffect } from 'react';
import { useCashFundsContext } from '../../context/CashFundsContext.jsx';
import { useBankAccountsContext } from '../../context/BankAccountsContext.jsx';

/**
 * @param {Object} props
 * @param {string} props.method - 'cash' | 'bank' (طريقة الدفع)
 * @param {string} props.value - القيمة الحالية (cashFundId أو bankAccountId)
 * @param {Function} props.onChange - دالة التغيير
 * @param {boolean} [props.required=true]
 * @param {boolean} [props.showBalance=true] - إظهار الرصيد
 * @param {string} [props.label]
 * @param {string} [props.error]
 */
const CashSelector = ({
  method = 'cash',
  value,
  onChange,
  required = true,
  showBalance = true,
  label,
  error,
}) => {
  const { funds, defaultFund } = useCashFundsContext();
  const { accounts, activeAccount } = useBankAccountsContext();

  const isCash = method === 'cash';
  const list = isCash ? funds : accounts;
  const activeList = list.filter((item) => item.isActive !== false);
  const defaultItem = isCash ? defaultFund : activeAccount;

  // تعيين الافتراضي تلقائياً عند التحميل
  useEffect(() => {
    if (!value && defaultItem) {
      onChange(defaultItem._id);
    }
  }, [value, defaultItem, onChange]);

  const defaultLabel = isCash ? 'الصندوق' : 'الحساب البنكي';

  if (activeList.length === 0) {
    return (
      <div className="p-3 bg-yellow-50 border border-yellow-300 rounded-md text-sm text-yellow-800">
        ⚠️ لا يوجد {isCash ? 'صندوق' : 'حساب بنكي'} نشط.{' '}
        {isCash ? 'أنشئ صندوقاً من صفحة الصناديق.' : 'أنشئ حساباً من صفحة البنك.'}
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label || defaultLabel}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          error ? 'border-red-500' : 'border-gray-300'
        }`}
      >
        <option value="">-- اختر {defaultLabel} --</option>
        {activeList.map((item) => {
          const displayName = isCash
            ? item.name
            : `${item.bankName} — ${item.accountNumber}`;
          const balance = item.balance || 0;
          const isDefault = item._id === defaultItem?._id;
          return (
            <option key={item._id} value={item._id}>
              {displayName}
              {isDefault ? ' (افتراضي)' : ''}
              {showBalance ? ` — الرصيد: ${balance.toFixed(2)} SDG` : ''}
            </option>
          );
        })}
      </select>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
};

export default CashSelector;