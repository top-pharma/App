/**
 * AppProviders.jsx
 *
 * تجميع كل الـ Providers في مكان واحد.
 * الترتيب مهم: من الخارج للداخل.
 *
 * ⚠️ قاعدة الترتيب:
 *   ToastProvider (الأبعد) → AuthProvider → NotificationsProvider → باقي Providers
 *
 * ✅ v10.9 (2026-11-16):
 * - إضافة SalesRepTransactionsProvider (داخل InvoicesProvider).
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
import { CustomerReturnsProvider } from './CustomerReturnsContext.jsx';

// ─── Phase 3 ───
import { CashFundsProvider } from './CashFundsContext.jsx';
import { BankAccountsProvider } from './BankAccountsContext.jsx';

// ✅ v10.9 — حركات المناديب
import { SalesRepTransactionsProvider } from './SalesRepTransactionsContext.jsx';

export const AppProviders = ({ children }) => {
  return (
    <ToastProvider>
      <AuthProvider>
        <NotificationsProvider>
          <CategoriesProvider>
            <WarehousesProvider>
              <ItemsProvider>
                <SuppliersProvider>
                  <CustomersProvider>
                    <StockProvider>
                      <InvoicesProvider>
                        <SalesRepTransactionsProvider>  {/* ✅ v10.9 */}
                          <CustomerReturnsProvider>
                            <CashFundsProvider>
                              <BankAccountsProvider>
                                {children}
                              </BankAccountsProvider>
                            </CashFundsProvider>
                          </CustomerReturnsProvider>
                        </SalesRepTransactionsProvider>
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