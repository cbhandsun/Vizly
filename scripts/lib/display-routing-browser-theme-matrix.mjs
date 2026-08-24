import { setTimeout as delay } from 'node:timers/promises';

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

const switchTheme = (session, themeId) => session.evaluate(`(() => {
  window.dispatchEvent(new CustomEvent('diagram-global-theme-changed', {
    detail: ${JSON.stringify(themeId)},
  }));
  return true;
})()`);

export const verifyDisplayRoutingThemeMatrix = async ({
  session,
  expectedSignature,
  expectedWorkerStartCount,
  expectedWorkerAbortCount,
  initialVisualScales,
  verifyVisualScales,
}) => {
  const results = [];
  for (const [index, themeCase] of DISPLAY_ROUTING_THEME_CASES.entries()) {
    if (index > 0) await switchTheme(session, themeCase.id);
    const state = assertDisplayRoutingThemeState({
      themeCase,
      state: await waitForThemeState(session, themeCase),
      expectedSignature,
      expectedWorkerStartCount,
      expectedWorkerAbortCount,
    });
    const visualScales = index === 0 && Array.isArray(initialVisualScales)
      ? initialVisualScales
      : await verifyVisualScales(themeCase.id);
    results.push({
      id: themeCase.id,
      mode: state.dataTheme,
      primary: normalizeColor(state.primary),
      workerStartCount: state.workerStartCount,
      visualScales,
    });
  }
  return results;
};
