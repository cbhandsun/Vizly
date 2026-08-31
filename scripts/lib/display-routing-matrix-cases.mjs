const MAX_MATRIX_CASE_ID_LENGTH = 128;

export const displayRoutingLayoutSelectionMatches = (requestedLabel, appliedLabel) => {
  const normalize = value => typeof value === 'string' && value.length <= 1024
    ? value.replace(/\s+/g, ' ').trim()
    : '';
  const requested = normalize(requestedLabel);
  const applied = normalize(appliedLabel);
  return requested.length > 0 && applied.includes(requested);
};

export const DISPLAY_ROUTING_TOPOLOGY_CASE_ID = 'topology-edit-cycle';

export const DISPLAY_ROUTING_LAYOUT_CASES = Object.freeze([
  Object.freeze({ id: 'domain-compound-elk-tb', label: '复杂流程（保留域·上→下）' }),
  Object.freeze({ id: 'domain-compound-elk-bt', label: '复杂流程（保留域·下→上）' }),
  Object.freeze({ id: 'domain-compound-elk-lr', label: '复杂流程（保留域·左→右）' }),
  Object.freeze({ id: 'domain-compound-elk-rl', label: '复杂流程（保留域·右→左）' }),
  Object.freeze({ id: 'domain-lanes-tb', label: '泳道 · 域左右并列（域内上→下）' }),
  Object.freeze({ id: 'domain-lanes-bt', label: '泳道 · 域左右并列（域内下→上）' }),
  Object.freeze({ id: 'domain-lanes-lr', label: '泳道 · 域上下堆叠（域内左→右）' }),
  Object.freeze({ id: 'domain-lanes-rl', label: '泳道 · 域上下堆叠（域内右→左）' }),
  Object.freeze({ id: 'domain-elk-tb', label: '全图正交分层（上→下）' }),
  Object.freeze({ id: 'domain-elk-bt', label: '全图正交分层（下→上）' }),
  Object.freeze({ id: 'domain-elk-lr', label: '全图正交分层（左→右）' }),
  Object.freeze({ id: 'domain-elk-rl', label: '全图正交分层（右→左）' }),
  Object.freeze({ id: 'tree-tb', label: '↕ 树形 (上→下)' }),
  Object.freeze({ id: 'tree-bt', label: '↥ 树形 (下→上)' }),
  Object.freeze({ id: 'tree-lr', label: '↔ 树形 (左→右)' }),
  Object.freeze({ id: 'tree-rl', label: '↔ 树形 (右→左)' }),
]);

export const createDisplayRoutingMatrixCaseIds = presetIds => new Set([
  ...presetIds,
  ...DISPLAY_ROUTING_LAYOUT_CASES.map(layoutCase => layoutCase.id),
  DISPLAY_ROUTING_TOPOLOGY_CASE_ID,
]);

export const parseDisplayRoutingMatrixCase = (rawValue, knownCaseIds) => {
  if (typeof rawValue !== 'string') return '';
  const candidate = rawValue.trim();
  if (!candidate) return '';
  if (candidate.length > MAX_MATRIX_CASE_ID_LENGTH || !knownCaseIds.has(candidate)) {
    throw new Error('Unknown DISPLAY_ROUTING_MATRIX_CASE');
  }
  return candidate;
};

export const parseDisplayRoutingMatrixPreset = (rawValue, knownPresetIds, fallbackPresetId) => {
  const candidate = typeof rawValue === 'string' ? rawValue.trim() : '';
  const selected = candidate || fallbackPresetId;
  if (
    typeof selected !== 'string'
    || selected.length === 0
    || selected.length > MAX_MATRIX_CASE_ID_LENGTH
    || !knownPresetIds.has(selected)
  ) {
    throw new Error('Unknown DISPLAY_ROUTING_MATRIX_PRESET');
  }
  return selected;
};

