import type { Node as ReactFlowNode, Edge } from '@xyflow/react';
import type { ElkNode } from 'elkjs';
import type { LayoutOptions } from '../types/layout';
import { ILayoutStrategy } from './LayoutStrategyManager';
import { diagramConfigManager } from '../config/DiagramConfig';
import {
  applyDomainGrouping,
  applySubGrouping,
  assignChildrenToSubGroupsBySemantic,
  normalizeMissingNodeSubDomainByDomain,
  normalizeSubGroupDomainByChildren,
  ensureMeasuredForNodes,
  recomputeSubGroupContainersBasic,
  enforceSubGroupTitleClearance,
} from '../utils/layoutUtils';
import { logLayoutWorkerTimeout, logWorkerLayoutFailure } from './layoutLogging';
import { runElkLayout } from '../workers/elkLayoutClient';
import {
  applyDomainElkLayoutRoutes,
  collectDomainElkLayoutRoutes,
} from './domainElkLayoutRoutes';

export interface ElkLayoutResult {
  nodes: ReactFlowNode[];
  edges: Edge[];
}

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const isGroupType = (type: unknown): boolean =>
  new Set(['subGroup', 'titleGroup', 'group', 'domain']).has(String(type || ''));

/**
 * ELK child coordinates are relative to their compound parent. React Flow uses
 * the same contract whenever `parentId` is present, so only root children may
 * receive the canvas padding/absolute offset. Writing accumulated coordinates
 * into nested nodes makes React Flow add every parent a second time and also
 * gives the edge router a different graph from the one ELK actually ranked.
 */
export const applyElkResultNodeGeometry = (
  children: ElkNode[] | undefined,
  nodeById: Map<string, ReactFlowNode>,
  padding: { x: number; y: number },
): void => {
  const visit = (
    node: ElkNode,
    parentAbsoluteX: number,
    parentAbsoluteY: number,
    parentElkId?: string,
  ) => {
    const localX = finiteNumber(node.x, 0);
    const localY = finiteNumber(node.y, 0);
    const absoluteX = parentAbsoluteX + localX;
    const absoluteY = parentAbsoluteY + localY;
    const targetNode = nodeById.get(node.id);
    if (targetNode) {
      const usesElkParent = Boolean(parentElkId && targetNode.parentId === parentElkId);
      targetNode.position = usesElkParent
        ? { x: localX, y: localY }
        : { x: absoluteX, y: absoluteY };

      const width = finiteNumber(node.width, 0);
      const height = finiteNumber(node.height, 0);
      if (width > 0 && height > 0 && isGroupType(targetNode.type)) {
        targetNode.style = { ...targetNode.style, width, height };
        targetNode.measured = { width, height };
      }
    }

    node.children?.forEach(child => visit(
      child,
      absoluteX,
      absoluteY,
      node.id,
    ));
  };

  children?.forEach(child => visit(child, padding.x, padding.y));
};

export abstract class AbstractElkLayoutStrategy implements ILayoutStrategy {
  abstract getName(): string;
  abstract getCategory(): 'hierarchy' | 'node';
  abstract getDescription(): string;

  isApplicable(nodes: ReactFlowNode[], _edges: Edge[]): boolean {
    return Array.isArray(nodes) && nodes.length > 0;
  }

