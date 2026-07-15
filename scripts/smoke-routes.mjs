import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, rm, stat } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import {
  isFinalWmsDisplayRoutingReady,
  resolveRouteBudget,
  shouldRetryEvaluateAfterTimeout,
} from './smokeRouteBudgetUtils.mjs';

const HOST = '127.0.0.1';
const parsePortEnv = (name, defaultValue) => {
  const rawValue = process.env[name];
  const value = rawValue ? Number(rawValue) : defaultValue;
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`Invalid TCP port env value for ${name}: ${rawValue}`);
  }
  return value;
};
const APP_PORT = parsePortEnv('SMOKE_PORT', 5373);
const REQUESTED_DEBUG_PORT = parsePortEnv('SMOKE_DEBUG_PORT', 9333);
let DEBUG_PORT = REQUESTED_DEBUG_PORT;
const HAS_EXPLICIT_DEBUG_PORT = Boolean(process.env.SMOKE_DEBUG_PORT);
const BASE_URL = process.env.SMOKE_BASE_URL || `http://${HOST}:${APP_PORT}`;
const USE_EXISTING_SERVER = Boolean(process.env.SMOKE_BASE_URL);
const SERVER_MODE = process.env.SMOKE_SERVER || 'preview';
const LIFECYCLE_EVENT = process.env.npm_lifecycle_event || '';
const IS_BUDGET_SMOKE_SCRIPT = LIFECYCLE_EVENT === 'smoke:routes:budget';
const IS_MOBILE_SMOKE_SCRIPT = LIFECYCLE_EVENT === 'smoke:routes:mobile';
const PRINT_REPORT = process.env.SMOKE_REPORT === '1';
const CHECK_BUDGET = process.env.SMOKE_BUDGET === '1' || IS_BUDGET_SMOKE_SCRIPT || IS_MOBILE_SMOKE_SCRIPT;
const parseOptionalViewportEnv = (name) => {
  const rawValue = process.env[name];
  if (!rawValue) return undefined;

  const parsedValue = Number(rawValue);
  if (!Number.isInteger(parsedValue) || parsedValue < 100 || parsedValue > 10000) {
    throw new Error(`Invalid viewport pixel env value for ${name}: ${rawValue}`);
  }

  return parsedValue;
};
const VIEWPORT_WIDTH = parseOptionalViewportEnv('SMOKE_VIEWPORT_WIDTH') ?? (IS_MOBILE_SMOKE_SCRIPT ? 390 : undefined);
const VIEWPORT_HEIGHT = parseOptionalViewportEnv('SMOKE_VIEWPORT_HEIGHT') ?? (IS_MOBILE_SMOKE_SCRIPT ? 844 : undefined);
const VIEWPORT_SCALE = Number(process.env.SMOKE_VIEWPORT_SCALE || '1');
if (!Number.isFinite(VIEWPORT_SCALE) || VIEWPORT_SCALE <= 0 || VIEWPORT_SCALE > 10) {
  throw new Error(`Invalid positive viewport scale env value for SMOKE_VIEWPORT_SCALE: ${process.env.SMOKE_VIEWPORT_SCALE}`);
}
const VIEWPORT = VIEWPORT_WIDTH || VIEWPORT_HEIGHT
  ? {
      width: VIEWPORT_WIDTH ?? 1280,
      height: VIEWPORT_HEIGHT ?? 720,
      scale: VIEWPORT_SCALE,
    }
  : null;
const parseSmokeRepeat = () => {
  const rawValue = process.env.SMOKE_REPEAT;
  if (!rawValue) return 1;

  const parsedValue = Number(rawValue);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`Invalid positive integer env value for SMOKE_REPEAT: ${rawValue}`);
  }

  return parsedValue;
};
const SMOKE_REPEAT = parseSmokeRepeat();
const ROUTE_FILTERS = (process.env.SMOKE_ROUTES || '')
  .split(',')
  .map((routeName) => routeName.trim())
  .filter(Boolean);
const WORKSPACE_ROOT = resolve(process.cwd());
const SMOKE_PROFILE_PREFIX = '.tmp-vizly-smoke-profile-';
const parseSmokeProfileMaxAgeMs = () => {
  const rawValue = process.env.SMOKE_PROFILE_MAX_AGE_MS;
  if (!rawValue) return 30 * 60 * 1000;

  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    throw new Error(`Invalid non-negative numeric env value for SMOKE_PROFILE_MAX_AGE_MS: ${rawValue}`);
  }

  return parsedValue;
};
const STALE_PROFILE_MAX_AGE_MS = parseSmokeProfileMaxAgeMs();
const browserProfileDir = resolve(WORKSPACE_ROOT, `${SMOKE_PROFILE_PREFIX}${process.pid}`);

const allowedWarningPatterns = [
  /\[DataRegistry\] Failed to fetch remote templates/,
  /没有节点数据/,
  /没有连线数据/,
  /Automatic fallback to software WebGL has been deprecated/,
  /GL Driver Message .*ReadPixels/,
];

