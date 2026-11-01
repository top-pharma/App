/**
 * @file InvoiceDetailPage.jsx
 * @description صفحة تفاصيل الفاتورة — Phase 2.5.
 *
 * إضافة:
 *   - زر "تعديل المسودة" (يفتح InvoiceForm في وضع editDraft).
 *   - زر "اعتماد ودفع" (يفتح FinalizeModal).
 *   - auto-open لـ FinalizeModal عند الوصول بـ ?finalize=1.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowRight, Printer, Banknote, XCircle, FileText, User, Calendar,
  AlertCircle, CheckCircle2, Clock, Ban, FileEdit, Send,
} from 'lucide-react';

import { useAuth } from '../hooks/useAuth.js';
import { useInvoices } from '../hooks/useInvoices.js';
import { useToast } from '../hooks/useToast.js';
import * as invoicesAPI from '../api/invoicesAPI.js';

import Button from '../components/UI/Button.jsx';
import Card from '../components/UI/Card.jsx';
import Loading from '../components/UI/Loading.jsx';
import Input from '../components/UI/Input.jsx';
import Modal from '../components/UI/Modal.jsx';
import InvoicePrint from '../components/Sales/InvoicePrint.jsx';
import InvoiceForm from '../components/Sales/InvoiceForm.jsx';

import { formatCurrency, formatDate } from '../utils/formatters.js';
import { PAYMENT_TYPE_LABELS_AR } from '../utils/constants.js';

function StatusBadge({ status }) {
  const map = {
    draft: { label: 'مسودة', class: 'bg-neutral-200 text-neutral-700', icon: FileEdit },
    pending: { label: 'معلقة', class: 'bg-warning-100 text-warning-800', icon: Clock },
    paid: { label: 'مدفوعة', class: 'bg-success-100 text-success-800', icon: CheckCircle2 },
    partial: { label: 'مدفوعة جزئياً', class: 'bg-info-100 text-info-800', icon: Clock },
    overdue: { label: 'متأخرة', class: 'bg-danger-100 text-danger-800', icon: AlertCircle },
    cancelled: { label: 'ملغاة', class: 'bg-neutral-200 text-neutral-700', icon: Ban },
  };
  const c = map[status] || map.pending;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold ${c.class}`}>
      <Icon size={14} />{c.label}
    </span>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2 py-2">
      {Icon && <Icon size={16} className="text-neutral-400 mt-0.5 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-neutral-500">{label}</p>
        <p className="text-sm font-medium text-neutral-900">{value || '—'}</p>
      </div>
    </div>
  );
}

function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const { isAdmin, isAccountant } = useAuth();
  const { cancelInvoice, registerPayment, finalize } = useInvoices();

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [isEditDraftOpen, setIsEditDraftOpen] = useState(false);
  const [isFinalizeOpen, setIsFinalizeOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Payment form
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Cancel form
  const [cancelReason, setCancelReason] = useState('');

  // Finalize form (for drafts)
  const [fPaymentType, setFPaymentType] = useState('cash');
  const [fDueDate, setFDueDate] = useState('');
  const [fTotalInstallments, setFTotalInstallments] = useState('2');
  const [fPaidAmount, setFPaidAmount] = useState('0');
  const [fPaymentMethod, setFPaymentMethod] = useState('cash');

  const loadInvoice = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoicesAPI.getInvoice(id);
      setInvoice(data);
      // Auto-open finalize if URL says so
      if (data.status === 'draft' && searchParams.get('finalize') === '1') {
        setIsFinalizeOpen(true);
      }
    } catch (err) {
      setError(err?.error?.message || err?.message || 'فشل تحميل الفاتورة.');
    } finally {
      setLoading(false);
    }
  }, [id, searchParams]);

  useEffect(() => { loadInvoice(); }, [loadInvoice]);

  // ═══════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════

  const handleRegisterPayment = async () => {
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) { toast.error('أدخل مبلغاً صحيحاً.'); return; }
    if (amount > (invoice?.remainingAmount || 0)) { toast.error('يتجاوز المتبقي.'); return; }

    setIsProcessing(true);
    const r = await registerPayment(id, { amount, paymentMethod, notes: paymentNotes });
    setIsProcessing(false);
    if (r.success) {
      toast.success('تم تسجيل الدفعة.');
      setIsPayOpen(false);
      setPaymentAmount(''); setPaymentNotes('');
      loadInvoice();
    } else { toast.error(r.error); }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) { toast.error('سبب الإلغاء مطلوب.'); return; }
    setIsProcessing(true);
    const r = await cancelInvoice(id, { cancelReason });
    setIsProcessing(false);
    if (r.success) {
      toast.success('تم إلغاء الفاتورة.');
      setIsCancelOpen(false); setCancelReason('');
      loadInvoice();
    } else { toast.error(r.error); }
  };

  const handleFinalize = async () => {
    if (fPaymentType !== 'cash' && !fDueDate) { toast.error('تاريخ الاستحقاق مطلوب.'); return; }
    if (fPaymentType === 'installments') {
      const n = parseInt(fTotalInstallments, 10);
      if (!Number.isInteger(n) || n < 2) { toast.error('عدد الأقساط ≥ 2.'); return; }
    }

    const paid = fPaymentType === 'cash' ? invoice.total : parseFloat(fPaidAmount) || 0;
    if (paid > invoice.total + 0.01) { toast.error('المدفوع أكبر من الإجمالي.'); return; }

    setIsProcessing(true);
    const r = await finalize(id, {
      paymentType: fPaymentType,
      dueDate: fDueDate ? new Date(fDueDate).toISOString() : undefined,
      totalInstallments: fPaymentType === 'installments' ? parseInt(fTotalInstallments, 10) : 0,
      paidAmount: paid,
      paymentMethod: paid > 0 ? fPaymentMethod : '',
    });
    setIsProcessing(false);
    if (r.success) {
      toast.success('تم اعتماد الفاتورة وتفعيل كل التأثيرات.');
      setIsFinalizeOpen(false);
      loadInvoice();
    } else { toast.error(r.error); }
  };

  const handleDraftEditSuccess = () => {
    setIsEditDraftOpen(false);
    toast.success('تم تحديث المسودة.');
    loadInvoice();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loading size="lg" text="جاري تحميل الفاتورة..." />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" icon={ArrowRight} onClick={() => navigate('/sales/invoices')}>
          عودة للفواتير
        </Button>
        <Card>
          <div className="text-center py-12">
            <AlertCircle size={48} className="text-danger-500 mx-auto mb-4" />
            <p className="text-lg font-bold text-neutral-900 mb-2">تعذّر تحميل الفاتورة</p>
            <p className="text-sm text-neutral-600 mb-4">{error || 'غير موجودة.'}</p>
            <Button variant="primary" onClick={loadInvoice}>إعادة المحاولة</Button>
          </div>
        </Card>
      </div>
    );
  }

  const isDraft = invoice.status === 'draft';
  const canPay = !isDraft && (isAdmin || isAccountant) && invoice.remainingAmount > 0 && invoice.status !== 'cancelled';
  const canCancel = (isAdmin || isAccountant) && (isDraft || invoice.paidAmount === 0) && invoice.status !== 'cancelled';
  const canEditDraft = isDraft && (isAdmin || isAccountant);
  const canFinalize = isDraft && (isAdmin || isAccountant);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" icon={ArrowRight} onClick={() => navigate('/sales/invoices')}>
            عودة
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
              <FileText size={24} className="text-primary-700" />{invoice.invoiceNumber}
            </h1>
            <p className="text-sm text-neutral-500 mt-1">{formatDate(invoice.invoiceDate)}</p>
          </div>
          <StatusBadge status={invoice.status} />
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" icon={Printer} onClick={() => setIsPrintOpen(true)}>طباعة</Button>
          {canEditDraft && (
            <Button variant="outline" icon={FileEdit} onClick={() => setIsEditDraftOpen(true)}>
              تعديل المسودة
            </Button>
          )}
          {canFinalize && (
            <Button variant="primary" icon={Send} onClick={() => setIsFinalizeOpen(true)}>
              اعتماد ودفع
            </Button>
          )}
          {canPay && (
            <Button variant="primary" icon={Banknote} onClick={() => setIsPayOpen(true)}>تسجيل دفعة</Button>
          )}
          {canCancel && (
            <Button variant="danger" icon={XCircle} onClick={() => setIsCancelOpen(true)}>إلغاء</Button>
          )}
        </div>
      </div>

      {/* Draft warning */}
      {isDraft && (
        <div className="bg-info-50 border border-info-200 rounded-lg p-3 text-sm text-info-800 flex items-start gap-2">
          <FileEdit size={18} className="flex-shrink-0 mt-0.5" />
          <span>
            هذه <strong>مسودة</strong> — لم تُخصم من المخزون ولم تُسجَّل عمولة. اضغط "اعتماد ودفع" لتفعيل التأثير.
          </span>
        </div>
      )}

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card title="الصيدلية" icon={User}>
          <p className="font-bold text-neutral-900">{invoice.pharmacy?.name}</p>
          <p className="text-sm text-neutral-600">{invoice.pharmacy?.phone}</p>
        </Card>
        <Card title="المندوب" icon={User}>
          <p className="font-bold text-neutral-900">{invoice.salesRep?.name || '—'}</p>
        </Card>
        <Card title="المخزن" icon={FileText}>
          <p className="font-bold text-neutral-900">{invoice.warehouse?.name || '—'}</p>
        </Card>
        <Card title="الدفع" icon={Calendar}>
          {isDraft ? (
            <p className="text-sm text-neutral-500">يُحدَّد عند الاعتماد.</p>
          ) : (
            <>
              <InfoRow label="نوع الدفع"
                value={PAYMENT_TYPE_LABELS_AR[invoice.paymentType] || '—'} />
              <InfoRow label="الاستحقاق"
                value={invoice.dueDate ? formatDate(invoice.dueDate) : '—'} />
            </>
          )}
        </Card>
      </div>

      {/* Items */}
      <Card title="بنود الفاتورة" noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="px-4 py-3 text-right font-bold">الصنف</th>
                <th className="px-4 py-3 text-center font-bold">الدفعة</th>
                <th className="px-4 py-3 text-center font-bold">الصلاحية</th>
                <th className="px-4 py-3 text-center font-bold">الكمية</th>
                <th className="px-4 py-3 text-center font-bold">الوحدة</th>
                <th className="px-4 py-3 text-left font-bold">السعر</th>
                <th className="px-4 py-3 text-left font-bold">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {invoice.items?.map((item, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{item.item?.tradeName || '—'}</p>
                    <p className="text-xs text-neutral-500">{item.item?.scientificName || ''}</p>
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-xs">{item.batch}</td>
                  <td className="px-4 py-3 text-center text-xs">{item.expiry ? formatDate(item.expiry) : '—'}</td>
                  <td className="px-4 py-3 text-center numeric font-medium">{item.quantity}</td>
                  <td className="px-4 py-3 text-center text-xs">{item.unit || '—'}</td>
                  <td className="px-4 py-3 text-left numeric">{formatCurrency(item.unitPrice, false)}</td>
                  <td className="px-4 py-3 text-left numeric font-bold">{formatCurrency(item.total, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Financial summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="سجل الدفعات">
          {invoice.status === 'cancelled' ? (
            <div className="text-center py-6 text-neutral-500 text-sm">الفاتورة ملغاة.</div>
          ) : isDraft ? (
            <div className="text-center py-6 text-neutral-500 text-sm">لم تُعتمد بعد.</div>
          ) : invoice.paidAmount > 0 ? (
            <div className="space-y-3">
              <InfoRow icon={Banknote} label="المبلغ المدفوع" value={formatCurrency(invoice.paidAmount)} />
              {invoice.paidAt && (
                <InfoRow icon={Calendar} label="تاريخ آخر دفعة" value={formatDate(invoice.paidAt)} />
              )}
              <InfoRow label="طريقة الدفع" value={invoice.paymentMethod || '—'} />
            </div>
          ) : (
            <div className="text-center py-6 text-neutral-500 text-sm">لا توجد دفعات بعد.</div>
          )}
        </Card>

        <Card title="الملخص المالي">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-600">المجموع الفرعي</span>
              <span className="numeric font-medium">{formatCurrency(invoice.subtotal, false)}</span>
            </div>
            {invoice.discount?.computedAmount > 0 && (
              <div className="flex justify-between text-sm text-danger-700">
                <span>الخصم {invoice.discount.type === 'percentage' ? `(${invoice.discount.value}%)` : ''}</span>
                <span className="numeric">-{formatCurrency(invoice.discount.computedAmount, false)}</span>
              </div>
            )}
            {invoice.taxAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-600">الضريبة ({invoice.taxRate}%)</span>
                <span className="numeric">{formatCurrency(invoice.taxAmount, false)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold border-t border-neutral-200 pt-2 mt-2">
              <span>الإجمالي</span>
              <span className="numeric">{formatCurrency(invoice.total)}</span>
            </div>
            {!isDraft && (
              <>
                <div className="flex justify-between text-sm text-success-700">
                  <span>المدفوع</span>
                  <span className="numeric">{formatCurrency(invoice.paidAmount, false)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-danger-700">
                  <span>المتبقي</span>
                  <span className="numeric">{formatCurrency(invoice.remainingAmount)}</span>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* ═══ Modals ═══ */}

      {/* Print */}
      {isPrintOpen && (
        <InvoicePrint
          invoice={invoice}
          company={{
            name: 'شركة توب فارما الطبية',
            subtitle: 'أدوية - مستلزمات طبية - كوزمتك',
            phone: '+249 123 456 789', email: 'info@toppharma.sd',
            address: 'الخرطوم - السودان',
            bankName: 'بنك الخرطوم', bankAccount: '1234567890',
            bankAccountName: 'شركة توب فارما الطبية',
            logoUrl: '/logo.png',
          }}
          onClose={() => setIsPrintOpen(false)}
        />
      )}

      {/* Edit draft modal */}
      <Modal isOpen={isEditDraftOpen} onClose={() => setIsEditDraftOpen(false)}
        title="تعديل المسودة" size="full" closeOnOverlay={false}>
        <InvoiceForm
          mode="editDraft"
          initialDraft={invoice}
          onSuccess={handleDraftEditSuccess}
          onCancel={() => setIsEditDraftOpen(false)}
        />
      </Modal>

      {/* Finalize modal */}
      <Modal isOpen={isFinalizeOpen} onClose={() => setIsFinalizeOpen(false)}
        title="اعتماد الفاتورة وتحديد الدفع"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsFinalizeOpen(false)} disabled={isProcessing}>إلغاء</Button>
            <Button variant="primary" onClick={handleFinalize} loading={isProcessing} icon={Send}>
              اعتماد ودفع ({formatCurrency(invoice.total)})
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="bg-info-50 border border-info-200 rounded p-3 text-xs text-info-800 flex items-start gap-2">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>عند الاعتماد: سيُخصم المخزون، وتُسجَّل العمولة، ويُحدَّث رصيد الصيدلية.</span>
          </div>

          <div>
            <label className="block mb-1.5 text-sm font-medium text-neutral-700">نوع الدفع *</label>
            <select value={fPaymentType}
              onChange={(e) => { setFPaymentType(e.target.value); if (e.target.value === 'cash') setFDueDate(''); }}
              className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm">
              <option value="cash">نقدي</option>
              <option value="credit">آجل</option>
              <option value="installments">أقساط</option>
            </select>
          </div>

          {fPaymentType !== 'cash' && (
            <Input label="تاريخ الاستحقاق" type="date" value={fDueDate}
              onChange={(e) => setFDueDate(e.target.value)} required />
          )}

          {fPaymentType === 'installments' && (
            <Input label="عدد الأقساط" type="number" min="2" max="60"
              value={fTotalInstallments} onChange={(e) => setFTotalInstallments(e.target.value)} />
          )}

          <Input
            label={fPaymentType === 'cash' ? 'المبلغ المدفوع (كامل)' : 'دفعة مقدمة'}
            type="number"
            value={fPaymentType === 'cash' ? invoice.total.toFixed(2) : fPaidAmount}
            onChange={(e) => setFPaidAmount(e.target.value)}
            disabled={fPaymentType === 'cash'}
            min="0" max={invoice.total} step="0.01"
          />

          {parseFloat(fPaidAmount) > 0 && fPaymentType !== 'cash' && (
            <div>
              <label className="block mb-1.5 text-sm font-medium text-neutral-700">طريقة الدفع</label>
              <select value={fPaymentMethod}
                onChange={(e) => setFPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm">
                <option value="cash">نقدي</option>
                <option value="bank">تحويل بنكي</option>
                <option value="check">شيك</option>
              </select>
            </div>
          )}
        </div>
      </Modal>

      {/* Register payment modal (final invoices) */}
      <Modal isOpen={isPayOpen} onClose={() => setIsPayOpen(false)}
        title="تسجيل دفعة" size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsPayOpen(false)} disabled={isProcessing}>إلغاء</Button>
            <Button variant="primary" onClick={handleRegisterPayment} loading={isProcessing}>تسجيل</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="bg-neutral-50 rounded-md p-3 text-sm flex justify-between">
            <span>المتبقي:</span>
            <span className="font-bold numeric">{formatCurrency(invoice.remainingAmount)}</span>
          </div>
          <Input label="المبلغ" type="number" value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            min="0" step="0.01" max={invoice.remainingAmount} />
          <div>
            <label className="block mb-1.5 text-sm font-medium text-neutral-700">طريقة الدفع</label>
            <select value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm">
              <option value="cash">نقدي</option>
              <option value="bank">تحويل بنكي</option>
              <option value="check">شيك</option>
            </select>
          </div>
          <div>
            <label className="block mb-1.5 text-sm font-medium text-neutral-700">ملاحظات (اختياري)</label>
            <textarea value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm"
              rows={2} />
          </div>
        </div>
      </Modal>

      {/* Cancel modal */}
      <Modal isOpen={isCancelOpen} onClose={() => setIsCancelOpen(false)}
        title="إلغاء الفاتورة" size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsCancelOpen(false)} disabled={isProcessing}>رجوع</Button>
            <Button variant="danger" onClick={handleCancel} loading={isProcessing}>تأكيد الإلغاء</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-danger-50 border border-danger-200 rounded p-3 text-sm text-danger-800">
            <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
            <p>
              {isDraft
                ? 'سيتم إلغاء المسودة نهائياً.'
                : 'سيتم إرجاع المخزون وإلغاء العمولة. لا يمكن التراجع.'}
            </p>
          </div>
          <div>
            <label className="block mb-1.5 text-sm font-medium text-neutral-700">سبب الإلغاء *</label>
            <textarea value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm"
              rows={3} placeholder="اذكر سبب الإلغاء..." required />
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default InvoiceDetailPage;