import { Node } from '@xyflow/react';
import { enhancedTextMeasurement } from '../../../utils/EnhancedTextMeasurement';
import { diagramConfigManager } from '../../config/DiagramConfig';

/**
 * 布局配置接口
 */
export interface LayoutConfig {
  nodeWidth: number;
  nodeHeight: number;
  horizontalSpacing: number;
  verticalSpacing: number;
  groupPadding: number;
  titleBarHeight: number;
}

/**
 * 节点位置信息
 */
export interface NodePosition {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 域/组信息
 */
export interface DomainInfo {
  id: string;
  title: string;
  nodes: string[];
  position: NodePosition;
}

/**
 * 统一的图表布局工具类
 * 提供各种布局算法和计算方法
 */
export class DiagramLayoutUtils {
  private config: LayoutConfig;

  constructor(config: LayoutConfig) {
    this.config = config;
  }

  /**
   * 根据内容计算节点宽度
   */
  calculateNodeWidthByContent(description: string): number {
    const measurement = enhancedTextMeasurement.measureNodeContent(description, {
      fontSize: 18,
      fontFamily: 'Arial, sans-serif',
      padding: { horizontal: 16, vertical: 12 }
    });
    
    return Math.max(this.config.nodeWidth, measurement.width + 32);
  }

  /**
   * 计算统一域宽度
   */
  calculateUnifiedDomainWidth(domains: DomainInfo[]): number {
    let maxWidth = 0;
    
    domains.forEach(domain => {
      const nodeCount = domain.nodes.length;
      const nodesWidth = nodeCount * this.config.nodeWidth + (nodeCount - 1) * this.config.horizontalSpacing;
      const domainWidth = nodesWidth + this.config.groupPadding * 2;
      maxWidth = Math.max(maxWidth, domainWidth);
    });
    
    return maxWidth;
  }

  /**
   * 创建网格布局
   */
  createGridLayout(
    items: Array<{ id: string; content?: string }>,
    columns: number,
    startX: number = 0,
    startY: number = 0
  ): NodePosition[] {
    const positions: NodePosition[] = [];
    
    items.forEach((item, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      
      const width = item.content 
        ? this.calculateNodeWidthByContent(item.content)
        : this.config.nodeWidth;
      
      positions.push({
        x: startX + col * (this.config.nodeWidth + this.config.horizontalSpacing),
        y: startY + row * (this.config.nodeHeight + this.config.verticalSpacing),
        width,
        height: this.config.nodeHeight
      });
    });
    
    return positions;
  }

  /**
   * 创建水平居中布局
   */
  createCenteredHorizontalLayout(
    items: Array<{ id: string; content?: string }>,
    containerWidth: number,
    y: number
  ): NodePosition[] {
    const positions: NodePosition[] = [];
    const totalWidth = items.length * this.config.nodeWidth + (items.length - 1) * this.config.horizontalSpacing;
    const startX = (containerWidth - totalWidth) / 2;
    
    items.forEach((item, index) => {
      const width = item.content 
        ? this.calculateNodeWidthByContent(item.content)
        : this.config.nodeWidth;
      
      positions.push({
        x: startX + index * (this.config.nodeWidth + this.config.horizontalSpacing),
        y,
        width,
        height: this.config.nodeHeight
      });
    });
    
    return positions;
  }

  /**
   * 创建垂直布局
   */
  createVerticalLayout(
    items: Array<{ id: string; content?: string }>,
    x: number,
    startY: number = 0
  ): NodePosition[] {
    const positions: NodePosition[] = [];
    
    items.forEach((item, index) => {
      const width = item.content 
        ? this.calculateNodeWidthByContent(item.content)
        : this.config.nodeWidth;
      
      positions.push({
        x,
        y: startY + index * (this.config.nodeHeight + this.config.verticalSpacing),
        width,
        height: this.config.nodeHeight
      });
    });
    
    return positions;
  }

  /**
   * 创建域/组布局
   */
  createDomainLayout(
    domain: DomainInfo,
    unifiedWidth: number,
    y: number
  ): { nodes: NodePosition[]; group: NodePosition } {
    const nodePositions = this.createCenteredHorizontalLayout(
      domain.nodes.map(id => ({ id })),
      unifiedWidth - this.config.groupPadding * 2,
      y + this.config.titleBarHeight + this.config.groupPadding
    );

    const groupHeight = this.config.titleBarHeight + this.config.nodeHeight + this.config.groupPadding * 2;
    
    return {
      nodes: nodePositions,
      group: {
        x: domain.position.x,
        y,
        width: unifiedWidth,
        height: groupHeight
      }
    };
  }

  /**
   * 计算边的路径点
   */
  calculateEdgePoints(
    sourcePos: NodePosition,
    targetPos: NodePosition,
    type: 'straight' | 'step' | 'bezier' = 'step'
  ): Array<{ x: number; y: number }> {
    const sourceCenter = {
      x: sourcePos.x + sourcePos.width / 2,
      y: sourcePos.y + sourcePos.height / 2
    };
    
    const targetCenter = {
      x: targetPos.x + targetPos.width / 2,
      y: targetPos.y + targetPos.height / 2
    };

    switch (type) {
      case 'straight':
        return [sourceCenter, targetCenter];
      
      case 'step': {
        const midY = (sourceCenter.y + targetCenter.y) / 2;
        return [
          sourceCenter,
          { x: sourceCenter.x, y: midY },
          { x: targetCenter.x, y: midY },
          targetCenter
        ];
      }
      
      case 'bezier':
        return [
          sourceCenter,
          { x: sourceCenter.x, y: sourceCenter.y + 50 },
          { x: targetCenter.x, y: targetCenter.y - 50 },
          targetCenter
        ];
      
      default:
        return [sourceCenter, targetCenter];
    }
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<LayoutConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 获取当前配置
   */
  getConfig(): LayoutConfig {
    return { ...this.config };
  }
}

/**
 * 创建默认布局工具实例
 */
export function createLayoutUtils(config?: Partial<LayoutConfig>): DiagramLayoutUtils {
  const defaultConfig: LayoutConfig = {
    nodeWidth: 200,
    nodeHeight: 120,
    horizontalSpacing: 120,
    verticalSpacing: 100,
    groupPadding: 60,
    titleBarHeight: 50,
  };

  return new DiagramLayoutUtils({ ...defaultConfig, ...config });
}

/**
 * 创建节点的默认配置
 * @param id 节点ID
 * @param label 节点标签
 * @param position 节点位置
 * @param additionalData 额外数据
 * @returns 节点配置
 */
export const createNode = (
  id: string,
  label: string,
  position: { x: number; y: number },
  additionalData: any = {}
): Node => {
  const fontConfig = diagramConfigManager.getConfig().node.font;
  
  return {
    id,
    type: 'custom',
    position,
    data: {
      label,
      fontSize: fontConfig.size,
      ...additionalData
    }
  };
};
