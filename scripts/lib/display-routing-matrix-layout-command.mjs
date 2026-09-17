import { setTimeout as delay } from 'node:timers/promises';
import {
  DISPLAY_ROUTING_LAYOUT_CASES,
  displayRoutingLayoutSelectionMatches,
  findDisplayRoutingMenuElementByKey,
  resolveDisplayRoutingMenuPointerTarget,
} from './display-routing-matrix-cases.mjs';

export const displayRoutingLayoutParentMenuKey = caseId => {
  if (typeof caseId !== 'string') return undefined;
  if (/^domain-dagre-(?:tb|bt|lr|rl)$/.test(caseId)) return 'group-standard-process';
  if (/^domain-compound-elk-(?:tb|bt|lr|rl)$/.test(caseId)) return 'group-complex-process';
  if (/^domain-lanes-(?:tb|bt|lr|rl)$/.test(caseId)) return 'group-swimlane-process';
  return undefined;
};

export const readDisplayRoutingLayoutMenuDiagnostics = (caseId, parentMenuKey) => {
  const boundedText = value => (
    typeof value === 'string'
      ? { length: Math.min(value.length, 10_000) }
      : undefined
  );
  const rect = element => {
    const value = element?.getBoundingClientRect?.();
    return value && [value.left, value.top, value.width, value.height].every(Number.isFinite)
      ? {
        left: Math.round(value.left),
        top: Math.round(value.top),
        width: Math.round(value.width),
        height: Math.round(value.height),
      }
      : null;
  };
  const describe = element => {
    if (!element) return null;
    const box = rect(element);
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(element) : null;
    return {
      tagName: String(element.tagName || '').slice(0, 32),
      role: typeof element.getAttribute === 'function'
        ? element.getAttribute('role') ?? undefined
        : undefined,
      menuId: typeof element.getAttribute === 'function'
        ? element.getAttribute('data-menu-id') ?? undefined
        : undefined,
      ariaLabel: boundedText(
        typeof element.getAttribute === 'function'
          ? element.getAttribute('aria-label') ?? undefined
          : undefined,
      ),
      text: boundedText(element.textContent ?? undefined),
      rect: box,
      visible: Boolean(box && box.width > 0 && box.height > 0
        && (!style || (style.display !== 'none' && style.visibility !== 'hidden'))),
    };
  };
  const findByKey = findDisplayRoutingMenuElementByKey;
  const menuItems = [...document.querySelectorAll(
    '.flowchart-layout-menu [data-menu-id], .flowchart-layout-submenu-popup [data-menu-id]',
  )];
  const target = findByKey(menuItems, caseId);
  const parent = typeof parentMenuKey === 'string' ? findByKey(menuItems, parentMenuKey) : null;
  const more = findByKey(menuItems, 'more-layout-engines');
  const targetRect = rect(target);
  let hit = null;
  if (targetRect && targetRect.width > 0 && targetRect.height > 0) {
    const x = Math.round(targetRect.left + targetRect.width / 2);
    const y = Math.round(targetRect.top + targetRect.height / 2);
    hit = describe(document.elementFromPoint?.(x, y));
  }
  return {
    caseId: typeof caseId === 'string' && caseId.length <= 128 ? caseId : '<invalid>',
    trigger: describe([...document.querySelectorAll('button')]
      .find(button => /自动布局|layout/i.test(button.getAttribute('aria-label') || ''))),
    menuRootCount: document.querySelectorAll(
      '.flowchart-layout-menu, .flowchart-layout-submenu-popup',
    ).length,
    menuItemCount: menuItems.length,
    target: describe(target),
    parent: describe(parent),
    more: describe(more),
    hitAtTargetCenter: hit,
    knownMenuIds: menuItems
      .map(item => item.getAttribute('data-menu-id'))
      .filter(value => typeof value === 'string')
      .slice(0, 64),
  };
};

const readLayoutMenuDiagnostics = async (session, layoutCase) => session.evaluate(`(() => {
  const findDisplayRoutingMenuElementByKey = ${findDisplayRoutingMenuElementByKey.toString()};
  const reader = ${readDisplayRoutingLayoutMenuDiagnostics.toString()};
  return reader(
    ${JSON.stringify(layoutCase.id)},
    ${JSON.stringify(displayRoutingLayoutParentMenuKey(layoutCase.id))},
  );
})()`);

