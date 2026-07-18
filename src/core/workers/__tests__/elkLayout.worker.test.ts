// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

vi.mock('elkjs/lib/elk-api', () => ({
  default: class MockElk {
    layout = vi.fn();
  },
}));

vi.mock('elkjs/lib/elk-worker.min.js?url', () => ({
  default: 'elk-worker.js',
}));

describe('elkLayout.worker message guards', () => {
  it('accepts a valid ELK layout worker message', async () => {
    const { validateElkWorkerMessage } = await import('../elkLayout.worker');

    const result = validateElkWorkerMessage({
      id: 'layout-a',
      graph: {
        id: 'root',
        layoutOptions: { 'elk.algorithm': 'layered' },
        children: [{ id: 'node-a', width: 100, height: 60 }],
        edges: [{ id: 'edge-a', sources: ['node-a'], targets: ['node-b'] }],
      },
      options: { 'elk.direction': 'RIGHT' },
    });

    expect(result.ok).toBe(true);
  });

  it('rejects malformed ELK layout worker messages', async () => {
    const { validateElkWorkerMessage } = await import('../elkLayout.worker');

    expect(validateElkWorkerMessage(null)).toMatchObject({
      ok: false,
      error: 'Invalid ELK worker message',
    });
    expect(validateElkWorkerMessage({ graph: { id: 'root' } })).toMatchObject({
      ok: false,
      error: 'Invalid ELK worker request id',
    });
    expect(validateElkWorkerMessage({ id: 'layout-a', graph: null })).toMatchObject({
      ok: false,
      id: 'layout-a',
      error: 'Invalid ELK graph',
    });
    expect(validateElkWorkerMessage({ id: 'layout-a', graph: { id: '' } })).toMatchObject({
      ok: false,
      id: 'layout-a',
      error: 'Invalid ELK graph id',
    });
  });

  it('rejects wrong-shaped ELK graph collections and options', async () => {
    const { validateElkWorkerMessage } = await import('../elkLayout.worker');

    expect(validateElkWorkerMessage({
      id: 'layout-a',
      graph: { id: 'root', children: [{ width: 100 }] },
    })).toMatchObject({ ok: false, error: 'Invalid ELK graph children' });

    expect(validateElkWorkerMessage({
      id: 'layout-a',
      graph: { id: 'root', edges: [{ id: 'edge-a', sources: ['a'], targets: [null] }] },
    })).toMatchObject({ ok: false, error: 'Invalid ELK graph edges' });

    expect(validateElkWorkerMessage({
      id: 'layout-a',
      graph: { id: 'root', layoutOptions: [] },
    })).toMatchObject({ ok: false, error: 'Invalid ELK graph layout options' });

    expect(validateElkWorkerMessage({
      id: 'layout-a',
      graph: { id: 'root' },
      options: [],
    })).toMatchObject({ ok: false, error: 'Invalid ELK layout options' });
  });
});
