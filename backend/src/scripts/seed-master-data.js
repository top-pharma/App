/**
 * @file seed-master-data.js
 * @description
 * زرع البيانات الأساسية (Master Data) — Phase 1 + Phase 2.
 *
 * ⚠️ تحديث 2026-10-19:
 * - إصلاح تعارض الفهرس unique_active_main_warehouse (لا مخازن إضافية).
 * - إصلاح ReferenceError في seedStock (mainWarehouse مباشرة).
 * - توزيع 8 صيدليات على 4 مناديب (2 لكل مندوب).
 * - عمولة لكل مندوب (بدل مندوب واحد).
 *
 * ما يُنشئ:
 *   1. التحقق من المخزن الرئيسي (seed.js أنشأه)
 *   2. 4 موردين
 *   3. 20 صنفاً دوائياً واقعياً
 *   4. 8 صيدليات موزّعة على 4 مناديب
 *   5. ~80 دفعة مخزون (FEFO: عادي / قارب / منتهي / ناقص)
 *   6. إعدادات عمولة لكل مندوب
 *
 * Idempotent: آمن للتشغيل المتكرر.
 *
 * ⚠️ متطلبات سابقة:
 *   1. npm run seed         (roles, admin, warehouse main, settings)
 *   2. npm run seed:test    (المستخدمون — بما فيهم 4 مناديب)
 *
 * التشغيل:
 *   node src/scripts/seed-master-data.js
 *   أو: npm run seed:master
 */

import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';

import { User, USER_ROLES } from '../models/User.js';
import { Category } from '../models/Category.js';
import { Warehouse } from '../models/Warehouse.js';
import { Item, ITEM_CATEGORIES } from '../models/Item.js';
import { Customer } from '../models/Customer.js';
import { Stock } from '../models/Stock.js';
import { Commission } from '../models/Commission.js';
import { Supplier } from '../models/Supplier.js';

// ============================================================
// 1) ثوابت: موردون
// ============================================================

const SUPPLIERS = [
  {
    name: 'شركة الجزيرة للأدوية',
    code: 'SUP-GAZIRA',
    contactPerson: 'أحمد محمد',
    phone: '+249123000001',
    email: 'gazira@supplier.sd',
    address: 'الخرطوم - السوق العربي',
    city: 'الخرطوم',
    paymentTerms: 30,
    isActive: true,
  },
  {
    name: 'شركة النيل الأزرق للاستيراد',
    code: 'SUP-NILE',
    contactPerson: 'سارة عثمان',
    phone: '+249123000002',
    email: 'nile@supplier.sd',
    address: 'الخرطوم - شارع القصر',
    city: 'الخرطوم',
    paymentTerms: 45,
    isActive: true,
  },
  {
    name: 'دارفور فارما',
    code: 'SUP-DARFUR',
    contactPerson: 'خالد إبراهيم',
    phone: '+249123000003',
    email: 'darfur@supplier.sd',
    address: 'الفاشر - السوق الكبير',
    city: 'الفاشر',
    paymentTerms: 30,
    isActive: true,
  },
  {
    name: 'الخرطوم الطبية للتوريدات',
    code: 'SUP-KMS',
    contactPerson: 'منى عبدالله',
    phone: '+249123000004',
    email: 'kms@supplier.sd',
    address: 'الخرطوم - الرياض',
    city: 'الخرطوم',
    paymentTerms: 60,
    isActive: true,
  },
];

// ============================================================
// 2) ثوابت: أصناف (20 صنفاً واقعياً)
// ============================================================

