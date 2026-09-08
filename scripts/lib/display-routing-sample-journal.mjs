import { mkdir, mkdtemp, open, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { projectDisplayRoutingEditStability } from './display-routing-edit-stability.mjs';
import { projectPrecompiledRouteLongTasks } from './precompiled-display-route-long-tasks.mjs';
import { projectPrecompiledWorkerExecution } from './precompiled-display-route-worker-execution.mjs';

const metric = value => Number.isFinite(value) && value >= 0 && value <= 1e15 ? value : null;
const fields = (value, keys) => Object.fromEntries(keys.map(key => [key, metric(value?.[key])]));
const timings = ['routeMs', 'workerDurationMs', 'workerStartCount', 'workerAbortCount',
  'releaseToFinalMs', 'workerToFinalMs', 'workerRoundTripMs', 'workerDeliveryWaitMs'];
const resolutions = ['full-route', 'full-route-repaired', 'incremental-route',
  'validated-candidate', 'repaired-candidate'];
const caseIds = ['logistics-architecture-v1', 'wms-demand-allocation-strategy-v2',
  'wms-process-flow-v1', 'l-oms', 'tms', 'wms'];

export const projectRoutingJournalSample = (kind, sample) => {
  if (!['cold', 'incremental'].includes(kind)) throw new Error('Invalid journal kind');
  const groups = kind === 'cold' ? ['presets'] : ['initialRoutes', 'dragCases'];
  return Object.fromEntries(groups.map(group => {
    const cases = sample?.[group];
    if (!Array.isArray(cases) || cases.length === 0 || cases.length > 32) {
      throw new Error('Invalid journal sample cases');
    }
    return [group, cases.map((item, caseIndex) => {
      const identifier = item?.presetId ?? item?.nodeId;
      return {
        caseIndex, caseId: caseIds.includes(identifier) ? identifier : null,
        ...fields(item, timings),
        workerResolution: resolutions.includes(item?.workerResolution) ? item.workerResolution : null,
        editStability: projectDisplayRoutingEditStability(item?.editStability),
        mainThreadLongTasks: projectPrecompiledRouteLongTasks(item?.mainThreadLongTasks),
        workerExecution: projectPrecompiledWorkerExecution(item?.workerExecution),
        workerTimings: item?.workerTimings == null ? null : fields(item.workerTimings,
          ['prewarmLeadMs', 'requestPreparationMs', 'firstResponseMs', 'workerDeliveryOverheadMs',
            'workerMonotonicDeliveryOverheadMs', 'responseParseMs', 'responseApplyMs']),
      };
    })];
  }));
};

// Failure messages can contain page content or CDP exceptions. Store only
// explicitly allowlisted wait codes observed in the existing diagnostic envelope.
export const projectRoutingJournalFailure = (error, code = 'sample-failed') => {
  if (!['sample-failed', 'journal-write-failed', 'progress-report-failed'].includes(code)) {
    throw new Error('Invalid journal failure code');
  }
  const message = typeof error?.message === 'string' ? error.message.slice(0, 65_536) : '';
  const wait = message.match(/"waitStatus":\s*"(not-ready|evaluation-failed|evaluation-timeout|invalid-evaluation|predicate-failed|quality-rejected)"/);
  const stage = message.match(/"stage":\s*"(scheduled|routing|worker-post|worker-phase|worker-response|worker-error|worker-message-error|worker-cancelled|worker-timeout|final-quality-rejected|final-safety-rejected|final-applied)"/);
  return { code, observedWaitStatus: wait?.[1] ?? null,
    observedRoutingStage: stage?.[1] ?? null };
};

export const createRoutingSampleJournal = async ({ kind, sampleCount,
  directory = 'artifacts/routing-performance', sourceCommit = null } = {}) => {
  if (!['cold', 'incremental'].includes(kind) || !Number.isSafeInteger(sampleCount)
    || sampleCount < 1 || sampleCount > 100) throw new Error('Invalid journal options');
  if (sourceCommit !== null && (typeof sourceCommit !== 'string' || !/^[0-9a-f]{40}$/.test(sourceCommit))) {
    throw new Error('Invalid journal source commit');
  }
  let buildEntrySha256 = null;
  try {
    buildEntrySha256 = createHash('sha256').update(await readFile('dist/index.html')).digest('hex');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await mkdir(directory, { recursive: true });
  const runDirectory = await mkdtemp(join(directory, `${kind}-`));
  const file = await open(join(runDirectory, 'samples.jsonl'), 'wx');
  const write = async record => {
    await file.writeFile(`${JSON.stringify({ schema: 'routing-sample-journal-v1', ...record })}\n`);
    await file.sync();
  };
  try {
    await write({ event: 'started', kind, sampleCount, sourceCommit, buildEntrySha256 });
  } catch (error) {
    await file.close();
    throw error;
  }
  let closed = false;
  let nextIndex = 1;
  return {
    runDirectory,
    async sample(index, value) {
      if (closed || index !== nextIndex || index > sampleCount) throw new Error('Invalid journal sample order');
      await write({ event: 'sample-completed', sampleIndex: index,
        metrics: projectRoutingJournalSample(kind, value) });
      nextIndex += 1;
    },
    async finish(error, code = 'sample-failed') {
      if (closed) throw new Error('Journal already closed');
      const failed = arguments.length > 0;
      closed = true;
      try {
        if (!failed && nextIndex !== sampleCount + 1) throw new Error('Incomplete journal samples');
        await write({ event: failed ? 'failed' : 'sampling-completed', completedSamples: nextIndex - 1,
          failure: failed ? projectRoutingJournalFailure(error, code) : null });
      } finally {
        await file.close();
      }
    },
  };
};

export const collectJournaledRoutingSamples = async ({ kind, sampleCount, runSample,
  directory, sourceCommit, onSample = () => {} }) => {
  const journal = await createRoutingSampleJournal({ kind, sampleCount, directory, sourceCommit });
  const samples = [];
  let failureCode = 'sample-failed';
  try {
    for (let index = 1; index <= sampleCount; index += 1) {
      failureCode = 'sample-failed';
      const sample = await runSample(index);
      failureCode = 'journal-write-failed';
      await journal.sample(index, sample);
      samples.push(sample);
      failureCode = 'progress-report-failed';
      onSample(index);
    }
  } catch (error) {
    await journal.finish(error, failureCode);
    throw new Error(`Routing benchmark failed: ${JSON.stringify(projectRoutingJournalFailure(error, failureCode))}`);
  }
  await journal.finish();
  return samples;
};
