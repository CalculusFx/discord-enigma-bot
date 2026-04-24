// Lightweight timer clamp polyfill
// Ensures negative timeout values are clamped to 1ms to avoid Node TimeoutNegativeWarning
// Keep behavior minimal: only wrap native functions and log a single warning per process for visibility
(function () {
  const globalObj = typeof global !== 'undefined' ? global : globalThis;
  if (!globalObj) return;

  // Avoid double-applying
  if (globalObj.__timerClampApplied) return;
  globalObj.__timerClampApplied = true;

  const origSetTimeout = globalObj.setTimeout;
  const origSetInterval = globalObj.setInterval;

  let warned = false;
  function clampMs(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n)) return 1;
    if (n < 1) {
      if (!warned) {
        warned = true;
        try { console.warn('[timerClamp] Negative or zero timeout detected; clamping to 1ms'); } catch {}
      }
      return 1;
    }
    return Math.floor(n);
  }

  globalObj.setTimeout = function (fn, ms, ...args) {
    return origSetTimeout(fn, clampMs(ms), ...args);
  };

  globalObj.setInterval = function (fn, ms, ...args) {
    return origSetInterval(fn, clampMs(ms), ...args);
  };
})();
