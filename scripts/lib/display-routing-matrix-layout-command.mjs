import { setTimeout as delay } from 'node:timers/promises';
import {
  DISPLAY_ROUTING_LAYOUT_CASES,
  displayRoutingLayoutSelectionMatches,
  findDisplayRoutingMenuElementByKey,
  resolveDisplayRoutingMenuPointerTarget,
} from './display-routing-matrix-cases.mjs';

export const clickLayout = async (session, layoutCase) => {
  const opened = await session.evaluate(`(() => {
    const trigger = Array.from(document.querySelectorAll('button'))
      .find(button => /自动布局|layout/i.test(button.getAttribute('aria-label') || ''));
    trigger?.click();
    return Boolean(trigger);
  })()`);
  if (!opened) throw new Error('Layout menu trigger was not found');
  await delay(300);
  const clickVisibleItem = async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const target = await session.evaluate(`(() => {
    const findByKey = ${findDisplayRoutingMenuElementByKey.toString()};
    const pointerTarget = ${resolveDisplayRoutingMenuPointerTarget.toString()};
    const item = findByKey(
      document.querySelectorAll('.flowchart-layout-menu [data-menu-id]'),
      ${JSON.stringify(layoutCase.id)},
    );
    if (!item || item.getBoundingClientRect().width === 0) return null;
    const viewport = { width: innerWidth, height: innerHeight };
    item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const point = pointerTarget(item.getBoundingClientRect(), viewport);
    if (!point || !item.contains(document.elementFromPoint(point.x, point.y))) return { inaccessible: true };
    window.__vizlyRequestedLayoutLabel = item.textContent?.trim() ?? '';
    return { ...point, clickedAt: Date.now() };
  })()`);
      if (!target) return null;
      if (target.inaccessible) {
        if (attempt === 0) {
          await delay(120);
          continue;
        }
        throw new Error(`${layoutCase.id} menu item is outside the viewport or covered`);
      }
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
        await session.send('Input.dispatchMouseEvent', {
          type, x: target.x, y: target.y,
          ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }),
        });
      }
      return target.clickedAt;
    }
    return null;
  };
  let clicked = await clickVisibleItem();
  if (!clicked) {
    const revealMoreLayouts = async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const target = await session.evaluate(`(() => {
      const findByKey = ${findDisplayRoutingMenuElementByKey.toString()};
      const pointerTarget = ${resolveDisplayRoutingMenuPointerTarget.toString()};
      const item = findByKey(
        document.querySelectorAll('.flowchart-layout-menu [data-menu-id]'),
        'more-layout-engines',
      );
      if (!item || item.getBoundingClientRect().width === 0) return null;
      const viewport = { width: innerWidth, height: innerHeight };
      item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const point = pointerTarget(item.getBoundingClientRect(), viewport);
      if (!point || !item.contains(document.elementFromPoint(point.x, point.y))) {
        return { inaccessible: true };
      }
      return point;
    })()`);
        if (!target) return false;
        if (target.inaccessible) {
          if (attempt === 0) {
            await delay(120);
            continue;
          }
          throw new Error('More layouts menu item is outside the viewport or covered');
        }
        await session.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: target.x,
          y: target.y,
        });
        return true;
      }
      return false;
    };
    if (await revealMoreLayouts()) {
      await delay(500);
      clicked = await clickVisibleItem();
    }
  }
  if (!clicked) throw new Error(`Layout menu item was not found: ${layoutCase.label}`);
  return clicked;
};

export const assertRequestedLayoutSelected = async (session, caseId) => {
  // Other legacy engines still have intentional topology fallbacks. Explicit
  // swimlane and compound commands must preserve the requested arrangement.
  if (!caseId.startsWith('domain-lanes-') && !caseId.startsWith('domain-compound-elk-')) return;
  const knownSelection = value => DISPLAY_ROUTING_LAYOUT_CASES.find(candidate => (
    displayRoutingLayoutSelectionMatches(candidate.label, value)
  ))?.id ?? 'unrecognized';
  const knownSelectionKey = value => DISPLAY_ROUTING_LAYOUT_CASES.some(candidate => (
    candidate.id === value
  )) ? value : 'unrecognized';
  const requested = knownSelectionKey(caseId);
  let applied = 'unrecognized';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const selection = await session.evaluate(`(() => ({
      requested: window.__vizlyRequestedLayoutLabel,
      applied: Array.from(document.querySelectorAll('button'))
        .find(button => /自动布局|layout/i.test(button.getAttribute('aria-label') || ''))
        ?.getAttribute('aria-label'),
      appliedKey: Array.from(document.querySelectorAll('button'))
        .find(button => button.hasAttribute('data-flowchart-layout-selection'))
        ?.getAttribute('data-flowchart-layout-selection'),
    }))()`);
    const appliedKey = knownSelectionKey(selection?.appliedKey);
    applied = appliedKey === 'unrecognized' ? knownSelection(selection?.applied) : appliedKey;
    if (appliedKey !== 'unrecognized') {
      if (requested === applied) return;
      break;
    }
    if (applied !== 'unrecognized') {
      if (requested === applied) return;
      break;
    }
    if (displayRoutingLayoutSelectionMatches(selection?.requested, selection?.applied)) {
      return;
    }
    // The toolbar may render before its stable key and translated status text
    // settle after a page switch. Only recognized mismatches fail immediately.
    await delay(50);
  }
  throw new Error(`${caseId} committed a different layout than requested`
    + ` (requested=${requested}, applied=${applied})`);
};
