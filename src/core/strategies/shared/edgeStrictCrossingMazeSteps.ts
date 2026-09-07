import { TINY_INTERIOR_SEGMENT } from './edgePathReadabilityThresholds';

/** Index of the first possible turn after a readable straight run. */
export const resolveMazeRunDestination = (
  coordinates: readonly number[],
  originIndex: number,
  sign: -1 | 1,
  retainedEnd?: { index: number; extension: number },
): number => {
  if (!Number.isInteger(originIndex) || originIndex < 0 || originIndex >= coordinates.length) return -1;
  let destination = originIndex + sign;
  while (destination >= 0 && destination < coordinates.length
    && Math.abs(coordinates[destination] - coordinates[originIndex]) < TINY_INTERIOR_SEGMENT) destination += sign;
  if (retainedEnd && Number.isInteger(retainedEnd.index) && retainedEnd.index >= 0
    && retainedEnd.index < coordinates.length && (retainedEnd.index - originIndex) * sign > 0
    && Number.isFinite(retainedEnd.extension) && retainedEnd.extension >= 0) {
    const distance = Math.abs(coordinates[retainedEnd.index] - coordinates[originIndex]);
    if (distance < TINY_INTERIOR_SEGMENT && distance + retainedEnd.extension >= TINY_INTERIOR_SEGMENT) return retainedEnd.index;
  }
  return destination >= 0 && destination < coordinates.length ? destination : -1;
};