export const clickLayout = async (session, layoutCase, wait = delay) => {
  const parentMenuKey = displayRoutingLayoutParentMenuKey(layoutCase.id);
  const opened = await session.evaluate(`(() => {
    const trigger = Array.from(document.querySelectorAll('button'))
      .find(button => /自动布局|layout/i.test(button.getAttribute('aria-label') || ''));
    trigger?.click();
    return Boolean(trigger);
  })()`);
  if (!opened) throw new Error('Layout menu trigger was not found');
  await wait(300);
  const clickVisibleItem = async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const target = await session.evaluate(`(() => {
    const findByKey = ${findDisplayRoutingMenuElementByKey.toString()};
    const pointerTarget = ${resolveDisplayRoutingMenuPointerTarget.toString()};
    const item = findByKey(
      document.querySelectorAll(
        '.flowchart-layout-menu [data-menu-id], .flowchart-layout-submenu-popup [data-menu-id]',
      ),
      ${JSON.stringify(layoutCase.id)},
    );
    const rect = item?.getBoundingClientRect?.();
    if (!item || !rect || rect.width === 0 || rect.height === 0) return null;
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
          await wait(120);
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
    const revealMenu = async (menuItemKey, mode) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const target = await session.evaluate(`(() => {
      const findByKey = ${findDisplayRoutingMenuElementByKey.toString()};
      const pointerTarget = ${resolveDisplayRoutingMenuPointerTarget.toString()};
      const item = findByKey(
        document.querySelectorAll(
          '.flowchart-layout-menu [data-menu-id], .flowchart-layout-submenu-popup [data-menu-id]',
        ),
        ${JSON.stringify(menuItemKey)},
      );
      const rect = item?.getBoundingClientRect?.();
      if (!item || !rect || rect.width === 0 || rect.height === 0) return null;
      const viewport = { width: innerWidth, height: innerHeight };
      item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const point = pointerTarget(item.getBoundingClientRect(), viewport);
      if (!point || !item.contains(document.elementFromPoint(point.x, point.y))) {
        item.click();
        return { clickedByDom: true };
      }
      return point;
    })()`);
        if (!target) return false;
        if (target.clickedByDom) return true;
        if (target.inaccessible) {
          if (attempt === 0) {
            await wait(120);
            continue;
          }
          throw new Error(`${menuItemKey} menu item is outside the viewport or covered`);
        }
        const events = mode === 'click'
          ? ['mouseMoved', 'mousePressed', 'mouseReleased']
          : ['mouseMoved'];
        for (const type of events) {
          await session.send('Input.dispatchMouseEvent', {
            type,
            x: target.x,
            y: target.y,
            ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }),
          });
        }
        return true;
      }
      return false;
    };
    const revealAndSelect = async menuItemKey => {
      if (await revealMenu(menuItemKey, 'hover')) {
        await wait(500);
        clicked = await clickVisibleItem();
      }
      if (!clicked && await revealMenu(menuItemKey, 'click')) {
        await wait(500);
        clicked = await clickVisibleItem();
      }
    };
    if (parentMenuKey) await revealAndSelect(parentMenuKey);
    if (!clicked && parentMenuKey) {
      for (const type of ['keyDown', 'keyUp']) {
        await session.send('Input.dispatchKeyEvent', {
          type,
          key: 'ArrowRight',
          code: 'ArrowRight',
          windowsVirtualKeyCode: 39,
          nativeVirtualKeyCode: 39,
        });
      }
      await wait(300);
      clicked = await clickVisibleItem();
    }
    if (!clicked && parentMenuKey !== 'more-layout-engines') {
      await revealAndSelect('more-layout-engines');
    }
  }
  if (!clicked) {
    const diagnostics = await readLayoutMenuDiagnostics(session, layoutCase).catch(error => ({
      diagnosticsError: error instanceof Error ? error.message : String(error),
    }));
    throw new Error(`Layout menu item was not found: ${layoutCase.label}\n${JSON.stringify(diagnostics)}`);
  }
  return clicked;
};

export const assertRequestedLayoutSelected = async (
  session,
  caseId,
  {
    attempts = 20,
    failFastRecognizedMismatch = true,
    waitMs = 50,
    wait = delay,
  } = {},
) => {
  // Other legacy engines still have intentional topology fallbacks. Explicit
  // standard, swimlane, compound and full-graph ELK commands must preserve
  // the requested arrangement so the initial preset layout remains replayable from the UI.
  if (
    !caseId.startsWith('domain-dagre-')
    && !caseId.startsWith('domain-lanes-')
    && !caseId.startsWith('domain-compound-elk-')
    && !caseId.startsWith('domain-elk-')
  ) return;
  const knownSelection = value => DISPLAY_ROUTING_LAYOUT_CASES.find(candidate => (
    displayRoutingLayoutSelectionMatches(candidate.label, value)
  ))?.id ?? 'unrecognized';
  const knownSelectionKey = value => DISPLAY_ROUTING_LAYOUT_CASES.some(candidate => (
    candidate.id === value
  )) ? value : 'unrecognized';
  const requested = knownSelectionKey(caseId);
  let applied = 'unrecognized';
  for (let attempt = 0; attempt < attempts; attempt += 1) {
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
      if (failFastRecognizedMismatch) break;
    }
    if (applied !== 'unrecognized') {
      if (requested === applied) return;
      if (failFastRecognizedMismatch) break;
    }
    if (displayRoutingLayoutSelectionMatches(selection?.requested, selection?.applied)) {
      return;
    }
    // The toolbar may render before its stable key and translated status text
    // settle after a page switch. Only recognized mismatches fail immediately.
    await wait(waitMs);
  }
  throw new Error(`${caseId} committed a different layout than requested`
    + ` (requested=${requested}, applied=${applied})`);
};
