// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  openDiagramViewerInNewTab,
  seedAutoSaveAndNavigateDiagram,
  selectDiagramInViewer,
} from '../diagramViewerNavigation';

describe('diagramViewerNavigation', () => {
  it('updates search params and recent diagrams when selecting a diagram', () => {
    const addRecentDiagram = vi.fn();
    const setSearchParams = vi.fn((updater) => updater(new URLSearchParams('foo=bar')));
    const setDiagramSearchParam = vi.fn((prev: URLSearchParams, id: string) => {
      const next = new URLSearchParams(prev);
      next.set('diagram', id);
      return next;
    });

    selectDiagramInViewer({
      id: 'target',
      setSearchParams,
      setDiagramSearchParam,
      addRecentDiagram,
    });

    expect(setDiagramSearchParam).toHaveBeenCalled();
    expect(addRecentDiagram).toHaveBeenCalledWith('target');
  });

  it('opens a diagram in a new tab and falls back on invalid URLs', () => {
    const openWindow = vi.fn();
    const logFailure = vi.fn();

    openDiagramViewerInNewTab({
      id: 'alpha',
      currentHref: 'https://example.com/app?foo=bar',
      openWindow,
      logFailure,
    });
    expect(openWindow).toHaveBeenCalledWith(
      'https://example.com/app?foo=bar&diagram=alpha',
      '_blank',
      'noopener,noreferrer',
    );

    openDiagramViewerInNewTab({
      id: 'beta',
      currentHref: '::::',
      openWindow,
      logFailure,
    });
    expect(logFailure).toHaveBeenCalledTimes(1);
    expect(openWindow).toHaveBeenLastCalledWith('/?diagram=beta', '_blank', 'noopener,noreferrer');
  });

  it('only finalizes seed navigation after confirmation and normalization', async () => {
    const ensureSwitchConfirmed = vi.fn().mockResolvedValue(true);
    const normalizeSeedData = vi.fn().mockResolvedValue({ normalized: true });
    const finalizeNavigation = vi.fn();

    await expect(seedAutoSaveAndNavigateDiagram({
      data: { raw: true },
      id: 'next-diagram',
      ensureSwitchConfirmed,
      normalizeSeedData,
      finalizeNavigation,
    })).resolves.toBe(true);

    expect(finalizeNavigation).toHaveBeenCalledWith({ normalized: true }, 'next-diagram');

    ensureSwitchConfirmed.mockResolvedValueOnce(false);
    await expect(seedAutoSaveAndNavigateDiagram({
      data: { raw: false },
      id: 'blocked',
      ensureSwitchConfirmed,
      normalizeSeedData,
      finalizeNavigation,
    })).resolves.toBe(false);
  });
});
