import type { Node as ReactFlowNode } from '@xyflow/react';

import { diagramConfigManager } from '../../config/DiagramConfig';

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const nonNegativeNumber = (value: unknown, fallback: number): number => {
  const number = finiteNumber(value, fallback);
  return number >= 0 ? number : fallback;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const nestedRecord = (value: unknown, key: string): Record<string, unknown> =>
  asRecord(asRecord(value)[key]);

const nodeSize = (node: ReactFlowNode): { width: number; height: number } => {
  const nodeRecord = node as unknown as Record<string, unknown>;
  const measured = asRecord(node.measured);
  const style = asRecord(node.style);
  return {
    width: nonNegativeNumber(measured.width ?? style.width ?? nodeRecord.width, 0),
    height: nonNegativeNumber(measured.height ?? style.height ?? nodeRecord.height, 0),
  };
};

/**
 * 将子域和域成员限制在各自容器内部；必要时只扩张容器，不压缩业务节点。
 */
export const clampNodesToContainers = (nodes: ReactFlowNode[]): ReactFlowNode[] => {
  const config = asRecord(diagramConfigManager.getConfig());
  const layoutConfig = asRecord(diagramConfigManager.getLayoutConfig());
  const updated = nodes.map(node => ({
    ...node,
    position: {
      x: finiteNumber(node.position?.x, 0),
      y: finiteNumber(node.position?.y, 0),
    },
  }));
  const idMap = new Map(updated.map(node => [node.id, node] as const));

  const subDomainConfig = nestedRecord(config, 'subDomain');
  const subDomainPadding = nestedRecord(subDomainConfig, 'padding');
  const subPadding = {
    horizontal: nonNegativeNumber(subDomainPadding.horizontal, 25),
    top: nonNegativeNumber(subDomainPadding.top, 35),
    bottom: nonNegativeNumber(subDomainPadding.bottom, 20),
  };
  const ensureTitleClearance = Boolean(layoutConfig.ENSURE_SUB_GROUP_TITLE_CLEARANCE);
  const titleClearance = nonNegativeNumber(layoutConfig.SUB_GROUP_TITLE_CLEARANCE, subPadding.top);
  const horizontalGap = nonNegativeNumber(layoutConfig.NODE_H_GAP, 120);

  for (const subGroup of updated.filter(node => String(node.type || '') === 'subGroup')) {
    const subGroupData = asRecord(subGroup.data);
    const dagreSize = asRecord(subGroupData.__dagreSized);
    if (finiteNumber(dagreSize.h, 0) > 0) continue;

    const position = subGroup.position ?? { x: 0, y: 0 };
    const size = nodeSize(subGroup);
    const localTitleClearance = typeof subGroupData.ensureTitleClearance === 'boolean'
      ? subGroupData.ensureTitleClearance
      : ensureTitleClearance;
    let innerLeft = finiteNumber(position.x, 0) + subPadding.horizontal;
    let innerRight = finiteNumber(position.x, 0) + size.width - subPadding.horizontal;
    const innerTop = finiteNumber(position.y, 0) + (
      localTitleClearance ? Math.max(subPadding.top, titleClearance) : subPadding.top
    );
    let innerBottom = finiteNumber(position.y, 0) + size.height - subPadding.bottom;
    const childIds = Array.isArray(subGroupData.children)
      ? subGroupData.children.filter((id): id is string => typeof id === 'string')
      : [];

    for (const childId of childIds) {
      const child = idMap.get(childId);
      if (!child || Boolean(asRecord(child.data).hidden)) continue;

      const childPosition = child.position ?? { x: 0, y: 0 };
      const childSize = nodeSize(child);
      const totalHorizontalSafety = Math.max(
        Math.floor(horizontalGap * 0.15),
        Math.floor(subPadding.horizontal * 0.5),
      );
      const leftSafety = Math.floor(totalHorizontalSafety / 2);
      const rightSafety = totalHorizontalSafety - leftSafety;

      if (childSize.width > Math.max(0, innerRight - innerLeft)) {
        const width = childSize.width + subPadding.horizontal * 2 + leftSafety + rightSafety;
        const x = finiteNumber(position.x, 0) - leftSafety;
        subGroup.position = { x, y: finiteNumber(position.y, 0) };
        subGroup.style = { ...asRecord(subGroup.style), width };
        subGroup.measured = { ...asRecord(subGroup.measured), width };
        innerLeft = x + subPadding.horizontal;
        innerRight = x + width - subPadding.horizontal;
      }
      if (childSize.height > Math.max(0, innerBottom - innerTop)) {
        const height = childSize.height + subPadding.top + subPadding.bottom;
        subGroup.style = { ...asRecord(subGroup.style), height };
        subGroup.measured = { ...asRecord(subGroup.measured), height };
        innerBottom = finiteNumber(position.y, 0) + height - subPadding.bottom;
      }

      child.position = {
        x: Math.min(
          Math.max(finiteNumber(childPosition.x, 0), innerLeft),
          Math.max(innerLeft, innerRight - rightSafety - childSize.width),
        ),
        y: Math.min(
          Math.max(finiteNumber(childPosition.y, 0), innerTop),
          Math.max(innerTop, innerBottom - childSize.height),
        ),
      };
      const childIndex = updated.findIndex(node => node.id === child.id);
      if (childIndex >= 0) updated[childIndex] = { ...child };
    }
  }

  const domainConfig = nestedRecord(config, 'domain');
  const domainPadding = nestedRecord(domainConfig, 'padding');
  const titleConfig = nestedRecord(domainConfig, 'title');
  const titlePadding = nestedRecord(titleConfig, 'padding');
  const domainPaddingHorizontal = nonNegativeNumber(domainPadding.horizontal, 24);
  const titleHeight = nonNegativeNumber(titleConfig.height, 40);
  const titlePaddingVertical = nonNegativeNumber(titlePadding.vertical, 12);
  const titleSafeGap = nonNegativeNumber(titleConfig.safeGap, 16);
  const bottomSafeGap = nonNegativeNumber(
    domainConfig.bottomSafeGap,
    titlePaddingVertical + titleSafeGap,
  );
  const domainContainers = updated.filter(node => String(node.type || '') === 'titleGroup');

  for (const domainContainer of domainContainers) {
    const domainKey = String(asRecord(domainContainer.data).domain || '');
    if (!domainKey) continue;

    const position = domainContainer.position ?? { x: 0, y: 0 };
    const size = nodeSize(domainContainer);
    const innerLeft = finiteNumber(position.x, 0) + domainPaddingHorizontal;
    let innerRight = finiteNumber(position.x, 0) + size.width - domainPaddingHorizontal;
    const innerTop = finiteNumber(position.y, 0) + titleHeight + titlePaddingVertical + titleSafeGap;
    const contentHeight = Math.max(
      0,
      size.height - (titleHeight + titlePaddingVertical + titleSafeGap) - bottomSafeGap,
    );
    let effectiveBottomGap = Math.max(6, Math.floor((titlePaddingVertical + titleSafeGap) * 0.5));
    effectiveBottomGap = Math.max(effectiveBottomGap, Math.floor(bottomSafeGap * 0.7));
    effectiveBottomGap = Math.min(effectiveBottomGap, Math.floor(contentHeight * 0.12));
    const innerBottom = finiteNumber(position.y, 0) + size.height - effectiveBottomGap;

    const majorityDomainOfChildren = (subGroup: ReactFlowNode): string | undefined => {
      const children = asRecord(subGroup.data).children;
      if (!Array.isArray(children)) return undefined;

      const counts = new Map<string, number>();
      for (const childId of children) {
        if (typeof childId !== 'string') continue;
        const domain = String(asRecord(idMap.get(childId)?.data).domain || '').trim();
        if (domain) counts.set(domain, (counts.get(domain) ?? 0) + 1);
      }
      return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
    };

    const members = updated.filter(node => {
      if (String(node.type || '') === 'titleGroup') return false;
      const nodeDomain = String(asRecord(node.data).domain || '').trim();
      if (nodeDomain === domainKey) return true;
      return String(node.type || '') === 'subGroup'
        && majorityDomainOfChildren(node) === domainKey.trim();
    });

    for (const member of members) {
      const memberPosition = member.position ?? { x: 0, y: 0 };
      const memberSize = nodeSize(member);
      if (memberSize.width > Math.max(0, innerRight - innerLeft)) {
        const width = memberSize.width + domainPaddingHorizontal * 2;
        domainContainer.style = { ...asRecord(domainContainer.style), width };
        domainContainer.measured = { ...asRecord(domainContainer.measured), width };
        innerRight = finiteNumber(position.x, 0) + width - domainPaddingHorizontal;
      }

      member.position = {
        x: Math.min(
          Math.max(finiteNumber(memberPosition.x, 0), innerLeft),
          Math.max(innerLeft, innerRight - memberSize.width),
        ),
        y: Math.min(
          Math.max(finiteNumber(memberPosition.y, 0), innerTop),
          Math.max(innerTop, innerBottom - memberSize.height),
        ),
      };
      const memberIndex = updated.findIndex(node => node.id === member.id);
      if (memberIndex >= 0) updated[memberIndex] = { ...member };
    }
  }

  return updated;
};