const ITEMS = [
  // ─── مسكنات ───
  {
    scientificName: 'Paracetamol 500mg',
    tradeName: 'Panadol 500',
    tradeNameEn: 'Panadol',
    manufacturer: 'GSK',
    originCountry: 'UK',
    category: ITEM_CATEGORIES.MEDICINE,
    dosageForm: 'أقراص',
    strength: '500mg',
    baseCost: 10,
    basePrice: 18,
    reorderLevel: 200,
  },
  {
    scientificName: 'Ibuprofen 400mg',
    tradeName: 'Brufen 400',
    tradeNameEn: 'Brufen',
    manufacturer: 'Abbott',
    originCountry: 'Germany',
    category: ITEM_CATEGORIES.MEDICINE,
    dosageForm: 'أقراص',
    strength: '400mg',
    baseCost: 15,
    basePrice: 25,
    reorderLevel: 150,
  },
  {
    scientificName: 'Aspirin 100mg',
    tradeName: 'Aspocid 100',
    tradeNameEn: 'Aspocid',
    manufacturer: 'Amipharma',
    originCountry: 'Sudan',
    category: ITEM_CATEGORIES.MEDICINE,
    dosageForm: 'أقراص',
    strength: '100mg',
    baseCost: 8,
    basePrice: 15,
    reorderLevel: 300,
  },
  // ─── مضادات حيوية ───
  {
    scientificName: 'Amoxicillin 500mg',
    tradeName: 'Amoxil 500',
    tradeNameEn: 'Amoxil',
    manufacturer: 'GSK',
    originCountry: 'UK',
    category: ITEM_CATEGORIES.MEDICINE,
    dosageForm: 'كبسولات',
    strength: '500mg',
    baseCost: 35,
    basePrice: 60,
    reorderLevel: 100,
  },
  {
    scientificName: 'Azithromycin 500mg',
    tradeName: 'Zithromax 500',
    tradeNameEn: 'Zithromax',
    manufacturer: 'Pfizer',
    originCountry: 'USA',
    category: ITEM_CATEGORIES.MEDICINE,
    dosageForm: 'أقراص',
    strength: '500mg',
    baseCost: 80,
    basePrice: 130,
    reorderLevel: 50,
  },
  {
    scientificName: 'Ceftriaxone 1g',
    tradeName: 'Rocephin 1g',
    tradeNameEn: 'Rocephin',
    manufacturer: 'Roche',
    originCountry: 'Switzerland',
    category: ITEM_CATEGORIES.MEDICINE,
    dosageForm: 'فيال',
    strength: '1g',
    baseCost: 220,
    basePrice: 340,
    reorderLevel: 40,
  },
  // ─── السكري ───
  {
    scientificName: 'Metformin 500mg',
    tradeName: 'Glucophage 500',
    tradeNameEn: 'Glucophage',
    manufacturer: 'Merck',
    originCountry: 'Germany',
    category: ITEM_CATEGORIES.MEDICINE,
    dosageForm: 'أقراص',
    strength: '500mg',
    baseCost: 12,
    basePrice: 20,
    reorderLevel: 250,
  },
  {
    scientificName: 'Insulin Aspart 100IU',
    tradeName: 'NovoRapid',
    tradeNameEn: 'NovoRapid',
    manufacturer: 'Novo Nordisk',
    originCountry: 'Denmark',
    category: ITEM_CATEGORIES.MEDICINE,
    dosageForm: 'قلم',
    strength: '100IU/ml',
    baseCost: 1800,
    basePrice: 2400,
    reorderLevel: 20,
  },
  // ─── القلب والضغط ───
  {
    scientificName: 'Atorvastatin 20mg',
    tradeName: 'Lipitor 20',
    tradeNameEn: 'Lipitor',
    manufacturer: 'Pfizer',
    originCountry: 'USA',
    category: ITEM_CATEGORIES.MEDICINE,
    dosageForm: 'أقراص',
    strength: '20mg',
    baseCost: 45,
    basePrice: 75,
    reorderLevel: 80,
  },
  {
    scientificName: 'Losartan 50mg',
    tradeName: 'Cozaar 50',
    tradeNameEn: 'Cozaar',
    manufacturer: 'MSD',
    originCountry: 'USA',
    category: ITEM_CATEGORIES.MEDICINE,
    dosageForm: 'أقراص',
    strength: '50mg',
    baseCost: 25,
    basePrice: 45,
    reorderLevel: 120,
  },
  {
    scientificName: 'Amlodipine 5mg',
    tradeName: 'Norvasc 5',
    tradeNameEn: 'Norvasc',
    manufacturer: 'Pfizer',
    originCountry: 'USA',
    category: ITEM_CATEGORIES.MEDICINE,
    dosageForm: 'أقراص',
    strength: '5mg',
    baseCost: 20,
    basePrice: 35,
    reorderLevel: 150,
  },
  {
    scientificName: 'Warfarin 5mg',
    tradeName: 'Coumadin 5',
    tradeNameEn: 'Coumadin',
    manufacturer: 'BMS',
    originCountry: 'USA',
    category: ITEM_CATEGORIES.MEDICINE,
    dosageForm: 'أقراص',
    strength: '5mg',
    baseCost: 30,
    basePrice: 50,
    reorderLevel: 60,
  },
  // ─── المعدة ───
  {
    scientificName: 'Omeprazole 20mg',
    tradeName: 'Losec 20',
    tradeNameEn: 'Losec',
    manufacturer: 'AstraZeneca',
    originCountry: 'Sweden',
    category: ITEM_CATEGORIES.MEDICINE,
    dosageForm: 'كبسولات',
    strength: '20mg',
    baseCost: 28,
    basePrice: 48,
    reorderLevel: 100,
  },
  // ─── الجهاز التنفسي ───
  {
    scientificName: 'Salbutamol 100mcg',
    tradeName: 'Ventolin Inhaler',
    tradeNameEn: 'Ventolin',
    manufacturer: 'GSK',
    originCountry: 'UK',
    category: ITEM_CATEGORIES.MEDICINE,
    dosageForm: 'بخاخ',
    strength: '100mcg',
    baseCost: 350,
    basePrice: 550,
    reorderLevel: 30,
  },
  {
    scientificName: 'Montelukast 10mg',
    tradeName: 'Singulair 10',
    tradeNameEn: 'Singulair',
    manufacturer: 'MSD',
    originCountry: 'USA',
    category: ITEM_CATEGORIES.MEDICINE,
    dosageForm: 'أقراص',
    strength: '10mg',
    baseCost: 90,
    basePrice: 145,
    reorderLevel: 40,
  },
  // ─── مضادات الهيستامين ───
  {
    scientificName: 'Cetirizine 10mg',
    tradeName: 'Zyrtec 10',
    tradeNameEn: 'Zyrtec',
    manufacturer: 'UCB',
    originCountry: 'Belgium',
    category: ITEM_CATEGORIES.MEDICINE,
    dosageForm: 'أقراص',
    strength: '10mg',
    baseCost: 18,
    basePrice: 30,
    reorderLevel: 120,
  },
  // ─── الغدة الدرقية ───
  {
    scientificName: 'Levothyroxine 50mcg',
    tradeName: 'Euthyrox 50',
    tradeNameEn: 'Euthyrox',
    manufacturer: 'Merck',
    originCountry: 'Germany',
    category: ITEM_CATEGORIES.MEDICINE,
    dosageForm: 'أقراص',
    strength: '50mcg',
    baseCost: 22,
    basePrice: 38,
    reorderLevel: 80,
  },
  // ─── فيتامينات (مكملات) ───
  {
    scientificName: 'Vitamin D3 50000IU',
    tradeName: 'Vidrop D3',
    tradeNameEn: 'Vidrop',
    manufacturer: 'Julphar',
    originCountry: 'UAE',
    category: ITEM_CATEGORIES.SUPPLEMENTS,
    dosageForm: 'أمبول فموي',
    strength: '50000IU',
    baseCost: 40,
    basePrice: 65,
    reorderLevel: 100,
  },
  {
    scientificName: 'Vitamin C 1000mg',
    tradeName: 'Redoxon C',
    tradeNameEn: 'Redoxon',
    manufacturer: 'Bayer',
    originCountry: 'Germany',
    category: ITEM_CATEGORIES.SUPPLEMENTS,
    dosageForm: 'أقراص فوارة',
    strength: '1000mg',
    baseCost: 55,
    basePrice: 90,
    reorderLevel: 80,
  },
  // ─── مستلزمات طبية ───
  {
    scientificName: 'Surgical Gloves Sterile',
    tradeName: 'Latex Gloves (100)',
    tradeNameEn: 'Latex Gloves',
    manufacturer: 'Ansell',
    originCountry: 'Thailand',
    category: ITEM_CATEGORIES.MEDICAL_SUPPLIES,
    dosageForm: 'علبة 100',
    strength: '—',
    baseCost: 800,
    basePrice: 1200,
    reorderLevel: 15,
  },
];

