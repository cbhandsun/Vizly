import { runColdRoutingSample } from './lib/precompiled-display-route-cold-sample.mjs';
import { collectJournaledRoutingSamples } from './lib/display-routing-sample-journal.mjs';

import {
  assertPrecompiledDisplayRoutePerformanceBudget,
  parsePrecompiledDisplayRouteBenchmarkPresetIds,
  parsePrecompiledDisplayRouteSampleCount,
  summarizePrecompiledDisplayRoutePerformance,
} from './lib/precompiled-display-route-performance.mjs';

const presetIds = parsePrecompiledDisplayRouteBenchmarkPresetIds(process.env.PRECOMPILED_ROUTE_PRESET_ID);

const sampleCount = parsePrecompiledDisplayRouteSampleCount(
  process.env.DISPLAY_ROUTING_COLD_SAMPLE_COUNT,
);
const samples = await collectJournaledRoutingSamples({ kind: 'cold', sampleCount,
  runSample: runColdRoutingSample, sourceCommit: process.env.GITHUB_SHA ?? null,
  onSample: index => process.stdout.write(`cold-routing sample ${index}/${sampleCount} complete\n`),
});

const summary = summarizePrecompiledDisplayRoutePerformance(samples, sampleCount, presetIds);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
assertPrecompiledDisplayRoutePerformanceBudget(summary);