const routes = [
  {
    name: 'management',
    url: `${BASE_URL}/`,
    timeoutMs: 25000,
    expression: `(() => {
      const body = document.body?.textContent || '';
      return {
        href: location.href,
        title: document.title,
        readyState: document.readyState,
        hasRoot: Boolean(document.getElementById('root')),
        hasReactFlow: Boolean(document.querySelector('.react-flow')),
        appFallback: body.includes('加载应用'),
        pageFallback: body.includes('加载图表管理') || body.includes('加载图表'),
        errorBoundary: body.includes('页面出现错误'),
        bodyText: body.slice(0, 240),
        scriptCount: document.scripts.length,
        scripts: Array.from(document.scripts).map((script) => script.src).filter(Boolean).slice(0, 8),
        resources: performance.getEntriesByType('resource').map((entry) => ({
          name: entry.name,
          duration: Math.round(entry.duration),
          transferSize: entry.transferSize,
        })).slice(0, 16),
        rootText: (document.getElementById('root')?.textContent || '').slice(0, 240),
        ready: Boolean(document.getElementById('root')) &&
          !body.includes('加载应用') &&
          !body.includes('加载图表管理') &&
          !body.includes('页面出现错误') &&
          (body.includes('Workspace') || body.includes('New Diagram') || body.includes('行业模板库')),
      };
    })()`,
  },
  {
    name: 'management-templates',
    url: `${BASE_URL}/?view=templates`,
    timeoutMs: 30000,
    expression: `(() => {
      const body = document.body?.textContent || '';
      const activeTab = document.querySelector('.filter-tab.active')?.textContent || '';
      return {
        href: location.href,
        title: document.title,
        readyState: document.readyState,
        hasRoot: Boolean(document.getElementById('root')),
        activeTab,
        appFallback: body.includes('加载应用'),
        pageFallback: body.includes('加载图表管理') || body.includes('加载图表'),
        errorBoundary: body.includes('页面出现错误'),
        bodyText: body.slice(0, 240),
        rootText: (document.getElementById('root')?.textContent || '').slice(0, 240),
        ready: Boolean(document.getElementById('root')) &&
          activeTab.includes('行业模板库') &&
          !body.includes('加载应用') &&
          !body.includes('加载图表管理') &&
          !body.includes('页面出现错误') &&
          (body.includes('行业模板库') || body.includes('No diagrams')),
      };
    })()`,
  },
  {
    name: 'default-diagram',
    url: `${BASE_URL}/?diagram=flowchart`,
    timeoutMs: 35000,
    expression: `(() => {
      const body = document.body?.textContent || '';
      return {
        href: location.href,
        title: document.title,
        readyState: document.readyState,
        hasRoot: Boolean(document.getElementById('root')),
        hasReactFlow: Boolean(document.querySelector('.react-flow')),
        hasRenderer: Boolean(document.querySelector('.react-flow__renderer')),
        appFallback: body.includes('加载应用'),
        pageFallback: body.includes('加载图表'),
        errorBoundary: body.includes('页面出现错误'),
        bodyText: body.slice(0, 240),
        scriptCount: document.scripts.length,
        scripts: Array.from(document.scripts).map((script) => script.src).filter(Boolean).slice(0, 8),
        resources: performance.getEntriesByType('resource').map((entry) => ({
          name: entry.name,
          duration: Math.round(entry.duration),
          transferSize: entry.transferSize,
        })).slice(0, 16),
        rootText: (document.getElementById('root')?.textContent || '').slice(0, 240),
        ready: Boolean(document.querySelector('.react-flow')) &&
          Boolean(document.querySelector('.react-flow__renderer')) &&
          !body.includes('加载图表') &&
          !body.includes('页面出现错误'),
      };
    })()`,
  },
  {
    name: 'wms-process-large-diagram',
    url: `${BASE_URL}/?diagram=wms-process-flow-v1`,
    timeoutMs: 55000,
    expression: `(() => {
      const body = document.body?.textContent || '';
      const bridge = window.__flowDataBridge?.['wms-process-flow-v1'];
      const renderedNodeCount = document.querySelectorAll('.react-flow__node').length;
      const renderedEdgeCount = document.querySelectorAll('.react-flow__edge').length;
      const bridgeNodeCount = Array.isArray(bridge?.nodes) ? bridge.nodes.length : 0;
      const bridgeEdgeCount = Array.isArray(bridge?.edges) ? bridge.edges.length : 0;
      const optimizationStats = window.__vizly_coordinator__?.getOptimizationStats?.();
      const parallelStats = optimizationStats?.parallel || null;
      const workerHealthy = !parallelStats ||
        (parallelStats.activeWorkers === 0 && parallelStats.queuedTasks === 0);
      const displayRouting = window.__vizlyBaseReactFlowDisplayRouting;
      const displayRoutingReady = (${isFinalWmsDisplayRoutingReady.toString()})(displayRouting);
      return {
        href: location.href,
        title: document.title,
        readyState: document.readyState,
        hasRoot: Boolean(document.getElementById('root')),
        hasReactFlow: Boolean(document.querySelector('.react-flow')),
        hasRenderer: Boolean(document.querySelector('.react-flow__renderer')),
        renderedNodeCount,
        renderedEdgeCount,
        bridgeNodeCount,
        bridgeEdgeCount,
        parallelStats,
        workerHealthy,
        displayRouting: displayRouting && {
          stage: displayRouting.stage,
          workerStartCount: displayRouting.workerStartCount,
          workerAbortCount: displayRouting.workerAbortCount,
          workerResolution: displayRouting.workerResolution,
          routeMs: displayRouting.routeMs,
          finalAppliedAt: displayRouting.finalAppliedAt,
          outputRouteSignature: displayRouting.outputRouteSignature,
        },
        displayRoutingReady,
        appFallback: body.includes('加载应用'),
        pageFallback: body.includes('加载图表'),
        errorBoundary: body.includes('页面出现错误'),
        bodyText: body.slice(0, 240),
        rootText: (document.getElementById('root')?.textContent || '').slice(0, 240),
        ready: Boolean(document.querySelector('.react-flow')) &&
          Boolean(document.querySelector('.react-flow__renderer')) &&
          renderedNodeCount >= 20 &&
          renderedEdgeCount >= 35 &&
          workerHealthy &&
          displayRoutingReady &&
          !body.includes('加载图表') &&
          !body.includes('页面出现错误'),
      };
    })()`,
  },
  {
    name: 'storage-config',
    url: `${BASE_URL}/storage-config`,
    timeoutMs: 30000,
    expression: `(() => {
      const body = document.body?.textContent || '';
      return {
        href: location.href,
        title: document.title,
        readyState: document.readyState,
        hasRoot: Boolean(document.getElementById('root')),
        appFallback: body.includes('加载应用'),
        pageFallback: body.includes('加载存储配置'),
        errorBoundary: body.includes('页面出现错误'),
        bodyText: body.slice(0, 240),
        rootText: (document.getElementById('root')?.textContent || '').slice(0, 240),
        ready: Boolean(document.getElementById('root')) &&
          !body.includes('加载存储配置') &&
          !body.includes('页面出现错误') &&
          body.includes('Settings & Storage') &&
          body.includes('Connection Settings'),
      };
    })()`,
  },
  {
    name: 'shared-missing-token',
    url: `${BASE_URL}/shared`,
    timeoutMs: 30000,
    expression: `(() => {
      const body = document.body?.textContent || '';
      return {
        href: location.href,
        title: document.title,
        readyState: document.readyState,
        hasRoot: Boolean(document.getElementById('root')),
        appFallback: body.includes('加载应用'),
        pageFallback: body.includes('加载分享页面'),
        errorBoundary: body.includes('页面出现错误'),
        bodyText: body.slice(0, 240),
        rootText: (document.getElementById('root')?.textContent || '').slice(0, 240),
        ready: Boolean(document.getElementById('root')) &&
          !body.includes('加载分享页面') &&
          !body.includes('页面出现错误') &&
          body.includes('404'),
      };
    })()`,
  },
  {
    name: 'theme-colors',
    url: `${BASE_URL}/?test=colors`,
    timeoutMs: 30000,
    expression: `(() => {
      const body = document.body?.textContent || '';
      return {
        href: location.href,
        title: document.title,
        readyState: document.readyState,
        hasRoot: Boolean(document.getElementById('root')),
        appFallback: body.includes('加载应用'),
        pageFallback: body.includes('加载主题对比页面'),
        errorBoundary: body.includes('页面出现错误'),
        bodyText: body.slice(0, 240),
        rootText: (document.getElementById('root')?.textContent || '').slice(0, 240),
        ready: Boolean(document.getElementById('root')) &&
          !body.includes('加载主题对比页面') &&
          !body.includes('页面出现错误') &&
          body.includes('主题颜色对比测试'),
      };
    })()`,
  },
  {
    name: 'theme-side-by-side',
    url: `${BASE_URL}/?test=sidebyside`,
    timeoutMs: 30000,
    expression: `(() => {
      const body = document.body?.textContent || '';
      return {
        href: location.href,
        title: document.title,
        readyState: document.readyState,
        hasRoot: Boolean(document.getElementById('root')),
        appFallback: body.includes('加载应用'),
        pageFallback: body.includes('加载并排对比页面'),
        errorBoundary: body.includes('页面出现错误'),
        bodyText: body.slice(0, 240),
        rootText: (document.getElementById('root')?.textContent || '').slice(0, 240),
        ready: Boolean(document.getElementById('root')) &&
          !body.includes('加载并排对比页面') &&
          !body.includes('页面出现错误') &&
          body.includes('主题颜色并排对比测试'),
      };
    })()`,
  },
  {
    name: 'docs-preview',
    url: `${BASE_URL}/?test=docs`,
    timeoutMs: 30000,
    expression: `(() => {
      const body = document.body?.textContent || '';
      return {
        href: location.href,
        title: document.title,
        readyState: document.readyState,
        hasRoot: Boolean(document.getElementById('root')),
        appFallback: body.includes('加载应用'),
        pageFallback: body.includes('加载文档预览页面'),
        errorBoundary: body.includes('页面出现错误'),
        bodyText: body.slice(0, 240),
        rootText: (document.getElementById('root')?.textContent || '').slice(0, 240),
        ready: Boolean(document.getElementById('root')) &&
          !body.includes('加载文档预览页面') &&
          !body.includes('页面出现错误'),
      };
    })()`,
  },
  {
    name: 'warehouse-3d',
    url: `${BASE_URL}/?test=3d`,
    timeoutMs: 45000,
    expression: `(() => {
      const body = document.body?.textContent || '';
      const readyMarker = document.querySelector('[data-smoke-ready="warehouse-3d"]');
      return {
        href: location.href,
        title: document.title,
        readyState: document.readyState,
        hasRoot: Boolean(document.getElementById('root')),
        hasCanvas: Boolean(document.querySelector('canvas')),
        hasReadyMarker: Boolean(readyMarker),
        appFallback: body.includes('加载应用'),
        pageFallback: body.includes('Loading 3D Warehouse') || body.includes('Loading 3D Environment'),
        errorBoundary: body.includes('页面出现错误'),
        bodyText: body.slice(0, 240),
        rootText: (document.getElementById('root')?.textContent || '').slice(0, 240),
        ready: Boolean(readyMarker) &&
          Boolean(document.querySelector('canvas')) &&
          !body.includes('Loading 3D Warehouse') &&
          !body.includes('Loading 3D Environment') &&
          !body.includes('页面出现错误') &&
          body.includes('Large Retail Logistics Center'),
      };
    })()`,
  },
  {
    name: 'unified-designer',
    url: `${BASE_URL}/?test=unified`,
    timeoutMs: 45000,
    expression: `(() => {
      const body = document.body?.textContent || '';
      return {
        href: location.href,
        title: document.title,
        readyState: document.readyState,
        hasRoot: Boolean(document.getElementById('root')),
        hasReactFlow: Boolean(document.querySelector('.react-flow')),
        hasRenderer: Boolean(document.querySelector('.react-flow__renderer')),
        appFallback: body.includes('加载应用'),
        pageFallback: body.includes('加载统一外壳测试页'),
        errorBoundary: body.includes('页面出现错误'),
        bodyText: body.slice(0, 240),
        rootText: (document.getElementById('root')?.textContent || '').slice(0, 240),
        ready: Boolean(document.querySelector('.react-flow')) &&
          Boolean(document.querySelector('.react-flow__renderer')) &&
          !body.includes('加载统一外壳测试页') &&
          !body.includes('页面出现错误'),
      };
    })()`,
  },
];