// ============================================================
// 3) ثوابت: صيدليات (العملاء)
// ============================================================

const CUSTOMERS = [
  { name: 'صيدلية النور', phone: '+249911100001', city: 'الخرطوم', address: 'الخرطوم - شارع النيل', creditLimit: 50000, paymentTerms: 30 },
  { name: 'صيدلية الشفاء', phone: '+249911100002', city: 'الخرطوم', address: 'الخرطوم - الرياض', creditLimit: 80000, paymentTerms: 30 },
  { name: 'صيدلية الحياة', phone: '+249911100003', city: 'أم درمان', address: 'أم درمان - السوق الشعبي', creditLimit: 30000, paymentTerms: 30 },
  { name: 'صيدلية الرحمة', phone: '+249911100004', city: 'الخرطوم بحري', address: 'الخرطوم بحري - كرري', creditLimit: 40000, paymentTerms: 45 },
  { name: 'صيدلية الوفاء', phone: '+249911100005', city: 'بورتسودان', address: 'بورتسودان - حي الترابي', creditLimit: 25000, paymentTerms: 30 },
  { name: 'صيدلية الأمل', phone: '+249911100006', city: 'ود مدني', address: 'ود مدني - السوق الكبير', creditLimit: 35000, paymentTerms: 30 },
  { name: 'صيدلية السلام', phone: '+249911100007', city: 'كسلا', address: 'كسلا - السوق المركزي', creditLimit: 20000, paymentTerms: 30 },
  { name: 'صيدلية الفجر', phone: '+249911100008', city: 'الخرطوم', address: 'الخرطوم - الطائف', creditLimit: 60000, paymentTerms: 30 },
];

