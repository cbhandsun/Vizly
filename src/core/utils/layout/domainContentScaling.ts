import type { Node as ReactFlowNode } from '@xyflow/react';

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

const boundedNumber = (
  value: unknown,
  fallback: number,
  minimum = -100_000,
  maximum = 100_000,
): number => {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, numeric));
};

const boundedDimension = (value: unknown, fallback = 0): number => (
  boundedNumber(value, fallback, 0, 100_000)
);

const nodeWidth = (node: ReactFlowNode): number => boundedDimension(
  node.measured?.width ?? node.style?.width ?? node.width,
);

const nodeHeight = (node: ReactFlowNode): number => boundedDimension(
  node.measured?.height ?? node.style?.height ?? node.height,
);

const domainId = (node: ReactFlowNode): string => String(asRecord(node.data).domain || '');

const isVisibleDomainMember = (node: ReactFlowNode, expectedDomainId: string): boolean => (
  domainId(node) === expectedDomainId
  && String(node.type || '') !== 'titleGroup'
  && asRecord(node.data).hidden !== true
);

export interface ScaleDomainContentOptions {
  syncLegacyWidth?: boolean;
}

export const scaleDomainContentToFitWidthWithConfig = (
  nodes: ReactFlowNode[],
  config: unknown,
  options: ScaleDomainContentOptions = {},
): ReactFlowNode[] => {
  const horizontalPadding = boundedDimension(
    nestedValue(config, 'domain', 'padding', 'horizontal'),
    24,
  );
  const sideSafeGap = boundedDimension(
    nestedValue(config, 'domain', 'sideSafeGap'),
    8,
  );
  const updated = nodes.map(node => ({
    ...node,
    position: {
      x: boundedNumber(node.position?.x, 0),
      y: boundedNumber(node.position?.y, 0),
    },
    style: node.style ? { ...node.style } : node.style,
    measured: node.measured ? { ...node.measured } : node.measured,
  }));

  for (const domain of updated.filter(node => String(node.type || '') === 'titleGroup')) {
    const id = domainId(domain);
    if (!id) continue;

    const innerLeft = domain.position.x + horizontalPadding + sideSafeGap;
    const availableWidth = Math.max(
      0,
      nodeWidth(domain) - 2 * horizontalPadding - 2 * sideSafeGap,
    );
    if (availableWidth <= 0) continue;

    const members = updated.filter(node => isVisibleDomainMember(node, id));
    if (!members.length) continue;

    const contentMinLeft = Math.min(...members.map(node => node.position.x));
    const contentMaxRight = Math.max(
      ...members.map(node => node.position.x + nodeWidth(node)),
    );
    const contentWidth = contentMaxRight - contentMinLeft;
    if (!Number.isFinite(contentWidth) || contentWidth <= 0) continue;

    const scale = availableWidth / contentWidth;
    if (!Number.isFinite(scale) || scale <= 0) continue;

    for (const member of members) {
      const width = Math.max(1, Math.round(nodeWidth(member) * scale));
      member.position = {
        x: Math.round(innerLeft + (member.position.x - contentMinLeft) * scale),
        y: member.position.y,
      };
      member.style = { ...member.style, width };
      member.measured = { width, height: nodeHeight(member) };
      if (options.syncLegacyWidth) member.width = width;
    }
  }

  return updated;
};
