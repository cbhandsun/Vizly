import type { Edge } from '@xyflow/react';

import {
  calculateEdgePairQuality,
  type PairQualityContribution,
  type Segment,
} from './edgePathQualityGeometry';

const DEFAULT_SIGNATURE_LIMIT = 4_096;
const DEFAULT_PAIR_LIMIT = 16_384;
const MAX_SIGNATURE_LENGTH = 32_768;

type PairMemoMetrics = Readonly<{
  hitCount: number;
  missCount: number;
  signatureCount: number;
  pairCount: number;
}>;

export type PairMemoCalculationMetrics = {
  cacheHitCount: number;
  calculatedPairCount: number;
};

const validLimit = (value: number, fallback: number): number => (
  Number.isSafeInteger(value) && value > 0 ? value : fallback
);

const validSignature = (value: unknown): value is string => (
  typeof value === 'string' && value.length > 0 && value.length <= MAX_SIGNATURE_LENGTH
);

/**
 * Interns exact edge-quality signatures so pair keys retain two small numeric
 * IDs instead of duplicating path strings for every candidate/peer pair.
 * Clearing both maps at the signature bound keeps memory deterministic and
 * cannot create a stale hit because IDs are never reused while pairs survive.
 */
export class EdgePathQualityPairMemo {
  readonly #signatureLimit: number;

  readonly #pairLimit: number;

  readonly #signatureIds = new Map<string, number>();

  readonly #pairs = new Map<string, Readonly<PairQualityContribution>>();

  #nextSignatureId = 1;

  #hitCount = 0;

  #missCount = 0;

  constructor(
    signatureLimit = DEFAULT_SIGNATURE_LIMIT,
    pairLimit = DEFAULT_PAIR_LIMIT,
  ) {
    this.#signatureLimit = validLimit(signatureLimit, DEFAULT_SIGNATURE_LIMIT);
    this.#pairLimit = validLimit(pairLimit, DEFAULT_PAIR_LIMIT);
  }

  get(
    firstSignature: string,
    secondSignature: string,
  ): Readonly<PairQualityContribution> | undefined {
    const key = this.#pairKey(firstSignature, secondSignature, false);
    if (!key) return undefined;
    const cached = this.#pairs.get(key);
    if (!cached) {
      this.#missCount += 1;
      return undefined;
    }
    this.#pairs.delete(key);
    this.#pairs.set(key, cached);
    this.#hitCount += 1;
    return cached;
  }

  set(
    firstSignature: string,
    secondSignature: string,
    contribution: PairQualityContribution,
  ): boolean {
    const key = this.#pairKey(firstSignature, secondSignature, true);
    if (!key) return false;
    this.#pairs.delete(key);
    this.#pairs.set(key, Object.freeze({ ...contribution }));
    while (this.#pairs.size > this.#pairLimit) {
      const oldest = this.#pairs.keys().next().value;
      if (typeof oldest !== 'string') break;
      this.#pairs.delete(oldest);
    }
    return this.#pairs.has(key);
  }

  metrics(): PairMemoMetrics {
    return {
      hitCount: this.#hitCount,
      missCount: this.#missCount,
      signatureCount: this.#signatureIds.size,
      pairCount: this.#pairs.size,
    };
  }

  clear(): void {
    this.#signatureIds.clear();
    this.#pairs.clear();
    this.#nextSignatureId = 1;
    this.#hitCount = 0;
    this.#missCount = 0;
  }

