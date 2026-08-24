import { setTimeout as delay } from 'node:timers/promises';

const EDGE_WRAPPER_SELECTOR = '[data-testid^="rf__edge-"]';
const INTERACTION_SELECTOR = '.react-flow__edge-interaction';
const TRACE_SELECTOR = '.shared-trunk-accent-trace';
const INTERACTION_PAINT_BUDGET_MS = 100;

export const assertDisplayRoutingInteractionPaint = ({ kind, state, durationMs }) => {
  const active = kind === 'hover'
    ? state?.hovered === true
    : kind === 'focus'
      ? state?.focused === true && state?.focusVisible === true
      : state?.selected === true;
  const valid = active
    && state?.interactionPathCount === 1
    && state?.traceVisible === true
    && Number.isFinite(state?.traceCoverage)
    && state.traceCoverage >= 0.95
    && state.traceCoverage <= 1.2
    && Number.isFinite(durationMs)
    && durationMs >= 0
    && durationMs <= INTERACTION_PAINT_BUDGET_MS;
  if (valid) return { kind, durationMs };
  throw new Error(`Display-routing ${kind} paint failed: ${JSON.stringify({
    kind,
    durationMs,
    budgetMs: INTERACTION_PAINT_BUDGET_MS,
    state: state ? {
      hovered: state.hovered,
      focused: state.focused,
      focusVisible: state.focusVisible,
      selected: state.selected,
      interactionPathCount: state.interactionPathCount,
      traceVisible: state.traceVisible,
      traceCoverage: state.traceCoverage,
    } : null,
  })}`);
};

export const assertDisplayRoutingInteractionReset = state => {
  const valid = state
    && state.activeEdgeCount === 0
    && state.visibleTraceCount === 0
    && state.runningAnimationCount === 0;
  if (valid) return state;
  throw new Error(`Display-routing interaction reset failed: ${JSON.stringify({
    activeEdgeCount: state?.activeEdgeCount ?? null,
    visibleTraceCount: state?.visibleTraceCount ?? null,
    runningAnimationCount: state?.runningAnimationCount ?? null,
  })}`);
};

const fitViewport = session => session.evaluate(`(async () => {
  const instance = window.reactFlowInstance;
  if (!instance || typeof instance.fitView !== 'function') return false;
  await instance.fitView({ padding: 0.1, duration: 0 });
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return true;
})()`);

const findVisibleInteractionTarget = session => session.evaluate(`(() => {
  const wrappers = [...document.querySelectorAll(${JSON.stringify(EDGE_WRAPPER_SELECTOR)})];
  for (const [edgeIndex, wrapper] of wrappers.entries()) {
    const path = wrapper.querySelector(${JSON.stringify(INTERACTION_SELECTOR)});
    if (!path || typeof path.getTotalLength !== 'function') continue;
    const length = path.getTotalLength();
    const matrix = path.getScreenCTM?.();
    if (!Number.isFinite(length) || length <= 0 || !matrix) continue;
    for (const fraction of [0.15, 0.35, 0.55, 0.75]) {
      const point = path.getPointAtLength(length * fraction);
      const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
      if (![screen.x, screen.y].every(Number.isFinite)
        || screen.x < 0 || screen.y < 0
        || screen.x > window.innerWidth || screen.y > window.innerHeight) continue;
      const topInteraction = document.elementsFromPoint(screen.x, screen.y)
        .find(element => element.classList?.contains('react-flow__edge-interaction'));
      if (topInteraction === path) return { edgeIndex, x: screen.x, y: screen.y };
    }
  }
  return null;
})()`);

