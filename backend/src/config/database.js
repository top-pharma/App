/**
 * @file database.js
 * @description
 * اتصال MongoDB Atlas عبر Mongoose + إدارة أحداث الاتصال.
 *
 * ✅ v10.3 (2026-11-15):
 * - safeStr في debug callback — لا circular structure (session/client).
 * - هذا كان سبب فشل restoreAll — JSON.stringify(arg) مع { session }.
 */

import mongoose from 'mongoose';

import { env, isProduction } from './env.js';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);

/**
 * ✅ v10.3 — debug callback آمن — لا circular.
 */
if (!isProduction()) {
  const safeStr = (arg) => {
    try {
      return JSON.stringify(arg);
    } catch {
      if (arg && typeof arg === 'object') {
        const keys = Object.keys(arg).filter(
          (k) =>
            !['session', 'client', 'topology', 's', '$__', 'sessionPool'].includes(k)
        );
        return `{${keys.join(',')}}`;
      }
      return String(arg);
    }
  };

  mongoose.set('debug', (collectionName, methodName, ...methodArgs) => {
    try {
      logger.debug(
        `[Mongoose] ${collectionName}.${methodName}(${methodArgs
          .map(safeStr)
          .join(', ')})`
      );
    } catch {
      // تجاهل — debug لا يجب أن يُسقط أي عملية
    }
  });
}

export const getConnectionState = () => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return states[mongoose.connection.readyState] ?? 'unknown';
};

export const isDatabaseReady = () => mongoose.connection.readyState === 1;

let listenersRegistered = false;

const registerConnectionListeners = () => {
  if (listenersRegistered) return;
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
    logger.error(`❌ خطأ في اتصال MongoDB: ${error.message}`);
  });
};

export const connectDatabase = async () => {
  registerConnectionListeners();

  const isAtlas = env.MONGODB_URI.includes('mongodb+srv://');
  logger.info(`⏳ جارٍ الاتصال بـ MongoDB ${isAtlas ? 'Atlas' : 'المحلي'}...`);

  try {
    const connection = await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 1,
      compressors: ['zlib'],
    });

    return connection;
  } catch (error) {
    logger.error(`❌ فشل الاتصال بـ MongoDB: ${error.message}`);
    throw error;
  }
};

export const disconnectDatabase = async () => {
  if (mongoose.connection.readyState === 0) return;

  try {
    await mongoose.connection.close(false);
    logger.info('🛑 تم إغلاق اتصال MongoDB.');
  } catch (error) {
    logger.error(`خطأ أثناء إغلاق الاتصال: ${error.message}`);
  }
};

export default mongoose;