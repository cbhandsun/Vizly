import { setTimeout as delay } from 'node:timers/promises';
import { readThemeControlEvidence, projectThemeControlEvidence, readThemeShortcutEvidence,
  projectThemeShortcutEvidence } from './display-routing-theme-control-evidence.mjs';

export const DISPLAY_ROUTING_THEME_CASES = Object.freeze([
  Object.freeze({ id: 'light', mode: 'light', primary: '#007bff' }),
  Object.freeze({ id: 'dark', mode: 'dark', primary: '#177ddc' }),
  Object.freeze({ id: 'high-contrast', mode: 'light', primary: '#000000' }),
]);

const normalizeColor = value => typeof value === 'string' ? value.trim().toLowerCase() : '';

export const assertDisplayRoutingThemeState = ({
  themeCase,
  state,
  expectedSignature,
  expectedWorkerStartCount,
  expectedWorkerAbortCount,
}) => {
  const valid = state
    && state.dataTheme === themeCase.mode
    && normalizeColor(state.primary) === normalizeColor(themeCase.primary)
    && state.outputRouteSignature === expectedSignature
    && state.workerStartCount === expectedWorkerStartCount
    && state.workerAbortCount === expectedWorkerAbortCount
    && state.stage === 'final-applied';
  if (valid) return state;
  throw new Error(`Display-routing theme state failed: ${JSON.stringify({
    themeId: themeCase?.id ?? null,
    expectedMode: themeCase?.mode ?? null,
    expectedPrimary: themeCase?.primary ?? null,
    expectedSignature,
    expectedWorkerStartCount,
    expectedWorkerAbortCount,
    state: state ? {
      dataTheme: state.dataTheme,
      primary: state.primary,
      signatureMatches: state.outputRouteSignature === expectedSignature,
      workerStartCount: state.workerStartCount,
      workerAbortCount: state.workerAbortCount,
      stage: state.stage,
    } : null,
  })}`);
};

const readThemeState = session => session.evaluate(`(() => {
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  return {
    dataTheme: document.documentElement.getAttribute('data-theme'),
    primary: getComputedStyle(document.documentElement).getPropertyValue('--theme-primary-main'),
    outputRouteSignature: routing.outputRouteSignature,
    workerStartCount: routing.workerStartCount,
    workerAbortCount: routing.workerAbortCount,
    stage: routing.stage,
  };
})()`);

const waitForThemeState = async (session, expected, timeoutMs = 5_000) => {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await readThemeState(session);
    if (
      state?.dataTheme === expected.mode
      && normalizeColor(state.primary) === normalizeColor(expected.primary)
    ) return state;
    await delay(50);
  }
  return state;
};

// The global-theme event is a notification, and its designer listener may not
// be mounted. Exercise the authoritative application control in every view.
export const clickDisplayRoutingThemeControl = (doc, action, themeId) => {
  if (!['light', 'dark', 'high-contrast'].includes(themeId)
    || !['open', 'select', 'close', 'close-settings'].includes(action)) return false;
  const dialogs = [...doc.querySelectorAll('[data-theme-selector-dialog]')];
  const clickable = button => button?.tagName === 'BUTTON' && !button.disabled
    && !button.closest('[inert], [hidden]') && button.getClientRects().length > 0;
  let button;
  if (action === 'close-settings') {
    if (dialogs.length > 0) return false;
    const settingsControls = [...doc.querySelectorAll('[data-settings-close]')].filter(clickable);
    if (settingsControls.length !== 1) return false;
    button = settingsControls[0];
  } else if (action === 'open') {
    if (dialogs.length > 0) return false;
    button = [...doc.querySelectorAll('[data-theme-selector-trigger]')].find(clickable);
  } else {
    if (dialogs.length !== 1) return false;
    button = action === 'close'
      ? dialogs[0].querySelector('[data-theme-selector-close]')
      : [...dialogs[0].querySelectorAll('[data-theme-id]')]
        .find(candidate => candidate.getAttribute('data-theme-id') === themeId);
  }
  if (!clickable(button)) return false;
  button.click();
  return true;
};

