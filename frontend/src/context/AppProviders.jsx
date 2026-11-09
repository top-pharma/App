/**
 * AppProviders.jsx
 *
 * تجميع كل الـ Providers في مكان واحد.
 * الترتيب مهم: من الخارج للداخل.
 *
 * ⚠️ قاعدة الترتيب:
 *   ToastProvider (الأبعد) → AuthProvider → NotificationsProvider → باقي Providers
 *
 *   - AuthProvider يحتاج useToast ✓ (ToastProvider خارجه)
 *   - NotificationsProvider يحتاج useAuth + useToast ✓ (كلاهما خارجه)
 *   - باقي الـ Providers تحتاج Auth + Toast + Notifications ✓
 *
 * ✅ 🅱 (2026-11-08):
 * - حُذف DeliveryNotesProvider.
 *
 * ✅ 🅲 (2026-11-08):
 * - حُذف ChecksProvider (Check أُلغي).
 */

// ─── Phase 0 ───
import { ToastProvider } from './ToastContext.jsx';
import { AuthProvider } from './AuthContext.jsx';

// ─── Phase 5 — يجب أن يكون قبل باقي Providers ───
import { NotificationsProvider } from './NotificationsContext.jsx';

// ─── Phase 1 ───
import { CategoriesProvider } from './CategoriesContext.jsx';
import { WarehousesProvider } from './WarehousesContext.jsx';
import { ItemsProvider } from './ItemsContext.jsx';
import { SuppliersProvider } from './SuppliersContext.jsx';
import { CustomersProvider } from './CustomersContext.jsx';
import { StockProvider } from './StockContext.jsx';

// ─── Phase 2 ───
import { InvoicesProvider } from './InvoicesContext.jsx';
// ⚠️ 🅱: حُذف import DeliveryNotesProvider
import { CustomerReturnsProvider } from './CustomerReturnsContext.jsx';

// ─── Phase 3 ───
import { CashFundsProvider } from './CashFundsContext.jsx';
import { BankAccountsProvider } from './BankAccountsContext.jsx';
// ⚠️ 🅲: حُذف import ChecksProvider

export const AppProviders = ({ children }) => {
  return (
    <ToastProvider>
      <AuthProvider>
        {/* ✅ Phase 5 — داخل Auth + Toast */}
        <NotificationsProvider>
          <CategoriesProvider>
            <WarehousesProvider>
              <ItemsProvider>
                <SuppliersProvider>
                  <CustomersProvider>
                    <StockProvider>
                      <InvoicesProvider>
                        {/* ⚠️ 🅱: حُذف <DeliveryNotesProvider> */}
                        <CustomerReturnsProvider>
                          {/* ── Phase 3 Providers ── */}
                          <CashFundsProvider>
                            <BankAccountsProvider>
                              {/* ⚠️ 🅲: حُذف <ChecksProvider> */}
                              {children}
                            </BankAccountsProvider>
                          </CashFundsProvider>
                        </CustomerReturnsProvider>
                      </InvoicesProvider>
                    </StockProvider>
                  </CustomersProvider>
                </SuppliersProvider>
              </ItemsProvider>
            </WarehousesProvider>
          </CategoriesProvider>
        </NotificationsProvider>
      </AuthProvider>
    </ToastProvider>
  );
};

export default AppProviders;