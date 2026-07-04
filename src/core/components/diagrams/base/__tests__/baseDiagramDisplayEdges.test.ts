import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
  createBaseDiagramDisplayEdges,
  hasTrustedLayoutPath,
} from '../baseDiagramDisplayEdges';

const makeEdge = (data: Edge['data'], type = 'advanced-smart'): Edge => ({
  id: 'edge-a-b',
  source: 'a',
  target: 'b',
  type,
  data,
});

describe('baseDiagramDisplayEdges', () => {
  it('promotes locked computed paths to the stable renderer', () => {
    const edge = makeEdge({
      layoutPathLocked: true,
      sharedTrunkAware: true,
      computedPath: [{ x: 0, y: 0 }, { x: 40, y: 0 }],
    });

    const [displayEdge] = createBaseDiagramDisplayEdges([edge]);

    expect(hasTrustedLayoutPath(edge)).toBe(true);
    expect(displayEdge.type).toBe('stablePath');
    expect(displayEdge.data).toBe(edge.data);
  });

  it('promotes ordinary locked computed paths to the stable renderer', () => {
    const edge = makeEdge({
      layoutPathLocked: true,
      computedPath: [{ x: 0, y: 0 }, { x: 40, y: 0 }],
    }, 'smart');

    const [displayEdge] = createBaseDiagramDisplayEdges([edge]);

    expect(hasTrustedLayoutPath(edge)).toBe(true);
    expect(displayEdge.type).toBe('stablePath');
  });

  it('does not promote invalid computed paths', () => {
    const edge = makeEdge({
      layoutPathLocked: true,
      sharedTrunkAware: true,
      computedPath: [{ x: 0, y: 0 }, { x: Number.POSITIVE_INFINITY, y: 0 }],
    });

    const [displayEdge] = createBaseDiagramDisplayEdges([edge]);

    expect(hasTrustedLayoutPath(edge)).toBe(false);
    expect(displayEdge).toBe(edge);
  });
});
