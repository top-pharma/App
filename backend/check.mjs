import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  console.log('✅ Connected\n');

  const collections = [
    'roles', 'users', 'settings', 'categories', 'warehouses',
    'items', 'suppliers', 'customers', 'stocks',
    'invoices', 'cashfunds', 'bankaccounts', 'checks',
    'commissions', 'cashtransactions', 'accountingentries', 'customerreturns',
  ];

  for (const col of collections) {
    try {
      const count = await db.collection(col).countDocuments();
      const icon = count > 0 ? '🟡' : '⚪';
      console.log(`${icon} ${col.padEnd(25)} ${count}`);
    } catch (e) {
      console.log(`❌ ${col.padEnd(25)} ${e.message}`);
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