const knownRouteNames = new Set(routes.map((route) => route.name));
const unknownRouteFilters = ROUTE_FILTERS.filter((routeName) => !knownRouteNames.has(routeName));
if (unknownRouteFilters.length > 0) {
  throw new Error(`Unknown SMOKE_ROUTES value(s): ${unknownRouteFilters.join(', ')}`);
}
const selectedRoutes = ROUTE_FILTERS.length > 0
  ? routes.filter((route) => ROUTE_FILTERS.includes(route.name))
  : routes;

const log = (message) => {
  process.stdout.write(`${message}\n`);
};

const fail = (message, details) => {
  const error = new Error(message);
  if (details) error.details = details;
  throw error;
};

const getEnvPath = (name) => {
  const value = process.env[name];
  return value && existsSync(value) ? value : null;
};

const findBrowserExecutable = () => {
  const explicit = getEnvPath('CHROME_PATH') || getEnvPath('EDGE_PATH') || getEnvPath('BROWSER_PATH');
  if (explicit) return explicit;

  const candidates = [
    join(process.env.PROGRAMFILES || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.PROGRAMFILES || 'C:/Program Files', 'Microsoft/Edge/Application/msedge.exe'),
    join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
  ];

  return candidates.find((candidate) => candidate && existsSync(candidate)) || null;
};

const probeHttp = (url, timeoutMs = 2500) => new Promise((resolveProbe, rejectProbe) => {
  const parsed = new URL(url);
  const request = parsed.protocol === 'https:' ? httpsRequest : httpRequest;
  const req = request(parsed, {
    method: 'GET',
    timeout: timeoutMs,
    headers: { 'cache-control': 'no-store' },
  }, (response) => {
    response.resume();
    response.on('end', () => {
      if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
        resolveProbe(response);
      } else {
        rejectProbe(new Error(`HTTP ${response.statusCode}`));
      }
    });
  });
  req.on('timeout', () => {
    req.destroy(new Error(`HTTP probe timed out after ${timeoutMs}ms`));
  });
  req.on('error', rejectProbe);
  req.end();
});

const requestJson = (url, { method = 'GET', timeoutMs = 5000 } = {}) => new Promise((resolveRequest, rejectRequest) => {
  const parsed = new URL(url);
  const request = parsed.protocol === 'https:' ? httpsRequest : httpRequest;
  let settled = false;
  const hardTimeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    req.destroy(new Error(`JSON request hard timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  const resolveOnce = (value) => {
    if (settled) return;
    settled = true;
    clearTimeout(hardTimeout);
    resolveRequest(value);
  };
  const rejectOnce = (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(hardTimeout);
    rejectRequest(error);
  };
  const req = request(parsed, { method, timeout: timeoutMs }, (response) => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', (chunk) => {
      body += chunk;
    });
    response.on('end', () => {
      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
        rejectOnce(new Error(`HTTP ${response.statusCode}: ${body.slice(0, 240)}`));
        return;
      }
      try {
        resolveOnce(JSON.parse(body));
      } catch (error) {
        rejectOnce(error);
      }
    });
  });
  req.on('timeout', () => {
    req.destroy(new Error(`JSON request timed out after ${timeoutMs}ms`));
  });
  req.on('error', rejectOnce);
  req.end();
});

const waitForHttp = async (url, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await probeHttp(url);
    } catch (error) {
      lastError = error;
    }
    await delay(300);
  }
  fail(`Timed out waiting for ${url}`, lastError?.message);
};

const isPortAvailable = (port) => new Promise((resolveAvailable) => {
  const server = createServer();
  server.once('error', () => resolveAvailable(false));
  server.once('listening', () => {
    server.close(() => resolveAvailable(true));
  });
  server.listen(port, HOST);
});

const findAvailablePort = async (startPort) => {
  for (let port = startPort; port <= 65535; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  fail(`Unable to find an available debug port at or above ${startPort}`);
};

const startAppServer = async () => {
  if (USE_EXISTING_SERVER) {
    log(`Waiting for existing server at ${BASE_URL}`);
    await waitForHttp(BASE_URL, 15000);
    return null;
  }

  const viteBin = resolve(WORKSPACE_ROOT, 'node_modules/vite/bin/vite.js');
  if (!existsSync(viteBin)) {
    fail(`Unable to find local Vite binary at ${viteBin}`);
  }

  if (SERVER_MODE === 'preview' && !existsSync(resolve(WORKSPACE_ROOT, 'dist/index.html'))) {
    fail('dist/index.html does not exist. Run `npm run build` before `npm run smoke:routes`, or set SMOKE_SERVER=dev.');
  }

  const viteArgs = SERVER_MODE === 'dev'
    ? ['--host', HOST, '--port', String(APP_PORT), '--strictPort']
    : ['preview', '--host', HOST, '--port', String(APP_PORT), '--strictPort'];

  log(`Launching Vite ${SERVER_MODE}: ${process.execPath} ${[viteBin, ...viteArgs].join(' ')}`);
  const child = spawn(process.execPath, [viteBin, ...viteArgs], {
    cwd: WORKSPACE_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BROWSER: 'none' },
    windowsHide: true,
  });
  log(`Vite child pid: ${child.pid ?? 'unknown'}`);

  const output = [];
  const collect = (chunk) => {
    output.push(String(chunk));
    if (output.length > 30) output.shift();
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);

  log(`Waiting for Vite ${SERVER_MODE} HTTP readiness at ${BASE_URL}`);
  await waitForHttp(BASE_URL, 30000).catch((error) => {
    child.kill();
    fail(`Vite ${SERVER_MODE} server did not become ready at ${BASE_URL}`, {
      error: error.message,
      output: output.join('').slice(-4000),
    });
  });
  log(`Vite ${SERVER_MODE} HTTP readiness confirmed`);

  return child;
};

const launchBrowser = async (browserPath) => {
  log(`Launching browser: ${browserPath}`);
  const browserArgs = [
    '--headless=new',
    '--disable-gpu',
    '--disable-gpu-sandbox',
    '--use-angle=swiftshader',
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-features=Vulkan,UseSkiaRenderer',
    '--disable-background-networking',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--disable-component-extensions-with-background-pages',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${browserProfileDir}`,
    ...(VIEWPORT ? [`--window-size=${VIEWPORT.width},${VIEWPORT.height}`] : []),
    'about:blank',
  ];
  const child = spawn(browserPath, browserArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  log(`Browser child pid: ${child.pid ?? 'unknown'}`);

  const output = [];
  const collect = (chunk) => {
    output.push(String(chunk));
    if (output.length > 30) output.shift();
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);

  await waitForHttp(`http://${HOST}:${DEBUG_PORT}/json/version`, 15000).catch((error) => {
    child.kill();
    fail('Browser did not expose a DevTools endpoint', {
      error: error.message,
      browserPath,
      output: output.join('').slice(-4000),
    });
  });
  log(`Browser DevTools endpoint ready at http://${HOST}:${DEBUG_PORT}/json/version`);
  const version = await requestJson(`http://${HOST}:${DEBUG_PORT}/json/version`);
  child.browserWebSocketDebuggerUrl = version.webSocketDebuggerUrl;

  return child;
};

const createTarget = async (url = 'about:blank') => {
  const endpoint = `http://${HOST}:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`;
  let target;
  try {
    target = await requestJson(endpoint, { method: 'PUT' });
  } catch {
    target = await requestJson(endpoint);
  }
  if (!target.webSocketDebuggerUrl) {
    fail('Browser target did not expose webSocketDebuggerUrl', target);
  }
  log(`Created browser target ${target.id || 'unknown'} (${target.type || 'unknown'}): ${target.url || url}`);
  return target;
};

class CdpSession {
  constructor(browserUrl, targetId) {
    this.browserUrl = browserUrl;
    this.targetId = targetId;
    this.nextId = 1;
    this.pending = new Map();
    this.eventWaiters = new Map();
    this.logs = [];
    this.networkIssues = [];
    this.pendingLogEnrichments = [];
    this.requests = new Map();
  }

  async open() {
    if (!this.browserUrl) {
      fail('Browser did not provide a browser-level DevTools WebSocket URL.');
    }

    this.socket = new WebSocket(this.browserUrl);
    this.socket.on('message', (data) => {
      this.onMessage(data).catch((error) => {
        this.logs.push({ level: 'error', message: `Failed to parse CDP message: ${error.message}` });
      });
    });
    await new Promise((resolveOpen, rejectOpen) => {
      const timeout = setTimeout(() => rejectOpen(new Error('Timed out opening CDP WebSocket')), 10000);
      this.socket.once('open', () => {
        clearTimeout(timeout);
        resolveOpen();
      });
      this.socket.once('error', rejectOpen);
    });

    const attachResult = await this.send('Target.attachToTarget', {
      targetId: this.targetId,
      flatten: true,
    }, 10000, false);
    this.sessionId = attachResult.sessionId;

    await Promise.all([
      this.send('Runtime.enable'),
      this.send('Page.enable'),
      this.send('Log.enable'),
      this.send('Network.enable'),
    ]);
    await this.send('Runtime.evaluate', {
      expression: `
        (function () {
          if (window.__smokeErrorCaptureInstalled) return;
          window.__smokeErrorCaptureInstalled = true;
          window.__smokeErrorCapture = [];
          window.__smokeErrorCaptureLimit = 50;

          const record = (entry) => {
            window.__smokeErrorCapture.push({
              ...entry,
              at: Date.now(),
            });
            if (window.__smokeErrorCapture.length > window.__smokeErrorCaptureLimit) {
              window.__smokeErrorCapture.shift();
            }
          };

          window.addEventListener('error', (event) => {
            const err = event?.error;
            record({
              type: 'error',
              message: err?.message || String(event?.message || 'unknown error'),
              stack: err?.stack || null,
              filename: event?.filename || null,
              lineno: event?.lineno || null,
              colno: event?.colno || null,
              source: event?.type || 'window',
            });
          });

          window.addEventListener('unhandledrejection', (event) => {
            const reason = event?.reason;
            record({
              type: 'unhandledrejection',
              message: reason?.message || String(reason || 'unknown rejection'),
              stack: reason?.stack || null,
              source: 'unhandledrejection',
            });
          });
        })();
      `,
      awaitPromise: true,
    }).catch(() => {});
    if (VIEWPORT) {
      await this.send('Emulation.setDeviceMetricsOverride', {
        width: VIEWPORT.width,
        height: VIEWPORT.height,
        deviceScaleFactor: VIEWPORT.scale,
        mobile: VIEWPORT.width <= 600,
      });
      await this.send('Emulation.setVisibleSize', {
        width: VIEWPORT.width,
        height: VIEWPORT.height,
      }).catch(() => {});
    }
    await this.send('Page.bringToFront').catch(() => {});
  }

  close() {
    this.socket?.close();
  }

  async onMessage(messageData) {
    const data = typeof messageData === 'string'
      ? messageData
      : Buffer.isBuffer(messageData)
        ? messageData.toString('utf8')
        : String(messageData);
    const message = JSON.parse(data);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message.result);
      return;
    }

    const waiters = this.eventWaiters.get(message.method);
    if (waiters?.length) {
      const waiter = waiters.shift();
      waiter.resolve(message.params);
      if (waiters.length === 0) this.eventWaiters.delete(message.method);
    }

    const describeConsoleArg = (arg) => {
      if (!arg) return '';
      if (arg.value !== undefined) return String(arg.value);
      if (arg.description) return String(arg.description);
      if (arg.preview?.description) return String(arg.preview.description);
      if (arg.type === 'object' && arg.className) return `[${arg.className}]`;
      return '';
    };

    if (message.method === 'Runtime.consoleAPICalled') {
      const { type, args = [] } = message.params;
      if (['warning', 'warn', 'error'].includes(type)) {
        const formattedArgs = args.map((arg) => describeConsoleArg(arg)).filter(Boolean);
        const includeRaw = process.env.SMOKE_LOG_RAW === '1';
        const logEntry = {
          level: type === 'warning' ? 'warn' : type,
          message: formattedArgs.length ? formattedArgs.join(' ') : `[${type}]`,
          ...(includeRaw ? {
            rawArgs: args.map((arg) => ({
              type: arg.type,
              objectId: arg.objectId,
              value: arg.value,
              description: arg.description,
              className: arg.className,
              preview: arg.preview
                ? {
                    type: arg.preview.type,
                    subtype: arg.preview.subtype,
                    description: arg.preview.description,
                    overflow: arg.preview.overflow,
                    properties: (arg.preview.properties || []).map((property) => ({
                      name: property.name,
                      type: property.type,
                      value: property.value ? String(property.value.value ?? property.value.description ?? '') : undefined,
                    })),
                }
                : undefined,
            })),
          } : {}),
        };
        const entryIndex = this.logs.push(logEntry) - 1;
        const enrichObjectArg = async (arg, rawArg) => {
          if (!arg.objectId || !includeRaw) return;
          try {
            const objectProperties = await this.send('Runtime.getProperties', {
              objectId: arg.objectId,
              ownProperties: true,
            }, 2000);
            const properties = objectProperties?.result || [];
            const getValue = (name) => {
              const matched = properties.find((property) => property.name === name);
              const rawValue = matched?.value;
              if (!rawValue) return undefined;
              return rawValue.unserializableValue ?? rawValue.value ?? rawValue.description;
            };
            const objectSnapshot = {
              name: getValue('name') ?? null,
              message: getValue('message') ?? null,
              stack: getValue('stack') ?? null,
            };
            if (!rawArg.rawSnapshot) {
              rawArg.rawSnapshot = objectSnapshot;
            }
          } catch {
            // Keep best-effort enrichment.
          }
        };

        if (includeRaw) {
          this.pendingLogEnrichments.push(...logEntry.rawArgs.map((rawArg, rawArgIndex) => enrichObjectArg(args[rawArgIndex], rawArg)));
        }
        this.logs[entryIndex] = logEntry;
      }
    }

    if (message.method === 'Log.entryAdded') {
      const { entry } = message.params;
      if (['warning', 'error'].includes(entry.level)) {
        this.logs.push({
          level: entry.level === 'warning' ? 'warn' : entry.level,
          message: entry.text || entry.url || '',
        });
      }
    }

    if (message.method === 'Runtime.exceptionThrown') {
      const { exceptionDetails } = message.params || {};
      const text = exceptionDetails?.text
        || exceptionDetails?.exception?.description
        || exceptionDetails?.exception?.value
        || 'Unhandled browser exception';
      const stack = exceptionDetails?.exception?.stackTrace?.callFrames
        ?.map((frame) => `${frame.functionName || '<anonymous>'}@${frame.url}:${frame.lineNumber}:${frame.columnNumber}`)
        .join('\n');
      this.logs.push({
        level: 'error',
        message: stack ? `${text}\n${stack}` : text,
      });
    }

    if (message.method === 'Network.loadingFailed') {
      const request = this.requests.get(message.params.requestId);
      this.networkIssues.push({
        type: 'loadingFailed',
        url: request?.url,
        resourceType: message.params.type,
        errorText: message.params.errorText,
        blockedReason: message.params.blockedReason,
      });
    }

    if (message.method === 'Network.requestWillBeSent') {
      this.requests.set(message.params.requestId, {
        url: message.params.request?.url,
        type: message.params.type,
        initiator: message.params.initiator,
      });
    }

    if (message.method === 'Network.responseReceived') {
      const { response } = message.params;
      if (response.status >= 400) {
        this.networkIssues.push({
          type: 'http',
          status: response.status,
          url: response.url,
          mimeType: response.mimeType,
        });
      }
    }
  }

  send(method, params = {}, timeoutMs = 10000, useSession = true) {
    const id = this.nextId++;
    const payload = JSON.stringify({
      id,
      method,
      params,
      ...(useSession && this.sessionId ? { sessionId: this.sessionId } : {}),
    });
    const promise = new Promise((resolveCommand, rejectCommand) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        rejectCommand(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolveCommand(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          rejectCommand(error);
        },
      });
    });
    this.socket.send(payload);
    return promise;
  }

  waitForEvent(method, timeoutMs = 15000) {
    return new Promise((resolveEvent, rejectEvent) => {
      const waiter = {
        resolve: (params) => {
          clearTimeout(timeout);
          resolveEvent(params);
        },
      };
      const timeout = setTimeout(() => {
        const waiters = this.eventWaiters.get(method) || [];
        this.eventWaiters.set(method, waiters.filter((item) => item !== waiter));
        rejectEvent(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);

      const waiters = this.eventWaiters.get(method) || [];
      waiters.push(waiter);
      this.eventWaiters.set(method, waiters);
    });
  }

  async evaluate(expression) {
    const evaluateOnce = () => this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout: 10000,
    });

    let result;
    try {
      result = await evaluateOnce();
    } catch (error) {
      if (!shouldRetryEvaluateAfterTimeout(error, { isMobile: IS_MOBILE_SMOKE_SCRIPT })) {
        throw error;
      }
      await delay(250);
      result = await evaluateOnce();
    }

    if (result.exceptionDetails) {
      fail('Route evaluation threw in the browser', result.exceptionDetails);
    }
    return result.result?.value;
  }

  async navigate(url) {
    const loadPromise = this.waitForEvent('Page.loadEventFired', 30000).catch(() => null);
    await this.send('Page.navigate', { url });
    await loadPromise;
  }
}

