import type { Node } from '@xyflow/react';

export interface Bounds { x: number; y: number; width: number; height: number }
export interface ValidationOptions { padding?: number; minGap?: number }
export interface ValidationViolation {
  type: string;
  id: string;
  info: Record<string, unknown>;
}
export interface ValidationReport {
  domainBounds: Record<string, Bounds>;
  subDomainBounds: Record<string, Bounds>;
  nodeBounds: Record<string, Bounds>;
  violations: ValidationViolation[];
}

const finiteNumber = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

const positiveDimension = (value: unknown, fallback: number): number => (
  Math.max(1, finiteNumber(value, fallback))
);

const dataText = (node: Node, key: 'domain' | 'subDomain'): string | undefined => {
  const value = node.data?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const boundsRecord = (entries: ReadonlyMap<string, Bounds>): Record<string, Bounds> => (
  Object.fromEntries(entries)
);

export function computeNodeBounds(node: Node): Bounds {
  return {
    x: finiteNumber(node.position?.x, 0),
    y: finiteNumber(node.position?.y, 0),
    width: positiveDimension(node.measured?.width ?? node.style?.width ?? node.width, 180),
    height: positiveDimension(node.measured?.height ?? node.style?.height ?? node.height, 80),
  };
}

export function expandBounds(bounds: Bounds, padding: number): Bounds {
  const safePadding = Math.max(0, finiteNumber(padding, 0));
  return {
    x: bounds.x - safePadding,
    y: bounds.y - safePadding,
    width: bounds.width + safePadding * 2,
    height: bounds.height + safePadding * 2,
  };
}

export function unionBounds(list: Bounds[], padding = 0): Bounds {
  if (list.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...list.map(bounds => bounds.x));
  const minY = Math.min(...list.map(bounds => bounds.y));
  const maxX = Math.max(...list.map(bounds => bounds.x + bounds.width));
  const maxY = Math.max(...list.map(bounds => bounds.y + bounds.height));
  return expandBounds({
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  }, padding);
}

export function overlapAmount(a: Bounds, b: Bounds): { dx: number; dy: number } {
  return {
    dx: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
    dy: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  };
}

const appendToMap = <T>(map: Map<string, T[]>, key: string, value: T): void => {
  const entries = map.get(key) ?? [];
  entries.push(value);
  map.set(key, entries);
};

export function validateHierarchy(nodes: Node[], options: ValidationOptions = {}): ValidationReport {
  const padding = Math.max(0, finiteNumber(options.padding, 24));
  const minGap = Math.max(0, finiteNumber(options.minGap, 16));
  const nodeBounds = new Map(nodes.map(node => [node.id, computeNodeBounds(node)] as const));
  const byDomain = new Map<string, Node[]>();
  const bySubDomain = new Map<string, Node[]>();

  for (const node of nodes) {
    const domain = dataText(node, 'domain') ?? 'default';
    const subDomain = dataText(node, 'subDomain');
    appendToMap(byDomain, domain, node);
    if (subDomain) appendToMap(bySubDomain, `${domain}::${subDomain}`, node);
  }

  const subDomainBounds = new Map<string, Bounds>();
  for (const [key, groupedNodes] of bySubDomain) {
    subDomainBounds.set(key, unionBounds(groupedNodes.map(node => nodeBounds.get(node.id)!), padding));
  }

  const domainBounds = new Map<string, Bounds>();
  for (const [domain, groupedNodes] of byDomain) {
    const directBounds = groupedNodes.map(node => nodeBounds.get(node.id)!);
    const nestedBounds = [...subDomainBounds]
      .filter(([key]) => key.startsWith(`${domain}::`))
      .map(([, bounds]) => bounds);
    domainBounds.set(domain, unionBounds([...directBounds, ...nestedBounds], padding));
  }

  const violations: ValidationViolation[] = [];
  for (const [key, groupedNodes] of bySubDomain) {
    const box = subDomainBounds.get(key)!;
    for (const node of groupedNodes) {
      const bounds = nodeBounds.get(node.id)!;
      const outside = bounds.x < box.x || bounds.y < box.y
        || bounds.x + bounds.width > box.x + box.width
        || bounds.y + bounds.height > box.y + box.height;
      if (outside) violations.push({
        type: 'NodeOutsideSubDomain',
        id: node.id,
        info: { subKey: key, node: bounds, sub: box },
      });
    }
  }

  for (const [domain, box] of domainBounds) {
    for (const [key, subBounds] of subDomainBounds) {
      if (!key.startsWith(`${domain}::`)) continue;
      const outside = subBounds.x < box.x || subBounds.y < box.y
        || subBounds.x + subBounds.width > box.x + box.width
        || subBounds.y + subBounds.height > box.y + box.height;
      if (outside) violations.push({
        type: 'SubDomainOutsideDomain',
        id: key,
        info: { domain, sub: subBounds, dom: box },
      });
    }
  }

  const subKeysByDomain = new Map<string, string[]>();
  for (const key of subDomainBounds.keys()) appendToMap(subKeysByDomain, key.split('::')[0], key);
  for (const keys of subKeysByDomain.values()) {
    for (let left = 0; left < keys.length; left++) {
      for (let right = left + 1; right < keys.length; right++) {
        const a = subDomainBounds.get(keys[left])!;
        const b = subDomainBounds.get(keys[right])!;
        const { dx, dy } = overlapAmount(a, b);
        if (dx > -minGap && dy > -minGap) violations.push({
          type: 'SubDomainOverlap',
          id: `${keys[left]}|${keys[right]}`,
          info: { a, b },
        });
      }
    }
  }

  const domains = [...domainBounds.keys()];
  for (let left = 0; left < domains.length; left++) {
    for (let right = left + 1; right < domains.length; right++) {
      const a = domainBounds.get(domains[left])!;
      const b = domainBounds.get(domains[right])!;
      const { dx, dy } = overlapAmount(a, b);
      if (dx > -minGap && dy > -minGap) violations.push({
        type: 'DomainOverlap',
        id: `${domains[left]}|${domains[right]}`,
        info: { a, b },
      });
    }
  }

  return {
    domainBounds: boundsRecord(domainBounds),
    subDomainBounds: boundsRecord(subDomainBounds),
    nodeBounds: boundsRecord(nodeBounds),
    violations,
  };
}

export function analyzeFailureReasons(report: ValidationReport): Array<{ cause: string; count: number; suggestion: string }> {
  const counts = new Map<string, number>();
  report.violations.forEach(violation => counts.set(violation.type, (counts.get(violation.type) ?? 0) + 1));
  return [...counts].map(([cause, count]) => ({
    cause,
    count,
    suggestion: cause === 'DomainOverlap'
      ? '增大域层 spacing 或调整 laneOrder 以减少并列拥挤'
      : cause === 'SubDomainOverlap'
        ? '子域内增加 padding/spacing 或启用行拆分'
        : cause === 'NodeOutsideSubDomain'
          ? '校准子域尺寸计算，确保含内边距，并检查节点位置来源是否正确'
          : '增大域容器 padding 并检查边界计算是否包含子域',
  }));
}