// ============================================================
// Helpers
// ============================================================

function makeBarcode(prefix, idx) {
  return `${prefix}${String(idx + 1).padStart(6, '0')}`;
}

function daysFromNow(n) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

/**
 * توليد دفعات المخزون لصنف.
 * سيناريوهات FEFO:
 *   - A / B / C: 3 دفعات عادية (3 / 8 / 15 شهراً)
 *   - NEAR (لصنف كل 4): دفعة قريبة الانتهاء (20 يوماً)
 *   - EXPIRED (لصنف كل 7): دفعة منتهية (لاختبار)
 *   - الصنف الأول: كميات منخفضة (لاختبار تنبيه الحد الأدنى)
 */
function buildBatchesForItem(itemIdx) {
  const baseQuantity = 500 + itemIdx * 50;
  const batches = [
    { label: 'A', months: 3, qty: baseQuantity },
    { label: 'B', months: 8, qty: baseQuantity * 1.5 },
    { label: 'C', months: 15, qty: baseQuantity * 2 },
  ];

  if (itemIdx % 4 === 0) {
    batches.push({ label: 'NEAR', days: 20, qty: 80 });
  }

  if (itemIdx % 7 === 0) {
    batches.push({ label: 'EXPIRED', days: -10, qty: 50 });
  }

  if (itemIdx === 0) {
    batches[0].qty = 15;
    batches[1].qty = 5;
    batches[2].qty = 3;
  }

  return batches;
}

function computeExpiry(b) {
  if (b.months) return daysFromNow(b.months * 30);
  if (b.days) return daysFromNow(b.days);
  return daysFromNow(180);
}

// ============================================================
// 1) المخازن — التحقق فقط (لا إنشاء)
// ============================================================

async function seedWarehouses() {
  logger.info('🏪 التحقق من المخازن...');

  // ⚠️ Warehouse.js يحتوي فهرساً فريداً على (type: 'main', isActive: true):
  //    لا يُسمح بأكثر من مخزن رئيسي واحد نشط.
  //    seed.js أنشأ WH-MAIN بالفعل — لا نُنشئ مخازن إضافية.
  const activeCount = await Warehouse.countDocuments({ isActive: true });
  if (activeCount === 0) {
    throw new Error('❌ لا يوجد أي مخزن نشط. شغّل: npm run seed أولاً.');
  }

  const mainWarehouse = await Warehouse.findOne({ isDefault: true, isActive: true });
  if (!mainWarehouse) {
    throw new Error('❌ لا يوجد مخزن افتراضي. شغّل: npm run seed أولاً.');
  }

  logger.info(`   ℹ️  ${activeCount} مخزن نشط (الافتراضي: ${mainWarehouse.code}).`);
  return mainWarehouse;
}

// ============================================================
// 2) الموردون
// ============================================================

async function seedSuppliers() {
  logger.info('🚚 تهيئة الموردين...');
  let created = 0;
  let updated = 0;

  for (const sup of SUPPLIERS) {
    const existing = await Supplier.findOne({ code: sup.code });
    if (existing) {
      Object.assign(existing, sup);
      await existing.save();
      updated++;
    } else {
      await Supplier.create(sup);
      created++;
    }
  }

  logger.info(`   ✅ ${created} جديد، ${updated} مُحدَّث.`);
}

// ============================================================
// 3) الأصناف
// ============================================================

