export const DEFAULT_MAINTENANCE_INTERVAL_SECONDS = 24 * 60 * 60;
export const MIN_MAINTENANCE_INTERVAL_SECONDS = 5 * 60;
export const MAX_MAINTENANCE_INTERVAL_SECONDS = 7 * 24 * 60 * 60;
export const MAINTENANCE_RETRY_SECONDS = 5 * 60;

export function maintenanceIntervalSeconds(value: string | undefined) {
  if (value === undefined || value === "") return DEFAULT_MAINTENANCE_INTERVAL_SECONDS;
  if (!/^\d+$/.test(value)) throw new Error("invalid_maintenance_interval");
  const seconds = Number(value);
  if (
    !Number.isSafeInteger(seconds) ||
    seconds < MIN_MAINTENANCE_INTERVAL_SECONDS ||
    seconds > MAX_MAINTENANCE_INTERVAL_SECONDS
  )
    throw new Error("invalid_maintenance_interval");
  return seconds;
}

export function maintenanceRetryDelaySeconds(intervalSeconds: number) {
  return Math.min(intervalSeconds, MAINTENANCE_RETRY_SECONDS);
}