const waitForRouteState = async (session, route) => {
  const deadline = Date.now() + route.timeoutMs;
  let state;
  let errorLoggerSnapshot;
  let rawErrorCapture;

  while (Date.now() < deadline) {
    state = await session.evaluate(route.expression);
    if (state?.ready) {
      state.readyAt = await session.evaluate('performance.now()');
      return state;
    }
    if (state?.errorBoundary) break;
    await delay(500);
  }

  if (!errorLoggerSnapshot) {
    try {
      errorLoggerSnapshot = await session.evaluate(`
        typeof window.__errorLogger?.getLogs === 'function'
          ? window.__errorLogger.getLogs().slice(-20)
          : null
      `);
    } catch {
      errorLoggerSnapshot = null;
    }
  }
  if (!rawErrorCapture) {
    try {
      rawErrorCapture = await session.evaluate('window.__smokeErrorCapture?.slice(-20) || null');
    } catch {
      rawErrorCapture = null;
    }
  }
  if (session.pendingLogEnrichments.length > 0) {
    try {
      await Promise.allSettled(session.pendingLogEnrichments);
    } catch {
      // ignore best-effort enrichment failures
    }
  }

  fail(`Route smoke failed for ${route.name}`, {
    state,
    logs: session.logs.slice(-20),
    networkIssues: session.networkIssues.slice(-20),
    errorLogger: errorLoggerSnapshot,
    rawErrorCapture,
  });
};

