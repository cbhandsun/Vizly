import type { Node } from '@xyflow/react';

const MAX_SEMANTIC_KEY_LENGTH = 200;

export const normalizeDomainSemanticKey = (value: unknown): string => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length === 0 || text.length > MAX_SEMANTIC_KEY_LENGTH) return '';
  return text
    .toLowerCase()
    .replace(/[\u3000\u00A0\s]+/g, '')
    .replace(/[+_-]/g, '')
    .replace(/[()（）【】[\]{}〈〉<>，、。：:；;．。！!？?]/g, '');
};

/** Auto-generated subgroups with the same semantic key as their domain add
 * no hierarchy. Existing authored subgroup nodes remain untouched. */
export const isDomainAliasSubDomain = (domain: unknown, subDomain: unknown): boolean => {
  const domainKey = normalizeDomainSemanticKey(domain);
  return domainKey.length > 0 && domainKey === normalizeDomainSemanticKey(subDomain);
};

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const isLayoutGeneratedSubGroup = (node: Node): boolean => {
  if (node.type !== 'subGroup' || node.draggable !== false) return false;
  const domain = text(node.data.domain);
  const subDomain = text(node.data.subDomain ?? node.data.subdomain);
  if (!isDomainAliasSubDomain(domain, subDomain)) return false;
  if (node.data.layoutGenerated === 'subdomain') return true;
  const legacyId = `subgroup-${domain}-${subDomain}`;
  const semanticId = `subGroup__${normalizeDomainSemanticKey(domain)}__${normalizeDomainSemanticKey(subDomain)}`;
  return node.id === legacyId || node.id.startsWith(`${legacyId}:`)
    || node.id === semanticId || node.id.startsWith(`${semanticId}__`);
};

/** Removes only auto-generated domain aliases and detaches any legacy child
 * references. Distinct and authored subgroup containers remain intact. */
export const collapseGeneratedDomainAliasSubGroups = (nodes: readonly Node[]): Node[] => {
  const visibleDomainKeys = new Set(nodes.flatMap(node => (
    node.type === 'titleGroup' && node.hidden !== true && node.data.hidden !== true
      ? [normalizeDomainSemanticKey(node.data.domain)] : []
  )));
  const removedIds = new Set(nodes.filter(node => isLayoutGeneratedSubGroup(node)
    && visibleDomainKeys.has(normalizeDomainSemanticKey(node.data.domain))).map(node => node.id));
  if (removedIds.size === 0) return nodes.slice();
  return nodes.flatMap(node => {
    if (removedIds.has(node.id)) return [];
    if (!node.parentId || !removedIds.has(node.parentId)) return [node];
    const { parentId: _parentId, extent: _extent, expandParent: _expandParent, ...detached } = node;
    return [{ ...detached }];
  });
};
