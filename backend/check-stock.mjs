import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Stock } from './src/models/Stock.js';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected\n');

  const itemId = '6aef2e25529b10b4094b0cd6';   // ← LOSEC-20
  const stocks = await Stock.find({ item: itemId }).lean();

  console.log(`═══ Stock for item ${itemId} ═══`);
  console.log(`Count: ${stocks.length}`);
  stocks.forEach((s) => {
    console.log({
      _id: s._id,
      batch: s.batch,
      quantity: s.quantity,
      expiry: s.expiry,
      isQuarantined: s.isQuarantined,
      warehouse: s.warehouse,
    });
  });

  // ═══ فحص selectFEFO يدوياً ═══
  const now = new Date();
  const valid = await Stock.find({
    item: itemId,
    quantity: { $gt: 0 },
    isQuarantined: false,
    expiry: { $gt: now },
  }).sort({ expiry: 1, createdAt: 1 }).lean();

  console.log(`\n═══ Valid batches (selectFEFO logic) ═══`);
  console.log(`Count: ${valid.length}`);
  valid.forEach((s) => {
    console.log({ batch: s.batch, quantity: s.quantity, expiry: s.expiry });
  });

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });