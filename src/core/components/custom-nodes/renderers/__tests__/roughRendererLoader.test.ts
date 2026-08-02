import { describe, expect, it, vi } from 'vitest';

import { createRoughRendererLoader } from '../roughRendererLoader';

describe('createRoughRendererLoader', () => {
  it('shares one in-flight import and returns the renderer', async () => {
    const renderer = { svg: vi.fn() };
    const importRenderer = vi.fn(async () => ({ default: renderer }));
    const loadRenderer = createRoughRendererLoader(importRenderer);

    await expect(Promise.all([loadRenderer(), loadRenderer()])).resolves.toEqual([renderer, renderer]);
    expect(importRenderer).toHaveBeenCalledTimes(1);
  });

  it('clears a failed import so a later sketch render can retry', async () => {
    const renderer = { svg: vi.fn() };
    const importRenderer = vi.fn()
      .mockRejectedValueOnce(new Error('chunk unavailable'))
      .mockResolvedValueOnce({ default: renderer });
    const loadRenderer = createRoughRendererLoader(importRenderer);

    await expect(loadRenderer()).rejects.toThrow('chunk unavailable');
    await expect(loadRenderer()).resolves.toBe(renderer);
    expect(importRenderer).toHaveBeenCalledTimes(2);
  });
});
