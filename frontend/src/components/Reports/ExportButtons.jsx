/**
 * @file ExportButtons.jsx
 * @description
 * زرا تصدير Excel + PDF — يدعم كل المجموعات.
 */

import { useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';

import { exportFinanceReport } from '../../api/reportsAPI';
import { exportSalesReport } from '../../api/salesReportsAPI';
import { exportCustomerReport } from '../../api/customerReportsAPI';
import { exportSupplierReport } from '../../api/supplierReportsAPI';
import { exportInventoryReport } from '../../api/inventoryReportsAPI';
import downloadBlob from '../../utils/downloadBlob';

const EXPORTERS = {
  finance: exportFinanceReport,
  sales: exportSalesReport,
  customers: exportCustomerReport,
  suppliers: exportSupplierReport,
  inventory: exportInventoryReport,
};

/**
 * @param {{
 *   reportName: string,
 *   category?: 'finance'|'sales'|'customers'|'suppliers'|'inventory',
 *   params?: Object,
 *   onError?: (msg: string) => void,
 * }} props
 */
export default function ExportButtons({
  reportName,
  category = 'finance',
  params = {},
  onError,
}) {
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const doExport = async (format) => {
    const setLoading = format === 'xlsx' ? setLoadingExcel : setLoadingPdf;
    setLoading(true);
    try {
      const exporter = EXPORTERS[category] || exportFinanceReport;
      const { blob, filename } = await exporter(reportName, format, params);
      downloadBlob(blob, filename);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[export ${format}]`, err);
      const msg =
        err?.error?.message || err?.message || 'فشل التصدير. تحقق من اتصال الخادم.';
      if (onError) onError(msg);
    } finally {
      setLoading(false);
    }
  };

  const isBusy = loadingExcel || loadingPdf;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => doExport('xlsx')}
        disabled={isBusy}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
      >
        {loadingExcel ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Download size={14} />
        )}
        Excel
      </button>
      <button
        type="button"
        onClick={() => doExport('pdf')}
        disabled={isBusy}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
      >
        {loadingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
        PDF
      </button>
    </div>
  );
}