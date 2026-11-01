/**
 * @file AppRoutes.jsx
 * @description
 * تعريف مسارات التطبيق — Phase 4 + Phase 5.
 *
 * ⚠️ كل المسارات المحمية (بما فيها /notifications و /backup)
 *    يجب أن تكون داخل <Route element={<Layout />}>.
 */

import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import Layout from '../components/Layout/Layout.jsx';
import Loading from '../components/UI/Loading.jsx';
import ProtectedRoute, { PublicRoute } from './ProtectedRoute.jsx';
import { useAuth } from '../hooks/useAuth.js';

// ═══════════════════════════════════════════════════════════
// 1. Phase 0 — Auth
// ═══════════════════════════════════════════════════════════
const Login = lazy(() => import('../pages/Login.jsx'));
const ForgotPassword = lazy(() => import('../pages/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('../pages/ResetPassword.jsx'));
const NotFound = lazy(() => import('../pages/NotFound.jsx'));

// ═══════════════════════════════════════════════════════════
// 2. Dashboard
// ═══════════════════════════════════════════════════════════
const Dashboard = lazy(() => import('../pages/Dashboard.jsx'));

// ═══════════════════════════════════════════════════════════
// 3. Phase 1 — Inventory
// ═══════════════════════════════════════════════════════════
const Inventory = lazy(() => import('../pages/Inventory.jsx'));
const Categories = lazy(() => import('../pages/Categories.jsx'));
const Warehouses = lazy(() => import('../pages/Warehouses.jsx'));
const Items = lazy(() => import('../pages/Items.jsx'));
const Suppliers = lazy(() => import('../pages/Suppliers.jsx'));
const Customers = lazy(() => import('../pages/Customers.jsx'));
const Stock = lazy(() => import('../pages/Stock.jsx'));

// ═══════════════════════════════════════════════════════════
// 4. Phase 2 — Sales
// ═══════════════════════════════════════════════════════════
const Sales = lazy(() => import('../pages/Sales.jsx'));
const Invoices = lazy(() => import('../pages/Invoices.jsx'));
const InvoiceDetail = lazy(() => import('../pages/InvoiceDetail.jsx'));
const DeliveryNotes = lazy(() => import('../pages/DeliveryNotes.jsx'));
const CustomerReturns = lazy(() => import('../pages/CustomerReturns.jsx'));
const PurchaseReceipts = lazy(() => import('../pages/PurchaseReceipts.jsx'));
const SupplierReturns = lazy(() => import('../pages/SupplierReturns.jsx'));

// ═══════════════════════════════════════════════════════════
// 5. Phase 3 — Finance
// ═══════════════════════════════════════════════════════════
const FinancePage = lazy(() => import('../pages/FinancePage.jsx'));
const CashFundsPage = lazy(() => import('../pages/CashFundsPage.jsx'));
const BankAccountsPage = lazy(() => import('../pages/BankAccountsPage.jsx'));
const ChecksPage = lazy(() => import('../pages/ChecksPage.jsx'));
const CheckDetailPage = lazy(() => import('../pages/CheckDetailPage.jsx'));
const CashTransactionsPage = lazy(() => import('../pages/CashTransactionsPage.jsx'));
const AccountingEntriesPage = lazy(() => import('../pages/AccountingEntriesPage.jsx'));

// ═══════════════════════════════════════════════════════════
// 6. Phase 4 — Reports
// ═══════════════════════════════════════════════════════════
const ReportsPage = lazy(() => import('../pages/ReportsPage.jsx'));
const FinanceReportsPage = lazy(() => import('../pages/FinanceReportsPage.jsx'));
const SalesReportsPage = lazy(() => import('../pages/SalesReportsPage.jsx'));
const CustomerReportsPage = lazy(() => import('../pages/CustomerReportsPage.jsx'));
const SupplierReportsPage = lazy(() => import('../pages/SupplierReportsPage.jsx'));
const InventoryReportsPage = lazy(() => import('../pages/InventoryReportsPage.jsx'));

// ═══════════════════════════════════════════════════════════
// 7. Phase 5 — Notifications + Backup
// ═══════════════════════════════════════════════════════════
const NotificationsPage = lazy(() => import('../pages/NotificationsPage.jsx'));
const BackupPage = lazy(() => import('../pages/BackupPage.jsx'));
// ═══════════════════════════════════════════════════════════
// 8. Phase C — Users Management
// ═══════════════════════════════════════════════════════════
const UsersPage = lazy(() => import('../pages/UsersPage.jsx'));

// ═══════════════════════════════════════════════════════════
// 9. Phase C — Change Password (forced)
// ═══════════════════════════════════════════════════════════
const ChangePasswordPage = lazy(() => import('../pages/ChangePasswordPage.jsx'));

// ═══════════════════════════════════════════════════════════
// 10. Phase D — Settings
// ═══════════════════════════════════════════════════════════
const SettingsPage = lazy(() => import('../pages/SettingsPage.jsx'));

// ═══════════════════════════════════════════════════════════
// 8. Suspense Fallback
// ═══════════════════════════════════════════════════════════
const SuspenseFallback = () => (
  <div className="flex items-center justify-center min-h-screen bg-neutral-50">
    <Loading size="lg" text="جاري تحميل الصفحة..." />
  </div>
);

// ═══════════════════════════════════════════════════════════
// 8.5. HomeRedirect — الصفحة الرئيسية حسب الصلاحيات
// ═══════════════════════════════════════════════════════════
/**
 * الصفحة الرئيسية للمستخدم حسب صلاحياته.
 *
 * ⚠️ BUG #1 Fix: بدل إظهار Dashboard للجميع (يفشل بـ 403 للأدوار
 * التي لا تملك reports.view)، نوجّه كل مستخدم لأول صفحة مسموحة له.
 *
 * - من يملك reports.view (admin, accountant) → Dashboard
 * - من يملك stocks.view (storekeeper) → /inventory/stock
 * - من يملك invoices.view (sales_rep, pharmacy) → /sales/invoices
 * - غير ذلك → /not-found (fail-safe)
 */
function HomeRedirect() {
  const { hasPermission } = useAuth();

  if (hasPermission('reports.view')) return <Dashboard />;
  if (hasPermission('stocks.view')) return <Navigate to="/inventory/stock" replace />;
  if (hasPermission('invoices.view')) return <Navigate to="/sales/invoices" replace />;
  return <Navigate to="/not-found" replace />;
}

// ═══════════════════════════════════════════════════════════
// 9. AppRoutes
// ═══════════════════════════════════════════════════════════
function AppRoutes() {
  return (
    <Suspense fallback={<SuspenseFallback />}>
      <Routes>
        {/* ─── Public ─── */}
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
        <Route path="/reset-password/:token" element={<PublicRoute><ResetPassword /></PublicRoute>} />

        {/* ─── Phase C: Change Password (forced — بلا Layout) ─── */}
        <Route
          path="/change-password"
          element={
            <ProtectedRoute>
              <ChangePasswordPage />
            </ProtectedRoute>
          }
        />

        {/* ─── Protected + Layout ───
            كل ما بداخله يرث Sidebar + Header + ToastContainer */}
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>

          {/* ⚠️ BUG #1 Fix: HomeRedirect بدل Dashboard مباشرة */}
          <Route index element={<HomeRedirect />} />
          {/* Phase 1 — Inventory */}
          <Route path="inventory" element={<Inventory />} />
          <Route path="inventory/categories" element={<Categories />} />
          <Route path="inventory/warehouses" element={<Warehouses />} />
          <Route path="inventory/items" element={<Items />} />
          <Route path="inventory/suppliers" element={<Suppliers />} />
          <Route path="inventory/customers" element={<Customers />} />
          <Route path="inventory/stock" element={<Stock />} />

          {/* Phase 2 — Sales */}
          <Route path="sales" element={<Sales />} />
          <Route path="sales/invoices" element={<Invoices />} />
          <Route path="sales/invoices/:id" element={<InvoiceDetail />} />
          <Route path="sales/delivery-notes" element={<DeliveryNotes />} />
          <Route path="sales/customer-returns" element={<CustomerReturns />} />
          <Route path="sales/purchase-receipts" element={<PurchaseReceipts />} />
          <Route path="sales/supplier-returns" element={<SupplierReturns />} />

          {/* Phase 3 — Finance */}
          <Route path="finance" element={<FinancePage />} />
          <Route path="finance/cash-funds" element={<CashFundsPage />} />
          <Route path="finance/bank-accounts" element={<BankAccountsPage />} />
          <Route path="finance/checks" element={<ChecksPage />} />
          <Route path="finance/checks/:id" element={<CheckDetailPage />} />
          <Route path="finance/cash-transactions" element={<CashTransactionsPage />} />
          <Route path="finance/accounting-entries" element={<AccountingEntriesPage />} />

          {/* Phase 4 — Reports */}
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/finance" element={<FinanceReportsPage />} />
          <Route path="reports/sales" element={<SalesReportsPage />} />
          <Route path="reports/customers" element={<CustomerReportsPage />} />
          <Route path="reports/suppliers" element={<SupplierReportsPage />} />
          <Route path="reports/inventory" element={<InventoryReportsPage />} />

          {/* Phase 5 — Notifications + Backup */}
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="backup" element={<BackupPage />} />

          {/* Phase C — Users Management */}
          <Route
            path="users"
            element={
              <ProtectedRoute requiredPermissions={['users.view']}>
                <UsersPage />
              </ProtectedRoute>
            }
          />
          {/* Phase D — Settings */}
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* 404 */}
        <Route path="/not-found" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/not-found" replace />} />
      </Routes>
    </Suspense>
  );
}

export default AppRoutes;