const readInteractionState = (session, edgeIndex) => session.evaluate(`(() => {
  const wrappers = [...document.querySelectorAll(${JSON.stringify(EDGE_WRAPPER_SELECTOR)})];
  const wrapper = wrappers[${JSON.stringify(edgeIndex)}];
  const interaction = wrapper?.querySelector(${JSON.stringify(INTERACTION_SELECTOR)});
  const trace = wrapper?.querySelector(${JSON.stringify(TRACE_SELECTOR)});
  const traceStyle = trace ? getComputedStyle(trace) : null;
  const interactionLength = interaction?.getTotalLength?.() ?? 0;
  const traceLength = trace?.getTotalLength?.() ?? 0;
  const traceOpacity = Number.parseFloat(traceStyle?.opacity || '0');
  return {
    interactionStartedAt: window.__vizlyRoutingInteractionStartedAt,
    interactionPaintedAt: window.__vizlyRoutingInteractionPaintedAt,
    hovered: Boolean(wrapper?.matches(':hover')),
    focused: Boolean(wrapper?.matches(':focus')),
    focusVisible: Boolean(wrapper?.matches(':focus-visible')),
    selected: Boolean(wrapper?.classList.contains('selected')),
    interactionPathCount: wrapper?.querySelectorAll(${JSON.stringify(INTERACTION_SELECTOR)}).length ?? 0,
    traceVisible: Boolean(
      trace
      && Number.isFinite(traceOpacity)
      && traceOpacity >= 0.99
      && traceStyle?.display !== 'none'
      && traceStyle?.visibility !== 'hidden'
    ),
    traceCoverage: Number.isFinite(interactionLength) && interactionLength > 0
      && Number.isFinite(traceLength)
      ? traceLength / interactionLength
      : null,
  };
})()`);

const armInteractionTimestamp = (session, edgeIndex, eventName, kind) => session.evaluate(`(() => {
  const wrappers = [...document.querySelectorAll(${JSON.stringify(EDGE_WRAPPER_SELECTOR)})];
  const wrapper = wrappers[${JSON.stringify(edgeIndex)}];
  if (!wrapper) return false;
  window.__vizlyRoutingInteractionStartedAt = null;
  window.__vizlyRoutingInteractionPaintedAt = null;
  wrapper.addEventListener(${JSON.stringify(eventName)}, () => {
    window.__vizlyRoutingInteractionStartedAt = performance.now();
    const trace = wrapper.querySelector(${JSON.stringify(TRACE_SELECTOR)});
    let remainingFrames = 120;
    const sample = () => {
      const traceStyle = trace ? getComputedStyle(trace) : null;
      const traceOpacity = Number.parseFloat(traceStyle?.opacity || '0');
      const active = ${JSON.stringify(kind)} === 'hover'
        ? wrapper.matches(':hover')
        : ${JSON.stringify(kind)} === 'focus'
          ? wrapper.matches(':focus') && wrapper.matches(':focus-visible')
          : wrapper.matches(':hover')
            || wrapper.matches(':focus')
            || wrapper.classList.contains('selected');
      if (active && Number.isFinite(traceOpacity) && traceOpacity >= 0.99) {
        requestAnimationFrame(() => {
          window.__vizlyRoutingInteractionPaintedAt = performance.now();
        });
        return;
      }
      remainingFrames -= 1;
      if (remainingFrames > 0) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, { once: true, capture: true });
  return true;
})()`);

const waitForInteractionPaint = async (session, edgeIndex, kind) => {
  const deadline = Date.now() + 1_000;
  let state = null;
  while (Date.now() < deadline) {
    state = await readInteractionState(session, edgeIndex);
    const active = kind === 'hover'
      ? state?.hovered
      : kind === 'focus'
        ? state?.focused && state?.focusVisible
        : state?.selected;
    if (active && state.traceVisible && Number.isFinite(state.interactionPaintedAt)) break;
    await delay(10);
  }
  return assertDisplayRoutingInteractionPaint({
    kind,
    state,
    durationMs: Number.isFinite(state?.interactionPaintedAt)
      && Number.isFinite(state?.interactionStartedAt)
      ? state.interactionPaintedAt - state.interactionStartedAt
      : null,
  });
};

const waitForPersistentSelectedPaint = async (session, edgeIndex, durationMs) => {
  const deadline = Date.now() + 1_000;
  let state = null;
  while (Date.now() < deadline) {
    state = await readInteractionState(session, edgeIndex);
    if (state?.selected && !state.hovered && state.traceVisible) break;
    await delay(10);
  }
  return assertDisplayRoutingInteractionPaint({ kind: 'selected', state, durationMs });
};

