type JobStage = 'job-started' | 'job-cancelled' | 'job-finished' | 'failed'
  | 'commit-accepted' | 'render-committed' | 'render-frame-observed';
type RequestStage = 'worker-requested' | 'worker-available' | 'worker-post-requested'
  | 'worker-response-validated' | 'worker-request-settled';
type Entry = Readonly<{ stage: JobStage | RequestStage; requestOrdinal: number | null; elapsedMs: number | null }>;
type Observation = {
  owner: 'display' | 'layout'; entries: Entry[]; truncated: boolean; closed: boolean;
  requestOrdinal: number; started: number; lastElapsed: number; now: () => number;
  jobStages: Set<JobStage>;
};
const observations = new WeakMap<object, Observation>();
const readClock = (now: () => number): number => {
  try { return now(); } catch { return NaN; }
};
const append = (observation: Observation, stage: Entry['stage'], requestOrdinal: number | null): void => {
  if (observation.closed) return;
  const elapsed = readClock(observation.now) - observation.started;
  const available = Number.isFinite(elapsed) && elapsed >= observation.lastElapsed && elapsed <= 600_000;
  if (available) observation.lastElapsed = elapsed;
  if (observation.entries.length === 32) { observation.entries.shift(); observation.truncated = true; }
  observation.entries.push({ stage, requestOrdinal, elapsedMs: available ? Math.round(elapsed) : null });
};

/** Keys are existing job signals/accepted objects, never document identifiers. */
export const startRoutingObservation = (signal: AbortSignal, owner: 'display' | 'layout',
  now: () => number = () => performance.now()): void => {
  if (observations.has(signal)) return;
  const observation: Observation = { owner, entries: [], truncated: false, closed: false,
    requestOrdinal: 0, started: readClock(now), lastElapsed: 0, now, jobStages: new Set(['job-started']) };
  observations.set(signal, observation);
  append(observation, 'job-started', null);
};

export const recordRoutingObservation = (key: object, stage: JobStage): void => {
  const observation = observations.get(key);
  if (!observation || observation.closed || observation.jobStages.has(stage)) return;
  observation.jobStages.add(stage);
  append(observation, stage, null);
  if (stage === 'failed' || stage === 'job-cancelled' || stage === 'job-finished') observation.closed = true;
};

/** Each request closure keeps its ordinal even when responses interleave. */
export const beginRoutingRequestObservation = (signal?: AbortSignal): ((stage: RequestStage) => void) => {
  const observation = signal ? observations.get(signal) : undefined;
  if (!observation || observation.closed) return () => {};
  if (observation.requestOrdinal >= 8) { observation.truncated = true; return () => {}; }
  const ordinal = ++observation.requestOrdinal;
  const seen = new Set<RequestStage>();
  const record = (stage: RequestStage) => {
    if (seen.has(stage) || seen.has('worker-request-settled')) return;
    seen.add(stage);
    append(observation, stage, ordinal);
  };
  record('worker-requested');
  return record;
};

export const bindRoutingObservation = (source: object, target: object): void => {
  const observation = observations.get(source);
  if (observation) observations.set(target, observation);
};

export const observeRoutingRenderFrame = (key: object, request: (callback: () => void) => number,
  cancel: (id: number) => void): (() => void) => {
  const observation = observations.get(key);
  if (!observation || observation.closed || observation.jobStages.has('render-frame-observed')) return () => {};
  let active = true;
  const frame = request(() => { if (active) recordRoutingObservation(key, 'render-frame-observed'); });
  return () => { active = false; cancel(frame); };
};

/** Only generated fixed codes/numbers leave the weak, in-memory journal. */
export const readRoutingObservation = (key: object) => {
  const observation = observations.get(key);
  return observation ? { schema: 'vizly-routing-observation-v1' as const, owner: observation.owner,
    truncated: observation.truncated, entries: observation.entries.map(entry => ({ ...entry })) } : null;
};
