import type { Node } from '@xyflow/react';

const GROUP_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
const MAX_SEMANTIC_TEXT_LENGTH = 200;
const MAX_CHILDREN = 10_000;
const MAX_GENERATED_SUB_GROUPS = 1_000;

export interface DomainHorizontalVisibilityOptions {
  domainWhitelist?: string[];
  subDomainWhitelist?: string[];
  showDomainGroups: boolean;
  showSubDomainGroups: boolean;
}

const boundedString = (value: unknown): string => (
  typeof value === 'string' ? value.trim().slice(0, MAX_SEMANTIC_TEXT_LENGTH) : ''
);

const asRecord = (value: unknown): Record<string, unknown> | undefined => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
);

const cloneNodes = (nodes: Node[]): Node[] => nodes.map(node => ({
  ...node,
  data: { ...node.data },
}));

const nodeDomain = (node: Node): string => boundedString(node.data.domain);

const nodeSubDomain = (node: Node): string => {
  const metadata = asRecord(node.data.metadata);
  return boundedString(node.data.subDomain ?? node.data.subdomain ?? metadata?.subDomain);
};

const childIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .slice(0, MAX_CHILDREN)
    .map(boundedString)
    .filter(Boolean))];
};

const isGroupNode = (node: Node): boolean => GROUP_TYPES.has(String(node.type || ''));

export const normalizeDomainSemanticKey = (value: unknown, punctuation = false): string => {
  const base = boundedString(value)
    .toLowerCase()
    .replace(/[\u3000\u00A0\s]+/g, '')
    .replace(/[+_-]/g, '');
  return punctuation
    ? base.replace(/[()（）【】[\]{}〈〉<>，、。：:；;．。！!？?]/g, '')
    : base;
};

export const applyDomainHorizontalGroupVisibility = (
  nodes: Node[],
  options: DomainHorizontalVisibilityOptions,
): Node[] => {
  const result = cloneNodes(nodes);
  const domainWhitelist = options.domainWhitelist
    ? new Set(options.domainWhitelist.map(boundedString).filter(Boolean))
    : undefined;
  const subDomainWhitelist = options.subDomainWhitelist
    ? new Set(options.subDomainWhitelist.map(boundedString).filter(Boolean))
    : undefined;

  for (const node of result) {
    const type = String(node.type || '');
    if (type === 'subGroup') {
      const key = nodeSubDomain(node);
      node.data.hidden = !(options.showSubDomainGroups
        && (subDomainWhitelist ? subDomainWhitelist.has(key) : true));
    } else if (type === 'titleGroup') {
      const domain = nodeDomain(node);
      node.data.hidden = !(options.showDomainGroups
        && (domainWhitelist ? domainWhitelist.has(domain) : true));
      node.data.anchorLocked = true;
    } else if (type === 'domain' || type === 'group') {
      node.data.anchorLocked = true;
    }
  }

  const nodeById = new Map(result.map(node => [node.id, node]));
  for (const group of result) {
    if (String(group.type || '') !== 'subGroup' || group.data.hidden !== true) continue;
    for (const childId of childIds(group.data.children)) {
      const child = nodeById.get(childId);
      if (child) child.data.hidden = true;
    }
  }
  return result;
};

export const injectSemanticSubGroupsForMissingKeys = (nodes: Node[]): Node[] => {
  const result = cloneNodes(nodes);
  const semanticKeysByDomain = new Map<string, Set<string>>();
  const existingKeysByDomain = new Map<string, Set<string>>();
  const existingIds = new Set(result.map(node => node.id));

  for (const node of result) {
    const domain = nodeDomain(node);
    if (!domain) continue;
    const semanticKeys = semanticKeysByDomain.get(domain) ?? new Set<string>();
    semanticKeysByDomain.set(domain, semanticKeys);
    if (String(node.type || '') === 'subGroup') {
      const existing = existingKeysByDomain.get(domain) ?? new Set<string>();
      existing.add(normalizeDomainSemanticKey(nodeSubDomain(node), true));
      existingKeysByDomain.set(domain, existing);
    } else if (!isGroupNode(node)) {
      const key = normalizeDomainSemanticKey(nodeSubDomain(node), true);
      if (key) semanticKeys.add(key);
    }
  }

  let generatedCount = 0;
  for (const [domain, semanticKeys] of semanticKeysByDomain) {
    const existing = existingKeysByDomain.get(domain) ?? new Set<string>();
    for (const key of semanticKeys) {
      if (existing.has(key) || generatedCount >= MAX_GENERATED_SUB_GROUPS) continue;
      const baseId = `subGroup__${normalizeDomainSemanticKey(domain)}__${key}`;
      let id = baseId;
      let suffix = 2;
      while (existingIds.has(id) && suffix <= MAX_GENERATED_SUB_GROUPS) {
        id = `${baseId}__${suffix}`;
        suffix += 1;
      }
      if (existingIds.has(id)) continue;
      existingIds.add(id);
      existing.add(key);
      generatedCount += 1;
      result.push({
        id,
        type: 'subGroup',
        position: { x: 0, y: 0 },
        data: { domain, subDomain: key, description: key, children: [] },
        style: { width: 0, height: 0 },
        measured: { width: 0, height: 0 },
        draggable: false,
      });
    }
  }
  return result;
};

export const rebindDomainHorizontalChildren = (nodes: Node[]): Node[] => {
  const result = cloneNodes(nodes);
  const domainKeys = [...new Set(result.map(nodeDomain).filter(Boolean))];
  const existingIds = new Set(result.map(node => node.id));
  const duplicateGroupIds = new Set<string>();

  for (const domain of domainKeys) {
    const groupsByKey = new Map<string, Node>();
    for (const group of result.filter(node => String(node.type || '') === 'subGroup' && nodeDomain(node) === domain)) {
      const key = normalizeDomainSemanticKey(nodeSubDomain(group) || domain, true);
      const existing = groupsByKey.get(key);
      if (existing) {
        duplicateGroupIds.add(group.id);
      } else {
        groupsByKey.set(key, group);
      }
    }
    const buckets = new Map<string, string[]>();
    for (const node of result) {
      if (isGroupNode(node) || nodeDomain(node) !== domain) continue;
      const key = normalizeDomainSemanticKey(nodeSubDomain(node), true)
        || normalizeDomainSemanticKey(domain, true);
      const ids = buckets.get(key) ?? [];
      ids.push(node.id);
      buckets.set(key, ids);
    }
    for (const group of groupsByKey.values()) {
      const key = normalizeDomainSemanticKey(nodeSubDomain(group) || domain, true);
      group.data.children = [...new Set((buckets.get(key) ?? []).filter(id => existingIds.has(id)))];
      group.data.domain = domain;
    }
  }
  return result.filter(node => !duplicateGroupIds.has(node.id));
};
