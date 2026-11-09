import { getDatabase } from "../src/db/client";
import { purgeInactiveSessions } from "../src/auth/session-policy";

try {
  const result = await purgeInactiveSessions();
  console.log(`[maintenance] removed ${result.count} inactive sessions`);
} finally {
  await getDatabase().$disconnect();
}
