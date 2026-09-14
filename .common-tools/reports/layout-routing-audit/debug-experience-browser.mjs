import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { clickLayout } from '../../../scripts/lib/display-routing-matrix-layout-command.mjs';
import { DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT } from '../../../scripts/lib/display-routing-browser-capture.mjs';
import { withPrecompiledRouteBrowser } from '../../../scripts/lib/precompiled-display-route-cdp.mjs';

const BASE_URL = String(process.env.PRECOMPILED_ROUTE_BASE_URL || '').trim().replace(/\/$/, '');
if (!BASE_URL) throw new Error('PRECOMPILED_ROUTE_BASE_URL is required');

const presetId = 'wms-demand-allocation-strategy-v2';
const outDir = '.common-tools/reports/layout-routing-audit/experience-evidence';
const screenshotsDir = join(outDir, 'screenshots');
const waitForValue = async (session, expression, label, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  let lastValue = null;
  while (Date.now() < deadline) {
    lastValue = await session.evaluate(expression);
    if (lastValue) return lastValue;
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(lastValue)}`);
};
const installExperienceCollectors = `(() => {
  const cap = value => {
    try {
      if (value instanceof Error) return String(value.message || value.name || 'Error').slice(0, 220);
      if (typeof value === 'string') return value.slice(0, 220);
      if (value == null) return String(value);
      return Object.prototype.toString.call(value).slice(0, 120);
    } catch {
      return 'unserializable';
    }
  };
  const state = { errors: [], warnings: [], unhandledRejections: [], fetches: [], xhrs: [] };
  Object.defineProperty(window, '__vizlyExperienceAudit', { value: state, configurable: true });
  window.addEventListener('error', event => {
    state.errors.push({ kind: 'window-error', message: cap(event.message), source: cap(event.filename), line: event.lineno || 0 });
  });
  window.addEventListener('unhandledrejection', event => {
    state.unhandledRejections.push({ kind: 'unhandledrejection', message: cap(event.reason) });
  });
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args) => {
    state.errors.push({ kind: 'console-error', message: args.map(cap).join(' | ').slice(0, 320) });
    return originalError.apply(console, args);
  };
  console.warn = (...args) => {
    const message = args.map(cap).join(' | ').slice(0, 320);
    if (!/React Router Future Flag Warning|Download the React DevTools/i.test(message)) {
      state.warnings.push({ kind: 'console-warn', message });
    }
    return originalWarn.apply(console, args);
  };
  const pushBounded = (items, value, limit = 80) => {
    items.push(value);
    if (items.length > limit) items.splice(0, items.length - limit);
  };
  const sanitizeUrl = value => {
    try {
      const url = new URL(String(value), location.href);
      return url.origin === location.origin ? url.origin + url.pathname : url.origin;
    } catch {
      return cap(value);
    }
  };
  const originalFetch = window.fetch?.bind(window);
  if (originalFetch) {
    window.fetch = async (input, init) => {
      const startedAt = performance.now();
      const method = init?.method || (input && typeof input === 'object' && 'method' in input ? input.method : 'GET');
      const url = sanitizeUrl(input && typeof input === 'object' && 'url' in input ? input.url : input);
      try {
        const response = await originalFetch(input, init);
        pushBounded(state.fetches, {
          method: String(method || 'GET').slice(0, 16),
          url,
          status: response.status,
          ok: response.ok,
          durationMs: Math.round(performance.now() - startedAt),
        });
        return response;
      } catch (error) {
        pushBounded(state.fetches, {
          method: String(method || 'GET').slice(0, 16),
          url,
          status: 'error',
          ok: false,
          message: cap(error),
          durationMs: Math.round(performance.now() - startedAt),
        });
        throw error;
      }
    };
  }
  const OriginalXhr = window.XMLHttpRequest;
  if (OriginalXhr) {
    window.XMLHttpRequest = function VizlyAuditXMLHttpRequest() {
      const xhr = new OriginalXhr();
      let method = 'GET';
      let url = '';
      let startedAt = 0;
      const originalOpen = xhr.open;
      xhr.open = function patchedOpen(nextMethod, nextUrl, ...rest) {
        method = String(nextMethod || 'GET').slice(0, 16);
        url = sanitizeUrl(nextUrl);
        return originalOpen.call(xhr, nextMethod, nextUrl, ...rest);
      };
      const originalSend = xhr.send;
      xhr.send = function patchedSend(...args) {
        startedAt = performance.now();
        xhr.addEventListener('loadend', () => {
          pushBounded(state.xhrs, {
            method,
            url,
            status: xhr.status,
            ok: xhr.status >= 200 && xhr.status < 400,
            durationMs: Math.round(performance.now() - startedAt),
          });
        }, { once: true });
        return originalSend.apply(xhr, args);
      };
      return xhr;
    };
  }
})();`;

const visibleSnapshotExpression = label => `(() => {
  const visible = element => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  };
  const controls = Array.from(document.querySelectorAll('button, [role="button"], a[href], input, textarea, select'))
    .filter(visible)
    .slice(0, 80)
    .map(element => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        text: (element.innerText || element.getAttribute('aria-label') || element.getAttribute('title') || '').trim().slice(0, 80),
        aria: element.getAttribute('aria-label'),
        disabled: element.disabled === true || element.getAttribute('aria-disabled') === 'true',
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    });
  const rightOverflow = Array.from(document.body.querySelectorAll('*'))
    .filter(visible)
    .map(element => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.right > innerWidth + 2 || rect.left < -2)
    .slice(0, 20)
    .map(({ element, rect }) => ({
      tag: element.tagName.toLowerCase(),
      className: String(element.className || '').slice(0, 80),
      text: (element.textContent || '').trim().slice(0, 80),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      width: Math.round(rect.width),
    }));
  return {
    label: ${JSON.stringify(label)},
    url: location.href,
    title: document.title,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    readyState: document.readyState,
    bodyTextSample: document.body.innerText.slice(0, 900),
    controlCount: controls.length,
    controls,
    reactFlow: {
      present: Boolean(document.querySelector('.react-flow')),
      nodeDomCount: document.querySelectorAll('.react-flow__node').length,
      edgeDomCount: document.querySelectorAll('.react-flow__edge').length,
      instanceNodeCount: window.reactFlowInstance?.getNodes?.().length ?? null,
      instanceEdgeCount: window.reactFlowInstance?.getEdges?.().length ?? null,
      viewport: window.reactFlowInstance?.getViewport?.() ?? null,
    },
    statusRegions: Array.from(document.querySelectorAll('[role="status"], [aria-live]')).map(element => ({
      role: element.getAttribute('role'),
      live: element.getAttribute('aria-live'),
      text: (element.textContent || '').trim().slice(0, 220),
      className: String(element.className || '').slice(0, 120),
    })),
    horizontalOverflow: document.scrollingElement ? document.scrollingElement.scrollWidth - innerWidth : 0,
    rightOverflow,
    audit: window.__vizlyExperienceAudit ? {
      ...window.__vizlyExperienceAudit,
      resourceSummary: (() => {
        const resources = performance.getEntriesByType?.('resource') || [];
        const sameOriginResources = resources.filter(entry => {
          try { return new URL(entry.name).origin === location.origin; } catch { return false; }
        });
        return {
          count: sameOriginResources.length,
          zeroTransferCount: sameOriginResources.filter(entry => entry.transferSize === 0 && entry.decodedBodySize === 0).length,
          slowCount: sameOriginResources.filter(entry => entry.duration > 3_000).length,
          largest: sameOriginResources
            .map(entry => ({ name: new URL(entry.name).pathname.slice(-120), durationMs: Math.round(entry.duration), transferSize: entry.transferSize || 0, decodedBodySize: entry.decodedBodySize || 0 }))
            .sort((a, b) => b.decodedBodySize - a.decodedBodySize)
            .slice(0, 12),
        };
      })(),
    } : null,
    routing: window.__vizlyBaseReactFlowDisplayRouting ? {
      stage: window.__vizlyBaseReactFlowDisplayRouting.stage,
      renderAuthorityStatus: window.__vizlyBaseReactFlowDisplayRouting.renderAuthorityStatus,
      layoutTransactionStatus: window.__vizlyBaseReactFlowDisplayRouting.layoutTransactionStatus ?? null,
      layoutTransactionJobId: window.__vizlyBaseReactFlowDisplayRouting.layoutTransactionJobId ?? null,
      hardClean: window.__vizlyBaseReactFlowDisplayRouting.hardGateDiagnostics?.hardClean ?? window.__vizlyBaseReactFlowDisplayRouting.layoutGeometryReport?.clean ?? null,
      obstacleHits: window.__vizlyBaseReactFlowDisplayRouting.hardGateDiagnostics?.obstacleHits ?? null,
      minimumClearanceViolations: window.__vizlyBaseReactFlowDisplayRouting.hardGateDiagnostics?.minimumClearanceViolations ?? null,
      commercialClearanceViolations: window.__vizlyBaseReactFlowDisplayRouting.hardGateDiagnostics?.commercialClearanceViolations ?? null,
      workerResolution: window.__vizlyBaseReactFlowDisplayRouting.workerResolution ?? null,
      nodeCount: window.__vizlyBaseReactFlowDisplayRouting.nodeCount ?? null,
      edgeCount: window.__vizlyBaseReactFlowDisplayRouting.edgeCount ?? null,
    } : null,
  };
})()`;

const activeElementExpression = `(() => {
  const element = document.activeElement;
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return {
    tag: element.tagName.toLowerCase(),
    text: (element.innerText || element.getAttribute('aria-label') || element.getAttribute('title') || '').trim().slice(0, 100),
    aria: element.getAttribute('aria-label'),
    role: element.getAttribute('role'),
    className: String(element.className || '').slice(0, 120),
    visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
    focusVisible: (() => { try { return element.matches(':focus-visible'); } catch { return false; } })(),
    outlineStyle: style.outlineStyle,
    outlineWidth: style.outlineWidth,
    boxShadow: style.boxShadow === 'none' ? 'none' : 'present',
    rect: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
  };
})()`;

const pressTab = async session => {
  await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
};

const captureScreenshot = async (session, name) => {
  const response = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const path = join(screenshotsDir, `${name}.png`);
  await writeFile(path, Buffer.from(response.data, 'base64'));
  return path;
};

const dispatchKey = async (session, key, code, windowsVirtualKeyCode) => {
  await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode });
  await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode });
};

await mkdir(screenshotsDir, { recursive: true });

const result = await withPrecompiledRouteBrowser(async session => {
  await session.send('Page.enable');
  await session.send('Runtime.enable');
  await session.send('Page.addScriptToEvaluateOnNewDocument', { source: installExperienceCollectors });
  await session.send('Page.addScriptToEvaluateOnNewDocument', { source: DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT });

  await session.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  await session.send('Page.navigate', { url: `${BASE_URL}/?experienceAudit=first-${Date.now()}` });
  await waitForValue(session, `(() => document.readyState === 'complete' && document.body.innerText.includes('Vizly') && document.querySelector('.diagram-card-title') && document.querySelectorAll('.ant-skeleton, [class*=skeleton], [class*=Skeleton]').length === 0 ? true : null)()`, 'first visit workspace', 60_000);
  await delay(500);
  const firstVisit = await session.evaluate(visibleSnapshotExpression('first-visit-desktop'));
  const firstVisitScreenshot = await captureScreenshot(session, 'first-visit-desktop');

  await session.send('Page.navigate', { url: `${BASE_URL}/?canonicalPreset=${encodeURIComponent(presetId)}&experienceAudit=core-${Date.now()}#/?diagram=${encodeURIComponent(presetId)}` });
  await waitForValue(session, `(() => {
    const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
    return routing.stage === 'final-applied' && routing.renderAuthorityStatus === 'accepted' ? routing : null;
  })()`, 'core flow diagram ready');
  await delay(500);
  const coreFlow = await session.evaluate(visibleSnapshotExpression('core-flow-diagram'));
  const coreFlowScreenshot = await captureScreenshot(session, 'core-flow-diagram');
  const resultFollowup = await session.evaluate(`(() => {
    const controls = Array.from(document.querySelectorAll('button, [role="button"], a[href]'))
      .map(element => {
        const rect = element.getBoundingClientRect();
        const text = (element.innerText || element.getAttribute('aria-label') || element.getAttribute('title') || '').trim();
        return {
          text: text.slice(0, 120),
          aria: element.getAttribute('aria-label'),
          disabled: element.disabled === true || element.getAttribute('aria-disabled') === 'true',
          visible: getComputedStyle(element).display !== 'none'
            && getComputedStyle(element).visibility !== 'hidden'
            && rect.width > 0
            && rect.height > 0,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter(control => control.visible);
    const findControl = pattern => controls.find(control => pattern.test(control.text) || pattern.test(control.aria || '')) || null;
    return {
      activeDiagramTitle: document.body.innerText.includes('仓储需求分流与库存分配策略'),
      followupActions: {
        fitView: findControl(/适应|fit/i),
        export: findControl(/导出|export/i),
        share: findControl(/分享|share/i),
        pageAdd: findControl(/新建页面|add page/i),
        propertyPanel: findControl(/属性|property/i),
      },
      availableActionCount: controls.filter(control => !control.disabled).length,
    };
  })()`);
  const resultFollowupScreenshot = await captureScreenshot(session, 'result-followup-core-actions');

  const disabledDependencyFeedback = await session.evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('button')).find(candidate => /恰好选择两个组件/.test(candidate.textContent || candidate.getAttribute('aria-label') || ''));
    if (!button) return null;
    return { text: button.textContent.trim(), aria: button.getAttribute('aria-label'), disabled: button.disabled, ariaDisabled: button.getAttribute('aria-disabled') };
  })()`);
  const beforeLayoutJobId = await session.evaluate('window.__vizlyBaseReactFlowDisplayRouting?.layoutTransactionJobId ?? 0');
  await clickLayout(session, { id: 'domain-compound-elk-lr', strategy: 'domain-compound-elk', direction: 'LR' });
  const layoutCommit = await waitForValue(session, `(() => {
    const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
    if ((routing.layoutTransactionJobId ?? 0) <= ${JSON.stringify(beforeLayoutJobId)}) return null;
    if (routing.layoutTransactionStatus !== 'committed') return null;
    return {
      layoutTransactionStatus: routing.layoutTransactionStatus,
      layoutTransactionJobId: routing.layoutTransactionJobId,
      hardClean: routing.layoutGeometryReport?.clean ?? routing.hardGateDiagnostics?.hardClean ?? null,
      positionMismatchCount: routing.nodeGeometryParity?.positionMismatchCount ?? null,
      maxPositionDelta: routing.nodeGeometryParity?.maxPositionDelta ?? null,
    };
  })()`, 'state feedback layout commit');
  await delay(300);
  const stateFeedback = {
    disabledDependencyFeedback,
    layoutCommit,
    snapshot: await session.evaluate(visibleSnapshotExpression('state-feedback-after-layout')),
    screenshot: await captureScreenshot(session, 'state-feedback-after-layout'),
  };

  await session.evaluate(`(() => { document.body.focus(); })()`);
  const keyboardTrace = [];
  for (let i = 0; i < 14; i += 1) {
    await pressTab(session);
    await delay(80);
    keyboardTrace.push(await session.evaluate(activeElementExpression));
  }
  await dispatchKey(session, 'Enter', 'Enter', 13);
  await delay(250);
  const keyboardAfterEnter = await session.evaluate(activeElementExpression);

  await session.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await session.send('Page.navigate', { url: `${BASE_URL}/?experienceAudit=mobile-${Date.now()}` });
  await waitForValue(session, `(() => document.readyState === 'complete' && document.body.innerText.includes('工作区') && document.querySelector('.diagram-card-title') && document.querySelectorAll('.ant-skeleton, [class*=skeleton], [class*=Skeleton]').length === 0 ? true : null)()`, 'mobile first visit', 60_000);
  await delay(600);
  const responsiveFirstVisit = await session.evaluate(visibleSnapshotExpression('responsive-mobile-first-visit'));
  const responsiveFirstVisitScreenshot = await captureScreenshot(session, 'responsive-mobile-first-visit');

  const poisonedViewportRecoverySetup = await session.evaluate(`(() => {
    const poisonousViewport = { x: -100000, y: -100000, zoom: 0.02 };
    const keys = [
      ${JSON.stringify(`${presetId}:page-1`)},
      ${JSON.stringify(`${presetId}:page-1:desktop`)},
    ].map(scope => 'vizly:viewport:v1:' + encodeURIComponent(scope));
    for (const key of keys) sessionStorage.setItem(key, JSON.stringify(poisonousViewport));
    return { keys, poisonousViewport };
  })()`);
  await session.send('Page.navigate', { url: `${BASE_URL}/?canonicalPreset=${encodeURIComponent(presetId)}&experienceAudit=mobile-core-${Date.now()}#/?diagram=${encodeURIComponent(presetId)}` });
  await waitForValue(session, `(() => {
    const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
    return routing.stage === 'final-applied' && routing.renderAuthorityStatus === 'accepted' ? routing : null;
  })()`, 'mobile core flow diagram ready');
  await delay(700);
  const responsiveCoreFlow = await session.evaluate(visibleSnapshotExpression('responsive-mobile-core-flow'));
  const responsiveCoreFlowScreenshot = await captureScreenshot(session, 'responsive-mobile-core-flow');
  const recovery = {
    poisonedViewportSetup: poisonedViewportRecoverySetup,
    recoveredViewport: responsiveCoreFlow.reactFlow.viewport,
    readableZoom: Number.isFinite(responsiveCoreFlow.reactFlow.viewport?.zoom)
      && responsiveCoreFlow.reactFlow.viewport.zoom >= 0.3,
    preservedDiagram: responsiveCoreFlow.reactFlow.instanceNodeCount === 30
      && responsiveCoreFlow.reactFlow.instanceEdgeCount === 26,
    screenshot: responsiveCoreFlowScreenshot,
  };

  return {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    presetId,
    screenshots: {
      firstVisit: firstVisitScreenshot,
      coreFlow: coreFlowScreenshot,
      resultFollowup: resultFollowupScreenshot,
      stateFeedback: stateFeedback.screenshot,
      recovery: recovery.screenshot,
      responsiveFirstVisit: responsiveFirstVisitScreenshot,
      responsiveCoreFlow: responsiveCoreFlowScreenshot,
    },
    scenarios: {
      firstVisit,
      coreFlow,
      resultFollowup,
      stateFeedback,
      recovery,
      responsive: { firstVisit: responsiveFirstVisit, coreFlow: responsiveCoreFlow },
      keyboard: { trace: keyboardTrace, afterEnter: keyboardAfterEnter },
    },
  };
});

