// @vitest-environment jsdom
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readThemeControlEvidence, projectThemeControlEvidence, readThemeShortcutEvidence,
  projectThemeShortcutEvidence } from './display-routing-theme-control-evidence.mjs';

import {
  assertDisplayRoutingThemeState,
  DISPLAY_ROUTING_THEME_CASES,
  clickDisplayRoutingThemeControl,
  switchDisplayRoutingTheme,
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
  it('records shortcut arrival and later cancellation without retaining other keys', async () => {
    const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    expect(readThemeShortcutEvidence(document, true)).toEqual({ received: false, defaultPrevented: null });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'private-user-content' }));
    expect(readThemeShortcutEvidence(document).received).toBe(false);
    window.addEventListener('keydown', stop);
    try {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true, cancelable: true }));
      await new Promise(resolve => window.queueMicrotask(resolve));
      expect(readThemeShortcutEvidence(document)).toEqual({ received: true, defaultPrevented: true });
      expect(window.__vizlyThemeShortcutCleanup).toBeUndefined();
      expect(JSON.stringify(readThemeShortcutEvidence(document))).not.toContain('private');
    } finally { window.removeEventListener('keydown', stop); }
  });

  it('bounds an undelivered shortcut observer to the original timeout', () => {
    vi.useFakeTimers();
    try {
      readThemeShortcutEvidence(document, true);
      vi.advanceTimersByTime(5000);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true }));
      expect(readThemeShortcutEvidence(document)).toEqual({ received: false, defaultPrevented: null });
      expect(window.__vizlyThemeShortcutCleanup).toBeUndefined();
    } finally { vi.useRealTimers(); }
  });

  it('projects only shortcut booleans from untrusted evidence', () => {
    for (const value of [null, [], {}, { received: 'secret', defaultPrevented: false }]) {
      expect(projectThemeShortcutEvidence(value)).toBeNull();
    }
    expect(projectThemeShortcutEvidence({ received: true, defaultPrevented: false, key: 'secret' }))
      .toEqual({ received: true, defaultPrevented: false });
  });
  it('retains bounded control evidence without content or input values', () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}]);
    for (let index = 0; index < 70; index += 1) {
      const button = document.createElement('button');
      button.setAttribute('data-theme-selector-trigger', '');
      button.textContent = 'private-theme-title';
      button.disabled = index === 0;
      button.hidden = index === 1;
      document.body.append(button);
    }
    const input = document.createElement('input');
    input.value = 'Bearer-private-secret';
    document.body.append(input);
    input.focus();
    for (const hidden of [false, true]) {
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-hidden', String(hidden));
      document.body.append(dialog);
    }
    const evidence = projectThemeControlEvidence(readThemeControlEvidence(document));
    expect(evidence).toMatchObject({ focus: 'input', editable: true,
      trigger: { found: 70, scanned: 64, clickable: 62, disabled: 1, hidden: 1 },
      modal: { found: 2, scanned: 2, hidden: 1 } });
    expect(JSON.stringify(evidence)).not.toMatch(/private-theme-title|Bearer-private-secret/);
  });

  it('projects untrusted CDP fields into fixed enums and bounded numbers', () => {
    expect(projectThemeControlEvidence(null)).toBeNull();
    expect(projectThemeControlEvidence([])).toBeNull();
    const evidence = projectThemeControlEvidence({ schema: 'theme-control-evidence-v1',
      readyState: 'secret', visibility: 'secret', focus: 'secret', editable: 'secret', hasFocus: 1,
      trigger: { found: Infinity, scanned: 65, clickable: -1, disabled: 'secret', hidden: 0, obscured: 1.2 },
      settings: null, dialog: {}, content: 'secret' });
    expect(evidence).toMatchObject({ readyState: 'unknown', visibility: 'unknown', focus: 'unknown',
      editable: null, hasFocus: null, trigger: { found: null, scanned: null, clickable: null,
        disabled: null, hidden: 0, obscured: null } });
    expect(JSON.stringify(evidence)).not.toContain('secret');
  });

  it('reports disabled controls at the original deadline without additional shortcuts', async () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}]);
    const button = document.createElement('button');
    button.setAttribute('data-theme-selector-trigger', '');
    button.disabled = true;
    document.body.append(button);
    let now = 0;
    const session = { send: vi.fn(), evaluate: async expression => runInNewContext(expression, {
      document, window, getComputedStyle: window.getComputedStyle.bind(window),
    }) };
    const failure = await switchDisplayRoutingTheme(session, DISPLAY_ROUTING_THEME_CASES[1], {
      now: () => now, wait: async ms => { now += ms; },
    }).catch(error => error);
    expect(now).toBe(5000);
    expect(session.send).toHaveBeenCalledTimes(2);
    expect(failure.message).toContain('within 5000ms');
    const controls = JSON.parse(failure.message.split('; controls=')[1]);
    expect(controls).toMatchObject({ openedSettings: true, lastControlEvidence: { action: 'open',
      elapsedMs: 4950, snapshot: { trigger: { found: 1, disabled: 1, clickable: 0 } } } });
  });

  it('keeps the original failure when diagnostic style inspection throws', async () => {
    const button = document.createElement('button');
    button.setAttribute('data-theme-selector-trigger', '');
    button.disabled = true;
    document.body.append(button);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => { throw new Error('private-probe-error'); });
    let now = 0;
    const session = { send: vi.fn(), evaluate: async expression => runInNewContext(expression, { document, window }) };
    const failure = await switchDisplayRoutingTheme(session, DISPLAY_ROUTING_THEME_CASES[1], {
      now: () => now, wait: async ms => { now += ms; },
    }).catch(error => error);
    expect(now).toBe(5000);
    expect(failure.message).toContain('within 5000ms');
    expect(failure.message).toContain('"lastControlEvidence":null');
    expect(failure.message).not.toContain('private-probe-error');
  });

  it.each([
    { closedAt: 4_980, observedAt: 4_980, succeeds: true },
    { closedAt: 5_001, observedAt: 5_001, succeeds: false },
    { closedAt: 4_980, observedAt: 5_001, succeeds: false },
  ])('checks completed settings closure within the original deadline: %j', async ({ closedAt, observedAt, succeeds }) => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}]);
    let now = 0;
    const theme = DISPLAY_ROUTING_THEME_CASES[1];
    const trigger = document.createElement('button');
    trigger.setAttribute('data-theme-selector-trigger', '');
    trigger.onclick = () => {
      const dialog = document.createElement('div');
      dialog.setAttribute('data-theme-selector-dialog', '');
      const choice = document.createElement('button');
      choice.setAttribute('data-theme-id', theme.id);
      choice.onclick = () => {
        document.documentElement.setAttribute('data-theme', theme.mode);
        document.documentElement.style.setProperty('--theme-primary-main', theme.primary);
      };
      const close = document.createElement('button');
      close.setAttribute('data-theme-selector-close', '');
      close.onclick = () => dialog.remove();
      dialog.append(choice, close);
      document.body.append(dialog);
    };
    const session = {
      evaluate: async expression => {
        const result = runInNewContext(expression, {
          document, window, getComputedStyle: window.getComputedStyle.bind(window),
        });
        if (expression === "!document.querySelector('[data-settings-close]')") now = observedAt;
        return result;
      },
      send: async (_method, { type }) => {
        if (type !== 'keyDown') return;
        const settings = document.createElement('div');
        const close = document.createElement('button');
        close.setAttribute('data-settings-close', '');
        close.onclick = () => { settings.remove(); now = closedAt; };
        settings.append(trigger, close);
        document.body.append(settings);
      },
    };
    const result = switchDisplayRoutingTheme(session, theme, {
      now: () => now,
      wait: async ms => { now += ms; },
    });
    if (succeeds) await expect(result).resolves.toMatchObject({ dataTheme: 'dark' });
    else await expect(result).rejects.toThrow('within 5000ms');
    expect(document.querySelector('[data-settings-close]')).toBeNull();
  });

  afterEach(() => {
    window.__vizlyThemeShortcutCleanup?.();
    delete window.__vizlyThemeShortcutEvidence;
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
