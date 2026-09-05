// Reviewed aggregate guardrail, not a first-load or runtime performance budget.
export const TOTAL_JS_HARD_LIMIT_KIB = 10_000;
export const TOTAL_JS_WARNING_KIB = 9_750;

export const evaluateTotalJsBudget = (bytes, hardLimitKiB = TOTAL_JS_HARD_LIMIT_KIB) => {
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new Error('Total JS bytes must be a non-negative safe integer');
  }
  if (!Number.isFinite(hardLimitKiB) || hardLimitKiB <= 0
    || hardLimitKiB > Number.MAX_SAFE_INTEGER / 1024) {
    throw new Error('Total JS hard limit must be a positive finite KiB value');
  }
  const warningKiB = Math.min(TOTAL_JS_WARNING_KIB, hardLimitKiB * 0.975);
  return {
    status: bytes > hardLimitKiB * 1024 ? 'fail'
      : bytes >= warningKiB * 1024 ? 'warn' : 'pass',
    warningKiB,
  };
};
