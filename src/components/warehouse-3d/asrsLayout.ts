import * as THREE from 'three';

export type Vector3Tuple = [number, number, number];

export interface AsrsBox {
  position: Vector3Tuple;
  scale: Vector3Tuple;
  color: THREE.Color;
}

export interface AsrsRack {
  position: Vector3Tuple;
}

export interface AsrsLayout {
  rackInstances: AsrsRack[];
  boxInstances: AsrsBox[];
  floorXPositions: number[];
}

export interface CraneTarget {
  z: number;
  y: number;
  wait: number;
}

const DEFAULT_WIDTH = 1;
const DEFAULT_DEPTH = 1;
const DEFAULT_HEIGHT = 4;
const AISLE_COUNT = 12;

const toFinitePositive = (value: number, fallback: number): number => (
  Number.isFinite(value) && value > 0 ? value : fallback
);

const boundedRandom = (random: () => number): number => {
  const value = random();
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

const normalizeZero = (value: number): number => (Object.is(value, -0) ? 0 : value);

export const getAsrsDimensions = (xRange: readonly number[]): { width: number; depth: number; height: number } => {
  const [start, end] = xRange;
  const width = toFinitePositive(end - start, DEFAULT_WIDTH);
  return { width, depth: 110, height: 25 };
};

export const getRandomCraneTarget = (
  depth: number,
  height: number,
  random: () => number = Math.random
): CraneTarget => {
  const safeDepth = toFinitePositive(depth, DEFAULT_DEPTH);
  const safeHeight = Math.max(4, toFinitePositive(height, DEFAULT_HEIGHT));
  const zSpan = Math.max(0, safeDepth - 4);
  const ySpan = Math.max(0, safeHeight - 4);
  return {
    z: normalizeZero((boundedRandom(random) - 0.5) * zSpan),
    y: boundedRandom(random) * ySpan + 2,
    wait: 1,
  };
};

export const createAsrsLayout = (
  width: number,
  depth: number,
  height: number,
  random: () => number = Math.random
): AsrsLayout => {
  const safeWidth = toFinitePositive(width, DEFAULT_WIDTH);
  const safeDepth = toFinitePositive(depth, DEFAULT_DEPTH);
  const safeHeight = toFinitePositive(height, DEFAULT_HEIGHT);
  const racks: AsrsRack[] = [];
  const boxes: AsrsBox[] = [];
  const floors: number[] = [];

  for (let i = 0; i < AISLE_COUNT; i += 1) {
    const aisleX = (i - 6) * (safeWidth / 13) + 2;
    floors.push(aisleX);
    racks.push({ position: [aisleX - 1.5, safeHeight / 2, 0] });
    racks.push({ position: [aisleX + 1.5, safeHeight / 2, 0] });

    for (const offsetX of [-1.1, 1.1]) {
      for (let b = 0; b < 40; b += 1) {
        if (boundedRandom(random) > 0.3) {
          boxes.push({
            position: [
              aisleX + offsetX,
              boundedRandom(random) * safeHeight * 0.9 + 1,
              (boundedRandom(random) - 0.5) * safeDepth * 0.9,
            ],
            scale: [0.8, 0.8, 1.0],
            color: new THREE.Color().setHSL(boundedRandom(random), 0.6, 0.3),
          });
        }
      }
    }
  }

  return { rackInstances: racks, boxInstances: boxes, floorXPositions: floors };
};
