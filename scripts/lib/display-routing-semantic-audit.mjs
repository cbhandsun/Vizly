const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 500;
const boundedNumber = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 10_000_000;

export const assertDisplayRoutingLaneDimensions = (direction, lanes) => {
  if (!['TB', 'BT', 'LR', 'RL'].includes(direction) || !Array.isArray(lanes)
    || lanes.length === 0 || lanes.length > 5000) throw new Error('Invalid lane dimension audit input');
  const dimension = direction === 'LR' || direction === 'RL' ? 'width' : 'height';
  const ids = new Set();
  const groups = new Map();
  for (const lane of lanes) {
    if (!isRecord(lane) || !validId(lane.id) || ids.has(lane.id)
      || typeof lane.parentId !== 'string' || lane.parentId.length > 500
      || !boundedNumber(lane.width) || !boundedNumber(lane.height)
      || lane.width <= 0 || lane.height <= 0) throw new Error('Missing or invalid rendered lane geometry');
    ids.add(lane.id);
    const group = groups.get(lane.parentId) ?? [];
    group.push(lane[dimension]);
    groups.set(lane.parentId, group);
  }
  let comparedGroups = 0;
  for (const values of groups.values()) {
    if (values.length < 2) continue;
    comparedGroups += 1;
    // DOM rectangles are measured in CSS pixels; allow subpixel rounding only.
    if (Math.max(...values) - Math.min(...values) > 0.5) throw new Error(`Unequal sibling lane ${dimension}`);
  }
  return { status: 'passed', dimension, laneCount: lanes.length, comparedGroups };
};

export const readDisplayRoutingLaneDimensions = () => {
  const elements = new Map([...document.querySelectorAll('.react-flow__node[data-id]')]
    .map(element => [element.getAttribute('data-id'), element]));
  return (window.reactFlowInstance?.getNodes?.() ?? [])
    .filter(node => node.type === 'titleGroup' && node.hidden !== true && node.data?.hidden !== true)
    .map(node => {
      const rect = elements.get(node.id)?.getBoundingClientRect();
      return { id: node.id, parentId: node.parentId ?? '', width: rect?.width ?? null, height: rect?.height ?? null };
    });
};

