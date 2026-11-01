import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from './src/config/database.js';
import { runExpiryAlert } from './src/jobs/expiryAlert.js';
import { runReorderAlert } from './src/jobs/reorderAlert.js';
import { logger } from './src/utils/logger.js';

async function main() {
  await connectDatabase();

  logger.info('═══ اختبار expiryAlert ═══');
  const expiryResult = await runExpiryAlert();
  console.log(JSON.stringify(expiryResult, null, 2));

  logger.info('');
  logger.info('═══ اختبار reorderAlert ═══');
  const reorderResult = await runReorderAlert();
  console.log(JSON.stringify(reorderResult, null, 2));

  await disconnectDatabase();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});