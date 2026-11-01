# Pharma System — Backend

Backend لنظام إدارة شركة أدوية سودانية (شركة + مخزن رئيسي + صيدليات).
مبني بـ **Node.js 20+**، **Express**، **MongoDB Atlas**، **Mongoose**، **JWT**.
هذا المشروع بديل حديث وبسيط لنظام `Phenom Pharma` القديم.

---

## المتطلبات

- Node.js 20 أو أحدث
- npm 10 أو أحدث
- حساب MongoDB Atlas (Free Tier يكفي)
- حساب Ethereal Email للاختبار (اختياري، للتطوير فقط)

---

## التشغيل السريع

```bash
# 1) نسخ متغيرات البيئة
cp .env.example .env
# ثم عدّل القيم في .env (خصوصاً MONGODB_URI و JWT_*_SECRET)

# 2) تثبيت الاعتماديات
npm install

# 3) تعبئة قاعدة البيانات بالبيانات الأولية
npm run seed

# 4) تشغيل وضع التطوير (nodemon)
npm run dev