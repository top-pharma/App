# Pharma System — نظام إدارة شركة أدوية سودانية

> نظام ويب واحد (PWA) لإدارة شركة أدوية: **المخزون + المبيعات + المندوبين + الموردين + الخزينة + التقارير**.
> بديل حديث وبسيط لنظام `Phenom Pharma` القديم.
> **اللغة:** عربي فقط (RTL). **العملة:** الجنيه السوداني (SDG). **التقويم:** ميلادي.

---

## 🎯 نظرة عامة

النظام يخدم ثلاث جهات:
- **الشركة** (المالك): كل التقارير والصلاحيات.
- **المخزن الرئيسي**: استلام البضاعة من الموردين وصرفها للصيدليات.
- **الصيدليات**: العملاء الدائمون (كل من يشتري من الشركة).

> ⚠️ النظام **لا يدير البيع داخل الصيدلية**. الصيدلية تبيع كما تشاء خارج النطاق.

---

## 👥 الأدوار (5)

| الدور | الوصف |
|---|---|
| **مدير (Admin)** | كل الصلاحيات + إنشاء المستخدمين |
| **أمين مخزن (Storekeeper)** | المخزون فقط |
| **محاسب (Accountant)** | المالية فقط |
| **مندوب (Sales Rep)** | صيدلياته فقط (عمولات + مصروفات + سلف) |
| **صيدلية (Pharmacy)** | عرض فقط |

---

## 🏗️ البنية التقنية

### Frontend
- React 18 + Vite
- JavaScript ES2024 (بلا TypeScript)
- Context API + Axios (بلا Redux)
- React Router v6
- Tailwind CSS + مكونات UI مخصصة
- React Hook Form + Zod
- Recharts + Lucide React
- PWA (vite-plugin-pwa + Workbox)
- IndexedDB (idb)

### Backend
- Node.js 20+
- Express.js
- JavaScript ES2024
- MongoDB Atlas + Mongoose
- JWT (access + refresh) + bcrypt (12 rounds)
- Zod للتحقق
- Nodemailer (Ethereal في التطوير)
- node-cron للمهام المجدولة

### DevOps
- Frontend: Vercel
- Backend: Render / Railway
- Database: MongoDB Atlas (Free Tier)
- CI/CD: GitHub Actions

---

## 📁 بنية المستودع
