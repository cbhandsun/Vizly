import { describe, expect, it } from 'vitest';

import { TimelinePlugin } from '../TimelinePlugin';

describe('TimelinePlugin migration', () => {
  it.each(['event', 'milestone'] as const)('normalizes legacy %s data into an atomic point', async (type) => {
    const result = await new TimelinePlugin().migrate({
      nodes: [{
        id: type,
        data: {
          type,
          date: '2026-08-24',
          endDate: '2026-09-30',
          progress: 73,
          status: 'done',
        },
      }],
      edges: [],
    }, '1.1.0');

    expect(result.nodes[0].data).toMatchObject({
      type,
      date: '2026-08-24',
      endDate: '2026-08-24',
      status: 'done',
    });
    expect(result.nodes[0].data).not.toHaveProperty('progress');
  });

  it('coerces malformed phase fields without mutating the input', async () => {
    const source = {
      nodes: [{
        id: 'phase',
        data: {
          type: '<script>',
          date: '2026-02-31',
          endDate: '2020-01-01',
          progress: Number.POSITIVE_INFINITY,
          status: 'unknown',
        },
      }],
    };
    const result = await new TimelinePlugin().migrate(source, undefined);

    expect(result).not.toBe(source);
    expect(result.nodes[0].data).toMatchObject({
      type: 'phase',
      progress: 0,
      status: 'pending',
    });
    expect(result.nodes[0].data.endDate).toBe(result.nodes[0].data.date);
    expect(source.nodes[0].data.type).toBe('<script>');
  });

  it('leaves current-version payload values untouched', async () => {
    const plugin = new TimelinePlugin();
    const source = { nodes: [{ id: 'legacy', data: { type: 'event', endDate: '2099-01-01' } }] };

    await expect(plugin.migrate(source, plugin.version)).resolves.toEqual(source);
  });
});