const assertViewportState = async (session, routeName) => {
  if (!VIEWPORT) return null;

  const viewportState = await session.evaluate(`(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  }))()`);
  if (viewportState.width !== VIEWPORT.width || viewportState.height !== VIEWPORT.height) {
    fail(`Viewport smoke mismatch on ${routeName}`, {
      expected: VIEWPORT,
      actual: viewportState,
    });
  }
  return viewportState;
};

const getUnexpectedLogs = (logs) => logs.filter((entry) => {
  if (entry.level === 'error') return true;
  return !allowedWarningPatterns.some((pattern) => pattern.test(entry.message));
});

const getRouteAssetReport = async (session, readyAt) => session.evaluate(`(() => {
  const readyAt = ${Number.isFinite(readyAt) ? readyAt : 0};
  const assets = performance.getEntriesByType('resource')
    .filter((entry) => entry.name.includes('/assets/'))
    .map((entry) => ({
      file: entry.name.split('/').pop(),
      startTime: Math.round(entry.startTime),
      duration: Math.round(entry.duration),
      transferSize: entry.transferSize || 0,
      encodedBodySize: entry.encodedBodySize || 0,
      decodedBodySize: entry.decodedBodySize || 0,
    }))
    .sort((a, b) => b.decodedBodySize - a.decodedBodySize || a.file.localeCompare(b.file));

  const criticalCutoff = readyAt + 50;
  const criticalAssets = assets.filter((asset) => asset.startTime <= criticalCutoff);
  const backgroundAssets = assets.filter((asset) => asset.startTime > criticalCutoff);
  const decodedKB = (items) => Math.round(items.reduce((sum, asset) => sum + asset.decodedBodySize, 0) / 102.4) / 10;
  const storageAssetPattern = /storage|supabase|share|event-streams|UnifiedStorageService|StorageService|SupabaseStorage|DataService/i;
  const layoutAssetPattern = /layout|dagre|elk|LayoutAlgorithms|LayoutRefinement|Domain.*LayoutStrategy|designerUtils/i;

  return {
    readyAt: Math.round(readyAt),
    criticalCutoff: Math.round(criticalCutoff),
    totalAssets: assets.length,
    totalDecodedKB: decodedKB(assets),
    criticalAssets: criticalAssets.length,
    criticalDecodedKB: decodedKB(criticalAssets),
    backgroundAssets: backgroundAssets.length,
    backgroundDecodedKB: decodedKB(backgroundAssets),
    largestAssets: assets.slice(0, 12),
    vendorAssets: assets
      .filter((asset) => asset.file.startsWith('vendor-'))
      .slice(0, 12),
    criticalVendorAssets: criticalAssets
      .filter((asset) => asset.file.startsWith('vendor-'))
      .sort((a, b) => b.decodedBodySize - a.decodedBodySize || a.file.localeCompare(b.file))
      .slice(0, 12),
    backgroundVendorAssets: backgroundAssets
      .filter((asset) => asset.file.startsWith('vendor-'))
      .sort((a, b) => b.decodedBodySize - a.decodedBodySize || a.file.localeCompare(b.file))
      .slice(0, 12),
    storageAssets: assets
      .filter((asset) => storageAssetPattern.test(asset.file))
      .map((asset) => ({
        ...asset,
        phase: asset.startTime <= criticalCutoff ? 'critical' : 'background',
      }))
      .slice(0, 20),
    layoutAssets: assets
      .filter((asset) => layoutAssetPattern.test(asset.file))
      .map((asset) => ({
        ...asset,
        phase: asset.startTime <= criticalCutoff ? 'critical' : 'background',
      }))
      .slice(0, 24),
  };
})()`);