await writeFile(join(outDir, 'experience-browser-evidence.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  out: join(outDir, 'experience-browser-evidence.json'),
  screenshots: result.screenshots,
  firstVisit: {
    controls: result.scenarios.firstVisit.controlCount,
    bodyIncludesVizly: result.scenarios.firstVisit.bodyTextSample.includes('Vizly'),
    horizontalOverflow: result.scenarios.firstVisit.horizontalOverflow,
    errors: result.scenarios.firstVisit.audit?.errors?.length ?? null,
  },
  coreFlow: {
    nodes: result.scenarios.coreFlow.reactFlow.instanceNodeCount,
    edges: result.scenarios.coreFlow.reactFlow.instanceEdgeCount,
    hardClean: result.scenarios.coreFlow.routing?.hardClean,
    errors: result.scenarios.coreFlow.audit?.errors?.length ?? null,
  },
  resultFollowup: {
    activeDiagramTitle: result.scenarios.resultFollowup.activeDiagramTitle,
    availableActionCount: result.scenarios.resultFollowup.availableActionCount,
    followupActions: Object.fromEntries(Object.entries(result.scenarios.resultFollowup.followupActions)
      .map(([key, value]) => [key, Boolean(value && !value.disabled)])),
  },
  stateFeedback: {
    disabledDependencyFeedback: result.scenarios.stateFeedback.disabledDependencyFeedback,
    layoutCommit: result.scenarios.stateFeedback.layoutCommit,
  },
  recovery: {
    readableZoom: result.scenarios.recovery.readableZoom,
    preservedDiagram: result.scenarios.recovery.preservedDiagram,
    recoveredViewport: result.scenarios.recovery.recoveredViewport,
  },
  consoleNetwork: {
    firstVisit: {
      fetches: result.scenarios.firstVisit.audit?.fetches?.length ?? null,
      xhrs: result.scenarios.firstVisit.audit?.xhrs?.length ?? null,
      resources: result.scenarios.firstVisit.audit?.resourceSummary?.count ?? null,
      slowResources: result.scenarios.firstVisit.audit?.resourceSummary?.slowCount ?? null,
    },
    coreFlow: {
      fetches: result.scenarios.coreFlow.audit?.fetches?.length ?? null,
      xhrs: result.scenarios.coreFlow.audit?.xhrs?.length ?? null,
      resources: result.scenarios.coreFlow.audit?.resourceSummary?.count ?? null,
      slowResources: result.scenarios.coreFlow.audit?.resourceSummary?.slowCount ?? null,
    },
  },
  responsive: {
    firstVisitOverflow: result.scenarios.responsive.firstVisit.horizontalOverflow,
    coreFlowOverflow: result.scenarios.responsive.coreFlow.horizontalOverflow,
    coreFlowNodes: result.scenarios.responsive.coreFlow.reactFlow.instanceNodeCount,
    coreFlowEdges: result.scenarios.responsive.coreFlow.reactFlow.instanceEdgeCount,
  },
  keyboard: result.scenarios.keyboard.trace.map((entry, index) => ({ index: index + 1, tag: entry?.tag, text: entry?.text, visible: entry?.visible, focusVisible: entry?.focusVisible, outlineWidth: entry?.outlineWidth, boxShadow: entry?.boxShadow })),
}, null, 2));
