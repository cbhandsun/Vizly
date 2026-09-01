export const coerceDetachedRepairBudget = (
  value: unknown,
  fallback: number,
): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
};
