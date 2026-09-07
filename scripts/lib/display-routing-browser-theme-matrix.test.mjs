// @vitest-environment jsdom
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertDisplayRoutingThemeState,
  DISPLAY_ROUTING_THEME_CASES,
  clickDisplayRoutingThemeControl,
  verifyDisplayRoutingThemeMatrix,
} from './display-routing-browser-theme-matrix.mjs';

const stateFor = themeCase => ({
  dataTheme: themeCase.mode,
  primary: themeCase.primary.toUpperCase(),
  outputRouteSignature: 'route-v2:14:61:8e8bdf697cad3bb7',
  workerStartCount: 1,
  workerAbortCount: 0,
  stage: 'final-applied',
});

describe('display routing browser theme matrix', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('--theme-primary-main');
    delete window.__vizlyBaseReactFlowDisplayRouting;
  });

  it.each([false, true])('switches through application controls (nested settings: %s)', async nestedSettings => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}]);
    const selected = [];
    const setTheme = themeCase => {
      document.documentElement.setAttribute('data-theme', themeCase.mode);
      document.documentElement.style.setProperty('--theme-primary-main', themeCase.primary);
    };
    setTheme(DISPLAY_ROUTING_THEME_CASES[0]);
    window.__vizlyBaseReactFlowDisplayRouting = stateFor(DISPLAY_ROUTING_THEME_CASES[0]);
    const trigger = document.createElement('button');
    trigger.setAttribute('data-theme-selector-trigger', '');
    trigger.onclick = () => {
      const dialog = document.createElement('div');
      dialog.setAttribute('data-theme-selector-dialog', '');
      for (const themeCase of DISPLAY_ROUTING_THEME_CASES) {
        const choice = document.createElement('button');
        choice.setAttribute('data-theme-id', themeCase.id);
        choice.onclick = () => { selected.push(themeCase.id); setTheme(themeCase); };
        dialog.append(choice);
      }
      const close = document.createElement('button');
      close.setAttribute('data-theme-selector-close', '');
      close.onclick = () => dialog.remove();
      dialog.append(close);
      document.body.append(dialog);
    };
    const send = vi.fn(async (method, event) => {
      expect(method).toBe('Input.dispatchKeyEvent');
      expect(event).toMatchObject({ key: ',', code: 'Comma', modifiers: 2 });
      if (event.type !== 'keyDown') return;
      const settings = document.createElement('div');
      settings.setAttribute('role', 'dialog');
      const close = document.createElement('button');
      close.setAttribute('data-settings-close', '');
      close.onclick = () => settings.remove();
      settings.append(trigger, close);
      document.body.append(settings);
    });
    if (!nestedSettings) document.body.append(trigger);
    const session = { send, evaluate: async source => runInNewContext(source, {
      window, document, getComputedStyle: window.getComputedStyle.bind(window),
    }) };
    const interactions = vi.fn(async () => []);
    const result = await verifyDisplayRoutingThemeMatrix({ session,
      expectedSignature: stateFor(DISPLAY_ROUTING_THEME_CASES[0]).outputRouteSignature,
      expectedWorkerStartCount: 1, expectedWorkerAbortCount: 0,
      verifyVisualScales: async () => [], verifyInteractionStates: interactions,
    });
    expect(result.map(item => item.id)).toEqual(['light', 'dark', 'high-contrast']);
    expect(selected).toEqual(['dark', 'high-contrast']);
    expect(interactions).toHaveBeenCalledTimes(3);
    expect(document.querySelector('[data-theme-selector-dialog]')).toBeNull();
    expect(document.querySelector('[data-settings-close]')).toBeNull();
    expect(send).toHaveBeenCalledTimes(nestedSettings ? 4 : 0);
  });

  it('rejects missing, hidden, disabled, ambiguous and invalid controls', () => {
    expect(clickDisplayRoutingThemeControl(document, 'open', 'dark')).toBe(false);
    const trigger = document.createElement('button');
    trigger.setAttribute('data-theme-selector-trigger', '');
    trigger.onclick = vi.fn();
    document.body.append(trigger);
    expect(clickDisplayRoutingThemeControl(document, 'open', 'dark')).toBe(false);
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}]);
    trigger.disabled = true;
    expect(clickDisplayRoutingThemeControl(document, 'open', 'dark')).toBe(false);
    trigger.disabled = false;
    trigger.hidden = true;
    expect(clickDisplayRoutingThemeControl(document, 'open', 'dark')).toBe(false);
    trigger.hidden = false;
    for (const id of ['', null, 'unknown', '<script>alert(1)</script>', 'x'.repeat(10_000)]) {
      expect(clickDisplayRoutingThemeControl(document, 'open', id)).toBe(false);
    }
    expect(clickDisplayRoutingThemeControl(document, 'invalid', 'dark')).toBe(false);
    expect(clickDisplayRoutingThemeControl(document, 'select', 'dark')).toBe(false);
    for (let index = 0; index < 2; index += 1) {
      const dialog = document.createElement('div');
      dialog.setAttribute('data-theme-selector-dialog', '');
      document.body.append(dialog);
    }
    expect(clickDisplayRoutingThemeControl(document, 'select', 'dark')).toBe(false);
    expect(clickDisplayRoutingThemeControl(document, 'close', 'dark')).toBe(false);
    expect(clickDisplayRoutingThemeControl(document, 'close-settings', 'dark')).toBe(false);
    expect(trigger.onclick).not.toHaveBeenCalled();
  });

  it('closes settings only after the nested selector closes and the control is unambiguous', () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}]);
    expect(clickDisplayRoutingThemeControl(document, 'close-settings', 'dark')).toBe(false);
    const close = document.createElement('button');
    close.setAttribute('data-settings-close', '');
    close.onclick = vi.fn();
    const duplicate = close.cloneNode();
    document.body.append(close, duplicate);
    expect(clickDisplayRoutingThemeControl(document, 'close-settings', 'dark')).toBe(false);
    duplicate.remove();
    const dialog = document.createElement('div');
    dialog.setAttribute('data-theme-selector-dialog', '');
    document.body.append(dialog);
    expect(clickDisplayRoutingThemeControl(document, 'close-settings', 'dark')).toBe(false);
    dialog.remove();
    expect(clickDisplayRoutingThemeControl(document, 'close-settings', 'dark')).toBe(true);
    expect(close.onclick).toHaveBeenCalledOnce();
  });

  it('accepts all canonical themes without a geometry or Worker lifecycle change', () => {
    for (const themeCase of DISPLAY_ROUTING_THEME_CASES) {
      expect(assertDisplayRoutingThemeState({
        themeCase,
        state: stateFor(themeCase),
        expectedSignature: 'route-v2:14:61:8e8bdf697cad3bb7',
        expectedWorkerStartCount: 1,
        expectedWorkerAbortCount: 0,
      })).toMatchObject({ workerStartCount: 1, workerAbortCount: 0 });
    }
  });

  it('fails closed for the wrong palette, route signature, or Worker count', () => {
    const themeCase = DISPLAY_ROUTING_THEME_CASES[1];
    const assertState = state => assertDisplayRoutingThemeState({
      themeCase,
      state,
      expectedSignature: 'route-v2:14:61:8e8bdf697cad3bb7',
      expectedWorkerStartCount: 1,
      expectedWorkerAbortCount: 0,
    });

    expect(() => assertState({ ...stateFor(themeCase), primary: '#ffffff' }))
      .toThrow(/theme state failed/);
    expect(() => assertState({ ...stateFor(themeCase), outputRouteSignature: 'stale' }))
      .toThrow(/theme state failed/);
    expect(() => assertState({ ...stateFor(themeCase), workerStartCount: 2 }))
      .toThrow(/theme state failed/);
    expect(() => assertState(null)).toThrow(/theme state failed/);
  });
});
