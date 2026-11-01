# سجل التغييرات — Pharma System

جميع التغييرات المهمة في هذا المشروع موثقة في هذا الملف.

التنسيق مبني على [Keep a Changelog](https://keepachangelog.com/ar/1.0.0/)،
والمشروع يتبع [Semantic Versioning](https://semver.org/lang/ar/).

---

## [0.1.0] — 2026-10-14

### ✨ أُضيف

#### Backend (48 ملف)
- **الإعداد:**
  - `package.json` مع الاعتماديات والسكربتات
  - `.env.example` + `.env` (بيانات Atlas)
  - `.eslintrc.json` + `.prettierrc`
  - `README.md`

- **الإعدادات:**
  - `config/env.js` — تحميل + تحقق عبر Zod
  - `config/database.js` — اتصال MongoDB + إدارة الأحداث

- **الأدوات:**
  - `utils/logger.js` — Logger موحد
  - `utils/password.js` — bcrypt 12 rounds
  - `utils/jwt.js` — Access + Refresh + tokenVersion
  - `utils/email.js` — Nodemailer

- **Middlewares:**
  - `errorMiddleware.js` — معالجة موحّدة
  - `rateLimitMiddleware.js` — 4 Limiters
  - `authMiddleware.js` — 5 دوال
  - `rbacMiddleware.js` — فحص الصلاحيات
  - `auditLogMiddleware.js` — تسجيل العمليات
  - `validateMiddleware.js` — تحقق Zod

- **Models (23):**
  - `Role`, `User`, `AuditLog`, `Settings`, `Notification`
  - `Warehouse`, `Category`, `Customer`, `Supplier`, `Item`, `Stock`
  - `Invoice`, `DeliveryNote`, `CustomerReturn`, `SupplierReturn`
  - `PurchaseReceipt`, `CashFund`, `BankAccount`, `Check`
  - `CashTransaction`, `SalesRepTransaction`, `Commission`, `AccountingEntry`

- **Validators:**
  - `authValidator.js` — 10 Schemas

- **Controllers:**
  - `authController.js` — 7 دوال
  - `userController.js` — 7 دوال

- **Routes:**
  - `authRoutes.js` — 7 مسارات
  - `userRoutes.js` — 7 مسارات

- **Server:**
  - `server.js` — 10 أقسام + Graceful Shutdown

- **Seed:**
  - `seed.js` — 7 مراحل (idempotent)

#### Frontend (49 ملف)
- **الإعداد:**
  - `package.json`, `vite.config.js`, `tailwind.config.js`
  - `index.html` (ar + RTL)
  - `vercel.json` (SPA rewrites)

- **PWA:**
  - `vite-plugin-pwa` + Workbox
  - Manifest (ar + RTL + standalone)
  - أيقونات (192, 512, maskable)

- **Core:**
  - `main.jsx`, `App.jsx`, `index.css`
  - `axiosInstance.js` — Interceptors + Refresh
  - `AuthContext.jsx` — إدارة الجلسة
  - `ToastContext.jsx` — إشعارات

- **Hooks:**
  - `useAuth.js`, `useToast.js`, `usePermissions.js`

- **Utils:**
  - `constants.js`, `formatters.js`, `permissions.js`

- **Routes:**
  - `AppRoutes.jsx`, `ProtectedRoute.jsx`

- **Components (13):**
  - Layout: `Header.jsx`, `Sidebar.jsx`, `Layout.jsx`
  - UI: `Button.jsx`, `Input.jsx`, `Card.jsx`, `Modal.jsx`, `Tooltip.jsx`, `Pagination.jsx`, `Loading.jsx`, `Toast.jsx`, `ToastContainer.jsx`, `Table.jsx`, `ConfirmDialog.jsx`, `Can.jsx`

- **Pages (5):**
  - `Login.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`, `Dashboard.jsx`, `NotFound.jsx`

#### التوثيق
- `docs/SETUP.md` — دليل التشغيل
- `docs/DEPLOYMENT.md` — دليل النشر
- `docs/MONGODB_ATLAS.md` — دليل Atlas
- `docs/API.md` — توثيق APIs
- `docs/ARCHITECTURE.md` — المعمارية
- `docs/PHASE_0_SUMMARY.md` — ملخص المرحلة 0

#### ملفات الجذر
- `.gitignore`, `README.md`, `LICENSE`
- `.editorconfig`, `.nvmrc`, `CHANGELOG.md`

---

## 🔮 قادم

### [0.2.0] — المرحلة 1: المخزون (متوقع)
- CRUD الأصناف
- إدارة Batch + Expiry
- FEFO
- التنبيهات (انتهاء + حد أدنى)
- الجرد

### [0.3.0] — المرحلة 2: المبيعات
### [0.4.0] — المرحلة 3: المالية
### [0.5.0] — المرحلة 4: التقارير
### [0.6.0] — المرحلة 5: اللوحات + التنبيهات

---

## 📌 تنسيق الإصدارات

- **Major** (1.0.0): تغييرات كبيرة قد تكسر التوافق
- **Minor** (0.1.0): ميزات جديدة متوافقة
- **Patch** (0.0.1): إصلاحات صغيرة

---

[0.1.0]: https://github.com/toppharma/pharma-system/releases/tag/v0.1.0