import type { Node as ReactFlowNode } from '@xyflow/react';

export type DomainVerticalNodeLayout =
  | 'grid'
  | 'horizontal'
  | 'vertical'
  | 'centered'
  | 'dagre';

export type DomainSubOrder =
  | readonly string[]
  | Readonly<Record<string, readonly string[]>>
  | undefined;

interface VisibilityOptions {
  domainWhitelist?: unknown;
  subDomainWhitelist?: unknown;
  generateDomainGroups?: unknown;
  generateSubDomainGroups?: unknown;
}

const normalizeSemanticKey = (value: unknown): string =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\u3000|\u00A0/g, '')
    .replace(/\s+/g, '')
    .replace(/[+_-]/g, '');

const trimmedString = (value: unknown): string => String(value ?? '').trim();

const sanitizeWhitelist = (value: unknown): Set<string> | undefined => {
  if (!Array.isArray(value)) return undefined;
  return new Set(
    value
      .filter((entry): entry is string => typeof entry === 'string')
      .map(entry => entry.trim())
      .filter(Boolean),
  );
};

const parseSequence = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const coerceBoolean = (value: unknown): boolean => {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null) return false;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0' || normalized === '') return false;
  return false;
};

const normalizeLayoutName = (value: unknown): DomainVerticalNodeLayout | undefined => {
  const normalized = normalizeSemanticKey(value);
  const byString: Record<string, DomainVerticalNodeLayout> = {
    gridlayout: 'grid',
    grid: 'grid',
    horizontallayout: 'horizontal',
    horizontal: 'horizontal',
    verticallayout: 'vertical',
    vertical: 'vertical',
    centeredlayout: 'centered',
    centered: 'centered',
    dagrelayout: 'dagre',
    dagre: 'dagre',
  };
  return byString[normalized];
};

export const resolveDomainVerticalNodeLayout = (
  requestedLayout: unknown,
  configuredLayout?: unknown,
): DomainVerticalNodeLayout =>
  normalizeLayoutName(requestedLayout)
  ?? normalizeLayoutName(configuredLayout)
  ?? 'horizontal';

/**
 * Applies container visibility at the external options boundary.
 *
 * Every returned node and data object is cloned. Hidden subgroup membership is
 * then propagated to child nodes without mutating caller-owned input.
 */
export const applyDomainVerticalVisibility = (
  nodes: readonly ReactFlowNode[],
  options: VisibilityOptions,
): ReactFlowNode[] => {
  const domainWhitelist = sanitizeWhitelist(options.domainWhitelist);
  const subDomainWhitelist = sanitizeWhitelist(options.subDomainWhitelist);
  const showDomains = coerceBoolean(options.generateDomainGroups);
  const showSubDomains = coerceBoolean(options.generateSubDomainGroups);

  const preparedNodes = nodes.map(node => {
    const clone = {
      ...node,
      data: { ...((node.data as Record<string, unknown> | undefined) ?? {}) },
    } as ReactFlowNode;
    const data = clone.data as Record<string, unknown>;
    const type = trimmedString(node.type);

    if (type === 'subGroup') {
      const key = trimmedString(data.description || data.subDomain || clone.id);
      data.hidden = !(
        showSubDomains
        && (!subDomainWhitelist || subDomainWhitelist.has(key))
      );
    } else if (type === 'titleGroup') {
      const domainKey = trimmedString(data.domain);
      data.hidden = !(
        showDomains
        && (!domainWhitelist || domainWhitelist.has(domainKey))
      );
      data.anchorLocked = true;
    } else if (type === 'domain' || type === 'group') {
      data.anchorLocked = true;
    }

    return clone;
  });

  const nodeById = new Map(preparedNodes.map(node => [String(node.id), node] as const));
  for (const subgroup of preparedNodes) {
    if (subgroup.type !== 'subGroup' || !(subgroup.data as Record<string, unknown>)?.hidden) {
      continue;
    }
    const children = (subgroup.data as Record<string, unknown>)?.children;
    if (!Array.isArray(children)) continue;
    for (const childId of children) {
      const child = nodeById.get(String(childId));
      if (!child) continue;
      child.data = {
        ...((child.data as Record<string, unknown> | undefined) ?? {}),
        hidden: true,
      };
    }
  }

  return preparedNodes;
};

export const collectDomainVerticalDomainOrder = (
  nodes: readonly ReactFlowNode[],
  configuredOrder: unknown,
): string[] => {
  const orderedDomains = new Set<string>();
  const source = Array.isArray(configuredOrder) && configuredOrder.length > 0
    ? configuredOrder
    : nodes.map(node => (node.data as Record<string, unknown> | undefined)?.domain);

  for (const value of source) {
    if (typeof value !== 'string') continue;
    const domain = value.trim();
    if (domain) orderedDomains.add(domain);
  }
  return [...orderedDomains];
};

