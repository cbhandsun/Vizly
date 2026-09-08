import { setTimeout as delay } from 'node:timers/promises';

/** CDP coordinates must hit the visible handle, not just its bounding-box center. */
export const resolveTopologyHandleHitPoint = (rect, hitTest) => {
  if (!rect || typeof hitTest !== 'function'
    || ![rect.left, rect.top, rect.width, rect.height].every(value =>
      Number.isFinite(value) && Math.abs(value) <= 1_000_000)
    || rect.width <= 0 || rect.height <= 0) return null;
  for (const [dx, dy] of [[.5, .5], [.8, .5], [.2, .5], [.5, .8], [.5, .2]]) {
    const point = { x: Math.round(rect.left + rect.width * dx), y: Math.round(rect.top + rect.height * dy) };
    if (hitTest(point.x, point.y) === true) return point;
  }
  return null;
};

export const applyTopologyEdgeAdd = async session => {
  const readPoint = (nodeId, side) => session.evaluate(`(() => {
    const resolvePoint = ${resolveTopologyHandleHitPoint.toString()};
    const handle = document.querySelector('.react-flow__node[data-id="${nodeId}"] .react-flow__handle.source[data-handleid="${side}"]');
    const rect = handle?.getBoundingClientRect();
    return resolvePoint(rect, (x, y) => {
      const hit = document.elementFromPoint(x, y);
      return hit === handle || handle.contains(hit);
    });
  })()`);
  await session.evaluate(`(() => {
    const instance = window.reactFlowInstance;
    const nodes = instance?.getNodes?.().filter(node => node.id === 'wcs' || node.id === 'bms');
    if (nodes?.length === 2) instance.fitView?.({ nodes, padding: 0.25, duration: 0 });
    return nodes?.length === 2;
  })()`);
  await delay(200);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const gesture = await session.evaluate(`(() => {
      // Loose connection mode uses the canonical bidirectional source handle
      // on either end. Legacy aliases/target shadows are 1px compatibility anchors.
      const source = document.querySelector(
        '.react-flow__node[data-id="wcs"] .react-flow__handle.source[data-handleid="right"]',
      );
      const target = document.querySelector(
        '.react-flow__node[data-id="bms"] .react-flow__handle.source[data-handleid="left"]',
      );
      const instance = window.reactFlowInstance;
      if (!source || !target || !instance?.getEdges) return null;
      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const inViewport = rect => (
        rect.width > 0
        && rect.height > 0
        && rect.left >= 0
        && rect.top >= 0
        && rect.right <= window.innerWidth
        && rect.bottom <= window.innerHeight
      );
      if (!inViewport(sourceRect) || !inViewport(targetRect)) return null;
      return {
        source: { x: sourceRect.left + sourceRect.width / 2, y: sourceRect.top + sourceRect.height / 2 },
        target: { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 },
        previousEdgeIds: instance.getEdges().map(edge => edge.id),
      };
    })()`);
    if (!gesture) {
      await delay(100);
      continue;
    }
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      ...gesture.source,
      button: 'none',
    });
    await delay(80);
    const hoveredSource = await readPoint('wcs', 'right');
    if (!hoveredSource) return false;
    gesture.source = hoveredSource;
    await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...gesture.source, button: 'none' });
    await session.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...gesture.source,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    for (let step = 1; step <= 10; step += 1) {
      await session.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: gesture.source.x + ((gesture.target.x - gesture.source.x) * step) / 10,
        y: gesture.source.y + ((gesture.target.y - gesture.source.y) * step) / 10,
        button: 'left',
        buttons: 1,
      });
      await delay(20);
    }
    const hoveredTarget = await readPoint('bms', 'left');
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...(hoveredTarget ?? gesture.target),
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
    const previousIds = JSON.stringify(gesture.previousEdgeIds);
    const deadline = Date.now() + 1_500;
    while (Date.now() < deadline) {
      const edgeId = await session.evaluate(`(() => {
        const previousIds = new Set(${previousIds});
        const edge = window.reactFlowInstance?.getEdges?.()
          .find(candidate => !previousIds.has(candidate.id));
        if (!edge) return null;
        window.__vizlyTopologyAuditEdgeId = edge.id;
        return edge.id;
      })()`);
      if (edgeId) return true;
      await delay(50);
    }
  }
  return false;
};