const summarizeInitiator = (initiator) => {
  if (!initiator) return undefined;
  const frames = initiator.stack?.callFrames || initiator.stack?.parent?.callFrames || [];
  const frame = frames.find((item) => item.url) || frames[0];
  return {
    type: initiator.type,
    url: frame?.url ? frame.url.split('/').pop() : undefined,
    functionName: frame?.functionName || undefined,
    lineNumber: typeof frame?.lineNumber === 'number' ? frame.lineNumber + 1 : undefined,
    columnNumber: typeof frame?.columnNumber === 'number' ? frame.columnNumber + 1 : undefined,
  };
};

const attachInitiators = (session, report) => {
  const byFile = new Map();
  for (const request of session.requests.values()) {
    if (!request.url?.includes('/assets/')) continue;
    byFile.set(request.url.split('/').pop(), summarizeInitiator(request.initiator));
  }

  const decorate = (asset) => ({ ...asset, initiator: byFile.get(asset.file) });
  return {
    ...report,
    largestAssets: report.largestAssets.map(decorate),
    vendorAssets: report.vendorAssets.map(decorate),
    criticalVendorAssets: report.criticalVendorAssets.map(decorate),
    backgroundVendorAssets: report.backgroundVendorAssets.map(decorate),
    storageAssets: report.storageAssets.map(decorate),
    layoutAssets: report.layoutAssets.map(decorate),
  };
};

const upperMedian = (values) => {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  return sorted[Math.floor(sorted.length / 2)];
};

const aggregateRouteSamples = (samples) => {
  if (samples.length === 1) {
    return samples[0];
  }

  const reports = samples.map((sample) => sample.assetReport);
  const medianReadyAt = upperMedian(reports.map((report) => report.readyAt));
  const representativeSample = samples.find((sample) => sample.assetReport.readyAt === medianReadyAt) || samples[0];
  const worstReport = reports.reduce((worst, report) => (
    report.readyAt > worst.readyAt ? report : worst
  ), reports[0]);

  return {
    ...representativeSample,
    sampleCount: samples.length,
    samples,
    worstReport,
    assetReport: {
      ...representativeSample.assetReport,
      readyAt: medianReadyAt,
      criticalAssets: upperMedian(reports.map((report) => report.criticalAssets)),
      criticalDecodedKB: upperMedian(reports.map((report) => report.criticalDecodedKB)),
      totalAssets: upperMedian(reports.map((report) => report.totalAssets)),
      totalDecodedKB: upperMedian(reports.map((report) => report.totalDecodedKB)),
    },
  };
};

const printRouteReports = (results) => {
  if (!PRINT_REPORT) return;

  log('\nRoute asset report:');
  for (const result of results) {
    const report = result.assetReport;
    const repeatSummary = result.sampleCount > 1 && result.worstReport
      ? `, samples ${result.sampleCount}, worst ready ${result.worstReport.readyAt} ms`
      : '';
    log(`- ${result.name}: critical ${report.criticalAssets}/${report.totalAssets} assets, ${report.criticalDecodedKB}/${report.totalDecodedKB} KB decoded, ready ${report.readyAt} ms${repeatSummary}`);
    for (const asset of report.criticalVendorAssets.slice(0, 6)) {
      const size = Math.round(asset.decodedBodySize / 102.4) / 10;
      const initiator = asset.initiator
        ? `, initiator ${asset.initiator.type}${asset.initiator.url ? ` ${asset.initiator.url}` : ''}${asset.initiator.lineNumber ? `:${asset.initiator.lineNumber}` : ''}`
        : '';
      log(`  critical ${asset.file} (${size} KB decoded, start ${asset.startTime} ms, ${asset.duration} ms${initiator})`);
    }
    for (const asset of report.backgroundVendorAssets.slice(0, 3)) {
      const size = Math.round(asset.decodedBodySize / 102.4) / 10;
      log(`  background ${asset.file} (${size} KB decoded, start ${asset.startTime} ms, ${asset.duration} ms)`);
    }
    for (const asset of report.storageAssets || []) {
      const size = Math.round(asset.decodedBodySize / 102.4) / 10;
      const initiator = asset.initiator
        ? `, initiator ${asset.initiator.type}${asset.initiator.url ? ` ${asset.initiator.url}` : ''}${asset.initiator.lineNumber ? `:${asset.initiator.lineNumber}` : ''}`
        : '';
      log(`  ${asset.phase} storage ${asset.file} (${size} KB decoded, start ${asset.startTime} ms, ${asset.duration} ms${initiator})`);
    }
    for (const asset of report.layoutAssets || []) {
      const size = Math.round(asset.decodedBodySize / 102.4) / 10;
      const initiator = asset.initiator
        ? `, initiator ${asset.initiator.type}${asset.initiator.url ? ` ${asset.initiator.url}` : ''}${asset.initiator.lineNumber ? `:${asset.initiator.lineNumber}` : ''}`
        : '';
      log(`  ${asset.phase} layout ${asset.file} (${size} KB decoded, start ${asset.startTime} ms, ${asset.duration} ms${initiator})`);
    }
  }
};

const collectBudgetViolations = (results) => {
  if (!CHECK_BUDGET) return [];

  const violations = [];
  for (const result of results) {
    let budget;
    try {
      budget = resolveRouteBudget(result.name, {
        env: process.env,
        isMobile: IS_MOBILE_SMOKE_SCRIPT,
      });
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Failed to resolve route budget');
    }
    const report = result.assetReport;
    const checks = [
      {
        metric: 'criticalAssets',
        actual: report.criticalAssets,
        max: budget.criticalAssets,
        unit: 'assets',
      },
      {
        metric: 'criticalDecodedKB',
        actual: report.criticalDecodedKB,
        max: budget.criticalDecodedKB,
        unit: 'KB decoded',
      },
      {
        metric: 'readyMs',
        actual: report.readyAt,
        max: budget.readyMs,
        unit: 'ms',
      },
    ];

    for (const check of checks) {
      if (typeof check.max === 'number' && check.actual > check.max) {
        violations.push({
          route: result.name,
          metric: check.metric,
          actual: check.actual,
          max: check.max,
          unit: check.unit,
          sampleCount: result.sampleCount || 1,
          worstReadyMs: result.worstReport?.readyAt,
        });
      }
    }
  }

  return violations;
};

const printBudgetSummary = (results) => {
  if (!CHECK_BUDGET) return;

  log('\nRoute asset budget summary:');
  for (const result of results) {
    const budget = resolveRouteBudget(result.name, {
      env: process.env,
      isMobile: IS_MOBILE_SMOKE_SCRIPT,
    });
    const report = result.assetReport;
    const sampleSummary = result.sampleCount > 1 && result.worstReport
      ? `, samples ${result.sampleCount}, worst ready ${result.worstReport.readyAt} ms`
      : '';
    log(`- ${result.name}: critical assets ${report.criticalAssets}/${budget.criticalAssets}, decoded ${report.criticalDecodedKB}/${budget.criticalDecodedKB} KB, ready ${report.readyAt}/${budget.readyMs} ms${sampleSummary}`);
  }
};

