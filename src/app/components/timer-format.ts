export function elapsedFromBaseline(
  baselineSeconds: number,
  mountedAtMilliseconds: number,
  nowMilliseconds: number,
) {
  return Math.max(
    0,
    Math.floor(baselineSeconds) +
      Math.max(0, Math.floor((nowMilliseconds - mountedAtMilliseconds) / 1000)),
  );
}

export function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map((part) => String(part).padStart(2, "0")).join(":");
}

export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(seconds / 3600)}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}m`;
}
