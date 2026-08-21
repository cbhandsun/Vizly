import { describe, expect, it, vi } from 'vitest';

import {
  dismissMindMapEmptyGuide,
  isMindMapEmptyGuideDismissed,
} from '../mindMapEmptyGuidePreference';

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  };
};

describe('mindMapEmptyGuidePreference', () => {
  it('persists dismissal per sanitized diagram identifier', () => {
    const storage = createStorage();

    expect(isMindMapEmptyGuideDismissed('diagram-one', storage)).toBe(false);
    expect(dismissMindMapEmptyGuide('diagram-one', storage)).toBe(true);
    expect(isMindMapEmptyGuideDismissed('diagram-one', storage)).toBe(true);
    expect(isMindMapEmptyGuideDismissed('diagram-two', storage)).toBe(false);
  });

  it('rejects empty identifiers and bounds unsafe external input', () => {
    const storage = createStorage();

    expect(dismissMindMapEmptyGuide(null, storage)).toBe(false);
    expect(dismissMindMapEmptyGuide('   ', storage)).toBe(false);
    expect(dismissMindMapEmptyGuide(`<script>${'x'.repeat(400)}</script>`, storage)).toBe(true);

    const persistedKey = storage.setItem.mock.calls[0]?.[0] ?? '';
    expect(persistedKey).toMatch(/^vizly_mindmap_empty_guide_dismissed_v1:/);
    expect(persistedKey).not.toContain('<');
    expect(persistedKey.length).toBeLessThan(400);
  });

  it('degrades safely when storage access fails', () => {
    const unavailable = {
      getItem: vi.fn(() => { throw new DOMException('blocked', 'SecurityError'); }),
      setItem: vi.fn(() => { throw new DOMException('blocked', 'SecurityError'); }),
    };

    expect(isMindMapEmptyGuideDismissed('diagram-one', unavailable)).toBe(false);
    expect(dismissMindMapEmptyGuide('diagram-one', unavailable)).toBe(false);
    expect(isMindMapEmptyGuideDismissed('diagram-one', null)).toBe(false);
  });
});
