import type { Node as ReactFlowNode, Edge } from '@xyflow/react';
import type { LayoutOptions } from '../types/layout';
import { ILayoutStrategy } from './LayoutStrategyManager';
import { diagramConfigManager } from '../components/config/DiagramConfig';
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

export interface ElkLayoutResult {
  nodes: ReactFlowNode[];
  edges: Edge[];
}

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
  protected prepareData(nodes: ReactFlowNode[], options: LayoutOptions) {
    const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;

    // 1. 计算 Padding
    const left = Math.max(40, num(((options as any)?.padding?.left), 40));
    const top = Math.max(40, num(((options as any)?.padding?.top), 40));

    // 2. 数据清洗与分组准备
    let updatedNodes: ReactFlowNode[] = nodes.map(n => ({ ...n }));

    const domainWhitelist = (options as any)?.domainWhitelist as string[] | undefined;
    const subWhitelist = (options as any)?.subDomainWhitelist as string[] | undefined;
    const showDomain = ((options as any)?.generateDomainGroups !== undefined) ? !!(options as any)?.generateDomainGroups : true;
    const showSub = ((options as any)?.generateSubDomainGroups !== undefined) ? !!((options as any)?.generateSubDomainGroups) : true;

    updatedNodes = applyDomainGrouping(updatedNodes as any, domainWhitelist) as any;
    updatedNodes = normalizeMissingNodeSubDomainByDomain(updatedNodes) as any;
    updatedNodes = applySubGrouping(updatedNodes as any, subWhitelist) as any;
    updatedNodes = assignChildrenToSubGroupsBySemantic(updatedNodes as any) as any;
    updatedNodes = ensureMeasuredForNodes(updatedNodes);
    updatedNodes = normalizeSubGroupDomainByChildren(updatedNodes);
    updatedNodes = recomputeSubGroupContainersBasic(updatedNodes);
    updatedNodes = enforceSubGroupTitleClearance(updatedNodes);

    // 3. 处理显隐性
    updatedNodes = updatedNodes.map(n => {
      const clone: any = { ...n, data: { ...(n as any).data } };
      if (String(n.type || '') === 'subGroup') {
        const key = String((clone.data?.subDomain || '')).trim();
        const inWhite = Array.isArray(subWhitelist) ? subWhitelist.includes(key) : false;
        const visible = showSub ? (Array.isArray(subWhitelist) ? inWhite : true) : false;
        clone.data.hidden = !visible;
      }
      if (String(n.type || '') === 'titleGroup') {
        const dKey = String(((clone.data?.domain || '') || '')).trim();
        const inWhiteDom = Array.isArray(domainWhitelist) ? domainWhitelist.includes(dKey) : false;
        const visibleDom = showDomain ? (Array.isArray(domainWhitelist) ? inWhiteDom : true) : false;
        clone.data.hidden = !visibleDom;
        clone.data.anchorLocked = true;
      }
      return clone as ReactFlowNode;
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
    elkGraph: any,
    updatedNodes: ReactFlowNode[],
    edges: Edge[],
    padding: { x: number, y: number }
  ): Promise<ElkLayoutResult> {
    // 构建 ID 映射表，用于快速回填
    const idMap = new Map<string, ReactFlowNode>(updatedNodes.map(n => [n.id, n] as const));
    const isGroupType = (t: any) => new Set(['subGroup', 'titleGroup', 'group', 'domain']).has(String(t || ''));



    return new Promise((resolve) => {
      const worker = this.getWorker();
      const layoutId = `${this.getName()}-${Date.now()}-${Math.random()}`;

      const handleMessage = (event: MessageEvent) => {
        const { id, result, error } = event.data;
        if (id === layoutId) {
          worker.removeEventListener('message', handleMessage);

          if (error) {
            console.error(`[${this.getName()}] Worker Layout Failed:`, error);
            resolve({ nodes: updatedNodes, edges });
          } else {


            const updateNodePositions = (node: any, parentX: number, parentY: number) => {
              const currentX = parentX + (node.x || 0);
              const currentY = parentY + (node.y || 0);

              const targetNode = idMap.get(node.id);
              if (targetNode) {
                // 更新位置
                (targetNode as any).position = { x: currentX, y: currentY };

                // 更新尺寸（ELK 会计算容器的包围盒尺寸）
                if (node.width && node.height && isGroupType(targetNode.type)) {
                  targetNode.style = { ...targetNode.style, width: node.width, height: node.height };
                  (targetNode as any).measured = { width: node.width, height: node.height };
                }
              }

              if (node.children) {
                node.children.forEach((child: any) => updateNodePositions(child, currentX, currentY));
              }
            };

            // 根节点坐标为 padding
            if (result.children) {
              result.children.forEach((child: any) => updateNodePositions(child, padding.x, padding.y));
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
        console.warn(`[${this.getName()}] Layout worker timed out`);
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
  ): any;

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
    const isGroupType = (t: any) => new Set(['subGroup', 'titleGroup', 'group', 'domain']).has(String(t || ''));
    const domainOf = (x: ReactFlowNode): string => {
      const dt: any = ((x as any)?.data) || {};
      return String(dt?.domain || '').trim();
    };

    const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
    const cfg = this.getConfig();
    const getW = (n: ReactFlowNode) => num((((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width)), Math.max(120, cfg.node.minWidth || 120));
    const getH = (n: ReactFlowNode) => num((((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height)), Math.max(60, cfg.node.height || 80));

    return { idMap, isGroupType, domainOf, getW, getH, cfg };
  }
}