  #pairKey(
    firstSignature: string,
    secondSignature: string,
    create: boolean,
  ): string | null {
    if (!validSignature(firstSignature) || !validSignature(secondSignature)) return null;
    if (create) {
      const missingSignatures = new Set(
        [firstSignature, secondSignature]
          .filter(signature => !this.#signatureIds.has(signature)),
      );
      if (missingSignatures.size > this.#signatureLimit) return null;
      if (this.#signatureIds.size + missingSignatures.size > this.#signatureLimit) {
        this.#signatureIds.clear();
        this.#pairs.clear();
        this.#nextSignatureId = 1;
      }
    }
    const firstId = this.#signatureId(firstSignature, create);
    const secondId = this.#signatureId(secondSignature, create);
    return firstId && secondId ? `${firstId}:${secondId}` : null;
  }

  #signatureId(signature: string, create: boolean): number | null {
    const cached = this.#signatureIds.get(signature);
    if (cached) return cached;
    if (!create) return null;
    if (this.#signatureIds.size >= this.#signatureLimit) return null;
    const next = this.#nextSignatureId;
    this.#nextSignatureId += 1;
    this.#signatureIds.set(signature, next);
    return next;
  }
}

/**
 * Hot-path memo used inside one immutable quality evaluation context. Unlike
 * the shared LRU it does not concatenate pair keys or reorder entries on every
 * hit. The whole generation is discarded at the bound, which keeps lookup
 * cost and retained derived geometry deterministic for compound beam search.
 */
export class EdgePathQualityGenerationalPairMemo {
  readonly #pairLimit: number;

  readonly #pairs = new Map<
    string,
    Map<string, Readonly<PairQualityContribution>>
  >();

  #pairCount = 0;

  #hitCount = 0;

  #missCount = 0;

  constructor(pairLimit = DEFAULT_PAIR_LIMIT) {
    this.#pairLimit = validLimit(pairLimit, DEFAULT_PAIR_LIMIT);
  }

  get(
    firstSignature: string,
    secondSignature: string,
  ): Readonly<PairQualityContribution> | undefined {
    if (!validSignature(firstSignature) || !validSignature(secondSignature)) return undefined;
    const cached = this.#pairs.get(firstSignature)?.get(secondSignature);
    if (cached) this.#hitCount += 1;
    else this.#missCount += 1;
    return cached;
  }

  set(
    firstSignature: string,
    secondSignature: string,
    contribution: PairQualityContribution,
  ): boolean {
    if (!validSignature(firstSignature) || !validSignature(secondSignature)) return false;
    const existing = this.#pairs.get(firstSignature)?.has(secondSignature) === true;
    if (!existing && this.#pairCount >= this.#pairLimit) this.clearValues();
    let seconds = this.#pairs.get(firstSignature);
    if (!seconds) {
      seconds = new Map<string, Readonly<PairQualityContribution>>();
      this.#pairs.set(firstSignature, seconds);
    }
    if (!seconds.has(secondSignature)) this.#pairCount += 1;
    seconds.set(secondSignature, Object.freeze({ ...contribution }));
    return true;
  }

  metrics(): Readonly<{ hitCount: number; missCount: number; pairCount: number }> {
    return {
      hitCount: this.#hitCount,
      missCount: this.#missCount,
      pairCount: this.#pairCount,
    };
  }

  clear(): void {
    this.clearValues();
    this.#hitCount = 0;
    this.#missCount = 0;
  }

  private clearValues(): void {
    this.#pairs.clear();
    this.#pairCount = 0;
  }
}

const sharedEdgePairQualityMemo = new EdgePathQualityPairMemo();

export const readSharedEdgePairQualityMemoMetrics = () => (
  sharedEdgePairQualityMemo.metrics()
);

export const calculateMemoizedEdgePairQuality = (
  firstEdge: Edge,
  secondEdge: Edge,
  firstSegments: Segment[],
  secondSegments: Segment[],
  firstSignature: string,
  secondSignature: string,
  metrics?: PairMemoCalculationMetrics,
): PairQualityContribution => {
  const cached = sharedEdgePairQualityMemo.get(firstSignature, secondSignature);
  if (cached) {
    if (metrics) metrics.cacheHitCount += 1;
    return cached;
  }
  if (metrics) metrics.calculatedPairCount += 1;
  const contribution = calculateEdgePairQuality(
    firstEdge,
    secondEdge,
    firstSegments,
    secondSegments,
  );
  sharedEdgePairQualityMemo.set(firstSignature, secondSignature, contribution);
  return contribution;
};
