/**
 * CashTransactionsPage.jsx
 *
 * صفحة عرض حركات النقدية.
 */

import { useState, useEffect } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import cashTransactionsAPI from '../api/cashTransactionsAPI.js';
import Table from '../components/UI/Table.jsx';
import Loading from '../components/UI/Loading.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';

const methodLabels = { cash: 'نقدي', bank: 'بنك', check: 'شيك' };
const refLabels = {
  invoice: 'فاتورة',
  customer_return: 'مرتجع عميل',
  purchase: 'مشتريات',
  check: 'شيك',
  manual: 'يدوي',
  expense: 'مصروف',
  delivery_note: 'إيصال',
};

const CashTransactionsPage = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    method: 'all',
    direction: 'all',
    from: '',
    to: '',
    search: '',
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const params = { limit: 100 };
        if (filters.method !== 'all') params.method = filters.method;
        if (filters.direction !== 'all') params.direction = filters.direction;
        if (filters.from) params.from = filters.from;
        if (filters.to) params.to = filters.to;
        if (filters.search) params.search = filters.search;
        const result = await cashTransactionsAPI.getCashTransactions(params);
        setTransactions(result.data || []);
      } catch (err) {
        // Toast
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [filters]);

  const columns = [
    {
      header: 'التاريخ',
      accessor: 'transactionDate',
      cell: (row) => formatDate(row.transactionDate),
    },
    {
      header: 'الاتجاه',
      accessor: 'direction',
      cell: (row) => (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${
            row.direction === 'in' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {row.direction === 'in' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
          {row.direction === 'in' ? 'دخل' : 'خرج'}
        </span>
      ),
    },
    {
      header: 'الطريقة',
      accessor: 'method',
      cell: (row) => methodLabels[row.method] || row.method,
    },
    {
      header: 'الصندوق / البنك',
      cell: (row) =>
        row.cashFundId?.name || row.bankAccountId?.bankName || '-',
    },
    {
      header: 'المبلغ',
      accessor: 'amount',
      cell: (row) => (
        <span className={`font-bold ${row.direction === 'in' ? 'text-green-700' : 'text-red-700'}`}>
          {row.direction === 'in' ? '+' : '-'} {formatCurrency(row.amount)} SDG
        </span>
      ),
    },
    {
      header: 'المصدر',
      accessor: 'referenceType',
      cell: (row) => refLabels[row.referenceType] || row.referenceType || '-',
    },
    {
      header: 'الوصف',
      accessor: 'description',
      cell: (row) => <span className="text-sm text-gray-600">{row.description}</span>,
    },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">الحركات النقدية</h1>
        <p className="text-gray-600 text-sm mt-1">{transactions.length} حركة</p>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-4 flex flex-wrap gap-3">
        <select
          value={filters.method}
          onChange={(e) => setFilters({ ...filters, method: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="all">كل الطرق</option>
          <option value="cash">نقدي</option>
          <option value="bank">بنك</option>
          <option value="check">شيك</option>
        </select>
        <select
          value={filters.direction}
          onChange={(e) => setFilters({ ...filters, direction: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="all">الكل</option>
          <option value="in">دخل</option>
          <option value="out">خرج</option>
        </select>
        <input
          type="date"
          value={filters.from}
          onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          placeholder="من"
        />
        <input
          type="date"
          value={filters.to}
          onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          placeholder="إلى"
        />
        <input
          type="text"
          placeholder="بحث في الوصف..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {loading ? <Loading /> : <Table columns={columns} data={transactions} emptyMessage="لا توجد حركات" />}
      </div>
    </div>
  );
};

export default CashTransactionsPage;