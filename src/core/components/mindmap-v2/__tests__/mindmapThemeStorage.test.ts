import { describe, expect, it, vi } from 'vitest';
import {
  isStoredApplicationThemeDark,
  persistMindMapThemeKey,
  readStoredMindMapThemeKey,
  resolveMindMapThemeKey,
  shouldSyncMindMapThemeWithApplication,
} from '../mindmapThemeStorage';

const storage = (values: Record<string, string> = {}) => ({
  getItem: vi.fn((key: string) => values[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { values[key] = value; }),
});

describe('mindmapThemeStorage', () => {
  it('accepts only registered bounded theme keys', () => {
    expect(readStoredMindMapThemeKey(storage({ vizly_mindmap_theme: 'ocean' }))).toBe('ocean');
    expect(readStoredMindMapThemeKey(storage({ vizly_mindmap_theme: '../../evil' }))).toBeNull();
    expect(readStoredMindMapThemeKey(storage({ vizly_mindmap_theme: 'x'.repeat(100) }))).toBeNull();
    expect(resolveMindMapThemeKey(storage())).toBe('indigo');
  });

  it('reads the application dark-mode flag without accepting other values', () => {
    expect(isStoredApplicationThemeDark(storage({ 'vizly-theme': 'dark' }))).toBe(true);
    expect(isStoredApplicationThemeDark(storage({ 'vizly-theme': 'system' }))).toBe(false);
  });

  it('syncs the application theme only when no valid manual mind-map theme exists', () => {
    expect(shouldSyncMindMapThemeWithApplication(storage())).toBe(true);
    expect(shouldSyncMindMapThemeWithApplication(storage({ vizly_mindmap_theme: '../../evil' }))).toBe(true);
    expect(shouldSyncMindMapThemeWithApplication(storage({ vizly_mindmap_theme: 'ocean' }))).toBe(false);
    expect(shouldSyncMindMapThemeWithApplication(storage({ vizly_mindmap_theme: 'dark' }))).toBe(false);
  });

  it('degrades safely when storage rejects access', () => {
    const unavailable = {
      getItem: vi.fn(() => { throw new DOMException('blocked', 'SecurityError'); }),
      setItem: vi.fn(() => { throw new DOMException('blocked', 'SecurityError'); }),
    };
    expect(resolveMindMapThemeKey(unavailable)).toBe('indigo');
    expect(persistMindMapThemeKey('dark', unavailable)).toBe(false);
    expect(persistMindMapThemeKey('unknown', storage())).toBe(false);
  });
});
