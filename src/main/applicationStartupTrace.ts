const stages = ['runtime-started', 'runtime-ready', 'readiness-ready',
  'mount-requested', 'mount-submitted', 'failed'] as const;
type StartupMilestoneStage = typeof stages[number];
export type StartupMilestone = Readonly<{ stage: StartupMilestoneStage; elapsedMs: number | null }>;

const isStage = (value: unknown): value is StartupMilestoneStage => (
  typeof value === 'string' && stages.some(stage => stage === value)
);

/** Projection is bounded and excludes arbitrary properties before user export. */
export const projectStartupMilestones = (value: unknown): StartupMilestone[] | null => {
  if (!Array.isArray(value) || value.length === 0 || value.length > stages.length) return null;
  const projected: StartupMilestone[] = [];
  let lastStage = -1;
  let lastElapsed = 0;
  for (const item of value) {
    if (!item || typeof item !== 'object' || !('stage' in item) || !isStage(item.stage)
      || !('elapsedMs' in item)) return null;
    const ordinal = stages.indexOf(item.stage);
    if (ordinal <= lastStage || (lastStage === -1 && ordinal !== 0)) return null;
    const elapsed = item.elapsedMs;
    if (elapsed !== null && (typeof elapsed !== 'number' || !Number.isSafeInteger(elapsed)
      || elapsed < lastElapsed || elapsed > 600_000)) return null;
    if (elapsed !== null) lastElapsed = elapsed;
    projected.push({ stage: item.stage, elapsedMs: elapsed });
    lastStage = ordinal;
  }
  return projected;
};

/** Fixed startup milestones only; no error, URL, graph or application payload. */
export const createStartupTrace = (startedAt: number, now: () => number) => {
  const entries: StartupMilestone[] = [{ stage: 'runtime-started', elapsedMs: Number.isFinite(startedAt) ? 0 : null }];
  let lastElapsed = 0;
  let lastStage = 0;
  return {
    record: (stage: StartupMilestoneStage): number | null => {
      const ordinal = stages.indexOf(stage);
      if (entries.length >= stages.length || ordinal <= lastStage) return null;
      let elapsedMs: number | null = null;
      try {
        const elapsed = now() - startedAt;
        if (Number.isFinite(elapsed) && elapsed >= lastElapsed && elapsed <= 600_000) {
          elapsedMs = Math.round(elapsed);
          lastElapsed = elapsed;
        }
      } catch {
        // Clock failure is represented by null; it cannot interrupt startup.
      }
      entries.push({ stage, elapsedMs });
      lastStage = ordinal;
      return elapsedMs;
    },
    snapshot: (): StartupMilestone[] => entries.map(entry => ({ ...entry })),
  };
};
