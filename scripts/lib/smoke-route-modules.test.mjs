import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  createSmokeRouteCatalog,
  isManagementTemplatesReady,
} from './smoke-route-catalog.mjs';
import { CdpSession, createCdpSessionEnableCommands } from './smoke-route-cdp-session.mjs';
import { waitForRouteReadiness } from './smoke-route-readiness.mjs';
import {
  aggregateRouteSamples,
  collectBudgetViolations,
  dedupeRouteAssets,
  getUnexpectedLogs,
  partitionRouteAssetsByReadyTime,
  printBudgetSummary,
} from './smoke-route-reporting.mjs';
import { isEnterpriseDisplayRoutingSettled } from '../smokeRouteBudgetUtils.mjs';
import { installSmokeLongTaskProbe, projectSmokeLongTaskEvidence } from './smoke-route-long-tasks.mjs';
import { startupFaultCases, readStartupFaultRecovery, assertStartupFaultRecovery, parseStartupFaultBaseUrl } from './startup-fault-cases.mjs';

describe('smoke route modules', () => {
  it('prints safe evidence for every sample instead of only the ready-time median', () => {
    const evidence = { supported: true, durationMs: 15000, longTaskCount: 1,
      maxLongTaskMs: 162, droppedCount: 0, invalidCount: 0,
      entries: [{ offsetMs: 200, durationMs: 162, name: 'private' }] };
    const samples = [100, 200, 300].map(readyAt => ({ name: 'management',
      assetReport: { readyAt, criticalAssets: 1, criticalDecodedKB: 1, totalAssets: 1, totalDecodedKB: 1 },
      stabilityReport: { longTaskEvidence: evidence },
    }));
    const log = vi.fn();
    printBudgetSummary([aggregateRouteSamples(samples)], { enabled: true, log });
    const output = log.mock.calls.flat().join('\n');
    for (const index of [1, 2, 3]) expect(output).toContain(`stability sample ${index}:`);
    expect(output).toContain('"offsetMs":200');
    expect(output).not.toContain('private');
  });
  it('drains pending long tasks, preserves relative timing and stops before later harness work', () => {
    let deliver;
    let now = 100;
    const disconnect = vi.fn();
    class Observer {
      constructor(callback) { deliver = callback; }
      observe() {}
      takeRecords() { return [{ startTime: 120, duration: 162, name: 'private' }]; }
      disconnect = disconnect;
    }
    const probe = runInNewContext(`(${installSmokeLongTaskProbe.toString()})()`, {
      PerformanceObserver: Observer, performance: { now: () => now },
    });
    deliver({ getEntries: () => [{ startTime: 90, duration: 50, attribution: 'private' }] });
    now = 15100;
    const result = projectSmokeLongTaskEvidence(probe.stop());
    expect(result).toEqual({ supported: true, durationMs: 15000, longTaskCount: 2, maxLongTaskMs: 162,
      droppedCount: 0, invalidCount: 0, entries: [{ offsetMs: -10, durationMs: 50 }, { offsetMs: 20, durationMs: 162 }] });
    deliver({ getEntries: () => [{ startTime: 15200, duration: 500 }] });
    expect(projectSmokeLongTaskEvidence(probe.stop())).toEqual(result);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toMatch(/private|attribution|startTime/);
  });
  it('bounds stored detail without dropping counts or maximums and flags invalid observation', () => {
    let deliver;
    class Observer {
      constructor(callback) { deliver = callback; }
      observe() {}
      takeRecords() { return []; }
      disconnect() {}
    }
    const probe = runInNewContext(`(${installSmokeLongTaskProbe.toString()})()`, {
      PerformanceObserver: Observer, performance: { now: () => 0 },
    });
    deliver({ getEntries: () => [...Array.from({ length: 300 }, (_, index) => ({ startTime: index, duration: index + 50 })),
      { startTime: NaN, duration: 50 }, { startTime: 0, duration: Infinity }] });
    const result = projectSmokeLongTaskEvidence(probe.stop());
    expect(result).toMatchObject({ longTaskCount: 300, maxLongTaskMs: 349, droppedCount: 44, invalidCount: 2 });
    expect(result.entries).toHaveLength(256);
    expect(projectSmokeLongTaskEvidence(runInNewContext(`(${installSmokeLongTaskProbe.toString()})()`, {
      performance: { now: () => 0 },
    }).stop())).toMatchObject({ supported: false });
    for (const value of [null, {}, { ...result, entries: Array(257).fill({}) },
      { ...result, durationMs: Infinity }, { ...result, longTaskCount: 0 },
      { ...result, entries: [{ offsetMs: 'private', durationMs: 50 }] }]) {
      expect(() => projectSmokeLongTaskEvidence(value)).toThrow('Invalid smoke long task evidence');
    }
  });
  it('marks unsupported, failed registration and failed record reads unavailable', () => {
    for (const mode of ['unsupported', 'observe', 'read']) {
      class Observer {
        static supportedEntryTypes = mode === 'unsupported' ? [] : ['longtask'];
        observe() { if (mode === 'observe') throw new Error('private'); }
        takeRecords() { throw new Error('private'); }
        disconnect() {}
      }
      const probe = runInNewContext(`(${installSmokeLongTaskProbe.toString()})()`, {
        PerformanceObserver: Observer, performance: { now: () => 0 },
      });
      const result = projectSmokeLongTaskEvidence(probe.stop());
      expect(result.supported).toBe(false);
      expect(JSON.stringify(result)).not.toContain('private');
    }
  });
  it('accepts only bounded local preview origins and never echoes invalid URL input', () => {
    expect(parseStartupFaultBaseUrl('http://127.0.0.1:4176/')).toBe('http://127.0.0.1:4176');
    expect(parseStartupFaultBaseUrl('https://localhost')).toBe('https://localhost');
    expect(parseStartupFaultBaseUrl('http://[::1]:4176')).toBe('http://[::1]:4176');
    for (const value of [null, undefined, '', [], 1, 'x'.repeat(2049), 'http://localhost:0',
      'http://user:private@localhost', 'http://localhost?token=private', 'http://localhost/#private',
      'http://localhost/path', 'https://example.com', 'file:///private', 'private-not-url']) {
      expect(() => parseStartupFaultBaseUrl(value)).toThrow('Startup fault verification requires a local preview origin');
    }
  });
  it('gates startup failure recovery in the existing required preview lifecycle', () => {
    const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    expect(ci).toMatch(/node scripts\/verify-startup-failures.mjs\s+if \(\$LASTEXITCODE -ne 0\)/);
    const position = ci.indexOf('node scripts/verify-startup-failures.mjs');
    expect(position).toBeGreaterThan(ci.indexOf("if (-not $ready)"));
    expect(position).toBeLessThan(ci.indexOf('Stop-Process -Id $savedPreview.Id'));
  });

  it.each(['worker-creation', 'worker-post'])('injects %s only into display Workers', id => {
    class WorkerStub { postMessage() { return 'sent'; } }
    const context = { window: { Worker: WorkerStub } };
    const fault = startupFaultCases.find(candidate => candidate.id === id);
    runInNewContext(fault.source, context);
    expect(new context.window.Worker('elk-engine-worker.js').postMessage()).toBe('sent');
    if (id === 'worker-creation') {
      expect(() => new context.window.Worker('baseReactFlowDisplayEdges.worker.js')).toThrow('private-fault-marker');
    } else {
      expect(() => new context.window.Worker('baseReactFlowDisplayEdges.worker.js').postMessage()).toThrow('private-fault-marker');
    }
  });

  it.each([['worker-runtime', 'error'], ['worker-decode', 'messageerror'],
    ['worker-invalid-response', 'message']])('injects %s after the request is posted', (id, type) => {
    const events = []; const queued = [];
    class WorkerStub {
      postMessage() { throw new Error('The request must be intercepted'); }
      dispatchEvent(event) { events.push(event); }
    }
    class EventStub { constructor(eventType, options) { this.type = eventType; Object.assign(this, options); } }
    const context = { window: { Worker: WorkerStub }, queueMicrotask: callback => queued.push(callback),
      ErrorEvent: EventStub, MessageEvent: EventStub };
    runInNewContext(startupFaultCases.find(candidate => candidate.id === id).source, context);
    new context.window.Worker('baseReactFlowDisplayEdges.worker.js').postMessage({ requestId: 'request' });
    expect(events).toHaveLength(0);
    expect(queued).toHaveLength(1);
    queued[0]();
    expect(events[0].type).toBe(type);
    if (type === 'message') expect(events[0].data).toEqual({ requestId: 'request', edges: 'invalid' });
  });

  it('projects browser recovery and rejects malformed, excessive or private summary fields', () => {
    const valid = { schema: 'vizly-startup-failure-v1', stage: 'mount', code: 'application-mount-failed', elapsedMs: 1,
      milestones: ['runtime-started', 'runtime-ready', 'readiness-ready', 'mount-requested', 'failed']
        .map((stage, index) => ({ stage, elapsedMs: index === 4 ? 1 : 0 })) };
    for (const summary of [valid, { ...valid, secret: 'private-fault-marker' }, null, [],
      { ...valid, elapsedMs: -1 }, { ...valid, elapsedMs: 600001 }, { ...valid, code: 'private-fault-marker' },
      { ...valid, milestones: undefined }, { ...valid, milestones: [] },
      { ...valid, milestones: [{ stage: 'runtime-started', elapsedMs: 0, token: 'private-fault-marker' }] },
      { ...valid, milestones: [...valid.milestones, ...valid.milestones] }]) {
      const textarea = { value: JSON.stringify(summary), readOnly: true,
        getBoundingClientRect: () => ({ x: 0, y: 0, width: 200 }) };
      const panel = { textContent: '', querySelector: selector => selector === 'textarea' ? textarea : null };
      const result = runInNewContext(`(${readStartupFaultRecovery.toString()})('startup')`, {
        document: { querySelector: () => panel, elementFromPoint: () => textarea },
      });
      expect(result.valid).toBe(summary === valid);
      expect(JSON.stringify(result)).not.toContain('private-fault-marker');
    }
  });

  it('rejects every missing recovery invariant without echoing the observation', () => {
    // The shape assertion below remains independent of the browser projection.
    const fault = startupFaultCases[0];
    const valid = { valid: true, code: fault.code, stage: fault.stage, unobscured: true,
      readOnly: true, nodesPreserved: true, privateContentAbsent: true };
    expect(() => assertStartupFaultRecovery(valid, fault)).not.toThrow();
    for (const key of Object.keys(valid)) {
      expect(() => assertStartupFaultRecovery({ ...valid, [key]: 'private-fault-marker' }, fault))
        .toThrow('Startup fault recovery contract failed');
    }
    expect(() => assertStartupFaultRecovery(null, fault)).toThrow('Startup fault recovery contract failed');
  });
  it('requires bounded content-free request observations for Worker recovery', () => {
    const valid = { schema: 'vizly-routing-failure-v1', reason: 'worker-failed', stage: 'worker-creation',
      code: 'display-edge-worker-unavailable',
      checkpoint: { schema: 'vizly-routing-observation-checkpoint-v1',
        owner: 'display', lastStage: 'failed', previousStage: 'worker-requested',
        lastRequestOrdinal: null, elapsedMs: 2, eventCount: 3, truncated: false },
      observation: { schema: 'vizly-routing-observation-v1',
        owner: 'display', truncated: false, entries: [
          { stage: 'job-started', requestOrdinal: null, elapsedMs: 0 },
          { stage: 'worker-requested', requestOrdinal: 1, elapsedMs: 1 },
          { stage: 'failed', requestOrdinal: null, elapsedMs: 2 },
        ] } };
    for (const summary of [valid, { ...valid, observation: undefined },
      { ...valid, observation: { ...valid.observation, token: 'private-fault-marker' } },
      { ...valid, observation: { ...valid.observation, truncated: true } },
      { ...valid, observation: { ...valid.observation, entries: Array(33).fill(valid.observation.entries[0]) } },
      { ...valid, observation: { ...valid.observation, entries: [{ stage: 'private-fault-marker' }] } },
      { ...valid, checkpoint: undefined },
      { ...valid, checkpoint: { ...valid.checkpoint, previousStage: 'private-fault-marker' } }]) {
      const textarea = { value: JSON.stringify(summary), readOnly: true,
        getBoundingClientRect: () => ({ x: 0, y: 0, width: 200 }) };
      const panel = { textContent: '', querySelector: selector => selector === 'textarea' ? textarea : null };
      const result = runInNewContext(`(${readStartupFaultRecovery.toString()})('worker')`, {
        document: { querySelector: () => panel, querySelectorAll: () => [{}], elementFromPoint: () => textarea },
      });
      expect(result.valid).toBe(summary === valid);
      expect(JSON.stringify(result)).not.toContain('private-fault-marker');
    }
  });
  it('closes the page target before disconnecting after each sample', async () => {
    const session = new CdpSession('ws://browser', 'sample-target');
    const calls = [];
    session.socket = { readyState: 1, close: () => calls.push('disconnect') };
    session.send = vi.fn(async () => { calls.push('close-target'); return { success: true }; });
    await session.disposeTarget();
    expect(session.send).toHaveBeenCalledWith('Target.closeTarget', { targetId: 'sample-target' }, 10000, false);
    expect(calls).toEqual(['close-target', 'disconnect']);
    const source = readFileSync(new URL('../smoke-routes.mjs', import.meta.url), 'utf8');
    expect(source).toContain('await session.disposeTarget()');
  });

  it('retries only local script buffer exhaustion during route smoke sampling', () => {
    const source = readFileSync(new URL('../smoke-routes.mjs', import.meta.url), 'utf8');
    expect(source).toContain('isRouteResourceBufferIssue');
    expect(source).toContain("issue?.type === 'loadingFailed'");
    expect(source).toContain("issue?.resourceType === 'Script'");
    expect(source).toContain("issue?.errorText === 'net::ERR_NO_BUFFER_SPACE'");
    expect(source).toContain("parsedUrl.pathname.startsWith('/assets/')");
    expect(source).toContain('runRouteSampleWithInfrastructureRetry');
    expect(source).toContain('Route resource buffer was exhausted');
  });

  it.each([{}, { success: false }, null])('rejects unconfirmed target cleanup: %j', async result => {
    const session = new CdpSession('ws://browser', 'sample-target');
    session.socket = { readyState: 1, close: vi.fn() };
    session.send = vi.fn(async () => result);
    await expect(session.disposeTarget()).rejects.toThrow('Smoke browser target was not closed');
    expect(session.socket.close).toHaveBeenCalledOnce();
  });

  it('disconnects on cleanup failure without swallowing the error', async () => {
    const session = new CdpSession('ws://browser', 'sample-target');
    session.socket = { readyState: 1, close: vi.fn() };
    session.send = vi.fn(async () => { throw new Error('cleanup timeout'); });
    await expect(session.disposeTarget()).rejects.toThrow('cleanup timeout');
    expect(session.socket.close).toHaveBeenCalledOnce();
  });

  it('can dispose before the socket opens', async () => {
    const session = new CdpSession('ws://browser', 'sample-target');
    session.send = vi.fn();
    await session.disposeTarget();
    expect(session.send).not.toHaveBeenCalled();
  });
  it.each(['worker-timeout', 'worker-rejected'])(
    'recognizes the exact bounded enterprise timeout in %s state', (stage) => {
      expect(isEnterpriseDisplayRoutingSettled({
        stage,
        error: 'display-edge-worker-timeout',
        workerStartCount: 1,
        workerAbortCount: 0,
      })).toBe(true);
    },
  );

  it('waits for the enterprise route to settle before measuring stability', () => {
    expect(isEnterpriseDisplayRoutingSettled({
      stage: 'worker-rejected',
      error: 'display-edge-worker-invalid-response',
      workerStartCount: 1,
      workerAbortCount: 0,
    })).toBe(false);
    expect(isEnterpriseDisplayRoutingSettled({
      stage: 'worker-phase',
      workerStartCount: 1,
      workerAbortCount: 0,
    })).toBe(false);
  });

  it.each([
    null,
    undefined,
    [],
    'worker-timeout',
    { stage: 'worker-timeout' },
    { stage: 'worker-phase', error: 'display-edge-worker-timeout', workerStartCount: 1, workerAbortCount: 0 },
    { stage: 'worker-timeout', error: 'display-edge-worker-invalid-response', workerStartCount: 1, workerAbortCount: 0 },
    { stage: 'worker-timeout', error: 'display-edge-worker-timeout', workerStartCount: 2, workerAbortCount: 0 },
    { stage: 'worker-timeout', error: 'display-edge-worker-timeout', workerStartCount: 1, workerAbortCount: 1 },
  ])('rejects incomplete or unexpected enterprise terminal states: %j', (state) => {
    expect(isEnterpriseDisplayRoutingSettled(state)).toBe(false);
  });

  it('disconnects long-task observation before forcing heap-accounting GC', () => {
    const smokeSource = readFileSync(new URL('../smoke-routes.mjs', import.meta.url), 'utf8');
    const endObservation = smokeSource.indexOf('state.longTaskEvidence = state.longTaskProbe.stop();');
    const finalGarbageCollection = smokeSource.lastIndexOf(
      "session.send('HeapProfiler.collectGarbage')",
    );

    expect(endObservation).toBeGreaterThan(0);
    expect(finalGarbageCollection).toBeGreaterThan(endObservation);
  });

  it('waits for a route stability boundary before starting observation', () => {
    const smokeSource = readFileSync(new URL('../smoke-routes.mjs', import.meta.url), 'utf8');
    const stabilityWait = smokeSource.indexOf('if (route.stabilityExpression)');
    const startObservation = smokeSource.indexOf(
      'const stabilityReport = await collectRouteStabilityReport',
    );

    expect(stabilityWait).toBeGreaterThan(0);
    expect(startObservation).toBeGreaterThan(stabilityWait);
  });

  it('keeps self-contained docs and 3D routes outside the Ant Design shell', () => {
    const routeSource = readFileSync(new URL('../../src/app/routes.tsx', import.meta.url), 'utf8');
    const routeErrorSource = readFileSync(new URL('../../src/app/AppRouteError.tsx', import.meta.url), 'utf8');
    const routeNotFoundSource = readFileSync(new URL('../../src/app/AppRouteNotFound.tsx', import.meta.url), 'utf8');

    expect(routeSource).toContain("const DocsPreview = withoutAntdRoute(() => import('@/pages/DocsPreview'))");
    expect(routeSource).toContain("const Warehouse3DPage = withoutAntdRoute(() => import('@/pages/Warehouse3DPage'))");
    expect(routeSource).not.toContain("import Warehouse3DShell from '@/components/warehouse-3d/Warehouse3DShell'");
    expect(routeSource).toContain("const DiagramManagementPage = withAntdRoute(() => import('@/pages/DiagramManagementPage'))");
    expect(routeErrorSource).not.toContain("from '@ant-design/icons'");
    expect(routeNotFoundSource).not.toContain("from '@ant-design/icons'");
  });

  it('keeps advanced edge routing off the empty-canvas startup path', () => {
    const canvasShellSource = readFileSync(new URL(
      '../../src/core/components/diagrams/FlowchartCanvasShell.tsx',
      import.meta.url,
    ), 'utf8');

    expect(canvasShellSource).toContain("import('./AdvancedFlowchartCanvasShell')");
    expect(canvasShellSource).toContain('props.nodes.length === 0 && props.displayEdges.length === 0');
    expect(canvasShellSource).not.toContain("from '../shared/BaseReactFlow'");
  });

  it('builds a unique route catalog against the supplied base URL', () => {
    const routes = createSmokeRouteCatalog('http://127.0.0.1:5373');
    const names = routes.map((route) => route.name);

    expect(routes.length).toBeGreaterThan(5);
    expect(new Set(names).size).toBe(routes.length);
    expect(routes.every((route) => route.url.startsWith('http://127.0.0.1:5373'))).toBe(true);
    expect(routes.every((route) => route.timeoutMs > 0 && route.expression.length > 0)).toBe(true);
    const enterpriseRoute = routes.find(
      (route) => route.name === 'enterprise-architecture-large-diagram',
    );
    expect(enterpriseRoute?.stabilityBudget)
      .toMatchObject({ durationMs: 15000, maxActiveWorkers: 0 });
    expect(enterpriseRoute?.stabilityTimeoutMs).toBeGreaterThan(10000);
    expect(enterpriseRoute?.stabilityExpression)
      .toContain('displayRoutingReady');
    expect(enterpriseRoute?.expression).not.toContain('displayRoutingReady');
  });

  it('keeps development-only visual routes out of production preview smoke', () => {
    const productionNames = createSmokeRouteCatalog('http://127.0.0.1:5373')
      .map((route) => route.name);
    const developmentNames = createSmokeRouteCatalog('http://127.0.0.1:5373', {
      includeDevRoutes: true,
    }).map((route) => route.name);

    for (const routeName of ['theme-colors', 'theme-side-by-side', 'unified-designer']) {
      expect(productionNames).not.toContain(routeName);
      expect(developmentNames).toContain(routeName);
    }
  });

  it('measures the warehouse shell without blocking on the progressively loaded canvas', () => {
    const warehouseRoute = createSmokeRouteCatalog('http://127.0.0.1:5373')
      .find((route) => route.name === 'warehouse-3d');

    expect(warehouseRoute?.expression).toContain('data-smoke-ready="warehouse-3d"');
    expect(warehouseRoute?.expression).toContain("querySelector('[role=\"status\"]')");
    expect(warehouseRoute?.expression).not.toContain('Large Retail Logistics Center');
    expect(warehouseRoute?.expression).not.toContain('Interactive 3D Simulation View');
    expect(warehouseRoute?.expression).not.toContain("querySelector('canvas')");
  });

  it('detects storage configuration readiness without coupling to localized copy', () => {
    const storageRoute = createSmokeRouteCatalog('http://127.0.0.1:5373')
      .find((route) => route.name === 'storage-config');

    expect(storageRoute?.expression).toContain('data-smoke-ready="storage-config"');
    expect(storageRoute?.expression).not.toContain('Settings & Storage');
    expect(storageRoute?.expression).not.toContain('Connection Settings');
  });

  it('keeps CDP runtime options explicit at the browser boundary', () => {
    const viewport = { width: 390, height: 844, scale: 2 };
    const session = new CdpSession('ws://browser', 'target-1', {
      viewport,
      isMobile: true,
    });

    expect(session.browserUrl).toBe('ws://browser');
    expect(session.targetId).toBe('target-1');
    expect(session.viewport).toEqual(viewport);
    expect(session.isMobile).toBe(true);
    expect(session.logs).toEqual([]);
    expect(session.networkIssues).toEqual([]);
  });

  it('uses cold browser samples for route asset budgets and repeats them in CI', () => {
    expect(createCdpSessionEnableCommands()).toContainEqual({
      method: 'Network.setCacheDisabled',
      params: { cacheDisabled: true },
    });

    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
    const smokeStep = workflow
      .split('- name: Run route smoke checks')[1]
      ?.split('- name: Run mobile route smoke checks')[0];
    const mobileSmokeStep = workflow
      .split('- name: Run mobile route smoke checks')[1]
      ?.split('- name: Verify ordinary saved diagram recovery')[0];
    expect(smokeStep).toContain('SMOKE_REPEAT: 3');
    expect(smokeStep).not.toContain('continue-on-error');
    expect(mobileSmokeStep).toContain('SMOKE_REPEAT: 3');
    expect(mobileSmokeStep).not.toContain('continue-on-error');
  });

  it('timestamps readiness in the same browser evaluation, before unrelated long tasks', async () => {
    let browserTime = 875;
    let evaluations = 0;
    const session = {
      logs: [], networkIssues: [], pendingLogEnrichments: [],
      evaluate: async (expression) => {
        evaluations += 1;
        const result = runInNewContext(expression, {
          readinessProbe: () => ({ ready: true }),
          performance: { now: () => browserTime },
        });
        // A render task can occupy the main thread before the next CDP call.
        browserTime += 9_000;
        return result;
      },
    };
    const state = await waitForRouteReadiness(session, {
      name: 'progressive-route', expression: 'readinessProbe()', timeoutMs: 20_000,
    });
    expect(state).toEqual({ ready: true, readyAt: 875 });
    expect(evaluations).toBe(1);
  });

  it.each([undefined, null, '0', -1, NaN, Infinity, 'secret-test-marker'])(
    'rejects invalid readiness timestamps without exposing their value: %s', async (timestamp) => {
      const session = {
        evaluate: async (expression) => runInNewContext(expression, {
          readinessProbe: () => ({ ready: true }),
          performance: { now: () => timestamp },
        }),
      };
      await expect(waitForRouteReadiness(session, {
        name: 'invalid-clock', expression: 'readinessProbe()', timeoutMs: 1_000,
      })).rejects.toThrow(/^Invalid route readiness timestamp$/);
    },
  );

  it('does not mark empty or loading probes ready and timestamps only the successful probe', async () => {
    let currentTime = 0;
    let clockReads = 0;
    const states = [null, undefined, { ready: false }, { ready: true, readyAt: -1 }];
    const session = {
      evaluate: async (expression) => runInNewContext(expression, {
        readinessProbe: () => states.shift(),
        performance: { now: () => { clockReads += 1; return 0; } },
      }),
    };
    expect(await waitForRouteReadiness(session, {
      name: 'loading-route', expression: 'readinessProbe()', timeoutMs: 2_000,
    }, {
      now: () => currentTime,
      wait: async (durationMs) => { currentTime += durationMs; },
    })).toEqual({ ready: true, readyAt: 0 });
    expect(currentTime).toBe(1_500);
    expect(clockReads).toBe(1);
  });

  it('keeps polling within the route deadline after a Runtime.evaluate timeout', async () => {
    let currentTime = 0;
    const expressions = [];
    const session = {
      logs: [],
      networkIssues: [],
      pendingLogEnrichments: [],
      evaluate: async (expression) => {
        expressions.push(expression);
        if (expressions.length === 1) {
          throw new Error('CDP command timed out: Runtime.evaluate');
        }
        return runInNewContext(expression, {
          readinessProbe: () => ({ ready: true, href: 'http://example.test/ready' }),
          performance: { now: () => 875 },
        });
      },
    };

    const state = await waitForRouteReadiness(session, {
      name: 'large-diagram',
      expression: 'readinessProbe()',
      timeoutMs: 2_000,
    }, {
      now: () => currentTime,
      wait: async (durationMs) => { currentTime += durationMs; },
    });

    expect(state).toEqual({
      ready: true,
      href: 'http://example.test/ready',
      readyAt: 875,
    });
    expect(expressions).toHaveLength(2);
    expect(expressions[0]).toBe(expressions[1]);
  });

  it('does not swallow unrelated CDP or evaluation errors', async () => {
    const session = {
      logs: [],
      networkIssues: [],
      pendingLogEnrichments: [],
      evaluate: async () => {
        throw new Error('CDP command timed out: Page.navigate');
      },
    };

    await expect(waitForRouteReadiness(session, {
      name: 'broken-route',
      expression: 'readinessProbe()',
      timeoutMs: 2_000,
    })).rejects.toThrow('CDP command timed out: Page.navigate');
  });

  it('fails with timeout diagnostics when Runtime.evaluate stays unavailable', async () => {
    let currentTime = 0;
    let readinessAttempts = 0;
    const session = {
      logs: [{ level: 'warn', message: 'rendering' }],
      networkIssues: [],
      pendingLogEnrichments: [],
      evaluate: async (expression) => {
        if (expression.includes('readinessProbe()')) {
          readinessAttempts += 1;
          throw new Error('CDP command timed out: Runtime.evaluate');
        }
        return null;
      },
    };

    const result = waitForRouteReadiness(session, {
      name: 'stuck-route',
      expression: 'readinessProbe()',
      timeoutMs: 1_000,
    }, {
      now: () => currentTime,
      wait: async (durationMs) => { currentTime += durationMs; },
    });

    await expect(result).rejects.toMatchObject({
      message: 'Route smoke failed for stuck-route',
      details: {
        evaluateTimeoutCount: 2,
        lastEvaluateTimeout: 'CDP command timed out: Runtime.evaluate',
        logs: [{ level: 'warn', message: 'rendering' }],
      },
    });
    expect(readinessAttempts).toBe(2);
  });

  it('accepts localized management-template empty states as ready', () => {
    expect(isManagementTemplatesReady({
      hasRoot: true,
      activeTab: 'Industry templates0',
      body: 'Industry templates0 General templates0 No diagrams yet',
    })).toBe(true);
    expect(isManagementTemplatesReady({
      hasRoot: true,
      activeTab: '行业模板库0',
      body: '行业模板库0 通用模板库0 暂无图表',
    })).toBe(true);
  });

  it('rejects loading, error, missing-root, and malformed template states', () => {
    expect(isManagementTemplatesReady({
      hasRoot: false,
      activeTab: 'Industry templates0',
      body: 'No diagrams yet',
    })).toBe(false);
    expect(isManagementTemplatesReady({
      hasRoot: true,
      activeTab: 'Industry templates0',
      body: '加载应用 No diagrams yet',
    })).toBe(false);
    expect(isManagementTemplatesReady({
      hasRoot: true,
      activeTab: 'Industry templates0',
      body: '页面出现错误 No diagrams yet',
    })).toBe(false);
    expect(isManagementTemplatesReady({
      hasRoot: true,
      activeTab: null,
      body: 'No diagrams yet',
    })).toBe(false);
  });

  it('filters allowlisted warnings but never suppresses errors', () => {
    const logs = [
      { level: 'warn', message: 'known transient warning' },
      { level: 'warn', message: 'new warning' },
      { level: 'error', message: 'known transient warning' },
    ];

    expect(getUnexpectedLogs(logs, [/known transient warning/])).toEqual([
      { level: 'warn', message: 'new warning' },
      { level: 'error', message: 'known transient warning' },
    ]);
  });

  it('counts each built asset once when the browser records repeated requests', () => {
    expect(dedupeRouteAssets([
      {
        file: 'display-routing-shared.js',
        startTime: 900,
        duration: 10,
        transferSize: 0,
        encodedBodySize: 0,
        decodedBodySize: 587_000,
      },
      {
        file: 'display-routing-shared.js',
        startTime: 200,
        duration: 40,
        transferSize: 120_000,
        encodedBodySize: 120_000,
        decodedBodySize: 587_000,
      },
    ])).toEqual([{
      file: 'display-routing-shared.js',
      startTime: 200,
      duration: 40,
      transferSize: 120_000,
      encodedBodySize: 120_000,
      decodedBodySize: 587_000,
    }]);
  });

  it('partitions route assets at the observed ready boundary without a timing grace window', () => {
    const before = { file: 'before.js', startTime: 999 };
    const boundary = { file: 'boundary.js', startTime: 1_000 };
    const after = { file: 'after.js', startTime: 1_001 };

    expect(partitionRouteAssetsByReadyTime([before, boundary, after], 1_000)).toEqual({
      criticalCutoff: 1_000,
      criticalAssets: [before, boundary],
      backgroundAssets: [after],
    });
  });

  it('keeps malformed asset timing out of the critical startup closure', () => {
    const malformed = { file: 'malformed.js', startTime: Number.NaN };
    expect(partitionRouteAssetsByReadyTime([malformed], Number.POSITIVE_INFINITY)).toEqual({
      criticalCutoff: 0,
      criticalAssets: [],
      backgroundAssets: [malformed],
    });
    expect(partitionRouteAssetsByReadyTime(null, -200)).toEqual({
      criticalCutoff: 0,
      criticalAssets: [],
      backgroundAssets: [],
    });
  });

  it('aggregates repeated samples with upper medians and preserves the worst report', () => {
    const sample = (readyAt, criticalAssets, suffix) => ({
      name: 'management',
      state: { href: `http://example/${suffix}` },
      assetReport: {
        readyAt,
        criticalAssets,
        criticalDecodedKB: criticalAssets * 10,
        totalAssets: criticalAssets + 2,
        totalDecodedKB: criticalAssets * 20,
      },
    });
    const result = aggregateRouteSamples([
      sample(300, 3, 'slow'),
      sample(100, 1, 'fast'),
      sample(200, 2, 'median'),
    ]);

    expect(result.sampleCount).toBe(3);
    expect(result.state.href).toBe('http://example/median');
    expect(result.assetReport).toMatchObject({
      readyAt: 200,
      criticalAssets: 2,
      criticalDecodedKB: 20,
      totalAssets: 4,
      totalDecodedKB: 40,
    });
    expect(result.worstReport.readyAt).toBe(300);
    expect(collectBudgetViolations([result])).toEqual([]);
  });
  it('uses representative samples for long task count while keeping hard stability spikes visible', () => {
    const samples = [100, 200, 300].map((readyAt, index) => ({
      name: 'management', assetReport: { readyAt, criticalAssets: 1, criticalDecodedKB: 1,
        totalAssets: 1, totalDecodedKB: 1 },
      stabilityBudget: { maxLongTaskCount: 1, maxLongTaskMs: 200 },
      stabilityReport: { longTaskCount: index === 0 ? 2 : 0, maxLongTaskMs: index === 2 ? 250 : 100 },
    }));
    const result = aggregateRouteSamples(samples);
    expect(result.stabilityReport.longTaskCount).toBe(0);
    expect(result.representativeSampleIndex).toBe(1);
    expect(collectBudgetViolations([result], { enabled: true })).toEqual([
      { route: 'management', metric: 'maxLongTaskMs', actual: 250, max: 200, unit: 'ms', sampleCount: 3, sampleIndex: 3 },
    ]);
    samples[1].stabilityReport.longTaskCount = 2;
    expect(collectBudgetViolations([aggregateRouteSamples(samples)], { enabled: true })).toContainEqual(
      { route: 'management', metric: 'longTaskCount', actual: 2, max: 1, unit: 'tasks', sampleCount: 3, sampleIndex: 2 },
    );
    samples[0].stabilityReport.longTaskCount = 1;
    samples[1].stabilityReport.longTaskCount = 0;
    samples[2].stabilityReport.maxLongTaskMs = 200;
    expect(collectBudgetViolations([aggregateRouteSamples(samples)], { enabled: true })).toEqual([]);
    samples[0].stabilityReport.longTaskCount = 2;
    expect(collectBudgetViolations([aggregateRouteSamples([samples[0]])], { enabled: true })).toEqual([
      { route: 'management', metric: 'longTaskCount', actual: 2, max: 1, unit: 'tasks', sampleCount: 1, sampleIndex: 1 },
    ]);
  });

  it('defers only warehouse 3D ready latency while preserving its resource budgets', () => {
    const result = {
      name: 'warehouse-3d',
      assetReport: {
        readyAt: 12_000,
        criticalAssets: 47,
        criticalDecodedKB: 2_801,
      },
    };

    expect(collectBudgetViolations([result], { enabled: true })).toEqual([
      {
        route: 'warehouse-3d',
        metric: 'criticalAssets',
        actual: 47,
        max: 46,
        unit: 'assets',
        sampleCount: 1,
        worstReadyMs: undefined,
      },
      {
        route: 'warehouse-3d',
        metric: 'criticalDecodedKB',
        actual: 2_801,
        max: 2_800,
        unit: 'KB decoded',
        sampleCount: 1,
        worstReadyMs: undefined,
      },
    ]);
  });
});
