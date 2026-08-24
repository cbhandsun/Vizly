import { describe, expect, it } from 'vitest';

import type { EdgeRoutingRect, EdgeRoutingSegment } from '../edgeRoutingPathGeometry';
import {
  createRoutingWaypointVisualRectIndex,
  type RoutingWaypointVisualRectEntry,
} from '../edgeRoutingWaypointVisualRectIndex';

const intersectsExpandedSegmentBounds = (
  rect: EdgeRoutingRect,
  segment: EdgeRoutingSegment,
  padding: number,
): boolean => {
  const minX = Math.min(segment.a.x, segment.b.x) - padding;
  const maxX = Math.max(segment.a.x, segment.b.x) + padding;
  const minY = Math.min(segment.a.y, segment.b.y) - padding;
  const maxY = Math.max(segment.a.y, segment.b.y) + padding;
  return rect.x <= maxX
    && rect.x + rect.width >= minX
    && rect.y <= maxY
    && rect.y + rect.height >= minY;
};

describe('routing waypoint visual rectangle index', () => {
  it('matches the conservative full-scan bounds filter across a dense grid', () => {
    const entries: RoutingWaypointVisualRectEntry[] = Array.from(
      { length: 144 },
      (_, index) => ({
        id: `node-${index}`,
        rect: {
          x: (index % 12) * 180 - 900,
          y: Math.floor(index / 12) * 140 - 700,
          width: 72 + (index % 3) * 12,
          height: 48 + (index % 2) * 16,
        },
      }),
    );
    const segments: EdgeRoutingSegment[] = [
      { a: { x: -820, y: -630 }, b: { x: 760, y: -630 } },
      { a: { x: -210, y: -680 }, b: { x: -210, y: 680 } },
      { a: { x: -750, y: -520 }, b: { x: 620, y: 460 } },
    ];
    const index = createRoutingWaypointVisualRectIndex(entries);

    for (const padding of [0, 8, 28]) {
      for (const segment of segments) {
        const expected = entries
          .filter(entry => intersectsExpandedSegmentBounds(entry.rect, segment, padding))
          .map(entry => entry.id);
        const query = index.queryPotentialEntries(segment, padding);
        expect(query.entries.map(entry => entry.id)).toEqual(expected);
        expect(query.scannedNodeCount).toBe(expected.length);
      }
    }
  });

  it('fails closed to the complete entry set for invalid query geometry', () => {
    const entries: RoutingWaypointVisualRectEntry[] = [{
      id: 'safe',
      rect: { x: 0, y: 0, width: 80, height: 48 },
    }];
    const index = createRoutingWaypointVisualRectIndex(entries);

    expect(index.queryPotentialEntries({
      a: { x: Number.NaN, y: 0 },
      b: { x: 10, y: 0 },
    }, 28)).toEqual({ entries, scannedNodeCount: 1 });
    expect(index.queryPotentialEntries({
      a: { x: 0, y: 0 },
      b: { x: 10, y: 0 },
    }, -1)).toEqual({ entries, scannedNodeCount: 1 });
  });
});