const waitForInteractionReset = async session => {
  const state = await session.evaluate(`(async () => {
    const wrappers = [...document.querySelectorAll(${JSON.stringify(EDGE_WRAPPER_SELECTOR)})];
    const nextPaint = () => new Promise(resolve => requestAnimationFrame(resolve));
    await nextPaint();
    await nextPaint();
    const edgeAnimations = [...new Set(wrappers.flatMap(wrapper => (
      typeof wrapper.getAnimations === 'function'
        ? wrapper.getAnimations({ subtree: true })
        : []
    )))].filter(animation => animation.playState === 'running' || animation.playState === 'pending');
    if (edgeAnimations.length > 0) {
      await Promise.race([
        Promise.allSettled(edgeAnimations.map(animation => animation.finished)),
        new Promise(resolve => setTimeout(resolve, 500)),
      ]);
    }
    await nextPaint();
    await nextPaint();
    const runningAnimations = [...new Set(wrappers.flatMap(wrapper => (
      typeof wrapper.getAnimations === 'function'
        ? wrapper.getAnimations({ subtree: true })
        : []
    )))].filter(animation => animation.playState === 'running' || animation.playState === 'pending');
    const traceIsVisible = trace => {
      const style = getComputedStyle(trace);
      const opacity = Number.parseFloat(style.opacity || '0');
      return Number.isFinite(opacity)
        && opacity > 0.001
        && style.display !== 'none'
        && style.visibility !== 'hidden';
    };
    return {
      activeEdgeCount: wrappers.filter(wrapper => (
        wrapper.matches(':hover')
        || wrapper.matches(':focus')
        || wrapper.matches(':focus-visible')
        || wrapper.classList.contains('selected')
      )).length,
      visibleTraceCount: wrappers.reduce((count, wrapper) => (
        count + [...wrapper.querySelectorAll(${JSON.stringify(TRACE_SELECTOR)})]
          .filter(traceIsVisible).length
      ), 0),
      runningAnimationCount: runningAnimations.length,
    };
  })()`);
  return assertDisplayRoutingInteractionReset(state);
};

export const verifyDisplayRoutingInteractionStates = async session => {
  if (await fitViewport(session) !== true) throw new Error('Unable to fit interaction audit viewport');
  const target = await findVisibleInteractionTarget(session);
  if (!target) throw new Error('Unable to find a visible topmost edge interaction path');

  await session.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9,
  });
  await session.send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9,
  });
  await armInteractionTimestamp(session, target.edgeIndex, 'focus', 'focus');
  await session.evaluate(`(() => {
    const wrappers = [...document.querySelectorAll(${JSON.stringify(EDGE_WRAPPER_SELECTOR)})];
    wrappers[${JSON.stringify(target.edgeIndex)}]?.focus();
    return true;
  })()`);
  const focus = await waitForInteractionPaint(session, target.edgeIndex, 'focus');

  await session.evaluate('document.activeElement?.blur?.()');
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });
  await armInteractionTimestamp(session, target.edgeIndex, 'mouseover', 'hover');
  await session.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x: target.x, y: target.y,
  });
  const hover = await waitForInteractionPaint(session, target.edgeIndex, 'hover');

  await armInteractionTimestamp(session, target.edgeIndex, 'pointerdown', 'selected');
  await session.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: target.x, y: target.y, button: 'left', buttons: 1, clickCount: 1,
  });
  await session.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: target.x, y: target.y, button: 'left', buttons: 0, clickCount: 1,
  });
  const selectedWhilePointerActive = await waitForInteractionPaint(
    session,
    target.edgeIndex,
    'selected',
  );
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });
  const selected = await waitForPersistentSelectedPaint(
    session,
    target.edgeIndex,
    selectedWhilePointerActive.durationMs,
  );

  await session.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27,
  });
  await session.send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27,
  });
  await waitForInteractionReset(session);
  return {
    focusMs: focus.durationMs,
    hoverMs: hover.durationMs,
    selectedMs: selected.durationMs,
    maximumPaintMs: Math.max(focus.durationMs, hover.durationMs, selected.durationMs),
  };
};
