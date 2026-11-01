/**
 * AccountingEntriesPage.jsx
 *
 * صفحة عرض القيود المحاسبية.
 * - قائمة القيود
 * - عرض تفاصيل القيد (مدين/دائن)
 */

import { useState, useEffect } from 'react';
import accountingEntriesAPI from '../api/accountingEntriesAPI.js';
import Table from '../components/UI/Table.jsx';
import Loading from '../components/UI/Loading.jsx';
import Modal from '../components/UI/Modal.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';

const entryTypeLabels = {
  SALE_CASH: 'بيع نقدي',
  SALE_CREDIT: 'بيع آجل',
  SALE_RETURN: 'مرتجع بيع',
  CUSTOMER_PAYMENT: 'تحصيل عميل',
  PURCHASE: 'مشتريات',
  PURCHASE_RETURN: 'مرتجع مشتريات',
  CHECK_RECEIVED: 'استلام شيك',
  CHECK_COLLECTED: 'تحصيل شيك',
  CHECK_BOUNCED: 'ارتداد شيك',
  CHECK_ISSUED: 'إصدار شيك',
  CHECK_PAID: 'صرف شيك',
  CASH_TRANSFER: 'تحويل صندوق',
  CASH_DEPOSIT: 'إيداع نقدي',
  CASH_WITHDRAWAL: 'سحب نقدي',
  EXPENSE: 'مصروف',
  OPENING: 'افتتاحي',
  ADJUSTMENT: 'تسوية',
};

const AccountingEntriesPage = () => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ entryType: '', from: '', to: '', search: '' });
  const [selectedEntry, setSelectedEntry] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const params = { limit: 100 };
        if (filters.entryType) params.entryType = filters.entryType;
        if (filters.from) params.from = filters.from;
        if (filters.to) params.to = filters.to;
        if (filters.search) params.search = filters.search;
        const result = await accountingEntriesAPI.getAccountingEntries(params);
        setEntries(result.data || []);
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
      header: 'رقم القيد',
      accessor: 'entryNumber',
      cell: (row) => (
        <button
          onClick={() => setSelectedEntry(row)}
          className="font-mono text-blue-600 hover:underline"
        >
          {row.entryNumber}
        </button>
      ),
    },
    {
      header: 'التاريخ',
      accessor: 'entryDate',
      cell: (row) => formatDate(row.entryDate),
    },
    {
      header: 'النوع',
      accessor: 'entryType',
      cell: (row) => (
        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-xs rounded-full">
          {entryTypeLabels[row.entryType] || row.entryType}
        </span>
      ),
    },
    {
      header: 'الوصف',
      accessor: 'description',
      cell: (row) => <span className="text-sm text-gray-700">{row.description}</span>,
    },
    {
      header: 'المدين',
      accessor: 'totalDebit',
      cell: (row) => (
        <span className="font-bold text-green-700">{formatCurrency(row.totalDebit)}</span>
      ),
    },
    {
      header: 'الدائن',
      accessor: 'totalCredit',
      cell: (row) => (
        <span className="font-bold text-blue-700">{formatCurrency(row.totalCredit)}</span>
      ),
    },
    {
      header: 'الحالة',
      accessor: 'isReversed',
      cell: (row) =>
        row.isReversed ? (
          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">مُعكَس</span>
        ) : (
          <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">نشط</span>
        ),
    },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">القيود المحاسبية</h1>
        <p className="text-gray-600 text-sm mt-1">{entries.length} قيد</p>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-4 flex flex-wrap gap-3">
        <select
          value={filters.entryType}
          onChange={(e) => setFilters({ ...filters, entryType: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">كل الأنواع</option>
          {Object.entries(entryTypeLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <input
          type="date"
          value={filters.from}
          onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
        <input
          type="date"
          value={filters.to}
          onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
        <input
          type="text"
          placeholder="بحث برقم القيد أو الوصف..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {loading ? <Loading /> : <Table columns={columns} data={entries} emptyMessage="لا توجد قيود" />}
      </div>

      {/* مودال تفاصيل القيد */}
      {selectedEntry && (
        <Modal
          isOpen={!!selectedEntry}
          onClose={() => setSelectedEntry(null)}
          title={`قيد ${selectedEntry.entryNumber}`}
          size="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-500">النوع</p>
                <p className="font-medium">{entryTypeLabels[selectedEntry.entryType]}</p>
              </div>
              <div>
                <p className="text-gray-500">التاريخ</p>
                <p className="font-medium">{formatDate(selectedEntry.entryDate)}</p>
              </div>
              <div className="col-span-2">
                <p className="text-gray-500">الوصف</p>
                <p className="font-medium">{selectedEntry.description}</p>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-2">السطور</h4>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-2 text-right">كود الحساب</th>
                    <th className="border p-2 text-right">اسم الحساب</th>
                    <th className="border p-2 text-left">مدين</th>
                    <th className="border p-2 text-left">دائن</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedEntry.lines?.map((line, idx) => (
                    <tr key={idx}>
                      <td className="border p-2 font-mono">{line.accountCode}</td>
                      <td className="border p-2">{line.accountName}</td>
                      <td className="border p-2 text-left text-green-700">
                        {line.debit > 0 ? formatCurrency(line.debit) : '-'}
                      </td>
                      <td className="border p-2 text-left text-blue-700">
                        {line.credit > 0 ? formatCurrency(line.credit) : '-'}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-bold">
                    <td className="border p-2" colSpan={2}>الإجمالي</td>
                    <td className="border p-2 text-left text-green-700">
                      {formatCurrency(selectedEntry.totalDebit)}
                    </td>
                    <td className="border p-2 text-left text-blue-700">
                      {formatCurrency(selectedEntry.totalCredit)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AccountingEntriesPage;