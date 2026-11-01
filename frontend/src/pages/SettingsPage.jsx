/**
 * @file SettingsPage.jsx
 * @description صفحة إعدادات النظام (Phase D).
 *
 * - 6 بطاقات (شركة، مبيعات، مخزون، مالية، أمان، طباعة).
 * - كل بطاقة لها زر "حفظ" مستقل (PATCH جزئي).
 * - قراءة فقط لمن لا يملك settings.update.
 * - رابط سريع لصفحة النسخ الاحتياطي (/backup).
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  TrendingUp,
  Package,
  Wallet,
  Shield,
  Printer,
  Database,
  RefreshCw,
  Save,
} from 'lucide-react';

import Card from '../components/UI/Card.jsx';
import Button from '../components/UI/Button.jsx';
import Input from '../components/UI/Input.jsx';
import Select from '../components/UI/Select.jsx';
import Loading from '../components/UI/Loading.jsx';

import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';
import * as settingsAPI from '../api/settingsAPI.js';

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

/**
 * Checkbox موحّد (لا يوجد مكوّن Checkbox في UI).
 */
function Checkbox({ label, checked, onChange, disabled }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="w-4 h-4 text-primary-800 border-neutral-300 rounded focus:ring-primary-500 disabled:opacity-50"
      />
      <span className="text-sm text-neutral-700">{label}</span>
    </label>
  );
}

// ═══════════════════════════════════════════════
// الصفحة
// ═══════════════════════════════════════════════