  /**
   * 通用数据准备流程
   * 包括：计算Padding、数据清洗、分组、显隐性处理
   */
  protected prepareData(
    nodes: ReactFlowNode[],
    options: LayoutOptions,
  ): { updatedNodes: ReactFlowNode[]; padding: { x: number; y: number } } {
    // 1. 计算 Padding
    const left = Math.max(40, finiteNumber(options.padding?.left, 40));
    const top = Math.max(40, finiteNumber(options.padding?.top, 40));

    // 2. 数据清洗与分组准备
    let updatedNodes: ReactFlowNode[] = nodes.map(n => ({ ...n }));

    const domainWhitelist = options.domainWhitelist;
    const subWhitelist = options.subDomainWhitelist;
    const showDomain = options.generateDomainGroups ?? true;
    const showSub = options.generateSubDomainGroups ?? true;

    updatedNodes = applyDomainGrouping(updatedNodes, domainWhitelist);
    updatedNodes = normalizeMissingNodeSubDomainByDomain(updatedNodes);
    updatedNodes = applySubGrouping(updatedNodes, subWhitelist);
    updatedNodes = assignChildrenToSubGroupsBySemantic(updatedNodes);
    updatedNodes = ensureMeasuredForNodes(updatedNodes);
    updatedNodes = normalizeSubGroupDomainByChildren(updatedNodes);
    updatedNodes = recomputeSubGroupContainersBasic(updatedNodes);
    updatedNodes = enforceSubGroupTitleClearance(updatedNodes);

    // 3. 处理显隐性
    updatedNodes = updatedNodes.map(n => {
      const clone: ReactFlowNode = { ...n, data: { ...asRecord(n.data) } };
      const data = asRecord(clone.data);
      if (String(n.type || '') === 'subGroup') {
        const key = String(data.subDomain || '').trim();
        const inWhite = Array.isArray(subWhitelist) ? subWhitelist.includes(key) : false;
        const visible = showSub ? (Array.isArray(subWhitelist) ? inWhite : true) : false;
        data.hidden = !visible;
      }
      if (String(n.type || '') === 'titleGroup') {
        const dKey = String(data.domain || '').trim();
        const inWhiteDom = Array.isArray(domainWhitelist) ? domainWhitelist.includes(dKey) : false;
        const visibleDom = showDomain ? (Array.isArray(domainWhitelist) ? inWhiteDom : true) : false;
        data.hidden = !visibleDom;
        data.anchorLocked = true;
      }
      clone.data = data;
      return clone;
    });

    return {
      updatedNodes,
      padding: { x: left, y: top }
    };
  }

  /**
   * 执行 Worker 布局并回填结果
   */
  protected async runWorkerLayout(
    elkGraph: ElkNode,
    updatedNodes: ReactFlowNode[],
    edges: Edge[],
    padding: { x: number, y: number }
  ): Promise<ElkLayoutResult> {
    // 构建 ID 映射表，用于快速回填
    const idMap = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
    try {
      const result = await runElkLayout(elkGraph, { timeoutMs: 30_000 });
      applyElkResultNodeGeometry(result.children, idMap, padding);

      const routes = collectDomainElkLayoutRoutes(
        result.edges,
        { x: padding.x, y: padding.y },
      );
      return {
        nodes: updatedNodes,
        edges: applyDomainElkLayoutRoutes(edges, routes),
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('timed out')) {
        logLayoutWorkerTimeout(this.getName());
      } else {
        logWorkerLayoutFailure(this.getName(), error instanceof Error ? error.message : error);
      }
      return { nodes: updatedNodes, edges };
    }
  }

  /**
   * 子类需实现的构建图逻辑
   */
  protected abstract buildElkGraph(
    nodes: ReactFlowNode[],
    edges: Edge[],
    options: LayoutOptions
  ): ElkNode;

  /**
   * 主入口
   */
  async calculateLayout(nodes: ReactFlowNode[], edges: Edge[], options: LayoutOptions): Promise<ElkLayoutResult> {
    const { updatedNodes, padding } = this.prepareData(nodes, options);
    const elkGraph = this.buildElkGraph(updatedNodes, edges, options);
    return this.runWorkerLayout(elkGraph, updatedNodes, edges, padding);
  }

  // 辅助工具：从 DiagramConfig 获取安全数值
  protected getConfig() {
    return diagramConfigManager.getConfig();
  }

  protected getHelpers(nodes: ReactFlowNode[]) {
    const idMap = new Map<string, ReactFlowNode>(nodes.map(n => [n.id, n] as const));
    const domainOf = (x: ReactFlowNode): string => {
      return String(asRecord(x.data).domain || '').trim();
    };

    const cfg = this.getConfig();
    const getW = (n: ReactFlowNode) => finiteNumber(
      n.measured?.width ?? n.style?.width ?? n.width,
      Math.max(120, cfg.node.minWidth || 120),
    );
    const getH = (n: ReactFlowNode) => finiteNumber(
      n.measured?.height ?? n.style?.height ?? n.height,
      Math.max(60, cfg.node.height || 80),
    );

    return { idMap, isGroupType, domainOf, getW, getH, cfg };
  }
}