async function seedItems(adminId) {
  logger.info('💊 تهيئة الأصناف الدوائية...');
  let created = 0;
  let updated = 0;
  const items = [];

  for (let i = 0; i < ITEMS.length; i++) {
    const def = ITEMS[i];
    const barcode = makeBarcode('ITM', i);

    const existing = await Item.findOne({ tradeName: def.tradeName });
    if (existing) {
      items.push(existing);
      updated++;
      continue;
    }

    const item = await Item.create({
      scientificName: def.scientificName,
      tradeName: def.tradeName,
      tradeNameEn: def.tradeNameEn,
      manufacturer: def.manufacturer,
      originCountry: def.originCountry,
      category: def.category,
      barcode,
      registrationNumber: `SD-${Date.now()}-${i}`,
      dosageForm: def.dosageForm,
      strength: def.strength,
      units: {
        base: {
          name: 'وحدة',
          contains: 1,
          price: def.basePrice,
          cost: def.baseCost,
        },
        packaging: {
          name: 'علبة',
          contains: 10,
          price: def.basePrice * 10,
          cost: def.baseCost * 10,
          barcode: `${barcode}P`,
        },
        smallest: {
          name: 'وحدة',
          contains: 1,
          price: def.basePrice,
          cost: def.baseCost,
        },
      },
      supportedUnits: ['وحدة', 'علبة'],
      defaultSaleUnit: 'وحدة',
      reorderLevel: def.reorderLevel,
      prescriptionRequired: ['Amoxil 500', 'Zithromax 500', 'Rocephin 1g', 'NovoRapid', 'Coumadin 5'].includes(def.tradeName),
      isActive: true,
      createdBy: adminId,
    });

    items.push(item);
    created++;
  }

  logger.info(`   ✅ ${created} جديد، ${updated} موجود.`);
  return items;
}

// ============================================================
// 4) الصيدليات — توزيع على المناديب
// ============================================================

/**
 * إنشاء الصيدليات وتوزيعها على المناديب (2 لكل مندوب).
 * @param {Array} salesReps - مصفوفة المناديب النشطين (مرتّبة أبجدياً بالبريد)
 * @param {string} adminId
 */
async function seedCustomers(salesReps, adminId) {
  logger.info(`🏥 تهيئة الصيدليات (${CUSTOMERS.length} صيدلية على ${salesReps.length} مندوب)...`);
  let created = 0;
  let updated = 0;
  const customers = [];

  for (let i = 0; i < CUSTOMERS.length; i++) {
    const def = CUSTOMERS[i];
    const salesRep = salesReps[i % salesReps.length];

    const existing = await Customer.findOne({ phone: def.phone });
    if (existing) {
      existing.assignedSalesRep = salesRep._id;
      existing.isActive = true;
      await existing.save();
      customers.push(existing);
      updated++;
      continue;
    }

    const c = await Customer.create({
      ...def,
      type: 'pharmacy',
      currentBalance: 0,
      returnGracePeriod: 7,
      assignedSalesRep: salesRep._id,
      isActive: true,
      isBlocked: false,
      createdBy: adminId,
    });
    customers.push(c);
    created++;
  }

  // ملخص التوزيع
  const distribution = {};
  for (const c of customers) {
    const repId = String(c.assignedSalesRep);
    distribution[repId] = (distribution[repId] || 0) + 1;
  }
  for (const rep of salesReps) {
    const count = distribution[String(rep._id)] || 0;
    logger.info(`   📊 ${rep.name}: ${count} صيدلية`);
  }

  logger.info(`   ✅ ${created} جديد، ${updated} موجود.`);
  return customers;
}

// ============================================================
// 5) دفعات المخزون
// ============================================================