export const switchDisplayRoutingTheme = async (session, themeCase, { now = Date.now, wait = delay } = {}) => {
  const startedAt = now();
  const deadline = startedAt + 5_000;
  let step = 'open';
  const transitions = [{ step, elapsedMs: 0 }];
  let state = null;
  let openedSettings = false;
  let lastControlEvidence = null;
  let shortcutEvidence = null;
  let beforeShortcutEvidence = null;
  const click = async action => {
    const result = await session.evaluate(`(() => {
      const clicked = (${clickDisplayRoutingThemeControl.toString()})(document, ${JSON.stringify(action)}, ${JSON.stringify(themeCase.id)});
      let evidence = null;
      let shortcut = null;
      try { shortcut = (${readThemeShortcutEvidence.toString()})(document, ${action === 'open' && !openedSettings} && !clicked); } catch { /* Optional bounded observation. */ }
      if (!clicked) {
        try { evidence = (${readThemeControlEvidence.toString()})(document); } catch { /* Preserve the control failure. */ }
      }
      return { clicked, evidence, shortcut };
    })()`);
    const evidence = projectThemeControlEvidence(result?.evidence);
    shortcutEvidence = projectThemeShortcutEvidence(result?.shortcut) ?? shortcutEvidence;
    if (evidence) lastControlEvidence = {
      action, elapsedMs: Math.min(60_000, Math.max(0, now() - startedAt)), snapshot: evidence,
    };
    return result?.clicked === true;
  };
  while (now() < deadline) {
    const previousStep = step;
    if (step === 'open') {
      if (await click('open')) step = 'select';
      else if (!openedSettings) {
        // The viewer exposes this selector inside settings. Use its public
        // shortcut once, then wait for the lazy panel within the same deadline.
        openedSettings = true;
        beforeShortcutEvidence = lastControlEvidence?.snapshot ?? null;
        for (const type of ['keyDown', 'keyUp']) {
          await session.send('Input.dispatchKeyEvent', {
            type, key: ',', code: 'Comma', modifiers: 2, windowsVirtualKeyCode: 188,
          });
        }
      }
    } else if (step === 'select' && await click('select')) step = 'applied';
    else if (step === 'applied') {
      state = await readThemeState(session);
      if (state?.dataTheme === themeCase.mode
        && normalizeColor(state.primary) === normalizeColor(themeCase.primary)) {
        if (await click('close')) step = 'closed';
      }
    } else if (step === 'closed' && await session.evaluate(
      `!document.querySelector('[data-theme-selector-dialog]')`,
    )) {
      if (!openedSettings) {
        if (now() < deadline) return state;
        break;
      }
      if (await click('close-settings')) step = 'settings-closed';
    } else if (step === 'settings-closed' && await session.evaluate(
      `!document.querySelector('[data-settings-close]')`,
    )) {
      if (now() < deadline) return state;
      break;
    }
    if (step !== previousStep) {
      transitions.push({ step, elapsedMs: Math.min(60_000, Math.max(0, now() - startedAt)) });
    } else {
      // Poll only pending UI work. Sleeping after a successful close can move
      // its completion check beyond the original deadline even with no dialog.
      await wait(Math.min(50, Math.max(0, deadline - now())));
    }
  }
  throw new Error(`Theme selector did not complete ${themeCase.id} (${step}) within 5000ms; transitions=${JSON.stringify(transitions)}; controls=${JSON.stringify({ openedSettings, beforeShortcutEvidence, shortcutEvidence, lastControlEvidence })}`);
};

export const verifyDisplayRoutingThemeMatrix = async ({
  session,
  expectedSignature,
  expectedWorkerStartCount,
  expectedWorkerAbortCount,
  initialVisualScales,
  verifyInteractionStates,
  verifyVisualScales,
}) => {
  const results = [];
  for (const [index, themeCase] of DISPLAY_ROUTING_THEME_CASES.entries()) {
    const appliedState = index > 0
      ? await switchDisplayRoutingTheme(session, themeCase)
      : await waitForThemeState(session, themeCase);
    const state = assertDisplayRoutingThemeState({
      themeCase,
      state: appliedState,
      expectedSignature,
      expectedWorkerStartCount,
      expectedWorkerAbortCount,
    });
    const visualScales = index === 0 && Array.isArray(initialVisualScales)
      ? initialVisualScales
      : await verifyVisualScales(themeCase.id);
    const interactions = await verifyInteractionStates(themeCase.id);
    assertDisplayRoutingThemeState({
      themeCase,
      state: await readThemeState(session),
      expectedSignature,
      expectedWorkerStartCount,
      expectedWorkerAbortCount,
    });
    results.push({
      id: themeCase.id,
      mode: state.dataTheme,
      primary: normalizeColor(state.primary),
      workerStartCount: state.workerStartCount,
      visualScales,
      interactions,
    });
  }
  return results;
};
