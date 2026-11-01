/**
 * @file database.js
 * @description
 * اتصال MongoDB Atlas عبر Mongoose + إدارة أحداث الاتصال.
 *
 * لماذا هذا الملف؟
 * - نُغلّف الاتصال بدالة واحدة `connectDatabase` لضمان أن نقطة الدخول
 *   `server.js` تنتظر الاتصال قبل الاستماع لأي طلب HTTP.
 * - نُسجّل مستمعي الأحداث (connected, disconnected, error) في مكان واحد
 *   بدلاً من تكرارهم في كل مكان.
 * - نُفعّل `strictQuery: true` لتفادي الاستعلامات بحقول غير معرّفة في
 *   الـ Schema (مصدر شائع للأخطاء الصامتة).
 * - نُغلق الاتصال بأمان عند إيقاف السيرفر (SIGINT/SIGTERM) لتفادي
 *   تسرّب الاتصالات في بيئات الاستضافة (Render/Railway).
 */

import mongoose from 'mongoose';

import { env, isProduction } from './env.js';
import { logger } from '../utils/logger.js';

/**
 * إعدادات Mongoose العامة.
 * نضعها هنا مرة واحدة بدلاً من تكرارها في كل مكان.
 */
mongoose.set('strictQuery', true);

// في التطوير نُظهر الاستعلامات البطيئة (> 100ms) لتسهيل التحسين.
if (!isProduction()) {
  mongoose.set('debug', (collectionName, methodName, ...methodArgs) => {
    logger.debug(
      `[Mongoose] ${collectionName}.${methodName}(${methodArgs
        .map((arg) => JSON.stringify(arg))
        .join(', ')})`
    );
  });
}

/**
 * حالة الاتصال الحالية بصيغة نصية مقروءة.
 * @returns {'disconnected'|'connected'|'connecting'|'disconnecting'|'unknown'}
 */
export const getConnectionState = () => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return states[mongoose.connection.readyState] ?? 'unknown';
};

/**
 * هل الاتصال بقاعدة البيانات جاهز؟
 * نستخدمها في نقطة الفحص الصحية `/api/health`.
 * @returns {boolean}
 */
export const isDatabaseReady = () => mongoose.connection.readyState === 1;

/**
 * تسجيل مستمعي أحداث الاتصال.
 * نُسجّلهم مرة واحدة فقط عند أول استدعاء لـ connectDatabase.
 */
let listenersRegistered = false;

const registerConnectionListeners = () => {
  if (listenersRegistered) {
    return;
  }
  listenersRegistered = true;

  const { connection } = mongoose;

  connection.on('connected', () => {
    logger.info(`✅ MongoDB متصل — القاعدة: ${connection.name}`);
  });

  connection.on('disconnected', () => {
    logger.warn('⚠️  MongoDB غير متصل.');
  });

  connection.on('reconnected', () => {
    logger.info('🔄 MongoDB أُعيد الاتصال بنجاح.');
  });

  connection.on('error', (error) => {
    // لا نُغلق العملية هنا — نترك Mongoose يُعيد المحاولة تلقائياً.
    logger.error(`❌ خطأ في اتصال MongoDB: ${error.message}`);
  });
};

/**
 * الاتصال بقاعدة البيانات.
 * تُستدعى مرة واحدة من `server.js` قبل `app.listen`.
 *
 * @async
 * @returns {Promise<typeof mongoose>} كائن mongoose بعد نجاح الاتصال.
 * @throws {Error} إذا فشل الاتصال في المحاولة الأولى.
 */
export const connectDatabase = async () => {
  registerConnectionListeners();

  const isAtlas = env.MONGODB_URI.includes('mongodb+srv://');
logger.info(`⏳ جارٍ الاتصال بـ MongoDB ${isAtlas ? 'Atlas' : 'المحلي'}...`);

  try {
    const connection = await mongoose.connect(env.MONGODB_URI, {
      // المهلة لاختيار سيرفر مناسب (Atlas قد يتأخر قليلاً في الاتصال البارد).
      serverSelectionTimeoutMS: 15000,

      // مهلة إنهاء Socket — نُبقيها مرتفعة قليلاً لتفادي الانقطاعات العابرة.
      socketTimeoutMS: 45000,

      // نبقي الحد الأقصى افتراضياً (100)، كافٍ لمرحلة التأسيس.
      maxPoolSize: 10,
      minPoolSize: 1,

      // ضغط البيانات على الشبكة لتقليل الاستهلاك.
      compressors: ['zlib'],
    });

    return connection;
  } catch (error) {
    logger.error(`❌ فشل الاتصال بـ MongoDB: ${error.message}`);
    throw error;
  }
};

/**
 * إغلاق الاتصال بأمان.
 * تُستدعى عند إشارات النظام (SIGINT/SIGTERM) أو من نقطة الاختبار.
 *
 * @async
 * @returns {Promise<void>}
 */
export const disconnectDatabase = async () => {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  try {
    await mongoose.connection.close(false);
    logger.info('🛑 تم إغلاق اتصال MongoDB.');
  } catch (error) {
    logger.error(`خطأ أثناء إغلاق الاتصال: ${error.message}`);
  }
};

export default mongoose;