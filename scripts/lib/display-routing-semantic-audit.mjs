const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 500;
const boundedNumber = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 10_000_000;

/** Explicit business chains, not every directed edge: feedback remains legal. */
export const assertDisplayRoutingSemanticFlow = ({ direction, chains, nodes, edges }) => {
  if (!['TB', 'BT', 'LR', 'RL'].includes(direction)
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
      || node.width <= 0 || node.height <= 0) {
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
  let checkedStepCount = 0;
  let minimumForwardGap = Infinity;
  for (const [chainIndex, chain] of chains.entries()) {
    for (let step = 1; step < chain.length; step += 1) {
      const source = nodeById.get(chain[step - 1]);
      const target = nodeById.get(chain[step]);
      if (!source || !target || !successors.get(source.id)?.has(target.id)) {
        throw new Error(`Semantic flow chain ${chainIndex} step ${step} is missing`);
      }
      // Actual rendered rectangles, so parent offsets and viewport zoom are
      // already accounted for; a correct Worker request alone cannot pass.
      const gap = reverse
        ? source[axis] - target[axis] - target[dimension]
        : target[axis] - source[axis] - source[dimension];
      if (gap <= 0) {
        throw new Error(`Semantic flow chain ${chainIndex} step ${step} contradicts ${direction}`);
      }
      checkedStepCount += 1;
      minimumForwardGap = Math.min(minimumForwardGap, gap);
    }
  }
  return { status: 'passed', direction, chainCount: chains.length, checkedStepCount, minimumForwardGap };
};

export const readDisplayRoutingSemanticNodes = () => (
  [...document.querySelectorAll('.react-flow__node[data-id]')].map(element => {
    const rect = element.getBoundingClientRect();
    return { id: element.getAttribute('data-id'), x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  })
);

export const auditDisplayRoutingLayoutSemantics = async (session, layoutCase, chains) => {
  if (!layoutCase.id.startsWith('domain-lanes-')) return { status: 'not-applicable' };
  const nodes = await session.evaluate(`(${readDisplayRoutingSemanticNodes.toString()})()`);
  const edges = await session.evaluate(`window.reactFlowInstance?.getEdges?.().map(edge => ({
    source: edge.source, target: edge.target,
  }))`);
  return assertDisplayRoutingSemanticFlow({
    direction: layoutCase.id.slice('domain-lanes-'.length).toUpperCase(), chains, nodes, edges,
  });
};
