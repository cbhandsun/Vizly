import type {
  PathFindingJob,
  SharedGraphContext,
} from '../types/routing';

type ChannelAssignableJob = PathFindingJob & {
  bidirectionalCount?: number;
  _graphConfig?: { algorithm?: { gridSize?: number } };
};

type CongestionAwareGraphConfig = SharedGraphContext['config'] & {
  portCongestion?: Record<string, number>;
};

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const coordinate = (value: unknown): number => finiteNumber(value, 0);
const endpointKey = (value: unknown): string => String(value ?? '').trim();

const compareJobs = (left: PathFindingJob, right: PathFindingJob): number =>
  finiteNumber(left.outgoingIndex, 0) - finiteNumber(right.outgoingIndex, 0)
  || finiteNumber(left.incomingIndex, 0) - finiteNumber(right.incomingIndex, 0)
  || String(left.edgeId ?? '').localeCompare(String(right.edgeId ?? ''));

export const assignBidirectionalRoutingChannels = (
  jobs: PathFindingJob[],
  rawBaseSpacing: number,
): void => {
  const baseSpacing = Math.max(0, finiteNumber(rawBaseSpacing, 25));
  const groups = new Map<string, ChannelAssignableJob[]>();
  for (const rawJob of jobs) {
    const job = rawJob as ChannelAssignableJob;
    const source = endpointKey(job.source);
    const target = endpointKey(job.target);
    if (!source || !target) continue;
    const forward = `${source}\u0000${target}`;
    const reverse = `${target}\u0000${source}`;
    const key = forward < reverse ? forward : reverse;
    const group = groups.get(key) ?? [];
    group.push(job);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((left, right) => {
      const leftDirection = `${endpointKey(left.source)}\u2192${endpointKey(left.target)}`;
      const rightDirection = `${endpointKey(right.source)}\u2192${endpointKey(right.target)}`;
      return leftDirection.localeCompare(rightDirection)
        || String(left.edgeId ?? '').localeCompare(String(right.edgeId ?? ''));
    });
    const count = group.length;
    const spacing = baseSpacing * Math.min(1, 3 / count);
    group.forEach((job, index) => {
      job.bidirectionalChannel = index;
      job.bidirectionalSpacing = spacing;
      job.bidirectionalCount = count;
    });
  }
};

export const assignGlobalRoutingChannels = (
  jobs: PathFindingJob[],
  baseSpacing: number,
): void => {
  assignBidirectionalRoutingChannels(jobs, baseSpacing);
  if (!jobs.length) return;
  const gridSize = Math.max(
    1,
    finiteNumber(
      (jobs[0] as ChannelAssignableJob)._graphConfig?.algorithm?.gridSize,
      15,
    ),
  );
  const groupSize = Math.max(100, gridSize * 10);
  const horizontalGroups = new Map<number, PathFindingJob[]>();
  const verticalGroups = new Map<number, PathFindingJob[]>();
  for (const job of jobs) {
    const sourceX = coordinate(job.sourceX);
    const sourceY = coordinate(job.sourceY);
    const targetX = coordinate(job.targetX);
    const targetY = coordinate(job.targetY);
    const horizontal = Math.abs(targetX - sourceX) > Math.abs(targetY - sourceY);
    const key = Math.floor(
      (horizontal ? (sourceY + targetY) / 2 : (sourceX + targetX) / 2)
      / groupSize,
    );
    const groups = horizontal ? horizontalGroups : verticalGroups;
    const group = groups.get(key) ?? [];
    group.push(job);
    groups.set(key, group);
  }
  const perturbation = groupSize * 0.08;
  for (const group of horizontalGroups.values()) {
    group.sort((left, right) => {
      const leftValue = coordinate(left.sourceY) + coordinate(left.targetY)
        + Math.sign(coordinate(left.targetX) - coordinate(left.sourceX))
          * perturbation;
      const rightValue = coordinate(right.sourceY) + coordinate(right.targetY)
        + Math.sign(coordinate(right.targetX) - coordinate(right.sourceX))
          * perturbation;
      return Math.abs(leftValue - rightValue) > 1
        ? leftValue - rightValue
        : compareJobs(left, right);
    });
    group.forEach((job, index) => {
      job.globalChannelIndex = index;
      job.globalChannelCount = group.length;
      job.globalChannelType = 'horizontal';
    });
  }
  for (const group of verticalGroups.values()) {
    group.sort((left, right) => {
      const leftValue = coordinate(left.sourceX) + coordinate(left.targetX)
        + Math.sign(coordinate(left.targetY) - coordinate(left.sourceY))
          * perturbation;
      const rightValue = coordinate(right.sourceX) + coordinate(right.targetX)
        + Math.sign(coordinate(right.targetY) - coordinate(right.sourceY))
          * perturbation;
      return Math.abs(leftValue - rightValue) > 1
        ? leftValue - rightValue
        : compareJobs(left, right);
    });
    group.forEach((job, index) => {
      job.globalChannelIndex = index;
      job.globalChannelCount = group.length;
      job.globalChannelType = 'vertical';
    });
  }
};

export const injectRoutingCongestionContext = (
  jobs: readonly PathFindingJob[],
  graph: SharedGraphContext,
): void => {
  const portCongestion: Record<string, number> = {};
  for (const job of jobs) {
    for (const endpoint of [endpointKey(job.source), endpointKey(job.target)]) {
      if (!endpoint) continue;
      portCongestion[endpoint] = (portCongestion[endpoint] ?? 0) + 1;
    }
  }
  if (!graph.config || typeof graph.config !== 'object') graph.config = {};
  (graph.config as CongestionAwareGraphConfig).portCongestion = portCongestion;
};