const isWorkspaceChildPath = (candidatePath) => {
  const resolved = resolve(candidatePath);
  return resolved.startsWith(`${WORKSPACE_ROOT}\\`) || resolved.startsWith(`${WORKSPACE_ROOT}/`);
};

const hasChildExited = (child) => !child || child.exitCode !== null || child.signalCode !== null;

const waitForChildExit = async (child, timeoutMs = 3000) => {
  if (hasChildExited(child)) return;

  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    delay(timeoutMs),
  ]);
};

const killProcessTree = async (child) => {
  if (hasChildExited(child)) return;

  if (process.platform !== 'win32' || !child.pid) {
    child.kill('SIGKILL');
    await waitForChildExit(child, 3000);
    return;
  }

  await new Promise((resolveKill) => {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    killer.once('exit', resolveKill);
    killer.once('error', resolveKill);
  });
  await waitForChildExit(child, 3000);
};

const closeBrowserGracefully = async (browserProcess) => {
  const browserWebSocketDebuggerUrl = browserProcess?.browserWebSocketDebuggerUrl;
  if (!browserWebSocketDebuggerUrl) return false;

  return new Promise((resolveClose) => {
    const ws = new WebSocket(browserWebSocketDebuggerUrl);
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.close();
      resolveClose(false);
    }, 2000);

    const settle = (closed) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveClose(closed);
    };

    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    });
    ws.on('message', () => settle(true));
    ws.on('close', () => settle(true));
    ws.on('error', () => settle(false));
  });
};

const removeDirectoryWithRetries = async (target, attempts = 10) => {
  if (!isWorkspaceChildPath(target)) return false;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await rm(target, { recursive: true, force: true }).catch(() => {});
    if (!existsSync(target)) return true;
    await delay(250 * (attempt + 1));
  }

  return !existsSync(target);
};

const cleanupStaleBrowserProfiles = async () => {
  const entries = await readdir(WORKSPACE_ROOT, { withFileTypes: true }).catch(() => []);
  const now = Date.now();
  let removed = 0;

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(SMOKE_PROFILE_PREFIX)) continue;
    if (entry.name === `${SMOKE_PROFILE_PREFIX}${process.pid}`) continue;

    const target = resolve(WORKSPACE_ROOT, entry.name);
    if (!isWorkspaceChildPath(target)) continue;

    const stats = await stat(target).catch(() => null);
    if (!stats || now - stats.mtimeMs < STALE_PROFILE_MAX_AGE_MS) continue;

    if (await removeDirectoryWithRetries(target)) {
      removed += 1;
    }
  }

  if (removed > 0) {
    log(`Cleaned ${removed} stale smoke browser profile director${removed === 1 ? 'y' : 'ies'}.`);
  }
};

const cleanup = async (...processes) => {
  await closeBrowserGracefully(browserProcess);
  await waitForChildExit(browserProcess, 5000);

  for (const child of processes) {
    if (!hasChildExited(child) && !child.killed) child.kill();
  }

  await Promise.all(processes.map((child) => waitForChildExit(child)));

  if (!hasChildExited(browserProcess)) {
    await killProcessTree(browserProcess);
  }

  if (!(await removeDirectoryWithRetries(browserProfileDir))) {
    log(`Warning: smoke browser profile directory was not removed: ${browserProfileDir}`);
  }
};

const runRouteSample = async (route, sampleIndex = 0) => {
  const sampleSuffix = SMOKE_REPEAT > 1 ? ` [sample ${sampleIndex + 1}/${SMOKE_REPEAT}]` : '';
  log(`Checking route ${route.name}${sampleSuffix}: ${route.url}`);
  const target = await createTarget();
  log(`Created CDP target for ${route.name}${sampleSuffix}`);
  const session = new CdpSession(browserProcess.browserWebSocketDebuggerUrl, target.id);
  try {
    log(`Opening CDP session for ${route.name}${sampleSuffix}`);
    await session.open();
    log(`Navigating route: ${route.name}${sampleSuffix}`);
    await session.navigate(route.url);
    log(`Waiting for route readiness: ${route.name}${sampleSuffix}`);
    const state = await waitForRouteState(session, route);
    const viewportState = await assertViewportState(session, route.name);
    const assetReport = attachInitiators(session, await getRouteAssetReport(session, state.readyAt));
    const routeLogs = session.logs;
    const routeNetworkIssues = session.networkIssues;
    const unexpectedLogs = getUnexpectedLogs(routeLogs);
    if (unexpectedLogs.length > 0) {
      fail(`Unexpected browser console output on ${route.name}`, unexpectedLogs);
    }
    if (routeNetworkIssues.length > 0) {
      fail(`Unexpected network issue on ${route.name}`, routeNetworkIssues);
    }
    log(`✓ ${route.name}${sampleSuffix}: ${state.href}`);
    return { name: route.name, state, viewportState, warnings: routeLogs.length, assetReport };
  } finally {
    session.close();
  }
};

let devServer;
let browserProcess;

try {
  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    fail('No Chrome or Edge executable found. Set CHROME_PATH, EDGE_PATH, or BROWSER_PATH to run route smoke checks.');
  }

  log(`Starting route smoke against ${BASE_URL} (${USE_EXISTING_SERVER ? 'existing server' : `vite ${SERVER_MODE}`}, repeat ${SMOKE_REPEAT})`);
  await cleanupStaleBrowserProfiles();
  devServer = await startAppServer();
  if (!HAS_EXPLICIT_DEBUG_PORT) {
    DEBUG_PORT = await findAvailablePort(REQUESTED_DEBUG_PORT);
    if (DEBUG_PORT !== REQUESTED_DEBUG_PORT) {
      log(`Default debug port ${REQUESTED_DEBUG_PORT} was busy; using ${DEBUG_PORT}.`);
    }
  }
  browserProcess = await launchBrowser(browserPath);

  const results = [];
  for (const route of selectedRoutes) {
    const samples = [];
    for (let sampleIndex = 0; sampleIndex < SMOKE_REPEAT; sampleIndex += 1) {
      samples.push(await runRouteSample(route, sampleIndex));
    }
    results.push(aggregateRouteSamples(samples));
  }

  printRouteReports(results);
  printBudgetSummary(results);
  const budgetViolations = collectBudgetViolations(results);
  if (budgetViolations.length > 0) {
    fail('Route asset budget exceeded', budgetViolations);
  }
  log(`Route smoke passed (${results.length} route${results.length === 1 ? '' : 's'}).`);
} catch (error) {
  console.error(`Route smoke failed: ${error.message}`);
  if (error.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }
  process.exitCode = 1;
} finally {
  await cleanup(browserProcess, devServer);
}
