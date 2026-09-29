// Seconds as "4 s" or "1:05"
export function formatSeconds(seconds: number) {
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${Math.max(rounded, 1)} s`;
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}
