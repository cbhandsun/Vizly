// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import {
  focusAvailableExportTrigger,
  isolateExportOverlaySiblings,
  markExportCaptureElementHidden,
} from '@/core/export/exportAccessibility';

describe('export accessibility boundaries', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('keeps offscreen export captures out of the accessibility and focus trees', () => {
    const capture = document.createElement('div');

    markExportCaptureElementHidden(capture);

    expect(capture.getAttribute('data-vizly-export-capture')).toBe('true');
    expect(capture.getAttribute('aria-hidden')).toBe('true');
    expect(capture.hasAttribute('inert')).toBe(true);
  });

  it('isolates existing and newly-added overlay siblings, then restores their attributes', async () => {
    const application = document.createElement('main');
    application.setAttribute('aria-hidden', 'false');
    const overlay = document.createElement('div');
    document.body.append(application, overlay);

    const restore = isolateExportOverlaySiblings(overlay);
    expect(application.getAttribute('aria-hidden')).toBe('true');
    expect(application.hasAttribute('inert')).toBe(true);

    const lateCapture = document.createElement('div');
    document.body.appendChild(lateCapture);
    await Promise.resolve();
    expect(lateCapture.getAttribute('aria-hidden')).toBe('true');
    expect(lateCapture.hasAttribute('inert')).toBe(true);

    restore();
    expect(application.getAttribute('aria-hidden')).toBe('false');
    expect(application.hasAttribute('inert')).toBe(false);
    expect(lateCapture.hasAttribute('aria-hidden')).toBe(false);
    expect(lateCapture.hasAttribute('inert')).toBe(false);
  });

  it('restores focus only to an available connected export trigger', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);

    expect(focusAvailableExportTrigger(trigger)).toBe(true);
    expect(document.activeElement).toBe(trigger);

    trigger.disabled = true;
    expect(focusAvailableExportTrigger(trigger)).toBe(false);
    trigger.remove();
    trigger.disabled = false;
    expect(focusAvailableExportTrigger(trigger)).toBe(false);
  });
});