export const collectOrderedDomainSubGroups = (
  nodes: readonly ReactFlowNode[],
  domainKey: unknown,
  orderKey: (node: ReactFlowNode) => number,
): ReactFlowNode[] => {
  const normalizedDomain = trimmedString(domainKey);
  if (!normalizedDomain) return [];
  const originalIndex = new Map(
    nodes.map((node, index) => [node.id, index] as const),
  );
  return nodes
    .filter(node =>
      node.type === 'subGroup'
      && trimmedString(
        (node.data as Record<string, unknown> | undefined)?.domain,
      ) === normalizedDomain)
    .slice()
    .sort((left, right) => {
      const leftOrder = orderKey(left);
      const rightOrder = orderKey(right);
      if (leftOrder !== rightOrder) {
        if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder)) {
          return leftOrder - rightOrder;
        }
        if (Number.isFinite(leftOrder)) return -1;
        if (Number.isFinite(rightOrder)) return 1;
      }
      return (originalIndex.get(left.id) ?? Number.POSITIVE_INFINITY)
        - (originalIndex.get(right.id) ?? Number.POSITIVE_INFINITY);
    });
};

const findSemanticIndex = (values: readonly string[], key: string): number => {
  const exactIndex = values.indexOf(key);
  if (exactIndex >= 0) return exactIndex;
  const normalizedKey = normalizeSemanticKey(key);
  return values.findIndex(value => normalizeSemanticKey(value) === normalizedKey);
};

const resolveExplicitSubDomainIndex = (
  order: DomainSubOrder,
  domainKey: string,
  subDomainKey: string,
): number => {
  if (Array.isArray(order)) {
    const index = findSemanticIndex(order.filter(
      (value): value is string => typeof value === 'string',
    ), subDomainKey);
    return index >= 0 ? index : Number.POSITIVE_INFINITY;
  }
  if (!order || typeof order !== 'object') return Number.POSITIVE_INFINITY;

  let entries: [string, readonly string[]][];
  try {
    entries = Object.entries(order) as [string, readonly string[]][];
  } catch {
    return Number.POSITIVE_INFINITY;
  }
  const exact = entries.find(([key]) => key === domainKey);
  const semantic = exact ?? entries.find(
    ([key]) => normalizeSemanticKey(key) === normalizeSemanticKey(domainKey),
  );
  const values = semantic?.[1];
  if (!Array.isArray(values)) return Number.POSITIVE_INFINITY;
  const index = findSemanticIndex(values.filter(
    (value): value is string => typeof value === 'string',
  ), subDomainKey);
  return index >= 0 ? index : Number.POSITIVE_INFINITY;
};

export const createDomainVerticalOrderKey = (
  originalNodes: readonly ReactFlowNode[],
  subDomainOrder: DomainSubOrder,
): ((node: ReactFlowNode) => number) => {
  const originalIndex = new Map(
    originalNodes.map((node, index) => [String(node.id), index] as const),
  );

  const firstSubDomainIndex = (domainKey: string, subDomainKey: string): number => {
    for (let index = 0; index < originalNodes.length; index++) {
      const data = originalNodes[index]?.data as Record<string, unknown> | undefined;
      const domain = trimmedString(data?.domain);
      const subDomain = trimmedString(
        data?.subDomain
        ?? data?.subdomain
        ?? (data?.metadata as Record<string, unknown> | undefined)?.subDomain,
      );
      if (domain === domainKey && subDomain === subDomainKey) return index;
    }
    return Number.POSITIVE_INFINITY;
  };

  return (node: ReactFlowNode): number => {
    const data = (node.data as Record<string, unknown> | undefined) ?? {};
    const sequence = parseSequence(data.sequence ?? data.order);

    if (node.type === 'subGroup') {
      const domainKey = trimmedString(data.domain);
      const subDomainKey = trimmedString(data.description || data.subDomain || node.id);
      const explicitIndex = resolveExplicitSubDomainIndex(
        subDomainOrder,
        domainKey,
        subDomainKey,
      );
      if (Number.isFinite(explicitIndex)) return explicitIndex - 200_000;
      if (sequence !== undefined) return sequence - 100_000;

      const children = Array.isArray(data.children) ? data.children : [];
      let childIndex = Number.POSITIVE_INFINITY;
      for (const childId of children) {
        const index = originalIndex.get(String(childId));
        if (index !== undefined) childIndex = Math.min(childIndex, index);
      }
      if (Number.isFinite(childIndex)) return childIndex;
      return firstSubDomainIndex(domainKey, subDomainKey);
    }

    if (sequence !== undefined) return sequence - 100_000;
    return originalIndex.get(String(node.id)) ?? Number.POSITIVE_INFINITY;
  };
};
