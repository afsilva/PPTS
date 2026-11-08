import { setTimeout as delay } from "node:timers/promises";
import { processPendingDocuments } from "../modules/documents/service";
import { initializeDocumentStorage } from "../modules/documents/storage";

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    stopping = true;
  });

await initializeDocumentStorage();
while (!stopping) {
  try {
    const processed = await processPendingDocuments();
    if (!processed) await delay(2000);
  } catch (error) {
    console.error(
      "[document-worker] processing failed",
      error instanceof Error ? error.name : "unknown",
    );
    await delay(5000);
  }
}
