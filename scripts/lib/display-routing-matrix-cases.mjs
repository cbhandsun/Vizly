const MAX_MATRIX_CASE_ID_LENGTH = 128;

export const DISPLAY_ROUTING_TOPOLOGY_CASE_ID = 'topology-edit-cycle';

export const DISPLAY_ROUTING_LAYOUT_CASES = Object.freeze([
  Object.freeze({ id: 'domain-compound-elk-tb', label: '复杂流程（保留域·上→下）' }),
  Object.freeze({ id: 'domain-compound-elk-bt', label: '复杂流程（保留域·下→上）' }),
  Object.freeze({ id: 'domain-compound-elk-lr', label: '复杂流程（保留域·左→右）' }),
  Object.freeze({ id: 'domain-compound-elk-rl', label: '复杂流程（保留域·右→左）' }),
  Object.freeze({ id: 'domain-lanes-tb', label: '循环流程泳道（上→下）' }),
  Object.freeze({ id: 'domain-lanes-bt', label: '循环流程泳道（下→上）' }),
  Object.freeze({ id: 'domain-lanes-lr', label: '循环流程泳道（左→右）' }),
  Object.freeze({ id: 'domain-lanes-rl', label: '循环流程泳道（右→左）' }),
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