/** Explicit business chains, not every directed edge: feedback remains legal. */
export const assertDisplayRoutingSemanticFlow = ({ direction, chains, nodes, edges, appliedMode = 'global' }) => {
  if (!['TB', 'BT', 'LR', 'RL'].includes(direction)
    || !['global', 'compact'].includes(appliedMode)
    || !Array.isArray(chains) || chains.length === 0 || chains.length > 64
    || chains.some(chain => !Array.isArray(chain) || chain.length < 2 || chain.length > 64
      || !chain.every(validId) || new Set(chain).size !== chain.length)
    || !Array.isArray(nodes) || nodes.length === 0 || nodes.length > 5000
    || !Array.isArray(edges) || edges.length === 0 || edges.length > 5000) {
    throw new Error('Invalid semantic flow audit input');
  }
  const nodeById = new Map();
  for (const node of nodes) {
    if (!isRecord(node) || !validId(node.id) || nodeById.has(node.id)
      || ![node.x, node.y, node.width, node.height].every(boundedNumber)
      || node.width <= 0 || node.height <= 0
      || (node.domain !== undefined && (typeof node.domain !== 'string' || node.domain.length > 500))) {
      throw new Error('Invalid semantic flow node geometry');
    }
    nodeById.set(node.id, node);
  }
  const successors = new Map();
  for (const edge of edges) {
    if (!isRecord(edge) || !validId(edge.source) || !validId(edge.target)) {
      throw new Error('Invalid semantic flow edge');
    }
    const targets = successors.get(edge.source) ?? new Set();
    targets.add(edge.target);
    successors.set(edge.source, targets);
  }
  const horizontal = direction === 'LR' || direction === 'RL';
  const reverse = direction === 'BT' || direction === 'RL';
  const axis = horizontal ? 'x' : 'y';
  const dimension = horizontal ? 'width' : 'height';
  const crossAxis = horizontal ? 'y' : 'x';
  const crossDimension = horizontal ? 'height' : 'width';
  let checkedStepCount = 0;
  let minimumForwardGap = Infinity;
  const stepDiagnostics = [];
  let crossDomainStepCount = 0;
  let backtrackCount = 0;
  for (const [chainIndex, chain] of chains.entries()) {
    for (let step = 1; step < chain.length; step += 1) {
      const source = nodeById.get(chain[step - 1]);
      const target = nodeById.get(chain[step]);
      if (!source || !target || !successors.get(source.id)?.has(target.id)) {
        throw new Error(`Semantic flow chain ${chainIndex} step ${step} is missing`);
      }
      // Actual rendered rectangles, so parent offsets and viewport zoom are
      // already accounted for; a correct Worker request alone cannot pass.
      const crossDomain = source.domain && target.domain && source.domain !== target.domain;
      const forwardGap = reverse
        ? source[axis] - target[axis] - target[dimension]
        : target[axis] - source[axis] - source[dimension];
      const perpendicularGap = crossDomain
        ? Math.max(
          target[crossAxis] - source[crossAxis] - source[crossDimension],
          source[crossAxis] - target[crossAxis] - target[crossDimension],
        )
        : null;
      const backtrack = forwardGap < 0;
      const passes = crossDomain && appliedMode === 'compact'
        ? perpendicularGap > 0
        : forwardGap > 0;
      if (!passes) {
        throw new Error(`Semantic flow chain ${chainIndex} step ${step} contradicts ${direction}`);
      }
      checkedStepCount += 1;
      if (forwardGap > 0) minimumForwardGap = Math.min(minimumForwardGap, forwardGap);
      if (crossDomain) crossDomainStepCount += 1;
      if (backtrack) backtrackCount += 1;
      stepDiagnostics.push({ chainIndex, step, sourceId: source.id, targetId: target.id,
        forwardGap, crossDomain: Boolean(crossDomain), backtrack });
    }
  }
  return {
    status: 'passed', direction, appliedMode, chainCount: chains.length, checkedStepCount,
    minimumForwardGap: Number.isFinite(minimumForwardGap) ? minimumForwardGap : null,
    stepDiagnostics,
    summary: { stepCount: checkedStepCount, crossDomainStepCount, backtrackCount },
  };
};

export const readDisplayRoutingSemanticNodes = () => (
  (() => {
    const modelNodes = window.reactFlowInstance?.getNodes?.() ?? [];
    const domainById = new Map(modelNodes.map(node => [
      node.id,
      typeof node.data?.domain === 'string' ? node.data.domain : '',
    ]));
    return [...document.querySelectorAll('.react-flow__node[data-id]')].map(element => {
      const rect = element.getBoundingClientRect();
      const id = element.getAttribute('data-id');
      return { id, domain: domainById.get(id) ?? '', x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
  })()
);

export const auditDisplayRoutingLayoutSemantics = async (session, layoutCase, chains) => {
  if (!layoutCase.id.startsWith('domain-lanes-')) return { status: 'not-applicable' };
  const appliedMode = await session.evaluate(`document.querySelector(
    '[data-flowchart-lane-rank-applied]'
  )?.getAttribute('data-flowchart-lane-rank-applied')`);
  if (appliedMode !== 'global' && appliedMode !== 'compact') {
    throw new Error('Semantic lane ranking has no committed applied mode');
  }
  const nodes = await session.evaluate(`(${readDisplayRoutingSemanticNodes.toString()})()`);
  const edges = await session.evaluate(`window.reactFlowInstance?.getEdges?.().map(edge => ({
    source: edge.source, target: edge.target,
  }))`);
  const semantic = assertDisplayRoutingSemanticFlow({
    direction: layoutCase.id.slice('domain-lanes-'.length).toUpperCase(), appliedMode, chains, nodes, edges,
  });
  const lanes = await session.evaluate(`(${readDisplayRoutingLaneDimensions.toString()})()`);
  return { ...semantic, laneDimensions: assertDisplayRoutingLaneDimensions(semantic.direction, lanes) };
};
