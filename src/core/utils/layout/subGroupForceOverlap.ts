import type { Node as ReactFlowNode } from '@xyflow/react';
import { forceCollide, forceSimulation, forceX, forceY } from 'd3-force';

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
);

const nestedValue = (source: unknown, ...keys: string[]): unknown => {
  let current: unknown = source;
  for (const key of keys) current = asRecord(current)[key];
  return current;
};

const firstDefined = (...values: unknown[]): unknown => (
  values.find(value => value !== undefined && value !== null)
);

const boundedNumber = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, numeric));
};

const coordinate = (value: unknown, fallback = 0): number => (
  boundedNumber(value, fallback, -100_000, 100_000)
);

const dimension = (value: unknown, fallback: number): number => (
  boundedNumber(value, fallback, 1, 100_000)
);

const iterationCount = (value: unknown, fallback: number): number => (
  Math.round(boundedNumber(value, fallback, 1, 2_000))
);

const forceStrength = (value: unknown, fallback: number): number => (
  boundedNumber(value, fallback, 0.2, 1)
);

const cloneLayoutNodes = (nodes: ReactFlowNode[]): ReactFlowNode[] => nodes.map(node => ({
  ...node,
  position: {
    x: coordinate(node.position?.x),
    y: coordinate(node.position?.y),
  },
  measured: node.measured
    ? {
      width: dimension(node.measured.width, 1),
      height: dimension(node.measured.height, 1),
    }
    : node.measured,
  style: node.style ? { ...node.style } : node.style,
}));

interface ForceMetrics {
  horizontalGap: number;
  verticalGap: number;
  minimumNodeWidth: number;
  defaultNodeHeight: number;
  subGroupHorizontalPadding: number;
  subGroupTopPadding: number;
  subGroupBottomPadding: number;
}

const resolveMetrics = (layoutConfig: unknown, config: unknown): ForceMetrics => {
  const titleHeight = dimension(firstDefined(
    nestedValue(config, 'subDomain', 'title', 'height'),
    nestedValue(config, 'subGroup', 'title', 'height'),
    nestedValue(layoutConfig, 'SUB_GROUP_TITLE_HEIGHT'),
  ), 28);
  const titlePadding = boundedNumber(firstDefined(
    nestedValue(config, 'subDomain', 'title', 'padding', 'vertical'),
    nestedValue(config, 'subGroup', 'title', 'padding', 'vertical'),
    nestedValue(layoutConfig, 'SUB_GROUP_TITLE_SAFE_GAP'),
  ), 8, 0, 10_000);
  const configuredTop = boundedNumber(firstDefined(
    nestedValue(config, 'subDomain', 'padding', 'top'),
    nestedValue(config, 'subGroup', 'padding', 'top'),
    nestedValue(layoutConfig, 'SUB_GROUP_TITLE_CLEARANCE'),
  ), titleHeight + titlePadding, 0, 10_000);

  return {
    horizontalGap: boundedNumber(nestedValue(layoutConfig, 'NODE_H_GAP'), 120, 0, 10_000),
    verticalGap: boundedNumber(nestedValue(layoutConfig, 'NODE_V_GAP'), 80, 0, 10_000),
    minimumNodeWidth: dimension(nestedValue(layoutConfig, 'NODE_MIN_WIDTH'), 120),
    defaultNodeHeight: dimension(nestedValue(config, 'node', 'height'), 80),
    subGroupHorizontalPadding: boundedNumber(firstDefined(
      nestedValue(config, 'subDomain', 'padding', 'horizontal'),
      nestedValue(config, 'subGroup', 'padding', 'horizontal'),
      nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'H'),
    ), 30, 0, 10_000),
    subGroupTopPadding: Math.max(titleHeight + titlePadding, configuredTop),
    subGroupBottomPadding: boundedNumber(firstDefined(
      nestedValue(config, 'subDomain', 'padding', 'bottom'),
      nestedValue(config, 'subGroup', 'padding', 'bottom'),
      nestedValue(layoutConfig, 'SUB_GROUP_PADDING', 'V_BOTTOM'),
    ), 20, 0, 10_000),
  };
};

const nodeWidth = (node: ReactFlowNode, fallback: number): number => dimension(
  node.measured?.width ?? node.style?.width ?? node.width,
  fallback,
);

const nodeHeight = (node: ReactFlowNode, fallback: number): number => dimension(
  node.measured?.height ?? node.style?.height ?? node.height,
  fallback,
);

