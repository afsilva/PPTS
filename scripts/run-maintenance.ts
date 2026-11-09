import { getDatabase } from "../src/db/client";
import { purgeInactiveSessions } from "../src/auth/session-policy";
import { waitForMaintenanceDelay } from "../src/modules/maintenance/lifecycle";
import {
  maintenanceIntervalSeconds,
  maintenanceRetryDelaySeconds,
} from "../src/modules/maintenance/policy";
import { purgeExpiredClockMutationReceipts } from "../src/modules/time-tracking/service";

const intervalSeconds = maintenanceIntervalSeconds(process.env.MAINTENANCE_INTERVAL_SECONDS);
const once = process.env.MAINTENANCE_RUN_ONCE === "true";
const shutdown = new AbortController();

function stop() {
  shutdown.abort();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

try {
  do {
    try {
      const now = new Date();
      const [sessions, receipts] = await Promise.all([
        purgeInactiveSessions(now),
        purgeExpiredClockMutationReceipts(now),
      ]);
      console.log(
        `[maintenance] removed ${sessions.count} inactive sessions and ${receipts.count} expired clock mutation receipts`,
      );
      if (!once && !shutdown.signal.aborted)
        await waitForMaintenanceDelay(intervalSeconds * 1000, shutdown.signal);
    } catch (error) {
      console.error("[maintenance] cleanup failed; retrying after a bounded delay");
      if (once) throw error;
      if (!shutdown.signal.aborted)
        await waitForMaintenanceDelay(
          maintenanceRetryDelaySeconds(intervalSeconds) * 1000,
          shutdown.signal,
        );
    }
  } while (!once && !shutdown.signal.aborted);
} finally {
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
  await getDatabase().$disconnect();
}
