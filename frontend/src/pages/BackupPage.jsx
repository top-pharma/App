/**
 * @file BackupPage.jsx
 * @description صفحة النسخ الاحتياطي والاستعادة (Phase 5 + 5.5) — admin فقط.
 */

import { useState, useEffect, useRef } from 'react';
import {
  Database,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle2,
  FileText,
} from 'lucide-react';

import backupAPI from '../api/backupAPI.js';
import Card from '../components/UI/Card.jsx';
import Button from '../components/UI/Button.jsx';
import Modal from '../components/UI/Modal.jsx';
import Loading from '../components/UI/Loading.jsx';
import { useToast } from '../hooks/useToast.js';

const downloadBlobSafe = async (blob, filename) => {
  try {
    const mod = await import('../utils/downloadBlob.js');
    const fn = mod.downloadBlob || mod.default;
    if (typeof fn === 'function') return fn(blob, filename);
  } catch {
    /* fallback */
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export default function BackupPage() {
  const toast = useToast();

  const [info, setInfo] = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [backups, setBackups] = useState([]);
  const [loadingBackups, setLoadingBackups] = useState(false);

  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreParsed, setRestoreParsed] = useState(null);
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);

  const fileInputRef = useRef(null);

  const loadInfo = async () => {
    setLoadingInfo(true);
    try {
      const data = await backupAPI.getBackupInfo();
      setInfo(data);
    } catch (err) {
      toast?.error?.(err?.error?.message || 'فشل تحميل معلومات النسخ.');
    } finally {
      setLoadingInfo(false);
    }
  };

  const loadBackups = async () => {
    setLoadingBackups(true);
    try {
      const data = await backupAPI.listBackups();
      setBackups(data || []);
    } catch {
      // صامت — قد لا توجد نسخ بعد
    } finally {
      setLoadingBackups(false);
    }
  };

  useEffect(() => {
    loadInfo();
    loadBackups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await backupAPI.exportBackup();
      await downloadBlobSafe(blob, filename);
      toast?.success?.('تم تصدير النسخة الاحتياطية.');
    } catch (err) {
      toast?.error?.(err?.error?.message || 'فشل التصدير.');
    } finally {
      setExporting(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreFile(file);
    setRestoreConfirm('');
    setRestoreResult(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed?._meta || parsed._meta.app !== 'Pharma System') {
        toast?.error?.('الملف ليس نسخة احتياطية من Pharma System.');
        setRestoreParsed(null);
        return;
      }
      setRestoreParsed(parsed);
    } catch {
      toast?.error?.('الملف ليس JSON صالحاً.');
      setRestoreParsed(null);
    }
  };

  const handleRestore = async () => {
    if (restoreConfirm !== 'RESTORE') {
      toast?.error?.('اكتب RESTORE بالأحرف الكبيرة للتأكيد.');
      return;
    }
    if (!restoreParsed) return;

    setRestoring(true);
    setRestoreResult(null);
    try {
      const result = await backupAPI.restoreBackup(restoreParsed);
      setRestoreResult(result);
      if (result?.success) {
        toast?.success?.(result.message || 'تمت الاستعادة بنجاح.');
        await loadInfo();
        await loadBackups();
      } else {
        toast?.warning?.(
          result?.message || 'تمت الاستعادة مع أخطاء — راجع التفاصيل.'
        );
      }
    } catch (err) {
      toast?.error?.(err?.error?.message || 'فشل الاستعادة.');
    } finally {
      setRestoring(false);
    }
  };

  const closeRestore = () => {
    if (restoring) return;
    setRestoreOpen(false);
    setRestoreFile(null);
    setRestoreParsed(null);
    setRestoreConfirm('');
    setRestoreResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <Card
        title="مركز النسخ الاحتياطي"
        subtitle="تصدير كامل لبيانات النظام / استعادة من ملف"
        icon={Database}
      >
        <div className="flex items-start gap-3 p-3 rounded-md bg-warning-50 border border-warning-200 text-warning-900 text-sm">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">تحذير</p>
            <p>
              الاستعادة تمسح البيانات الحالية نهائياً (عدا سجل التدقيق). استخدم
              الحذر الشديد، وصدّر نسخة احتياطية قبل كل استعادة.
            </p>
          </div>
        </div>
      </Card>

      {/* ── Info ── */}
      <Card
        title="حالة البيانات الحالية"
        icon={FileText}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={loadInfo}
            loading={loadingInfo}
          >
            تحديث
          </Button>
        }
      >
        {loadingInfo && !info ? (
          <Loading text="جاري التحميل..." />
        ) : info ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="إجمالي السجلات" value={info.totalDocuments} />
            <Stat label="المجموعات" value={info.collections} />
            {Object.entries(info.counts)
              .slice(0, 6)
              .map(([name, count]) => (
                <Stat key={name} label={name} value={count} />
              ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">لا توجد معلومات.</p>
        )}
      </Card>

      {/* ── Local Backups ── */}
      <Card
        title="النسخ المحفوظة تلقائياً"
        subtitle="آخر 7 نسخ يومية + 4 أسبوعية + 3 شهرية"
        icon={Database}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={loadBackups}
            loading={loadingBackups}
          >
            تحديث
          </Button>
        }
      >
        {loadingBackups && backups.length === 0 ? (
          <Loading text="جاري التحميل..." />
        ) : backups.length === 0 ? (
          <p className="text-sm text-neutral-500">
            لا توجد نسخ بعد — ستظهر تلقائياً كل ليلة 02:00 (بعد تفعيل cron).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="px-3 py-2 text-right font-bold text-neutral-700">
                    الملف
                  </th>
                  <th className="px-3 py-2 text-center font-bold text-neutral-700">
                    الحجم
                  </th>
                  <th className="px-3 py-2 text-center font-bold text-neutral-700">
                    التاريخ
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {backups.map((b) => (
                  <tr key={b.filename} className="hover:bg-neutral-50">
                    <td className="px-3 py-2 font-mono text-xs" dir="ltr">
                      {b.filename}
                    </td>
                    <td className="px-3 py-2 text-center numeric">
                      {(b.size / 1024).toFixed(1)} KB
                    </td>
                    <td className="px-3 py-2 text-center text-xs">
                      {new Date(b.createdAt).toLocaleString('en-GB')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Export ── */}
      <Card title="تصدير نسخة احتياطية" icon={Download}>
        <p className="text-sm text-neutral-600 mb-4">
          يُنشئ ملف JSON يحتوي كل بيانات النظام (بما فيها كلمات المرور
          المشفّرة، وسجل التدقيق لا يُشمَل).
        </p>
        <Button
          icon={Download}
          onClick={handleExport}
          loading={exporting}
          disabled={exporting}
        >
          {exporting ? 'جاري التصدير...' : 'تصدير نسخة احتياطية'}
        </Button>
      </Card>

      {/* ── Restore ── */}
      <Card title="استعادة من ملف" icon={Upload}>
        <p className="text-sm text-neutral-600 mb-4">
          ارفع ملف JSON أنشأته هذه الصفحة سابقاً. الاستعادة تمسح البيانات
          الحالية أولاً — تأكد من عمل نسخة احتياطية قبل المتابعة.
        </p>
        <Button
          variant="danger"
          icon={Upload}
          onClick={() => setRestoreOpen(true)}
        >
          اختيار ملف واستعادة
        </Button>
      </Card>

      {/* ── Modal: Restore ── */}
      <Modal
        isOpen={restoreOpen}
        onClose={closeRestore}
        title="استعادة نسخة احتياطية"
        size="lg"
        closeOnOverlay={!restoring}
        footer={
          <>
            <Button variant="ghost" onClick={closeRestore} disabled={restoring}>
              إلغاء
            </Button>
            <Button
              variant="danger"
              onClick={handleRestore}
              loading={restoring}
              disabled={
                !restoreParsed || restoreConfirm !== 'RESTORE' || restoring
              }
            >
              تنفيذ الاستعادة
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-3 rounded-md bg-danger-50 border border-danger-200 text-danger-900 text-sm flex items-start gap-2">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">إجراء تدميري</p>
              <p>
                كل البيانات الحالية (عدا سجل التدقيق) ستُمسَح وتُستبدَل
                بالبيانات من الملف. لا يمكن التراجع إلا باستعادة النسخة
                الاحتياطية الحالية.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              ملف النسخة الاحتياطية (.json)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileChange}
              disabled={restoring}
              className="block w-full text-sm text-neutral-700 file:mr-2 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
            />
            {restoreFile && restoreParsed && (
              <div className="mt-2 text-xs text-neutral-600">
                <p>
                  <span className="font-medium">الملف:</span> {restoreFile.name}{' '}
                  ({(restoreFile.size / 1024).toFixed(1)} KB)
                </p>
                <p>
                  <span className="font-medium">صُدِّر في:</span>{' '}
                  {restoreParsed._meta?.exportedAt
                    ? new Date(restoreParsed._meta.exportedAt).toLocaleString(
                        'en-GB'
                      )
                    : '—'}
                </p>
                <p>
                  <span className="font-medium">بواسطة:</span>{' '}
                  {restoreParsed._meta?.exportedBy || '—'}
                </p>
              </div>
            )}
          </div>

          {restoreParsed && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                للتأكيد، اكتب{' '}
                <code className="font-mono bg-neutral-100 px-1">RESTORE</code>
              </label>
              <input
                type="text"
                value={restoreConfirm}
                onChange={(e) => setRestoreConfirm(e.target.value)}
                placeholder="RESTORE"
                disabled={restoring}
                className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-danger-200"
              />
            </div>
          )}

          {restoreResult && (
            <div
              className={`p-3 rounded-md border text-sm ${
                restoreResult.success
                  ? 'bg-success-50 border-success-200 text-success-900'
                  : 'bg-warning-50 border-warning-200 text-warning-900'
              }`}
            >
              <div className="flex items-start gap-2">
                {restoreResult.success ? (
                  <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-bold">{restoreResult.message}</p>
                  <p className="text-xs mt-1">
                    إدراج: {restoreResult.data?.totals?.inserted ?? 0} — حذف:{' '}
                    {restoreResult.data?.totals?.deleted ?? 0} — أخطاء:{' '}
                    {restoreResult.data?.totals?.errors ?? 0}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

/* ── Stat mini-component ── */
function Stat({ label, value }) {
  return (
    <div className="p-3 rounded-md bg-neutral-50 border border-neutral-200">
      <p className="text-xs text-neutral-500 truncate">{label}</p>
      <p className="text-xl font-bold text-neutral-900 numeric">
        {typeof value === 'number' ? value.toLocaleString('en-US') : value}
      </p>
    </div>
  );
}