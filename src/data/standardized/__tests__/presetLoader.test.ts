import { describe, expect, it } from 'vitest';

import { loadStandardPresetById } from '../presetLoader';

describe('loadStandardPresetById', () => {
  it('single-flights the canonical key and persisted diagram id', async () => {
    const byId = loadStandardPresetById('logistics-architecture-v1');
    const byKey = loadStandardPresetById('LogisticsStandardData');

    expect(byId).toBe(byKey);
    await expect(byId).resolves.toMatchObject({
      id: 'logistics-architecture-v1',
      type: 'logistics',
    });
  });

  it('returns null for unknown ids without importing a fallback preset', async () => {
    await expect(loadStandardPresetById('unknown-diagram')).resolves.toBeNull();
  });
});
