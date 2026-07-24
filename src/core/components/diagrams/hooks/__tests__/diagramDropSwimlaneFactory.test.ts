import { describe, expect, it } from 'vitest';
import { coerceSwimlaneLanes, createSwimlaneDropNodes } from '../diagramDropSwimlaneFactory';

describe('diagram drop swimlane factory', () => {
  it('falls back for empty or invalid lane input', () => {
    expect(coerceSwimlaneLanes(null)).toHaveLength(3);
    expect(coerceSwimlaneLanes([{ label: '' }, null])).toHaveLength(3);
  });

  it('bounds and sanitizes external lane definitions', () => {
    const lanes = coerceSwimlaneLanes(Array.from({ length: 25 }, (_, index) => ({
      id: `lane-${index}`,
      label: ` Lane ${index} `,
      color: index === 0 ? '#abcdef' : 'red',
    })));
    expect(lanes).toHaveLength(20);
    expect(lanes[0]).toEqual({ id: 'lane-0', label: 'Lane 0', color: '#abcdef' });
    expect(lanes[1].color).toBeUndefined();
  });

  it('creates bounded vertical parent and child geometry', () => {
    const nodes = createSwimlaneDropNodes({
      containerId: 'swimlane-1',
      position: { x: 10, y: 20 },
      label: 'Process',
      config: { direction: 'vertical', lanes: [{ label: 'A' }, { label: 'B' }] },
      layerId: 'layer-1',
    });
    expect(nodes).toHaveLength(3);
    expect(nodes[0].data).toMatchObject({ direction: 'vertical', laneCount: 2 });
    expect(nodes[1]).toMatchObject({ parentId: 'swimlane-1', position: { x: 0, y: 36 } });
    expect(nodes[2]).toMatchObject({ parentId: 'swimlane-1', position: { x: 400, y: 36 } });
  });
});