async function seedStock({ items, mainWarehouse, suppliers, adminId }) {
  logger.info('📦 تهيئة دفعات المخزون...');

  let upserted = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const supplier = suppliers[i % suppliers.length];
    const batches = buildBatchesForItem(i);

    // نستخدم Trade Name للتعرف على الصنف من قائمة الأصناف
    const itemDef = ITEMS.find((x) => x.tradeName === item.tradeName);
    const baseCost = itemDef ? itemDef.baseCost : 10;
    const basePrice = itemDef ? itemDef.basePrice : 20;

    for (const b of batches) {
      const batchCode = `BATCH-${item.tradeName.replace(/\s+/g, '-').toUpperCase()}-${b.label}`;

      // تعديل بسيط على التكلفة/السعر حسب الدفعة (واقعية)
      const batchCost = Math.round(baseCost * (0.9 + Math.random() * 0.2));
      const batchPrice = Math.round(basePrice * (0.9 + Math.random() * 0.2));

      await Stock.findOneAndUpdate(
        { item: item._id, batch: batchCode, warehouse: mainWarehouse._id },
        {
          $setOnInsert: {
            item: item._id,
            batch: batchCode,
            productionDate: daysFromNow(-180),
            expiry: computeExpiry(b),
            warehouse: mainWarehouse._id,
            quantity: b.qty,
            unitCost: batchCost,
            unitPrice: batchPrice,
            supplier: supplier._id,
            isQuarantined: false,
            lastReceivedAt: new Date(),
            createdBy: adminId,
          },
        },
        { upsert: true, new: true }
      );
      upserted++;
    }
  }

  logger.info(`   ✅ ${upserted} دفعة (upsert).`);
}

// ============================================================
// 6) إعدادات العمولة (لكل مندوب)
// ============================================================

async function seedCommissions(salesReps, adminId) {
  logger.info('💰 تهيئة إعدادات عمولة المناديب...');
  let created = 0;
  let skipped = 0;

  for (const rep of salesReps) {
    const existing = await Commission.findOne({ salesRep: rep._id, isActive: true });
    if (existing) {
      skipped++;
      continue;
    }

    await Commission.create({
      salesRep: rep._id,
      isActive: true,
      baseCommission: 'percentage',
      baseRate: 2,
      tiers: [
        { minSales: 0, maxSales: 50000, bonusRate: 0 },
        { minSales: 50001, maxSales: 200000, bonusRate: 0.5 },
        { minSales: 200001, maxSales: 999999999, bonusRate: 1 },
      ],
      notes: 'عمولة 2% أساسية + حوافز متدرجة',
      createdBy: adminId,
    });
    created++;
  }

  logger.info(`   ✅ ${created} جديد، ${skipped} موجود.`);
}

// ============================================================
// Main
// ============================================================

async function main() {
  logger.info('═══════════════════════════════════════════════');
  logger.info('🌱 Pharma System — Master Data Seed');
  logger.info('═══════════════════════════════════════════════');

  await connectDatabase();

  try {
    // ─── 1. التحقق من المتطلبات ───
    const admin = await User.findOne({ role: USER_ROLES.ADMIN, isActive: true });
    if (!admin) {
      throw new Error('❌ لا يوجد admin نشط. شغّل: npm run seed');
    }

    const salesReps = await User.find({ role: USER_ROLES.SALES_REP, isActive: true }).sort({ email: 1 });
    if (salesReps.length === 0) {
      throw new Error('❌ لا يوجد أي sales_rep نشط. شغّل: npm run seed:test');
    }

    const categories = await Category.find({ isActive: true }).lean();
    if (categories.length === 0) {
      throw new Error('❌ لا توجد تصنيفات. شغّل: npm run seed');
    }

    // ─── 2. زرع ───
    const mainWarehouse = await seedWarehouses();

    await seedSuppliers();
    const allSuppliers = await Supplier.find({ isActive: true }).lean();
    if (allSuppliers.length === 0) {
      throw new Error('❌ فشل إنشاء الموردين.');
    }

    const items = await seedItems(admin._id);
    const customers = await seedCustomers(salesReps, admin._id);

    await seedStock({
      items,
      mainWarehouse,
      suppliers: allSuppliers,
      adminId: admin._id,
    });

    await seedCommissions(salesReps, admin._id);

    // ─── 3. الملخص ───
    logger.info('');
    logger.info('═══════════════════════════════════════════════');
    logger.info('🎉 اكتمل Master Data Seed');
    logger.info('═══════════════════════════════════════════════');
    logger.info('📊 الأعداد النهائية:');
    logger.info(`   • الموردون: ${allSuppliers.length}`);
    logger.info(`   • الأصناف: ${items.length}`);
    logger.info(`   • الصيدليات: ${customers.length}`);
    logger.info(`   • المناديب: ${salesReps.length}`);
    const stockCount = await Stock.countDocuments();
    logger.info(`   • دفعات المخزون: ${stockCount}`);
    logger.info('');
    logger.info('📌 التالي: node src/scripts/seed-test-invoices.js');
    logger.info('');
  } catch (error) {
    logger.error(`❌ فشل: ${error.message}`);
    logger.error(error.stack || '');
    throw error;
  } finally {
    await disconnectDatabase();
  }
}

main()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));