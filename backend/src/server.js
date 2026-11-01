/**
 * @file server.js
 * @description
 * نقطة دخول التطبيق (Backend) — Phase 5
 * (Reports فقط — Dashboard/Notifications/Backup مؤجلة حتى التحقق من الوحدات)
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';

// ─── Config ───
import { connectDatabase } from './config/database.js';
import env from './config/env.js';
import logger from './utils/logger.js';

// ─── Middlewares ───
import { errorHandler, notFoundHandler } from './middlewares/errorMiddleware.js';
import { globalLimiter } from './middlewares/rateLimitMiddleware.js';

// ─── Jobs ───
import { startJobs } from './jobs/index.js';

// ─── Routes — Phase 0 ───
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';

// ─── Routes — Phase 1 ───
import categoryRoutes from './routes/categoryRoutes.js';
import warehouseRoutes from './routes/warehouseRoutes.js';
import itemRoutes from './routes/itemRoutes.js';
import supplierRoutes from './routes/supplierRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import stockRoutes from './routes/stockRoutes.js';

// ─── Routes — Phase 2 ───
import invoiceRoutes from './routes/invoiceRoutes.js';
import deliveryNoteRoutes from './routes/deliveryNoteRoutes.js';
import customerReturnRoutes from './routes/customerReturnRoutes.js';
import supplierReturnRoutes from './routes/supplierReturnRoutes.js';
import purchaseReceiptRoutes from './routes/purchaseReceiptRoutes.js';

// ─── Routes — Phase 3 ───
import cashFundRoutes from './routes/cashFundRoutes.js';
import bankAccountRoutes from './routes/bankAccountRoutes.js';
import cashTransactionRoutes from './routes/cashTransactionRoutes.js';
import accountingEntryRoutes from './routes/accountingEntryRoutes.js';
import checkRoutes from './routes/checkRoutes.js';

// ─── Routes — Phase 4 (Reports) ───
import financeReportRoutes from './routes/financeReportRoutes.js';
import salesReportRoutes from './routes/salesReportRoutes.js';
import customerReportRoutes from './routes/customerReportRoutes.js';
import supplierReportRoutes from './routes/supplierReportRoutes.js';
import inventoryReportRoutes from './routes/inventoryReportRoutes.js';

import dashboardRoutes from './routes/dashboardRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import backupRoutes from './routes/backupRoutes.js';

// ─── Routes — Settings (Phase D) ───
import settingsRoutes from './routes/settingsRoutes.js';

const app = express();

/* ═════════════════════════════════════════════════════════════
 * 1) Middlewares
 * ═════════════════════════════════════════════════════════════ */
app.use(helmet());

app.use(
  cors({
    origin: env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);

// ✅ A6: 50mb لدعم استعادة Backup مستقبلاً
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(compression());

if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use('/api', globalLimiter);

/* ═════════════════════════════════════════════════════════════
 * 2) Health check
 * ═════════════════════════════════════════════════════════════ */
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Pharma System API is running',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    version: '5.0.0',
    phase: 'Phase 5 — Reports (Dashboard/Notifications/Backup pending)',
  });
});

/* ═════════════════════════════════════════════════════════════
 * 3) Routes — Phase 0
 * ═════════════════════════════════════════════════════════════ */
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

/* ═════════════════════════════════════════════════════════════
 * 4) Routes — Phase 1
 * ═════════════════════════════════════════════════════════════ */
app.use('/api/categories', categoryRoutes);
app.use('/api/warehouses', warehouseRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/stocks', stockRoutes);

/* ═════════════════════════════════════════════════════════════
 * 5) Routes — Phase 2
 * ═════════════════════════════════════════════════════════════ */
app.use('/api/invoices', invoiceRoutes);
app.use('/api/delivery-notes', deliveryNoteRoutes);
app.use('/api/customer-returns', customerReturnRoutes);
app.use('/api/supplier-returns', supplierReturnRoutes);
app.use('/api/purchase-receipts', purchaseReceiptRoutes);

/* ═════════════════════════════════════════════════════════════
 * 6) Routes — Phase 3
 * ═════════════════════════════════════════════════════════════ */
app.use('/api/cash-funds', cashFundRoutes);
app.use('/api/bank-accounts', bankAccountRoutes);
app.use('/api/cash-transactions', cashTransactionRoutes);
app.use('/api/accounting-entries', accountingEntryRoutes);
app.use('/api/checks', checkRoutes);

/* ═════════════════════════════════════════════════════════════
 * 7) Routes — Phase 4 (Reports) — 5 مجموعات
 * ═════════════════════════════════════════════════════════════ */
app.use('/api/reports/finance', financeReportRoutes);
app.use('/api/reports/sales', salesReportRoutes);
app.use('/api/reports/customers', customerReportRoutes);
app.use('/api/reports/suppliers', supplierReportRoutes);
app.use('/api/reports/inventory', inventoryReportRoutes);
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/notifications', notificationRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/settings', settingsRoutes);
/* ═════════════════════════════════════════════════════════════
 * 8) 404 + Error handlers
 * ═════════════════════════════════════════════════════════════ */
app.use(notFoundHandler);
app.use(errorHandler);

/* ═════════════════════════════════════════════════════════════
 * 9) Start server
 * ═════════════════════════════════════════════════════════════ */
const PORT = env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDatabase();
    logger.info('✅ Database connected');

    app.listen(PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${PORT}`);
      logger.info(`   Environment: ${env.NODE_ENV}`);
      logger.info(`   Frontend URL: ${env.FRONTEND_URL}`);
      logger.info(`   Phase: 5 — Reports (Dashboard/Notifications/Backup pending)`);
    });

    if (env.NODE_ENV !== 'test') {
      startJobs();
      logger.info('⏰ Jobs started (expiry + reorder + invoiceDue + checkDue)');
    }
  } catch (error) {
    logger.error(`❌ Failed to start server: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
};

process.on('unhandledRejection', (reason) => {
  logger.error(`❌ Unhandled Rejection: ${reason}`);
});

process.on('uncaughtException', (error) => {
  logger.error(`❌ Uncaught Exception: ${error.message}`);
  logger.error(error.stack);
  process.exit(1);
});

startServer();

export default app;