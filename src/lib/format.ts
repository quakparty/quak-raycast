// Seconds as "4 s" or "1:05"
export function formatSeconds(seconds: number) {
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${Math.max(rounded, 1)} s`;
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

// Seconds as a clock, "0:07"
export function formatClock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
