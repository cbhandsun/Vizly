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
import ElkWorker from '../workers/elkLayout.worker?worker';
import { logLayoutWorkerTimeout, logWorkerLayoutFailure } from './layoutLogging';

export interface ElkLayoutResult {
  nodes: ReactFlowNode[];
  edges: Edge[];
}

interface ElkWorkerResponse {
  id?: unknown;
  result?: ElkNode;
  error?: unknown;
}

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const isGroupType = (type: unknown): boolean =>
  new Set(['subGroup', 'titleGroup', 'group', 'domain']).has(String(type || ''));

export abstract class AbstractElkLayoutStrategy implements ILayoutStrategy {
  private worker: Worker | null = null;

  abstract getName(): string;
  abstract getCategory(): 'hierarchy' | 'node';
  abstract getDescription(): string;

  isApplicable(nodes: ReactFlowNode[], _edges: Edge[]): boolean {
    return Array.isArray(nodes) && nodes.length > 0;
  }

  protected getWorker(): Worker {
    if (!this.worker) {
      this.worker = new ElkWorker();
    }
    return this.worker;
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
    return new Promise((resolve) => {
      const worker = this.getWorker();
      const layoutId = `${this.getName()}-${Date.now()}-${Math.random()}`;

      const handleMessage = (event: MessageEvent<ElkWorkerResponse>) => {
        const { id, result, error } = event.data;
        if (id === layoutId) {
          worker.removeEventListener('message', handleMessage);

          if (error) {
            logWorkerLayoutFailure(this.getName(), error);
            resolve({ nodes: updatedNodes, edges });
          } else {


            const updateNodePositions = (node: ElkNode, parentX: number, parentY: number) => {
              const currentX = parentX + (node.x || 0);
              const currentY = parentY + (node.y || 0);

              const targetNode = idMap.get(node.id);
              if (targetNode) {
                // 更新位置
                targetNode.position = { x: currentX, y: currentY };

                // 更新尺寸（ELK 会计算容器的包围盒尺寸）
                if (node.width && node.height && isGroupType(targetNode.type)) {
                  targetNode.style = { ...targetNode.style, width: node.width, height: node.height };
                  targetNode.measured = { width: node.width, height: node.height };
                }
              }

              if (node.children) {
                node.children.forEach(child => updateNodePositions(child, currentX, currentY));
              }
            };

            // 根节点坐标为 padding
            if (result?.children) {
              result.children.forEach(child => updateNodePositions(child, padding.x, padding.y));
            }

            resolve({ nodes: updatedNodes, edges });
          }
        }
      };

      worker.addEventListener('message', handleMessage);

      worker.postMessage({
        id: layoutId,
        graph: elkGraph,
        options: {}
      });

      // 超时保护 (30秒)
      setTimeout(() => {
        worker.removeEventListener('message', handleMessage);
        logLayoutWorkerTimeout(this.getName());
        resolve({ nodes: updatedNodes, edges });
      }, 30000);
    });
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
