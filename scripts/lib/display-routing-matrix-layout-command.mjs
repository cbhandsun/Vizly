import { setTimeout as delay } from 'node:timers/promises';
import {
  displayRoutingLayoutSelectionMatches,
  findDisplayRoutingMenuElementByKey,
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
  const clickVisibleItem = () => session.evaluate(`(() => {
    const findByKey = ${findDisplayRoutingMenuElementByKey.toString()};
    const item = findByKey(
      document.querySelectorAll('.flowchart-layout-menu [data-menu-id]'),
      ${JSON.stringify(layoutCase.id)},
    );
    const clickedAt = Date.now();
    window.__vizlyRequestedLayoutLabel = item?.textContent?.trim() ?? '';
    item?.click();
    return item ? clickedAt : null;
  })()`);
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
  // swimlane commands must preserve their requested semantic arrangement.
  if (!caseId.startsWith('domain-lanes-')) return;
  const selection = await session.evaluate(`(() => ({
    requested: window.__vizlyRequestedLayoutLabel,
    applied: Array.from(document.querySelectorAll('button'))
      .find(button => /自动布局|layout/i.test(button.getAttribute('aria-label') || ''))
      ?.getAttribute('aria-label'),
  }))()`);
  if (!displayRoutingLayoutSelectionMatches(selection.requested, selection.applied)) {
    throw new Error(`${caseId} committed a different layout than requested`);
  }
};
