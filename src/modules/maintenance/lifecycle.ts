export function waitForMaintenanceDelay(milliseconds: number, signal: AbortSignal) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0)
    throw new Error("invalid_maintenance_delay");
  if (signal.aborted) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    // Keep this timer referenced: the scheduled worker must remain alive while sleeping.
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
  });
}