export default function SettingsPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const canView = hasPermission('settings.view');
  const canEdit = hasPermission('settings.update');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [settings, setSettings] = useState(null);

  // ═══════════════════════════════════════════
  // تحميل
  // ═══════════════════════════════════════════
  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const data = await settingsAPI.getSettings();
        setSettings(data);
      } catch (err) {
        toast.error(err?.error?.message || 'فشل تحميل الإعدادات');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  // ═══════════════════════════════════════════
  // تحديث محلي (dot-path)
  // ═══════════════════════════════════════════
  const setField = (section, key, value) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const sectionData = { ...(prev[section] || {}) };
      if (section === 'sales' && key === 'prefixes.invoice') {
        // معالجة خاصة للبادئات (nested أعمق)
        sectionData.prefixes = {
          ...(sectionData.prefixes || {}),
          invoice: value,
        };
      } else {
        sectionData[key] = value;
      }
      return { ...prev, [section]: sectionData };
    });
  };

  const setNested = (section, subKey, key, value) => {
    setSettings((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [section]: {
          ...(prev[section] || {}),
          [subKey]: {
            ...(prev[section]?.[subKey] || {}),
            [key]: value,
          },
        },
      };
    });
  };

  // ═══════════════════════════════════════════
  // حفظ قسم
  // ═══════════════════════════════════════════
  const handleSave = async (section) => {
    if (!canEdit) {
      toast.error('لا تملك صلاحية تعديل الإعدادات.');
      return;
    }

    setSaving((s) => ({ ...s, [section]: true }));
    try {
      const payload = { [section]: settings[section] };
      const updated = await settingsAPI.updateSettings(payload);
      setSettings(updated);
      toast.success('تم حفظ الإعدادات.');
    } catch (err) {
      toast.error(err?.error?.message || 'فشل حفظ الإعدادات');
    } finally {
      setSaving((s) => ({ ...s, [section]: false }));
    }
  };

  const handleReload = async () => {
    setLoading(true);
    try {
      const data = await settingsAPI.getSettings();
      setSettings(data);
      toast.success('تم تحديث البيانات.');
    } catch (err) {
      toast.error(err?.error?.message || 'فشل التحديث');
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════
  // Guards
  // ═══════════════════════════════════════════
  if (!canView) {
    return (
      <Card>
        <div className="text-center py-8">
          <p className="text-neutral-600">لا تملك صلاحية عرض الإعدادات.</p>
        </div>
      </Card>
    );
  }

  if (loading) {
    return <Loading fullScreen text="جارٍ تحميل الإعدادات..." />;
  }

  if (!settings) {
    return (
      <Card>
        <div className="text-center py-8 text-neutral-600">
          لا توجد إعدادات مهيأة. شغّل Seed أولاً.
        </div>
      </Card>
    );
  }

  const saveBtn = (section) => (
    <Button
      icon={Save}
      variant="primary"
      size="sm"
      onClick={() => handleSave(section)}
      loading={saving[section]}
      disabled={!canEdit}
    >
      حفظ
    </Button>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">إعدادات النظام</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {canEdit
              ? 'يمكنك تعديل الإعدادات. كل بطاقة تُحفظ بشكل مستقل.'
              : 'وضع القراءة فقط (لا تملك صلاحية التعديل).'}
          </p>
        </div>
        <Button variant="secondary" icon={RefreshCw} onClick={handleReload}>
          تحديث
        </Button>
      </div>

      {/* 1. الشركة */}
      <Card title="بيانات الشركة" icon={Building2} actions={saveBtn('company')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="اسم الشركة (عربي)"
            value={settings.company?.name || ''}
            onChange={(e) => setField('company', 'name', e.target.value)}
            disabled={!canEdit}
          />
          <Input
            label="Company Name (English)"
            value={settings.company?.nameEn || ''}
            onChange={(e) => setField('company', 'nameEn', e.target.value)}
            disabled={!canEdit}
            dir="ltr"
          />
          <Input
            label="الهاتف"
            value={settings.company?.phone || ''}
            onChange={(e) => setField('company', 'phone', e.target.value)}
            disabled={!canEdit}
            dir="ltr"
          />
          <Input
            label="البريد الإلكتروني"
            type="email"
            value={settings.company?.email || ''}
            onChange={(e) => setField('company', 'email', e.target.value)}
            disabled={!canEdit}
            dir="ltr"
          />
          <Input
            label="العنوان"
            value={settings.company?.address || ''}
            onChange={(e) => setField('company', 'address', e.target.value)}
            disabled={!canEdit}
          />
          <Input
            label="الرقم الضريبي"
            value={settings.company?.taxNumber || ''}
            onChange={(e) => setField('company', 'taxNumber', e.target.value)}
            disabled={!canEdit}
            dir="ltr"
          />
          <Input
            label="السجل التجاري"
            value={settings.company?.registrationNumber || ''}
            onChange={(e) =>
              setField('company', 'registrationNumber', e.target.value)
            }
            disabled={!canEdit}
            dir="ltr"
          />
        </div>
      </Card>

      {/* 2. المبيعات */}
      <Card title="إعدادات المبيعات والتسعير" icon={TrendingUp} actions={saveBtn('sales')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="الحد الأدنى للهامش (%)"
            type="number"
            min="0"
            max="100"
            value={settings.sales?.minMarginPercent ?? 10}
            onChange={(e) =>
              setField('sales', 'minMarginPercent', Number(e.target.value))
            }
            disabled={!canEdit}
            help="منع البيع بأقل من هذه النسبة"
          />
          <Input
            label="أقصى خصم مسموح (%)"
            type="number"
            min="0"
            max="100"
            value={settings.sales?.maxDiscountPercent ?? 15}
            onChange={(e) =>
              setField('sales', 'maxDiscountPercent', Number(e.target.value))
            }
            disabled={!canEdit}
          />
          <Input
            label="مهلة الإرجاع (أيام)"
            type="number"
            min="0"
            max="90"
            value={settings.sales?.returnGracePeriodDays ?? 7}
            onChange={(e) =>
              setField('sales', 'returnGracePeriodDays', Number(e.target.value))
            }
            disabled={!canEdit}
          />
          <Input
            label="شروط الدفع الافتراضية (أيام)"
            type="number"
            min="0"
            max="365"
            value={settings.sales?.defaultPaymentTerms ?? 30}
            onChange={(e) =>
              setField('sales', 'defaultPaymentTerms', Number(e.target.value))
            }
            disabled={!canEdit}
          />
          <Input
            label="عتبة 'قاربة الانتهاء' (أيام)"
            type="number"
            min="1"
            max="365"
            value={settings.sales?.nearExpiryThresholdDays ?? 30}
            onChange={(e) =>
              setField('sales', 'nearExpiryThresholdDays', Number(e.target.value))
            }
            disabled={!canEdit}
          />
          <Input
            label="أقصى خصم للدفعات القاربة للانتهاء (%)"
            type="number"
            min="0"
            max="100"
            value={settings.sales?.nearExpiryMaxDiscountPercent ?? 30}
            onChange={(e) =>
              setField(
                'sales',
                'nearExpiryMaxDiscountPercent',
                Number(e.target.value)
              )
            }
            disabled={!canEdit}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 pt-4 border-t border-neutral-200">
          <Checkbox
            label="السماح بتجاوز حدود الأسعار (بصلاحية)"
            checked={settings.sales?.allowPriceOverrides}
            onChange={(v) => setField('sales', 'allowPriceOverrides', v)}
            disabled={!canEdit}
          />
          <Checkbox
            label="السماح بمخزون سالب"
            checked={settings.sales?.allowNegativeStock}
            onChange={(v) => setField('sales', 'allowNegativeStock', v)}
            disabled={!canEdit}
          />
        </div>
      </Card>

      {/* 3. المخزون */}
      <Card title="إعدادات المخزون" icon={Package} actions={saveBtn('inventory')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="عتبة تحذير قرب الانتهاء (أيام)"
            type="number"
            min="1"
            max="365"
            value={settings.inventory?.expiryWarningDays ?? 90}
            onChange={(e) =>
              setField('inventory', 'expiryWarningDays', Number(e.target.value))
            }
            disabled={!canEdit}
          />
          <div className="flex items-end">
            <Checkbox
              label="تفعيل تحذيرات إعادة الطلب"
              checked={settings.inventory?.reorderWarningEnabled}
              onChange={(v) => setField('inventory', 'reorderWarningEnabled', v)}
              disabled={!canEdit}
            />
          </div>
        </div>
      </Card>

      {/* 4. المالية */}
      <Card title="إعدادات المالية" icon={Wallet} actions={saveBtn('finance')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="تذكير الشيكات قبل (أيام)"
            type="number"
            min="0"
            max="30"
            value={settings.finance?.checkReminderDays ?? 3}
            onChange={(e) =>
              setField('finance', 'checkReminderDays', Number(e.target.value))
            }
            disabled={!canEdit}
          />
          <Input
            label="تذكير الفواتير قبل (أيام)"
            type="number"
            min="0"
            max="30"
            value={settings.finance?.invoiceReminderDays ?? 3}
            onChange={(e) =>
              setField('finance', 'invoiceReminderDays', Number(e.target.value))
            }
            disabled={!canEdit}
          />
        </div>
        <div className="mt-4 pt-4 border-t border-neutral-200">
          <Checkbox
            label="تفعيل التذكيرات المالية"
            checked={settings.finance?.remindersEnabled}
            onChange={(v) => setField('finance', 'remindersEnabled', v)}
            disabled={!canEdit}
          />
        </div>
      </Card>

      {/* 5. الأمان */}
      <Card title="إعدادات الأمان" icon={Shield} actions={saveBtn('security')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="مدة الجلسة (ساعات)"
            type="number"
            min="1"
            max="72"
            value={settings.security?.sessionHours ?? 8}
            onChange={(e) =>
              setField('security', 'sessionHours', Number(e.target.value))
            }
            disabled={!canEdit}
          />
          <Input
            label="مهلة الخمول (دقائق)"
            type="number"
            min="5"
            max="240"
            value={settings.security?.idleTimeoutMinutes ?? 30}
            onChange={(e) =>
              setField('security', 'idleTimeoutMinutes', Number(e.target.value))
            }
            disabled={!canEdit}
            help="بعدها يُسجَّل الخروج تلقائياً (يتطلب تحديث الصفحة)"
          />
          <Input
            label="أقصى محاولات دخول فاشلة"
            type="number"
            min="3"
            max="20"
            value={settings.security?.maxFailedLogins ?? 5}
            onChange={(e) =>
              setField('security', 'maxFailedLogins', Number(e.target.value))
            }
            disabled={!canEdit}
          />
          <Input
            label="مدة القفل (دقائق)"
            type="number"
            min="1"
            max="1440"
            value={settings.security?.lockDurationMinutes ?? 15}
            onChange={(e) =>
              setField('security', 'lockDurationMinutes', Number(e.target.value))
            }
            disabled={!canEdit}
          />
          <Input
            label="الحد الأدنى لطول كلمة المرور"
            type="number"
            min="6"
            max="32"
            value={settings.security?.passwordMinLength ?? 8}
            onChange={(e) =>
              setField('security', 'passwordMinLength', Number(e.target.value))
            }
            disabled={!canEdit}
            help="يتطلب تحديث Backend فعلياً (لاحقاً)"
          />
        </div>
      </Card>

      {/* 6. الطباعة */}
      <Card title="إعدادات الطباعة" icon={Printer} actions={saveBtn('print')}>
        <div className="space-y-4">
          <Input
            label="ترويسة الفاتورة"
            value={settings.print?.invoiceHeader || ''}
            onChange={(e) => setField('print', 'invoiceHeader', e.target.value)}
            disabled={!canEdit}
          />
          <Input
            label="تذييل الفاتورة"
            value={settings.print?.invoiceFooter || ''}
            onChange={(e) => setField('print', 'invoiceFooter', e.target.value)}
            disabled={!canEdit}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <Input
              label="شفافية العلامة المائية (0–0.5)"
              type="number"
              min="0"
              max="0.5"
              step="0.01"
              value={settings.print?.watermarkOpacity ?? 0.08}
              onChange={(e) =>
                setField('print', 'watermarkOpacity', Number(e.target.value))
              }
              disabled={!canEdit}
            />
            <Checkbox
              label="إظهار شعار الشركة كعلامة مائية"
              checked={settings.print?.showLogoWatermark}
              onChange={(v) => setField('print', 'showLogoWatermark', v)}
              disabled={!canEdit}
            />
          </div>
        </div>
      </Card>

      {/* 7. Backup */}
      <Card
        title="النسخ الاحتياطي"
        subtitle="النسخ التلقائي اليومي 02:00 + اليدوي من صفحة Backup"
        icon={Database}
      >
        <Button
          variant="primary"
          onClick={() => navigate('/backup')}
          icon={Database}
        >
          الانتقال إلى صفحة النسخ الاحتياطي
        </Button>
      </Card>
    </div>
  );
}