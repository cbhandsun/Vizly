// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { hasVisibleModalDialog } from '@/core/components/ui/modalDialogState';
import { shouldHideDiagramViewerCenterIsland } from '../diagramViewerChrome';

const markVisible = (element: HTMLElement): void => {
  Object.defineProperty(element, 'getClientRects', {
    configurable: true,
    value: () => [{ width: 320, height: 240 }],
  });
};

describe('diagramViewerOverlayState', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('detects only visible modal dialogs', () => {
    const hiddenDialog = document.createElement('div');
    hiddenDialog.setAttribute('role', 'dialog');
    hiddenDialog.setAttribute('aria-modal', 'true');
    document.body.appendChild(hiddenDialog);

    expect(hasVisibleModalDialog()).toBe(false);

    const visibleDialog = document.createElement('div');
    visibleDialog.setAttribute('role', 'dialog');
    visibleDialog.setAttribute('aria-modal', 'true');
    markVisible(visibleDialog);
    document.body.appendChild(visibleDialog);

    expect(hasVisibleModalDialog()).toBe(true);

    visibleDialog.setAttribute('aria-hidden', 'true');
    expect(hasVisibleModalDialog()).toBe(false);
  });

  it('ignores visible non-modal regions', () => {
    const region = document.createElement('div');
    region.setAttribute('role', 'region');
    markVisible(region);
    document.body.appendChild(region);

    expect(hasVisibleModalDialog()).toBe(false);
  });
});

describe('diagram viewer plugin chrome', () => {
  it('hides the generic center island for self-rendered canvases', () => {
    expect(shouldHideDiagramViewerCenterIsland('timeline-diagram')).toBe(true);
    expect(shouldHideDiagramViewerCenterIsland('mindmap')).toBe(true);
    expect(shouldHideDiagramViewerCenterIsland('flowchart')).toBe(false);
    expect(shouldHideDiagramViewerCenterIsland(null)).toBe(false);
  });
});
