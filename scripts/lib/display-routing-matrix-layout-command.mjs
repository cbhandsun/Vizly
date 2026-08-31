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
    const target = await session.evaluate(`(() => {
    const findByKey = ${findDisplayRoutingMenuElementByKey.toString()};
    const pointerTarget = ${resolveDisplayRoutingMenuPointerTarget.toString()};
    const item = findByKey(
      document.querySelectorAll('.flowchart-layout-menu [data-menu-id]'),
      ${JSON.stringify(layoutCase.id)},
    );
    if (!item || item.getBoundingClientRect().width === 0) return null;
    const viewport = { width: innerWidth, height: innerHeight };
    const popup = item.closest('.ant-dropdown-menu-submenu-popup');
    if (popup && !pointerTarget(popup.getBoundingClientRect(), viewport)) return { inaccessible: true };
    item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const point = pointerTarget(item.getBoundingClientRect(), viewport);
    if (!point || !item.contains(document.elementFromPoint(point.x, point.y))) return { inaccessible: true };
    window.__vizlyRequestedLayoutLabel = item.textContent?.trim() ?? '';
    return { ...point, clickedAt: Date.now() };
  })()`);
    if (!target) return null;
    if (target.inaccessible) throw new Error(`${layoutCase.id} menu item is outside the viewport or covered`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await session.send('Input.dispatchMouseEvent', {
        type, x: target.x, y: target.y,
        ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }),
      });
    }
    return target.clickedAt;
  };
  let clicked = await clickVisibleItem();
  if (!clicked) {
    const submenuCenter = await session.evaluate(`(() => {
      const findByKey = ${findDisplayRoutingMenuElementByKey.toString()};
      const item = findByKey(
        document.querySelectorAll('.flowchart-layout-menu [data-menu-id]'),
        'more-layout-engines',
      );
      if (!item) return null;
      const rect = item.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    if (submenuCenter) {
      await session.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: submenuCenter.x,
        y: submenuCenter.y,
      });
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
  const selection = await session.evaluate(`(() => ({
    requested: window.__vizlyRequestedLayoutLabel,
    applied: Array.from(document.querySelectorAll('button'))
      .find(button => /自动布局|layout/i.test(button.getAttribute('aria-label') || ''))
      ?.getAttribute('aria-label'),
  }))()`);
  if (!displayRoutingLayoutSelectionMatches(selection.requested, selection.applied)) {
    const knownSelection = value => DISPLAY_ROUTING_LAYOUT_CASES.find(candidate => (
      displayRoutingLayoutSelectionMatches(candidate.label, value)
    ))?.id ?? 'unrecognized';
    throw new Error(`${caseId} committed a different layout than requested`
      + ` (requested=${knownSelection(selection.requested)}, applied=${knownSelection(selection.applied)})`);
  }
};
