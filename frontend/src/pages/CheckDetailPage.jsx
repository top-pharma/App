/**
 * CheckDetailPage.jsx
 *
 * صفحة تفاصيل شيك + طباعة.
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useReactToPrint } from 'react-to-print';
import { ArrowRight, Printer } from 'lucide-react';
import checksAPI from '../api/checksAPI.js';
import Button from '../components/UI/Button.jsx';
import Loading from '../components/UI/Loading.jsx';
import CheckPrint from '../components/Finance/CheckPrint.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';

const statusLabels = {
  pending: 'معلّق',
  collected: 'محصّل',
  paid: 'مدفوع',
  bounced: 'مرتد',
  cancelled: 'ملغى',
};

const CheckDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [check, setCheck] = useState(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef();

  useEffect(() => {
    const load = async () => {
      try {
        const data = await checksAPI.getCheck(id);
        setCheck(data);
      } catch (err) {
        // Toast
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: `Check-${check?.checkNumber || 'print'}`,
  });

  if (loading) return <Loading />;
  if (!check) return <div className="p-6 text-center text-gray-500">الشيك غير موجود</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6 print:hidden">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/finance/checks')} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowRight size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">شيك رقم {check.checkNumber}</h1>
            <p className="text-gray-600 text-sm">{formatDate(check.createdAt)}</p>
          </div>
        </div>
        <Button onClick={handlePrint} variant="primary">
          <Printer size={18} className="inline ml-1" /> طباعة
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:hidden">
        <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-bold mb-4">تفاصيل الشيك</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">النوع</dt>
              <dd className="font-medium">{check.type === 'incoming' ? 'وارد' : 'صادر'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">البنك</dt>
              <dd className="font-medium">{check.bankName}</dd>
            </div>
            <div>
              <dt className="text-gray-500">{check.type === 'incoming' ? 'العميل' : 'المورد'}</dt>
              <dd className="font-medium">
                {check.type === 'incoming' ? check.customerId?.name : check.supplierId?.name}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">المبلغ</dt>
              <dd className="font-bold text-green-700 text-lg">{formatCurrency(check.amount)} SDG</dd>
            </div>
            <div>
              <dt className="text-gray-500">تاريخ الإصدار</dt>
              <dd>{formatDate(check.issueDate)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">تاريخ الاستحقاق</dt>
              <dd>{formatDate(check.dueDate)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">الحالة</dt>
              <dd className="font-medium">{statusLabels[check.status]}</dd>
            </div>
            {check.notes && (
              <div className="col-span-2">
                <dt className="text-gray-500">ملاحظات</dt>
                <dd>{check.notes}</dd>
              </div>
            )}
            {check.bounceReason && (
              <div className="col-span-2">
                <dt className="text-gray-500">سبب الارتداد</dt>
                <dd className="text-red-600">{check.bounceReason}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-bold mb-4">الخط الزمني</h2>
          <div className="space-y-3 text-sm">
            <div className="flex gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
              <div>
                <p className="font-medium">إنشاء الشيك</p>
                <p className="text-xs text-gray-500">{formatDate(check.createdAt)}</p>
              </div>
            </div>
            {check.collectedAt && (
              <div className="flex gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5" />
                <div>
                  <p className="font-medium">تحصيل</p>
                  <p className="text-xs text-gray-500">{formatDate(check.collectedAt)}</p>
                </div>
              </div>
            )}
            {check.paidAt && (
              <div className="flex gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
                <div>
                  <p className="font-medium">صرف</p>
                  <p className="text-xs text-gray-500">{formatDate(check.paidAt)}</p>
                </div>
              </div>
            )}
            {check.bouncedAt && (
              <div className="flex gap-3">
                <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5" />
                <div>
                  <p className="font-medium">ارتداد</p>
                  <p className="text-xs text-gray-500">{formatDate(check.bouncedAt)}</p>
                </div>
              </div>
            )}
            {check.cancelledAt && (
              <div className="flex gap-3">
                <div className="w-2 h-2 rounded-full bg-gray-400 mt-1.5" />
                <div>
                  <p className="font-medium">إلغاء</p>
                  <p className="text-xs text-gray-500">{formatDate(check.cancelledAt)}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* نسخة الطباعة (مخفية على الشاشة) */}
      <div className="hidden print:block">
        <CheckPrint ref={printRef} check={check} />
      </div>
    </div>
  );
};

export default CheckDetailPage;