interface ForceParticle {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

const runSimulation = (
  particles: ForceParticle[],
  centerX: number,
  centerY: number,
  iterations: number,
  strength: number,
  centerStrengthMultiplier: number,
  minimumRadius: number,
): void => {
  const simulation = forceSimulation(particles)
    .alpha(1)
    .alphaDecay(1 - Math.pow(0.001, 1 / iterations))
    .force(
      'collide',
      forceCollide<ForceParticle>()
        .radius(particle => Math.max(minimumRadius, particle.r))
        .strength(strength),
    )
    .force('centerX', forceX(centerX).strength(strength * centerStrengthMultiplier))
    .force('centerY', forceY(centerY).strength(strength * centerStrengthMultiplier))
    .stop();

  for (let index = 0; index < iterations; index += 1) simulation.tick();
};

export const resolveSubGroupChildrenOverlapWithD3ForceWithConfig = (
  nodes: ReactFlowNode[],
  layoutConfig: unknown,
  config: unknown,
  requestedIterations: unknown = 160,
  requestedStrength: unknown = 0.6,
): ReactFlowNode[] => {
  const metrics = resolveMetrics(layoutConfig, config);
  const iterations = iterationCount(requestedIterations, 160);
  const strength = forceStrength(requestedStrength, 0.6);
  const updated = cloneLayoutNodes(nodes);
  const nodeById = new Map(updated.map(node => [node.id, node]));
  const margin = Math.max(metrics.horizontalGap, metrics.verticalGap) / 2;

  for (const subGroup of updated.filter(node => String(node.type || '') === 'subGroup')) {
    const groupX = coordinate(subGroup.position.x);
    const groupY = coordinate(subGroup.position.y);
    const groupWidth = nodeWidth(subGroup, 1);
    const groupHeight = nodeHeight(subGroup, 1);
    const innerLeft = groupX + metrics.subGroupHorizontalPadding;
    const innerRight = groupX + groupWidth - metrics.subGroupHorizontalPadding;
    const innerTop = groupY + metrics.subGroupTopPadding;
    const innerBottom = groupY + groupHeight - metrics.subGroupBottomPadding;
    const centerX = Math.round((innerLeft + innerRight) / 2);
    const centerY = Math.round((innerTop + innerBottom) / 2);
    const rawChildren = asRecord(subGroup.data).children;
    const children = Array.isArray(rawChildren)
      ? rawChildren
        .filter((id): id is string => typeof id === 'string')
        .map(id => nodeById.get(id))
        .filter((node): node is ReactFlowNode => Boolean(node))
      : [];
    if (children.length <= 1) continue;

    const particles = children.map(node => {
      const width = nodeWidth(node, metrics.minimumNodeWidth);
      const height = nodeHeight(node, metrics.defaultNodeHeight);
      return {
        id: node.id,
        x: coordinate(node.position.x),
        y: coordinate(node.position.y),
        w: width,
        h: height,
        r: Math.round(Math.max(12, Math.hypot(width, height) / 2 + margin)),
      };
    });
    runSimulation(particles, centerX, centerY, iterations, strength, 0.85, 12);

    for (const particle of particles) {
      const node = nodeById.get(particle.id);
      if (!node) continue;
      node.position = {
        x: Math.min(
          Math.max(Math.round(coordinate(particle.x)), innerLeft),
          Math.max(innerLeft, innerRight - particle.w),
        ),
        y: Math.min(
          Math.max(Math.round(coordinate(particle.y)), innerTop),
          Math.max(innerTop, innerBottom - particle.h),
        ),
      };
    }
  }

  return updated;
};

export const resolveSubGroupsOverlapWithD3ForceWithConfig = (
  nodes: ReactFlowNode[],
  layoutConfig: unknown,
  requestedIterations: unknown = 100,
  requestedStrength: unknown = 0.5,
): ReactFlowNode[] => {
  const metrics = resolveMetrics(layoutConfig, {});
  const iterations = iterationCount(requestedIterations, 100);
  const strength = forceStrength(requestedStrength, 0.5);
  const updated = cloneLayoutNodes(nodes);
  const nodeById = new Map(updated.map(node => [node.id, node]));
  const domainIds = new Set(
    updated
      .filter(node => String(node.type || '') === 'titleGroup')
      .map(node => String(asRecord(node.data).domain || ''))
      .filter(Boolean),
  );
  const margin = Math.max(metrics.horizontalGap, metrics.verticalGap) / 2;

  for (const domain of domainIds) {
    const subGroups = updated.filter(node => (
      String(node.type || '') === 'subGroup'
      && String(asRecord(node.data).domain || '') === domain
    ));
    if (subGroups.length <= 1) continue;

    const particles = subGroups.map(node => {
      const width = nodeWidth(node, 1);
      const height = nodeHeight(node, 1);
      return {
        id: node.id,
        x: coordinate(node.position.x) + width / 2,
        y: coordinate(node.position.y) + height / 2,
        w: width,
        h: height,
        r: Math.round(Math.max(24, Math.hypot(width, height) / 2 + margin)),
      };
    });
    const centerX = Math.round(
      particles.reduce((sum, particle) => sum + particle.x, 0) / particles.length,
    );
    const centerY = Math.round(
      particles.reduce((sum, particle) => sum + particle.y, 0) / particles.length,
    );
    runSimulation(particles, centerX, centerY, iterations, strength, 0.6, 24);

    for (const particle of particles) {
      const node = nodeById.get(particle.id);
      if (!node) continue;
      node.position = {
        x: Math.round(coordinate(particle.x) - particle.w / 2),
        y: Math.round(coordinate(particle.y) - particle.h / 2),
      };
    }
  }

  return updated;
};
