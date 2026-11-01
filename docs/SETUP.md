# دليل التشغيل — Pharma System

> دليل خطوة بخطوة لتشغيل النظام محلياً على جهازك من الصفر.

---

## 1. المتطلبات الأساسية

| الأداة | الإصدار الأدنى | التحقق |
|---|---|---|
| Node.js | 20.0.0 | `node -v` |
| npm | 10.0.0 | `npm -v` |
| Git | 2.40+ | `git --version` |
| حساب MongoDB Atlas | Free Tier | [atlas.mongodb.com](https://www.mongodb.com/cloud/atlas/register) |
| حساب Ethereal Email | مجاني | [ethereal.email](https://ethereal.email/create) |

> 💡 **Ethereal** اختياري — إذا لم تُعدّه، النظام سيعمل لكنه لن يُرسل بريداً حقيقياً (سيسجّل الرسائل فقط).

---

## 2. استنساخ المستودع

```bash
git clone <repo-url> pharma-system
cd pharma-system