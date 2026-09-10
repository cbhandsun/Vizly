import { mkdtemp, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectJournaledRoutingSamples, createRoutingSampleJournal,
  createRoutingSampleFailure, isRetryableRoutingSampleInfrastructureFailure,
  projectRoutingJournalFailure, projectRoutingJournalSample } from './display-routing-sample-journal.mjs';
import { projectRoutingWaitFailureEvidence } from './display-routing-wait-failure-evidence.mjs';

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal();
  const openMock = vi.fn(actual.open);
  return { ...actual, open: openMock, default: { ...actual.default, open: openMock } };
});

const directories = [];
const createDirectory = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vizly-journal-test-'));
  directories.push(directory);
  return directory;
};
afterEach(async () => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
const sample = { presets: [{ presetId: 'logistics-architecture-v1', routeMs: 10,
  workerDurationMs: 8, workerResolution: 'full-route' }] };
const records = async directory => {
  const runs = await readdir(directory);
  return Promise.all(runs.map(async run => (await readFile(join(directory, run, 'samples.jsonl'), 'utf8'))
    .trim().split('\n').map(line => JSON.parse(line))));
};

describe('routing sample journal', () => {
  const lifecycle = () => ({schema:'browser-lifecycle-v1',observation:'root-observed',
    page:{readyState:'complete',protocol:'http:',captureInstalled:true,rootChildCount:1,resourceErrors:2,
      url:'https://private.invalid/?token=secret',body:'private document'},
    milestones:{domReadyMs:20,workerConstructedMs:null},routing:{stage:'unknown',workerStartCount:0},
    requestCount:0,responseCount:0,requests:[{token:'secret'}]});
  const waitFailure = (diagnostics = lifecycle(), lastObservedDiagnostics = null, newline='\n') => new Error(
    `Child sample failed: Error: Browser state wait failed${newline}${JSON.stringify({waitStatus:'not-ready',
      evidenceStatus:diagnostics ? 'available':'evaluation-timeout',diagnostics,lastObservedDiagnostics})}\n at private-stack`,
  );
  it.each(['\n','\r\n'])('preserves bounded startup evidence across child stderr (%j)', newline => {
    const projected=projectRoutingJournalFailure(waitFailure(lifecycle(),null,newline));
    expect(projected.waitEvidence).toMatchObject({schema:'routing-wait-failure-v1',waitStatus:'not-ready',
      diagnostics:{observation:'root-observed',page:{readyState:'complete',resourceErrors:2},
        routing:{stage:'unknown',workerStartCount:0},requestCount:0,responseCount:0}});
    expect(JSON.stringify(projected)).not.toMatch(/secret|private|url|body|requests/);
  });
  it('keeps the last host observation if the final diagnostic read times out',()=>{
    const projected=projectRoutingWaitFailureEvidence(waitFailure(null,lifecycle()));
    expect(projected).toMatchObject({evidenceStatus:'evaluation-timeout',diagnostics:null,
      lastObservedDiagnostics:{observation:'root-observed'}});
  });
  it('uses the structured stage rather than unrelated stack text',()=>{
    const source=lifecycle();
    source.routing.stage='worker-response-error';
    const error=waitFailure(source);
    error.message='{"stage":"final-applied"}\n'+error.message;
    expect(projectRoutingJournalFailure(error).observedRoutingStage).toBe('worker-response-error');
  });
  it('rejects malformed, excessive and foreign envelopes and nulls invalid fields',()=>{
    for(const value of [null,{},'text',new Error('Browser state wait failed\n{broken'),
      new Error('Browser state wait failed\n'+ '['.repeat(40)),
      new Error('Browser state wait failed\n'+JSON.stringify({nested:Array.from({length:40}).reduce(value=>({nested:value}),{})})),
      new Error('Browser state wait failed\n{'+ ' '.repeat(65536)+'}'),
      waitFailure({schema:'foreign',body:'private'}),waitFailure(null,null)]) {
      expect(projectRoutingWaitFailureEvidence(value)).toBeNull();
    }
    const source=lifecycle();
    Object.assign(source.page,{readyState:'private',resourceErrors:-1,rootChildCount:Infinity,captureInstalled:'secret'});
    Object.assign(source.milestones,{domReadyMs:600001,workerConstructedMs:'token'});
    const projected=projectRoutingWaitFailureEvidence(waitFailure(source));
    expect(projected.diagnostics.page).toMatchObject({readyState:null,resourceErrors:null,rootChildCount:null,captureInstalled:null});
    expect(projected.diagnostics.milestones).toMatchObject({domReadyMs:null,workerConstructedMs:null});
    expect(JSON.stringify(projected)).not.toMatch(/secret|private|token/);
  });
  it('parses quoted braces safely and retains evidence through typed child failures and the real journal',async()=>{
    const directory=await createDirectory();
    const source=lifecycle();
    source.page.body='private } ] \\" { [ text';
    const error=createRoutingSampleFailure('child-exit-failed',waitFailure(source));
    expect(projectRoutingWaitFailureEvidence(error)?.diagnostics.page.resourceErrors).toBe(2);
    await expect(collectJournaledRoutingSamples({kind:'cold',sampleCount:1,directory,
      runSample:async()=>{throw error;}})).rejects.toThrow('resourceErrors');
    const [entries]=await records(directory);
    expect(entries.at(-1).failure.waitEvidence.diagnostics.page.resourceErrors).toBe(2);
    expect(JSON.stringify(entries)).not.toMatch(/secret|private/);
  });
  it('persists the precise safe sample category in both journal and terminal failure', async () => {
    const directory = await createDirectory();
    const error = createRoutingSampleFailure('child-exit-failed', {
      message: 'Bearer private {"waitStatus":"not-ready","stage":"worker-phase"}',
    });
    await expect(collectJournaledRoutingSamples({ kind: 'cold', sampleCount: 1, directory,
      runSample: async () => { throw error; },
    })).rejects.toThrow('child-exit-failed');
    const [entries] = await records(directory);
    expect(entries.at(-1).failure).toEqual({ code: 'sample-failed', sampleFailureCode: 'child-exit-failed',
      observedWaitStatus: 'not-ready', observedRoutingStage: 'worker-phase' });
    expect(JSON.stringify(entries)).not.toMatch(/Bearer|private/);
  });
  it('classifies only browser startup and loading navigation sample failures as retryable infrastructure', () => {
    const startupFailure = createRoutingSampleFailure('child-exit-failed', {
      childFailure: {
        sampleIndex: 2,
        stdout: '',
        stderr: `Error: safe startup failure
 at file:///D:/a/Vizly/Vizly/scripts/lib/precompiled-display-route-browser-startup.mjs:40:13`,
      },
    });
    expect(isRetryableRoutingSampleInfrastructureFailure(startupFailure)).toBe(true);

    const loadingNavigationFailure = createRoutingSampleFailure('child-exit-failed', waitFailure({
      schema: 'browser-lifecycle-v1',
      observation: 'page-loading',
      page: { readyState: 'loading', protocol: 'http:', captureInstalled: false,
        rootChildCount: null, resourceErrors: 0 },
      milestones: { domReadyMs: null, workerConstructedMs: null },
      routing: { stage: 'unknown', workerStartCount: null },
      requestCount: 0,
      responseCount: 0,
    }));
    expect(isRetryableRoutingSampleInfrastructureFailure(loadingNavigationFailure)).toBe(true);

    const budgetFailure = createRoutingSampleFailure('child-exit-failed', {
      childFailure: {
        sampleIndex: 3,
        stdout: '',
        stderr: `Error: Routing performance or lifecycle budget exceeded:
 at file:///D:/a/Vizly/Vizly/scripts/lib/display-routing-browser-performance.mjs:477:9`,
      },
    });
    expect(isRetryableRoutingSampleInfrastructureFailure(budgetFailure)).toBe(false);

    const productFailureWithResult = createRoutingSampleFailure('child-exit-failed', {
      childFailure: {
        sampleIndex: 4,
        stdout: 'DISPLAY_ROUTING_BROWSER_RESULT={}',
        stderr: `Error: safe startup failure
 at file:///D:/a/Vizly/Vizly/scripts/lib/precompiled-display-route-browser-startup.mjs:40:13`,
      },
    });
    expect(isRetryableRoutingSampleInfrastructureFailure(productFailureWithResult)).toBe(false);
  });

  it('persists a bounded child process failure summary without raw output', async () => {
    const directory = await createDirectory();
    const error = createRoutingSampleFailure('child-exit-failed', {
      message: 'Display-routing sample 3 failed',
      childFailure: {
        sampleIndex: 3,
        stdout: 'DISPLAY_ROUTING_BROWSER_RESULT={"private":true}\nBearer private body',
        stderr: 'Error: Routing performance or lifecycle budget exceeded:\n at file:///D:/a/Vizly/Vizly/scripts/lib/display-routing-browser-performance.mjs:477:9\nurl=https://private.invalid/?token=secret',
      },
    });
    await expect(collectJournaledRoutingSamples({ kind: 'cold', sampleCount: 1, directory,
      runSample: async () => { throw error; },
    })).rejects.toThrow('routing-performance-budget-exceeded');
    const [entries] = await records(directory);
    expect(entries.at(-1).failure.childFailureSummary).toEqual({
      code: 'routing-performance-budget-exceeded',
      sampleIndex: 3,
      stdoutLineCount: 2,
      stderrLineCount: 3,
      emittedMachineResult: true,
      firstRepoStackFile: 'scripts/lib/display-routing-browser-performance.mjs',
    });
    expect(JSON.stringify(entries)).not.toMatch(/Bearer|private|token|body|invalid/);
  });

  it('keeps numeric execution evidence and unavailable states without exporting raw timestamps', () => {
    const workerExecution = { status: 'available', handlerReadyAfterPostMs: 1,
      postReadyDispatchMs: 2, executionMs: 3, responseDeliveryMs: 4, readyAt: 'private' };
    const projected = projectRoutingJournalSample('cold', { presets: [{ ...sample.presets[0], workerExecution }] });
    expect(projected.presets[0].workerExecution).toMatchObject({ status: 'available', postReadyDispatchMs: 2 });
    expect(JSON.stringify(projected)).not.toMatch(/private|readyAt/);
    expect(projectRoutingJournalSample('cold', sample).presets[0].workerExecution).toEqual({ status: 'unavailable' });
  });
  it('persists each sample before advancing and preserves it on a later failure', async () => {
    const directory = await createDirectory();
    let calls = 0;
    await expect(collectJournaledRoutingSamples({ kind: 'cold', sampleCount: 3, directory,
      runSample: async () => {
        calls += 1;
        if (calls === 1) return sample;
        expect((await records(directory))[0].at(-1)).toMatchObject({ event: 'sample-completed', sampleIndex: 1 });
        throw new Error('Bearer private document\n{"waitStatus":"evaluation-timeout","stage":"worker-post"}');
      },
    })).rejects.toThrow('evaluation-timeout');
    expect(calls).toBe(2);
    const [entries] = await records(directory);
    expect(entries.at(-1)).toMatchObject({ event: 'failed', completedSamples: 1,
      failure: { observedWaitStatus: 'evaluation-timeout', observedRoutingStage: 'worker-post' } });
    expect(JSON.stringify(entries)).not.toMatch(/Bearer|private|document/);
  });

  it('keeps repeated runs separate and preserves the source sample for aggregation', async () => {
    const directory = await createDirectory();
    for (let index = 0; index < 2; index += 1) {
      const result = await collectJournaledRoutingSamples({ kind: 'cold', sampleCount: 1, directory,
        sourceCommit: 'a'.repeat(40), runSample: async () => sample });
      expect(result[0]).toBe(sample);
    }
    const runs = await records(directory);
    expect(runs).toHaveLength(2);
    expect(runs[0][0]).toMatchObject({ schema: 'routing-sample-journal-v1', sourceCommit: 'a'.repeat(40) });
    expect(runs[0].at(-1)).toMatchObject({ event: 'sampling-completed', completedSamples: 1 });
  });

  it('rejects missing, oversized and malformed groups and strips contents from valid cases', () => {
    for (const presets of [undefined, null, {}, [], Array(33).fill({})]) {
      expect(() => projectRoutingJournalSample('cold', { presets })).toThrow('Invalid');
    }
    const projected = projectRoutingJournalSample('incremental', {
      initialRoutes: [{ nodeId: 'private', routeMs: Infinity, token: 'secret' }],
      dragCases: [{ nodeId: 'wms', releaseToFinalMs: -1, workerResolution: 'private',
        editStability: { comparedNodeCount: 'secret' } }],
    });
    expect(projected.initialRoutes[0]).toMatchObject({ caseId: null, routeMs: null });
    expect(projected.dragCases[0]).toMatchObject({ caseId: 'wms', releaseToFinalMs: null, editStability: null });
    expect(JSON.stringify(projected)).not.toMatch(/secret|private|Infinity/);
    expect(projectRoutingJournalFailure(null)).toEqual({ code: 'sample-failed',
      observedWaitStatus: null, observedRoutingStage: null });
  });

  it('enforces bounded options, ordered writes and complete sampling', async () => {
    const directory = await createDirectory();
    for (const count of [0, 101, NaN, '1']) {
      await expect(createRoutingSampleJournal({ kind: 'cold', sampleCount: count, directory })).rejects.toThrow('Invalid');
    }
    await expect(createRoutingSampleJournal({ kind: 'private', sampleCount: 1, directory })).rejects.toThrow('Invalid');
    await expect(createRoutingSampleJournal({ kind: 'cold', sampleCount: 1, directory, sourceCommit: 'secret' })).rejects.toThrow('Invalid');
    const journal = await createRoutingSampleJournal({ kind: 'cold', sampleCount: 1, directory });
    await expect(journal.sample(2, sample)).rejects.toThrow('order');
    await expect(journal.finish()).rejects.toThrow('Incomplete');
    await expect(journal.sample(1, sample)).rejects.toThrow('order');
  });

  it('does not start a sample if the report cannot be opened', async () => {
    const directory = await createDirectory();
    const blockedPath = join(directory, 'file');
    await writeFile(blockedPath, 'occupied');
    const runSample = vi.fn();
    await expect(collectJournaledRoutingSamples({ kind: 'cold', sampleCount: 1,
      directory: blockedPath, runSample })).rejects.toThrow();
    expect(runSample).not.toHaveBeenCalled();
  });

  it.each([null, undefined, 'private'])('records non-Error failures without treating them as success: %s', async failure => {
    const directory = await createDirectory();
    await expect(collectJournaledRoutingSamples({ kind: 'cold', sampleCount: 1, directory,
      runSample: async () => { throw failure; },
    })).rejects.toThrow('sample-failed');
    expect((await records(directory))[0].at(-1)).toMatchObject({ event: 'failed', completedSamples: 0 });
  });

  it('does not advance sampling after a disk write fails and closes the handle', async () => {
    const directory = await createDirectory();
    const actual = await vi.importActual('node:fs/promises');
    let close;
    vi.mocked(open).mockImplementationOnce(async (...args) => {
      const file = await actual.open(...args);
      close = vi.spyOn(file, 'close');
      let writes = 0;
      const write = file.writeFile.bind(file);
      vi.spyOn(file, 'writeFile').mockImplementation(async (...writeArgs) => {
        writes += 1;
        if (writes === 2) throw new Error('private disk path');
        return write(...writeArgs);
      });
      return file;
    });
    const runSample = vi.fn(async () => sample);
    await expect(collectJournaledRoutingSamples({ kind: 'cold', sampleCount: 2,
      directory, runSample })).rejects.toThrow('journal-write-failed');
    expect(runSample).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect((await records(directory))[0].at(-1)).toMatchObject({ event: 'failed', completedSamples: 0 });
  });
});
