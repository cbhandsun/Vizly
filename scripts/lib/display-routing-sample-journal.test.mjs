import { mkdtemp, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectJournaledRoutingSamples, createRoutingSampleJournal,
  projectRoutingJournalFailure, projectRoutingJournalSample } from './display-routing-sample-journal.mjs';

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
