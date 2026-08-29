import { setTimeout as delay } from 'node:timers/promises';

import {
  DISPLAY_ROUTING_LAYOUT_CASES,
  findDisplayRoutingMenuElementByKey,
} from './display-routing-matrix-cases.mjs';

const resolveLayoutCase = variantId => DISPLAY_ROUTING_LAYOUT_CASES.find(
  layoutCase => layoutCase.id === variantId,
) ?? null;

export const clickPrecompiledDisplayRouteLayoutVariant = async (
  session,
  variantId,
  wait = delay,
) => {
  const layoutCase = resolveLayoutCase(variantId);
  if (!layoutCase) throw new Error(`Unknown precompiled layout variant ${variantId}`);
  const opened = await session.evaluate(`(() => {
    const trigger = Array.from(document.querySelectorAll('button'))
      .find(button => /自动布局|layout/i.test(button.getAttribute('aria-label') || ''));
    trigger?.click();
    return Boolean(trigger);
  })()`);
  if (!opened) throw new Error('Layout menu trigger was not found');
  await wait(300);
  const clickVisibleItem = () => session.evaluate(`(() => {
    const findByKey = ${findDisplayRoutingMenuElementByKey.toString()};
    const item = findByKey(
      document.querySelectorAll('.flowchart-layout-menu [data-menu-id]'),
      ${JSON.stringify(layoutCase.id)},
    );
    const clickedAt = Date.now();
    item?.click();
    return item ? clickedAt : null;
  })()`);
  let clickedAt = await clickVisibleItem();
  if (!clickedAt) {
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
      await wait(500);
      clickedAt = await clickVisibleItem();
    }
  }
  if (!clickedAt) throw new Error(`Layout menu item was not found: ${layoutCase.label}`);
  return clickedAt;
};
