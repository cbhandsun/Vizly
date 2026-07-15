export type BoundedEvaluationCacheSlots = Readonly<{
  edges: number;
  segments: number;
  pairs: number;
}>;

export type BoundedEvaluationCacheLimits = Readonly<{
  entries: number;
  edgeSlots: number;
  segmentSlots: number;
  pairSlots: number;
}>;

type CacheEntry<Value> = {
  value: Value;
  slots: BoundedEvaluationCacheSlots;
};

const toLimit = (value: number): number => (
  Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
);

const toSlots = (slots: BoundedEvaluationCacheSlots): BoundedEvaluationCacheSlots | null => {
  const values = [slots.edges, slots.segments, slots.pairs];
  if (values.some(value => !Number.isFinite(value) || value < 0)) return null;
  return {
    edges: Math.floor(slots.edges),
    segments: Math.floor(slots.segments),
    pairs: Math.floor(slots.pairs),
  };
};

/**
 * A small strong-reference LRU for derived graph snapshots. Entry and slot
 * budgets bound retained memory independently of the number of signatures
 * observed over the lifetime of the application.
 */
export class BoundedEvaluationLruCache<Value> {
  readonly #limits: BoundedEvaluationCacheLimits;

  readonly #entries = new Map<string, CacheEntry<Value>>();

  #edgeSlots = 0;

  #segmentSlots = 0;

  #pairSlots = 0;

  constructor(limits: BoundedEvaluationCacheLimits) {
    this.#limits = {
      entries: toLimit(limits.entries),
      edgeSlots: toLimit(limits.edgeSlots),
      segmentSlots: toLimit(limits.segmentSlots),
      pairSlots: toLimit(limits.pairSlots),
    };
  }

  get size(): number {
    return this.#entries.size;
  }

  get(key: string): Value | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: Value, rawSlots: BoundedEvaluationCacheSlots): boolean {
    const slots = toSlots(rawSlots);
    if (
      !slots
      || this.#limits.entries === 0
      || slots.edges > this.#limits.edgeSlots
      || slots.segments > this.#limits.segmentSlots
      || slots.pairs > this.#limits.pairSlots
    ) return false;

    this.#delete(key);
    this.#entries.set(key, { value, slots });
    this.#edgeSlots += slots.edges;
    this.#segmentSlots += slots.segments;
    this.#pairSlots += slots.pairs;

    while (this.#isOverBudget()) {
      const oldestKey = this.#entries.keys().next().value;
      if (typeof oldestKey !== 'string') break;
      this.#delete(oldestKey);
    }
    return this.#entries.has(key);
  }

  #isOverBudget(): boolean {
    return this.#entries.size > this.#limits.entries
      || this.#edgeSlots > this.#limits.edgeSlots
      || this.#segmentSlots > this.#limits.segmentSlots
      || this.#pairSlots > this.#limits.pairSlots;
  }

  #delete(key: string): void {
    const entry = this.#entries.get(key);
    if (!entry) return;
    this.#entries.delete(key);
    this.#edgeSlots -= entry.slots.edges;
    this.#segmentSlots -= entry.slots.segments;
    this.#pairSlots -= entry.slots.pairs;
  }
}
