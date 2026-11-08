import { getDatabase } from "../src/db/client";
import { purgeExpiredClockMutationReceipts } from "../src/modules/time-tracking/service";

try {
  const result = await purgeExpiredClockMutationReceipts();
  console.log(`[maintenance] removed ${result.count} expired clock mutation receipts`);
} finally {
  await getDatabase().$disconnect();
}
