import { writeFile } from 'node:fs/promises';
import { withPrecompiledRouteBrowser } from '../../../scripts/lib/precompiled-display-route-cdp.mjs';
import { DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT } from '../../../scripts/lib/display-routing-browser-capture.mjs';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const url = `${baseUrl}/?precompiledCapture=logistics-architecture-v1#/?diagram=logistics-architecture-v1`;

const evaluate = (session, expression) => session.evaluate(expression);

const screenshot = async (session, name) => {
  const capture = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(new URL(`./${name}`, import.meta.url), Buffer.from(capture.data, 'base64'));
};

await withPrecompiledRouteBrowser(async (session) => {
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await session.send('Page.addScriptToEvaluateOnNewDocument', {
    source: DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT,
  });
  await session.send('Page.navigate', { url });
  await evaluate(session, `new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
      if ((routing.stage === 'final-applied' && document.querySelectorAll('.react-flow__node').length > 0) || Date.now() - started > 30000) {
        clearInterval(timer); resolve(true);
      }
    }, 100);
  })`);
  const controls = await evaluate(session, `Array.from(document.querySelectorAll('button,[role="button"]')).map((el) => ({
    tag: el.tagName,
    text: (el.textContent || '').trim().slice(0, 100),
    aria: el.getAttribute('aria-label'),
    title: el.getAttribute('title'),
    layout: el.getAttribute('data-flowchart-layout-selection'),
  })).filter((item) => item.text || item.aria || item.title || item.layout)`);
  console.log(JSON.stringify({ controls, nodes: await evaluate(session, `document.querySelectorAll('.react-flow__node').length`) }, null, 2));
  await screenshot(session, 'logistics-toolbar.png');

  await evaluate(session, `document.querySelector('[data-flowchart-layout-selection]')?.click()`);
  await evaluate(session, `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  const layoutMenu = await evaluate(session, `({
    text: (document.querySelector('.flowchart-layout-menu')?.textContent || '').replace(/\\s+/g, ' ').trim(),
    menuItems: Array.from(document.querySelectorAll('.flowchart-layout-menu [role^="menuitem"]')).map((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim()),
  })`);
  console.log(JSON.stringify({ layoutMenu }, null, 2));
  await screenshot(session, 'layout-menu-open.png');

  await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  const edgePoint = await evaluate(session, `(() => {
    const path = document.querySelector('.react-flow__edge-path');
    if (!path) return null;
    const local = path.getPointAtLength(path.getTotalLength() / 2);
    const screen = new DOMPoint(local.x, local.y).matrixTransform(path.getScreenCTM());
    return { x: screen.x, y: screen.y };
  })()`);
  if (edgePoint) {
    await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: edgePoint.x, y: edgePoint.y, button: 'left', clickCount: 1 });
    await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: edgePoint.x, y: edgePoint.y, button: 'left', clickCount: 1 });
    await evaluate(session, `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  }
  const edgeEditing = await evaluate(session, `({
    selectedEdges: document.querySelectorAll('.react-flow__edge.selected').length,
    labels: Array.from(document.querySelectorAll('[aria-label]')).map((el) => el.getAttribute('aria-label')).filter((value) => /edge|边|线段|waypoint|label|标签|connection/i.test(value || '')).slice(0, 100),
    classes: Array.from(document.querySelectorAll('[class]')).map((el) => String(el.className?.baseVal || el.className || '')).filter((value) => /waypoint|segment|edge-label|edge-control|edge-edit/i.test(value)).slice(0, 100),
  })`);
  console.log(JSON.stringify({ edgeEditing }, null, 2));
  await screenshot(session, 'edge-selected.png');

  if (edgePoint) {
    await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: edgePoint.x, y: edgePoint.y, button: 'right', clickCount: 1 });
    await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: edgePoint.x, y: edgePoint.y, button: 'right', clickCount: 1 });
    await evaluate(session, `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    const contextMenu = await evaluate(session, `Array.from(document.querySelectorAll('[role="menuitem"]')).map((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim()).filter(Boolean)`);
    console.log(JSON.stringify({ contextMenu }, null, 2));
    await screenshot(session, 'edge-context-menu.png');
    const editableItemPoint = await evaluate(session, `(() => {
      const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find((el) => (el.textContent || '').trim() === '转为可编辑');
      if (!item) return null;
      const box = item.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    })()`);
    if (editableItemPoint) {
      await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: editableItemPoint.x, y: editableItemPoint.y, button: 'left', clickCount: 1 });
      await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: editableItemPoint.x, y: editableItemPoint.y, button: 'left', clickCount: 1 });
    }
    await evaluate(session, `new Promise((resolve) => setTimeout(resolve, 500))`);
    const editableState = await evaluate(session, `({
      zoom: window.reactFlowInstance?.getViewport?.().zoom,
      edgeTypes: window.reactFlowInstance?.getEdges?.().map((edge) => ({ id: edge.id, type: edge.type, selected: edge.selected })).filter((edge) => edge.selected || edge.type === 'editable'),
      handles: Array.from(document.querySelectorAll('[aria-label]')).map((el) => el.getAttribute('aria-label')).filter((value) => /线段|折点|waypoint|标签|连线/i.test(value || '')).slice(0, 100),
    })`);
    console.log(JSON.stringify({ editableState }, null, 2));
    await screenshot(session, 'edge-editable.png');
  }
});
