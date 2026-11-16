/**
 * @file SalesRepTransactionsPage.jsx
 * @description صفحة إدارة حركات المندوب — 6 أنواع.
 *
 * ✅ v10.9 (2026-11-16) — جديد.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Plus, Search, X, AlertCircle, DollarSign, TrendingUp, Clock,
  CheckCircle2, XCircle, Banknote, ThumbsUp, Ban, Gift, Wallet, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';

import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';
import { useSalesRepTransactions } from '../context/SalesRepTransactionsContext.jsx';
import * as usersAPI from '../api/usersAPI.js';

import Button from '../components/UI/Button.jsx';
import Input from '../components/UI/Input.jsx';
import Table from '../components/UI/Table.jsx';
import Pagination from '../components/UI/Pagination.jsx';
import Modal from '../components/UI/Modal.jsx';
import Select from '../components/UI/Select.jsx';

import { formatCurrency, formatDate, formatNumber } from '../utils/formatters.js';

const TYPES = [
  { value: 'commission', label: 'عمولة' },
  { value: 'bonus', label: 'بونص' },
  { value: 'expense', label: 'مصروف' },
  { value: 'advance', label: 'سلفة' },
  { value: 'settlement', label: 'تسوية' },
  { value: 'salary', label: 'راتب' },
];

const DIRECTIONS = [
  { value: 'credit', label: 'له (credit)' },
  { value: 'debit', label: 'عليه (debit)' },
];

const STATUSES = [
  { value: 'pending', label: 'معلّق' },
  { value: 'approved', label: 'معتمد' },
  { value: 'paid', label: 'مدفوع' },
  { value: 'cancelled', label: 'ملغى' },
];

function TypeBadge({ type }) {
  const map = {
    commission: { label: 'عمولة', class: 'bg-green-100 text-green-800', icon: DollarSign },
    bonus: { label: 'بونص', class: 'bg-purple-100 text-purple-800', icon: Gift },
    expense: { label: 'مصروف', class: 'bg-orange-100 text-orange-800', icon: TrendingUp },
    advance: { label: 'سلفة', class: 'bg-blue-100 text-blue-800', icon: Wallet },
    settlement: { label: 'تسوية', class: 'bg-cyan-100 text-cyan-800', icon: ThumbsUp },
    salary: { label: 'راتب', class: 'bg-indigo-100 text-indigo-800', icon: Banknote },
  };
  const c = map[type] || { label: type, class: 'bg-neutral-100 text-neutral-800', icon: DollarSign };
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${c.class}`}>
      <Icon size={12} />{c.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending: { label: 'معلّق', class: 'bg-yellow-100 text-yellow-800', icon: Clock },
    approved: { label: 'معتمد', class: 'bg-blue-100 text-blue-800', icon: CheckCircle2 },
    paid: { label: 'مدفوع', class: 'bg-green-100 text-green-800', icon: CheckCircle2 },
    cancelled: { label: 'ملغى', class: 'bg-red-100 text-red-800', icon: XCircle },
  };
  const c = map[status] || { label: status, class: 'bg-neutral-100 text-neutral-800', icon: Clock };
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${c.class}`}>
      <Icon size={12} />{c.label}
    </span>
  );
}

function MiniStat({ label, value, color = 'primary' }) {
  const colors = {
    primary: 'text-primary-700', warning: 'text-yellow-700', danger: 'text-red-700',
    success: 'text-green-700', neutral: 'text-neutral-700',
  };
  return (
    <div className="bg-white rounded-lg border border-neutral-200 px-4 py-3">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className={`text-lg font-bold numeric ${colors[color]}`}>{formatNumber(value)}</p>
    </div>
  );
}

function SalesRepTransactionsPage() {
  const { isAdmin, isAccountant } = useAuth();
  const toast = useToast();
  const {
    transactions, pagination, loading, error,
    fetchTransactions, createTransaction, approveTransaction, payTransaction, cancelTransaction, resetError,
  } = useSalesRepTransactions();

  const [salesReps, setSalesReps] = useState([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [salesRepFilter, setSalesRepFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [currentLimit, setCurrentLimit] = useState(20);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Form
  const [fSalesRep, setFSalesRep] = useState('');
  const [fType, setFType] = useState('bonus');
  const [fDirection, setFDirection] = useState('credit');
  const [fAmount, setFAmount] = useState('');
  const [fDescription, setFDescription] = useState('');
  const [fNotes, setFNotes] = useState('');

  // Action modals
  const [approveTarget, setApproveTarget] = useState(null);
  const [payTarget, setPayTarget] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const reps = await usersAPI.listSalesReps();
        setSalesReps(reps || []);
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setCurrentPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    const params = { page: currentPage, limit: currentLimit };
    if (debouncedSearch) params.search = debouncedSearch;
    if (statusFilter) params.status = statusFilter;
    if (typeFilter) params.type = typeFilter;
    if (salesRepFilter) params.salesRep = salesRepFilter;
    fetchTransactions(params);
  }, [currentPage, currentLimit, debouncedSearch, statusFilter, typeFilter, salesRepFilter, fetchTransactions]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!fSalesRep) return toast.error('اختر المندوب');
    if (!fAmount || Number(fAmount) <= 0) return toast.error('أدخل مبلغاً صحيحاً');
    if (!fDescription.trim()) return toast.error('أدخل الوصف');

    setIsProcessing(true);
    const r = await createTransaction({
      salesRep: fSalesRep,
      type: fType,
      direction: fDirection,
      amount: Number(fAmount),
      description: fDescription.trim(),
      notes: fNotes.trim() || undefined,
    });
    setIsProcessing(false);

    if (r.success) {
      toast.success('تم إنشاء الحركة.');
      setIsFormOpen(false);
      setFSalesRep(''); setFAmount(''); setFDescription(''); setFNotes('');
      load();
    } else {
      toast.error(r.error);
    }
  };

  const handleApprove = async () => {
    setIsProcessing(true);
    const r = await approveTransaction(approveTarget.id, {});
    setIsProcessing(false);
    if (r.success) {
      toast.success('تمت الموافقة.');
      setApproveTarget(null);
      load();
    } else toast.error(r.error);
  };

  const handlePay = async () => {
    setIsProcessing(true);
    const r = await payTransaction(payTarget.id, { paymentMethod: 'cash' });
    setIsProcessing(false);
    if (r.success) {
      toast.success('تم الدفع.');
      setPayTarget(null);
      load();
    } else toast.error(r.error);
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) return toast.error('سبب الإلغاء مطلوب.');
    setIsProcessing(true);
    const r = await cancelTransaction(cancelTarget.id, { cancelReason: cancelReason.trim() });
    setIsProcessing(false);
    if (r.success) {
      toast.success('تم الإلغاء.');
      setCancelTarget(null);
      setCancelReason('');
      load();
    } else toast.error(r.error);
  };

  const columns = [
    { key: 'transactionNumber', label: 'الرقم', render: (r) => <span className="font-mono text-xs">{r.transactionNumber}</span> },
    { key: 'salesRep', label: 'المندوب', render: (r) => <span className="text-sm">{r.salesRep?.name || '—'}</span> },
    { key: 'type', label: 'النوع', align: 'center', render: (r) => <TypeBadge type={r.type} /> },
    {
      key: 'direction', label: 'الاتجاه', align: 'center',
      render: (r) => r.direction === 'credit'
        ? <span className="text-green-700 text-xs font-bold inline-flex items-center gap-1"><ArrowUpRight size={12} /> له</span>
        : <span className="text-red-700 text-xs font-bold inline-flex items-center gap-1"><ArrowDownRight size={12} /> عليه</span>,
    },
    { key: 'amount', label: 'المبلغ', align: 'end', render: (r) => <span className="font-bold numeric">{formatCurrency(r.amount, false)}</span> },
    { key: 'transactionDate', label: 'التاريخ', align: 'center', render: (r) => <span className="text-xs">{formatDate(r.transactionDate)}</span> },
    { key: 'status', label: 'الحالة', align: 'center', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions', label: 'إجراءات', align: 'center',
      render: (r) => (
        <div className="flex items-center justify-center gap-1 flex-wrap">
          {r.status === 'pending' && (isAdmin || isAccountant) && (
            <Button variant="ghost" size="sm" icon={ThumbsUp} onClick={() => setApproveTarget(r)}>موافقة</Button>
          )}
          {r.status === 'approved' && (isAdmin || isAccountant) && (
            <Button variant="ghost" size="sm" icon={Banknote} onClick={() => setPayTarget(r)}>دفع</Button>
          )}
          {(r.status === 'pending' || r.status === 'approved') && (isAdmin || isAccountant) && (
            <Button variant="ghost" size="sm" icon={Ban} onClick={() => setCancelTarget(r)}>إلغاء</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <DollarSign size={24} className="text-primary-700" />
            حركات المناديب
          </h1>
          <p className="text-sm text-neutral-600 mt-1">عمولات، بونص، مصروفات، سلف، تسويات، رواتب</p>
        </div>
        {(isAdmin || isAccountant) && (
          <Button variant="primary" icon={Plus} onClick={() => setIsFormOpen(true)}>إنشاء حركة</Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="الإجمالي" value={pagination.total || 0} color="primary" />
        <MiniStat label="معلّقة" value={transactions.filter((t) => t.status === 'pending').length} color="warning" />
        <MiniStat label="معتمدة" value={transactions.filter((t) => t.status === 'approved').length} color="neutral" />
        <MiniStat label="مدفوعة" value={transactions.filter((t) => t.status === 'paid').length} color="success" />
      </div>

      <div className="bg-white rounded-lg border border-neutral-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2">
            <Input placeholder="ابحث برقم الحركة أو الوصف..." icon={Search} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}
            options={[{ value: '', label: 'كل الأنواع' }, ...TYPES]} />
          <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            options={[{ value: '', label: 'كل الحالات' }, ...STATUSES]} />
          <Select value={salesRepFilter} onChange={(e) => { setSalesRepFilter(e.target.value); setCurrentPage(1); }}
            options={[{ value: '', label: 'كل المناديب' }, ...salesReps.map((r) => ({ value: r.id || r._id, label: r.name }))]} />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-800"><AlertCircle size={18} /><span className="text-sm">{error}</span></div>
          <Button variant="ghost" size="sm" onClick={() => { resetError(); load(); }}>إعادة المحاولة</Button>
        </div>
      )}

      <Table columns={columns} data={transactions} loading={loading && transactions.length === 0} emptyMessage="لا توجد حركات" rowKey="id" />

      {pagination.total > 0 && (
        <Pagination page={currentPage} limit={currentLimit} total={pagination.total}
          onPageChange={setCurrentPage}
          onLimitChange={(l) => { setCurrentLimit(l); setCurrentPage(1); }} />
      )}

      {/* Create Modal */}
      <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title="إنشاء حركة مندوب" size="md"
        footer={<>
          <Button variant="ghost" onClick={() => setIsFormOpen(false)} disabled={isProcessing}>إلغاء</Button>
          <Button variant="primary" onClick={handleCreate} loading={isProcessing}>إنشاء</Button>
        </>}>
        <div className="space-y-3">
          <Select label="المندوب *" value={fSalesRep} onChange={(e) => setFSalesRep(e.target.value)}
            options={[{ value: '', label: '— اختر —' }, ...salesReps.map((r) => ({ value: r.id || r._id, label: r.name }))]} />
          <Select label="النوع *" value={fType} onChange={(e) => setFType(e.target.value)} options={TYPES} />
          <Select label="الاتجاه *" value={fDirection} onChange={(e) => setFDirection(e.target.value)} options={DIRECTIONS} />
          <Input label="المبلغ *" type="number" min="0" step="0.01" value={fAmount} onChange={(e) => setFAmount(e.target.value)} />
          <Input label="الوصف *" value={fDescription} onChange={(e) => setFDescription(e.target.value)} placeholder="مثال: بونص تحقيق هدف أكتوبر" />
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">ملاحظات</label>
            <textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm" />
          </div>
        </div>
      </Modal>

      {/* Approve Modal */}
      <Modal isOpen={Boolean(approveTarget)} onClose={() => setApproveTarget(null)} title="موافقة على الحركة" size="sm"
        footer={<>
          <Button variant="ghost" onClick={() => setApproveTarget(null)} disabled={isProcessing}>إلغاء</Button>
          <Button variant="primary" onClick={handleApprove} loading={isProcessing}>موافقة</Button>
        </>}>
        {approveTarget && (
          <div className="text-sm">
            <p>هل توافق على الحركة <strong>{approveTarget.transactionNumber}</strong>؟</p>
            <p className="mt-2 text-lg font-bold numeric">{formatCurrency(approveTarget.amount)}</p>
          </div>
        )}
      </Modal>

      {/* Pay Modal */}
      <Modal isOpen={Boolean(payTarget)} onClose={() => setPayTarget(null)} title="دفع الحركة" size="sm"
        footer={<>
          <Button variant="ghost" onClick={() => setPayTarget(null)} disabled={isProcessing}>إلغاء</Button>
          <Button variant="primary" onClick={handlePay} loading={isProcessing} icon={Banknote}>دفع</Button>
        </>}>
        {payTarget && (
          <div className="text-sm">
            <p>سيتم دفع الحركة <strong>{payTarget.transactionNumber}</strong></p>
            <p className="mt-2 text-lg font-bold numeric">{formatCurrency(payTarget.amount)}</p>
            <p className="mt-2 text-xs text-neutral-500">
              الاتجاه: {payTarget.direction === 'credit' ? 'له — سيتم الصرف من الصندوق' : 'عليه — سيتم الاستلام في الصندوق'}
            </p>
          </div>
        )}
      </Modal>

      {/* Cancel Modal */}
      <Modal isOpen={Boolean(cancelTarget)} onClose={() => setCancelTarget(null)} title="إلغاء الحركة" size="sm"
        footer={<>
          <Button variant="ghost" onClick={() => setCancelTarget(null)} disabled={isProcessing}>رجوع</Button>
          <Button variant="danger" onClick={handleCancel} loading={isProcessing}>تأكيد الإلغاء</Button>
        </>}>
        <div className="space-y-3">
          <p className="text-sm">سيتم إلغاء الحركة <strong>{cancelTarget?.transactionNumber}</strong>.</p>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">سبب الإلغاء *</label>
            <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3}
              className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm" />
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default SalesRepTransactionsPage;