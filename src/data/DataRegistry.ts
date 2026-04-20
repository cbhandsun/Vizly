/**
 * 数据注册中心
 * 统一管理所有标准化的架构图数据
 */

import type { StandardDiagramData } from '@/core';
import { DataService } from '../services/DataService';

// 导入标准化数据
import enterpriseArchitectureData from './standardized/ArchitectureStandardData.json';
import logisticsStandardData from './standardized/LogisticsStandardData.json';
import logisticsPlanningData from './standardized/LogisticsPlanningStandardData.json';
import systemsInteractionData from './standardized/SystemsInteractionStandardData.json';
import tmsStandardData from './standardized/TmsStandardData.json';
import transportDrivenData from './standardized/TransportDrivenStandardData.json';
import wmsArchitectureData from './standardized/WmsStandardData.json';
import wmsOrderToTaskFlowData from './standardized/WmsOrderToTaskFlowData.json';
import wmsProcessFlowData from './standardized/WmsProcessFlowStandardData.json';
import blankCanvasStandardData from './standardized/BlankCanvasStandardData.json';

/**
 * 数据注册中心类
 * 负责初始化和管理所有架构图数据
 */
export class DataRegistry {
  private static instance: DataRegistry;
  private dataService: DataService;
  private initialized = false;

  private constructor() {
    this.dataService = DataService.getInstance();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): DataRegistry {
    if (!DataRegistry.instance) {
      DataRegistry.instance = new DataRegistry();
    }
    return DataRegistry.instance;
  }

  /**
   * 初始化数据注册中心
   * 注册所有适配器和标准化数据
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // 1. 注册数据适配器
      this.registerAdapters();

      // 2. 注册标准化数据
      await this.registerStandardData();

      // 3. 验证数据完整性
      await this.validateData();

      this.initialized = true;
    } catch (error) {
      console.error('❌ 数据注册中心初始化失败:', error);
      throw error;
    }
  }

  /**
   * 注册数据适配器
   */
  private registerAdapters(): void {
    const dataService = this.dataService;

    // 移除ArchitectureDataAdapter，直接使用标准格式
    // dataService.registerAdapter('architecture', new ArchitectureDataAdapter());

  }

  /**
   * 注册标准化数据
   */
  private async registerStandardData(): Promise<void> {
    const diagrams: any[] = [
      enterpriseArchitectureData,
      logisticsStandardData,
      logisticsPlanningData,
      systemsInteractionData,
      tmsStandardData,
      transportDrivenData,
      wmsArchitectureData,
      wmsOrderToTaskFlowData,
      wmsProcessFlowData,
      blankCanvasStandardData,
    ];

    // 批量注册图表数据
    for (const diagram of diagrams) {
      await this.dataService.registerDiagram(diagram as StandardDiagramData);
    }

  }

  /**
   * 验证数据完整性
   */
  private async validateData(): Promise<void> {
    const allDiagrams = await this.dataService.queryDiagrams({});
    
    if (!allDiagrams || !allDiagrams.data || allDiagrams.data.length === 0) {
      throw new Error('没有找到任何注册的架构图数据');
    }

    // 验证每个图表的数据完整性
    for (const diagram of allDiagrams.data) {
      if (!diagram.nodes || diagram.nodes.length === 0) {
        console.warn(`⚠️ 图表 ${diagram.name} 没有节点数据`);
      }
      
      if (!diagram.edges || diagram.edges.length === 0) {
        console.warn(`⚠️ 图表 ${diagram.name} 没有连线数据`);
      }
    }

  }

  /**
   * 获取数据服务实例
   */
  public getDataService(): DataService {
    return this.dataService;
  }

  /**
   * 获取所有可用的架构图类型
   */
  public async getAvailableTypes(): Promise<string[]> {
    const result = await this.dataService.queryDiagrams({});
    const types = new Set(result.data.map((item: any) => item.type));
    return Array.from(types);
  }

  /**
   * 获取所有可用的域
   */
  public async getAvailableDomains(): Promise<string[]> {
    const result = await this.dataService.queryDiagrams({});
    const domains = new Set<string>();
    
    result.data.forEach((diagram: any) => {
      diagram.nodes.forEach((node: any) => {
        if (node.domain) {
          domains.add(node.domain);
        }
      });
    });
    
    return Array.from(domains);
  }

  /**
   * 获取统计信息
   */
  public async getStatistics(): Promise<{
    totalDiagrams: number;
    totalNodes: number;
    totalEdges: number;
    typeDistribution: Record<string, number>;
    domainDistribution: Record<string, number>;
  }> {
    const result = await this.dataService.queryDiagrams({});
    const typeDistribution: Record<string, number> = {};
    const domainDistribution: Record<string, number> = {};
    
    let totalNodes = 0;
    let totalEdges = 0;

    result.data.forEach((diagram: any) => {
      // 统计类型分布
      typeDistribution[diagram.type] = (typeDistribution[diagram.type] || 0) + 1;
      
      // 统计节点和边
      totalNodes += diagram.nodes.length;
      totalEdges += diagram.edges.length;
      
      // 统计域分布
      diagram.nodes.forEach((node: any) => {
        if (node.domain) {
          domainDistribution[node.domain] = (domainDistribution[node.domain] || 0) + 1;
        }
      });
    });

    return {
      totalDiagrams: result.data.length,
      totalNodes,
      totalEdges,
      typeDistribution,
      domainDistribution
    };
  }

  /**
   * 重置数据注册中心
   */
  public reset(): void {
    this.dataService.clearCache();
    this.initialized = false;
  }
}

// 导出单例实例
export const dataRegistry = DataRegistry.getInstance();

// 导出便捷方法
export const initializeDataRegistry = () => dataRegistry.initialize();
export const getDataService = () => dataRegistry.getDataService();
