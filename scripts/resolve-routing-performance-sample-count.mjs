import { resolveRoutingPerformanceSampleCount } from './lib/routing-performance-sample-count.mjs';

const sampleCount = resolveRoutingPerformanceSampleCount({
  eventName: process.env.ROUTING_PERF_EVENT_NAME,
  requestedSampleCount: process.env.ROUTING_PERF_REQUESTED_SAMPLE_COUNT,
});

process.stdout.write(String(sampleCount));
