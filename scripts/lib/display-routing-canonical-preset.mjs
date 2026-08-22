const MAX_PRESET_ELEMENTS = 5_000;
const MAX_ID_LENGTH = 500;

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);

const parseIds = (value, field) => {
  if (!Array.isArray(value) || value.length > MAX_PRESET_ELEMENTS) {
    throw new Error(`Canonical preset ${field} must be a bounded array`);
  }
  const ids = value.map((item, index) => {
    const id = isRecord(item) && typeof item.id === 'string' ? item.id.trim() : '';
    if (!id || id.length > MAX_ID_LENGTH) {
      throw new Error(`Canonical preset ${field}[${index}] has an invalid id`);
    }
    return id;
  });
  if (new Set(ids).size !== ids.length) throw new Error(`Canonical preset ${field} contains duplicate ids`);
  return ids.sort();
};

export const parseCanonicalPresetIdentity = (value, expectedPresetId) => {
  if (!isRecord(value) || typeof expectedPresetId !== 'string' || value.id !== expectedPresetId) {
    throw new Error('Canonical preset id does not match the active route');
  }
  return {
    presetId: expectedPresetId,
    nodeIds: parseIds(value.nodes, 'nodes'),
    edgeIds: parseIds(value.edges, 'edges'),
  };
};

const readObservedIds = (value, field) => parseIds(value, field);

const missingIds = (expected, actual) => {
  const actualSet = new Set(actual);
  return expected.filter(id => !actualSet.has(id));
};

export const verifyCanonicalPresetMount = ({
  identity,
  requestNodes,
  requestEdges,
  mountedNodes,
  mountedEdges,
}) => {
  if (!isRecord(identity) || typeof identity.presetId !== 'string') {
    throw new Error('Canonical preset identity is malformed');
  }
  const requestNodeIds = readObservedIds(requestNodes, 'requestNodes');
  const requestEdgeIds = readObservedIds(requestEdges, 'requestEdges');
  const mountedNodeIds = readObservedIds(mountedNodes, 'mountedNodes');
  const mountedEdgeIds = readObservedIds(mountedEdges, 'mountedEdges');
  const misses = {
    requestNodes: missingIds(identity.nodeIds, requestNodeIds),
    requestEdges: missingIds(identity.edgeIds, requestEdgeIds),
    mountedNodes: missingIds(identity.nodeIds, mountedNodeIds),
    mountedEdges: missingIds(identity.edgeIds, mountedEdgeIds),
  };
  if (Object.values(misses).some(ids => ids.length > 0)) {
    throw new Error(`Canonical preset mount identity mismatch: ${JSON.stringify(misses)}`);
  }
  if (requestEdgeIds.length !== identity.edgeIds.length || mountedEdgeIds.length !== identity.edgeIds.length) {
    throw new Error('Canonical preset mount contains unexpected logical edges');
  }
  return {
    presetId: identity.presetId,
    sourceNodeCount: identity.nodeIds.length,
    sourceEdgeCount: identity.edgeIds.length,
    mountedNodeCount: mountedNodeIds.length,
    mountedEdgeCount: mountedEdgeIds.length,
  };
};
