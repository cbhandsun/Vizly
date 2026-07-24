import type { Node as ReactFlowNode } from '@xyflow/react';

import type { DomainVerticalPrimitiveLayout } from './domainVerticalNodeLayoutPrimitives';
import { compactVisibleSubGroupsRigid } from './domainVerticalRigidTranslation';

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const positiveNumber = (value: unknown, fallback: number): number => {
  const parsed = finiteNumber(value, fallback);
  return parsed > 0 ? parsed : fallback;
};

const cloneNodes = (nodes: readonly ReactFlowNode[]): ReactFlowNode[] =>
  nodes.map(node => ({
    ...node,
    position: {
      x: finiteNumber(node.position?.x, 0),
      y: finiteNumber(node.position?.y, 0),
    },
    measured: node.measured ? { ...node.measured } : undefined,
    style: node.style ? { ...node.style } : undefined,
    data: { ...((node.data as Record<string, unknown> | undefined) ?? {}) },
  }));

const childIdsOf = (node: ReactFlowNode): string[] => {
  const children = (node.data as Record<string, unknown> | undefined)?.children;
  if (!Array.isArray(children)) return [];
  return [...new Set(children.filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  ))];
};

const writeSize = (node: ReactFlowNode, width: number, height: number): void => {
  const safeWidth = Math.max(0, finiteNumber(width, 0));
  const safeHeight = Math.max(0, finiteNumber(height, 0));
  node.style = { ...(node.style ?? {}), width: safeWidth, height: safeHeight };
  node.measured = { width: safeWidth, height: safeHeight };
  node.width = safeWidth;
  node.height = safeHeight;
};

export const areAllTitleGroupDomainsHidden = (
  nodes: readonly ReactFlowNode[],
): boolean => {
  const domains = nodes.filter(node => node.type === 'titleGroup');
  return domains.length === 0 || domains.every(node =>
    (node.data as Record<string, unknown> | undefined)?.hidden === true);
};

export interface HiddenDomainSubGroupLayoutOptions {
  layout: DomainVerticalPrimitiveLayout;
  top: number;
  gap: number;
  anchorLeft: number;
  horizontalPadding: number;
  topPadding: number;
  bottomPadding: number;
  fallbackSubGroupWidth: number;
  fallbackChildWidth: number;
  fallbackChildHeight: number;
  layoutChildren: (
    layout: Exclude<DomainVerticalPrimitiveLayout, 'dagre'>,
    children: ReactFlowNode[],
    left: number,
    right: number,
    top: number,
  ) => void;
}

export const layoutHiddenDomainSubGroups = (
  nodes: readonly ReactFlowNode[],
  rawOptions: HiddenDomainSubGroupLayoutOptions,
): ReactFlowNode[] => {
  let updated = cloneNodes(nodes);
  const nodeById = new Map(updated.map(node => [node.id, node] as const));
  const horizontalPadding = Math.max(0, finiteNumber(rawOptions.horizontalPadding, 0));
  const topPadding = Math.max(0, finiteNumber(rawOptions.topPadding, 0));
  const bottomPadding = Math.max(0, finiteNumber(rawOptions.bottomPadding, 0));
  const fallbackSubGroupWidth = positiveNumber(rawOptions.fallbackSubGroupWidth, 480);
  const fallbackChildWidth = positiveNumber(rawOptions.fallbackChildWidth, 240);
  const fallbackChildHeight = positiveNumber(rawOptions.fallbackChildHeight, 80);

  if (rawOptions.layout !== 'dagre') {
    for (const subGroup of updated.filter(node =>
      node.type === 'subGroup'
      && (node.data as Record<string, unknown> | undefined)?.hidden !== true)) {
      const children = childIdsOf(subGroup)
        .map(childId => nodeById.get(childId))
        .filter((child): child is ReactFlowNode =>
          Boolean(child)
          && (child?.data as Record<string, unknown> | undefined)?.hidden !== true);
      if (children.length === 0) continue;
      const subGroupX = finiteNumber(subGroup.position?.x, rawOptions.anchorLeft);
      const subGroupY = finiteNumber(subGroup.position?.y, rawOptions.top);
      const left = subGroupX + horizontalPadding;
      const width = positiveNumber(
        subGroup.measured?.width ?? subGroup.style?.width ?? subGroup.width,
        fallbackSubGroupWidth,
      );
      const right = subGroupX + Math.max(240, width) - horizontalPadding;
      const top = subGroupY + topPadding;
      rawOptions.layoutChildren(rawOptions.layout, children, left, right, top);
      for (const child of children) {
        child.position = {
          x: Math.round(finiteNumber(child.position?.x, left)),
          y: Math.round(finiteNumber(child.position?.y, top)),
        };
      }
      const minimumX = Math.min(...children.map(child => child.position.x));
      const minimumY = Math.min(...children.map(child => child.position.y));
      const maximumX = Math.max(...children.map(child =>
        child.position.x + positiveNumber(
          child.measured?.width ?? child.style?.width ?? child.width,
          fallbackChildWidth,
        )));
      const maximumY = Math.max(...children.map(child =>
        child.position.y + positiveNumber(
          child.measured?.height ?? child.style?.height ?? child.height,
          fallbackChildHeight,
        )));
      subGroup.position = {
        x: Math.round(minimumX - horizontalPadding),
        y: Math.round(minimumY - topPadding),
      };
      writeSize(
        subGroup,
        maximumX - minimumX + horizontalPadding * 2,
        maximumY - minimumY + topPadding + bottomPadding,
      );
    }
  }

  updated = compactVisibleSubGroupsRigid(updated, {
    top: finiteNumber(rawOptions.top, 80),
    gap: Math.max(0, finiteNumber(rawOptions.gap, 48)),
  });
  return updated;
};
