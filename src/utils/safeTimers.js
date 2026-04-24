    // Utility helpers for safe timeouts: clamp negative durations and provide sleep
export function clampTimeoutMs(ms) {
  const n = Number(ms) || 0;
  if (!Number.isFinite(n)) return 1;
  const clamped = Math.max(1, Math.floor(n));
  if (n < 0) {
    console.warn(`[safeTimers] clamped negative timeout ${n} -> ${clamped}`);
  }
  return clamped;
}

export function safeSetTimeout(fn, ms) {
  return setTimeout(fn, clampTimeoutMs(ms));
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, clampTimeoutMs(ms)));
}