export const parseDisplayRoutingMatrixTimeoutMs = (rawValue, fallbackMs = 120_000) => {
  if (rawValue === undefined || rawValue === null || rawValue === '') return fallbackMs;
  const candidate = typeof rawValue === 'number' ? rawValue : Number(String(rawValue).trim());
  if (!Number.isSafeInteger(candidate) || candidate < 1_000 || candidate > 120_000) {
    throw new Error('Invalid DISPLAY_ROUTING_MATRIX_WAIT_TIMEOUT_MS');
  }
  return candidate;
};

export const parseDisplayRoutingMatrixCaseList = (
  rawValue,
  knownCaseIds,
  maximumCases = 8,
) => {
  if (rawValue === undefined || rawValue === null || rawValue === '') return [];
  if (typeof rawValue !== 'string' || rawValue.length > 1_024) {
    throw new Error('Invalid DISPLAY_ROUTING_MATRIX_WARM_CASES');
  }
  const candidates = rawValue.split(',').map(value => value.trim()).filter(Boolean);
  if (
    candidates.length === 0
    || candidates.length > maximumCases
    || new Set(candidates).size !== candidates.length
    || candidates.some(candidate => (
      candidate.length > MAX_MATRIX_CASE_ID_LENGTH || !knownCaseIds.has(candidate)
    ))
  ) throw new Error('Invalid DISPLAY_ROUTING_MATRIX_WARM_CASES');
  return candidates;
};

export const findDisplayRoutingMenuElementByKey = (elements, rawKey) => {
  if (typeof rawKey !== 'string' || rawKey.length === 0 || rawKey.length > 128) {
    return null;
  }
  const suffix = `-${rawKey}`;
  return [...elements].find(element => (
    typeof element?.getAttribute === 'function'
    && String(element.getAttribute('data-menu-id') || '').endsWith(suffix)
  )) ?? null;
};

export const resolveDisplayRoutingConnectedDragDelta = (
  nodes,
  edges,
  nodeId,
  distance = 40,
) => {
  const record = value => (
    typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
  );
  const finite = value => (
    typeof value === 'number' && Number.isFinite(value) ? value : null
  );
  const center = (value) => {
    const node = record(value);
    const position = record(node.positionAbsolute ?? node.position);
    const measured = record(node.measured);
    const style = record(node.style);
    const x = finite(position.x);
    const y = finite(position.y);
    const width = finite(measured.width ?? node.width ?? style.width) ?? 0;
    const height = finite(measured.height ?? node.height ?? style.height) ?? 0;
    return x === null || y === null ? null : {
      x: x + Math.max(0, width) / 2,
      y: y + Math.max(0, height) / 2,
    };
  };
  if (
    !Array.isArray(nodes)
    || !Array.isArray(edges)
    || typeof nodeId !== 'string'
    || nodeId.length === 0
    || nodeId.length > 256
  ) return null;
  const safeDistance = Number.isFinite(distance)
    ? Math.max(1, Math.min(200, Math.round(Math.abs(distance))))
    : 40;
  const nodeById = new Map(nodes.flatMap(value => {
    const node = record(value);
    return typeof node.id === 'string' && node.id.length <= 256 ? [[node.id, value]] : [];
  }));
  const origin = center(nodeById.get(nodeId));
  if (!origin) return null;
  const neighborIds = new Set(edges.flatMap(value => {
    const edge = record(value);
    if (edge.source === nodeId && typeof edge.target === 'string') return [edge.target];
    if (edge.target === nodeId && typeof edge.source === 'string') return [edge.source];
    return [];
  }));
  const neighbors = [...neighborIds].flatMap(id => {
    const point = center(nodeById.get(id));
    return point ? [point] : [];
  });
  if (neighbors.length === 0) return null;
  const centroid = neighbors.reduce((total, point) => ({
    x: total.x + point.x / neighbors.length,
    y: total.y + point.y / neighbors.length,
  }), { x: 0, y: 0 });
  const towardX = centroid.x - origin.x;
  const towardY = centroid.y - origin.y;
  if (Math.abs(towardX) >= Math.abs(towardY)) {
    return { x: towardX >= 0 ? -safeDistance : safeDistance, y: 0 };
  }
  return { x: 0, y: towardY >= 0 ? -safeDistance : safeDistance };
};
