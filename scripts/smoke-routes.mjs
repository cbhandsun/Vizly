import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, rm, stat } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { createSmokeRouteCatalog } from './lib/smoke-route-catalog.mjs';
import { CdpSession } from './lib/smoke-route-cdp-session.mjs';
import { waitForRouteReadiness } from './lib/smoke-route-readiness.mjs';
import {
  aggregateRouteSamples,
  attachInitiators,
  collectBudgetViolations,
  getRouteAssetReport,
  getUnexpectedLogs,
  printBudgetSummary,
  printRouteReports,
} from './lib/smoke-route-reporting.mjs';

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
const INCLUDE_DEV_ROUTES = SERVER_MODE === 'dev' || process.env.SMOKE_INCLUDE_DEV_ROUTES === '1';
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

const routes = createSmokeRouteCatalog(BASE_URL, { includeDevRoutes: INCLUDE_DEV_ROUTES });

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

const collectRouteStabilityReport = async (session, budget) => {
  if (!budget || IS_MOBILE_SMOKE_SCRIPT) return null;
  await session.send('HeapProfiler.enable').catch(() => {});
  await session.send('HeapProfiler.collectGarbage').catch(() => {});
  await session.evaluate(`(() => {
    window.__smokeStability = {
      startedAt: performance.now(),
      heapStart: Number(performance.memory?.usedJSHeapSize) || 0,
      longTasks: [],
    };
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__smokeStability.longTasks.push({
            startTime: entry.startTime,
            duration: entry.duration,
          });
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
      window.__smokeStability.observer = observer;
    }
  })()`);
  await delay(budget.durationMs);
  await session.send('HeapProfiler.collectGarbage').catch(() => {});
  return session.evaluate(`(() => {
    const state = window.__smokeStability || { longTasks: [] };
    state.observer?.disconnect();
    const durations = state.longTasks.map((entry) => entry.duration).filter(Number.isFinite);
    const heapEnd = Number(performance.memory?.usedJSHeapSize) || 0;
    const parallel = window.__vizly_coordinator__?.getOptimizationStats?.()?.parallel || null;
    const report = {
      durationMs: Math.round(performance.now() - (state.startedAt || performance.now())),
      longTaskCount: durations.length,
      maxLongTaskMs: durations.length ? Math.round(Math.max(...durations)) : 0,
      heapGrowthKB: state.heapStart && heapEnd
        ? Math.round((heapEnd - state.heapStart) / 1024)
        : 0,
      activeWorkers: Number(parallel?.activeWorkers) || 0,
      queuedTasks: Number(parallel?.queuedTasks) || 0,
    };
    delete window.__smokeStability;
    return report;
  })()`);
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
  const session = new CdpSession(browserProcess.browserWebSocketDebuggerUrl, target.id, {
    viewport: VIEWPORT,
    isMobile: IS_MOBILE_SMOKE_SCRIPT,
  });
  try {
    log(`Opening CDP session for ${route.name}${sampleSuffix}`);
    await session.open();
    log(`Navigating route: ${route.name}${sampleSuffix}`);
    await session.navigate(route.url);
    log(`Waiting for route readiness: ${route.name}${sampleSuffix}`);
    const state = await waitForRouteReadiness(session, route);
    const viewportState = await assertViewportState(session, route.name);
    const stabilityReport = await collectRouteStabilityReport(session, route.stabilityBudget);
    const assetReport = attachInitiators(session, await getRouteAssetReport(session, state.readyAt));
    const routeLogs = session.logs;
    const routeNetworkIssues = session.networkIssues;
    const unexpectedLogs = getUnexpectedLogs(routeLogs, allowedWarningPatterns);
    if (unexpectedLogs.length > 0) {
      fail(`Unexpected browser console output on ${route.name}`, unexpectedLogs);
    }
    if (routeNetworkIssues.length > 0) {
      fail(`Unexpected network issue on ${route.name}`, routeNetworkIssues);
    }
    log(`✓ ${route.name}${sampleSuffix}: ${state.href}`);
    return {
      name: route.name,
      state,
      viewportState,
      warnings: routeLogs.length,
      assetReport,
      stabilityReport,
      stabilityBudget: route.stabilityBudget,
    };
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

  printRouteReports(results, { enabled: PRINT_REPORT, log });
  printBudgetSummary(results, {
    enabled: CHECK_BUDGET,
    isMobile: IS_MOBILE_SMOKE_SCRIPT,
    log,
  });
  const budgetViolations = collectBudgetViolations(results, {
    enabled: CHECK_BUDGET,
    isMobile: IS_MOBILE_SMOKE_SCRIPT,
  });
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
