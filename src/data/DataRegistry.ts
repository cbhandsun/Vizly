/**
 * 数据注册中心
 * 统一管理所有标准化的架构图数据
 */

import type { StandardDiagramData } from '@/core/models/DiagramModels';
import { DataService } from '../services/DataService';
import { localDB } from '../services/IndexedDBStorage';
import { parseRemoteDiagramContent } from '../services/remoteDiagramContent';
import { safeLog } from '../core/utils/consoleCleanup';
import {
  logDataRegistryInitializationFailure,
  logDiagramMissingEdges,
  logDiagramMissingNodes,
  logInvalidLocalDiagram,
  logInvalidRemoteTemplateContent,
  logLocalDiagramLoadFailure,
  logRemoteTemplateFetchFailure,
} from './dataRegistryLogging';

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
import demandAllocationData from './standardized/DeamndAllocation.json';
import blankCanvasStandardData from './standardized/BlankCanvasStandardData.json';

let supabaseModulePromise: Promise<typeof import('../services/supabase')> | null = null;

const shouldLoadRemoteTemplatesOnStartup = () => {
  return import.meta.env.VITE_ENABLE_REMOTE_TEMPLATES_ON_STARTUP === 'true';
};

const loadSupabaseClient = async () => {
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    return null;
  }
  supabaseModulePromise ??= import('../services/supabase');
  const { supabase } = await supabaseModulePromise;
  return supabase;
};

export const normalizeLocalDiagramForRegistry = (
  localDiagram: unknown,
  builtInDiagram?: StandardDiagramData
): StandardDiagramData => {
  const raw = (localDiagram && typeof localDiagram === 'object') ? localDiagram as Record<string, unknown> : {};
  const builtInLayout = (builtInDiagram as any)?.layout || {};
  const localLayout = (raw.layout && typeof raw.layout === 'object') ? raw.layout as Record<string, unknown> : {};
  const merged = builtInDiagram
    ? {
        ...raw,
        id: raw.id || builtInDiagram.id,
        layout: {
          ...builtInLayout,
          ...localLayout,
        },
      }
    : raw;

  return parseRemoteDiagramContent(merged, {
    id: String((merged as any).id || builtInDiagram?.id || 'local-diagram'),
    title: String((merged as any).name || (merged as any).metadata?.title || builtInDiagram?.name || 'Local Diagram'),
  }) as StandardDiagramData;
};

/**
 * 数据注册中心类
 * 负责初始化和管理所有架构图数据
 */
export class DataRegistry {
  private static instance: DataRegistry;
  private dataService: DataService;
  private initialized = false;
  private builtInDiagrams = new Map<string, StandardDiagramData>();

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

      // 2. 注册内置标准化数据 (Static Fallback / Built-in)
      await this.registerStandardData();

      // 3. 尝试从云端加载通用模板库 (Remote Templates)
      // 如果云端下发了同名的模板，会以云端的最后写入为准覆盖本地硬编码数据
      const _remoteLoaded = await this.loadRemoteTemplates();

      // 4. 注册本地持久化数据 (User's IndexedDB Data)
      // 用户本地修改的图表拥有最高优先级
      await this.loadLocalDiagrams();

      // 5. 验证数据完整性
      await this.validateData();

      this.initialized = true;
    } catch (error) {
      logDataRegistryInitializationFailure(error);
      throw error;
    }
  }

  /**
   * 注册数据适配器
   */
  private registerAdapters(): void {
    const _dataService = this.dataService;

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
      demandAllocationData,
      blankCanvasStandardData,
    ];

    // 批量注册内置图表数据，并禁止重复写入 IndexedDB
    for (const diagram of diagrams) {
      this.builtInDiagrams.set(diagram.id, diagram as StandardDiagramData);
      this.dataService.registerDiagram(diagram as StandardDiagramData, false);
    }
  }

  /**
   * 从云端 (Supabase) 加载通用模板库 API
   * 支持通过云端配置下发新的行业模板，而无需修改本地代码
   */
  private async loadRemoteTemplates(): Promise<boolean> {
      if (!shouldLoadRemoteTemplatesOnStartup()) return false;

      const supabase = await loadSupabaseClient();
      if (!supabase) return false;
      
      try {
          // 请求系统模板表
          // 表结构预期: id, title, content (JSON), is_active
          const { data, error } = await supabase
              .from('system_templates')
              .select('id, title, content')
              .eq('is_active', true);
              
          if (error) {
              // 表可能不存在或权限不足，静默降级到本地 JSON
              return false;
          }
          
          if (data && data.length > 0) {
              for (const row of data) {
                  if (!row.content) continue;
                  try {
                      const diagram = parseRemoteDiagramContent(row.content, {
                          id: row.id || 'remote-template',
                          title: row.title || row.id || 'Remote Template',
                      }) as StandardDiagramData;
                      this.dataService.registerDiagram(diagram, false);
                  } catch (templateError) {
                      logInvalidRemoteTemplateContent(templateError);
                  }
              }
              safeLog.debug(`[DataRegistry] Loaded ${data.length} remote templates from cloud.`);
              return true;
          }
          return false;
      } catch (error) {
          logRemoteTemplateFetchFailure(error);
          return false;
      }
  }

  /**
   * 从本地 IndexedDB 加载用户图表
   */
  private async loadLocalDiagrams(): Promise<void> {
      try {
          const localDiagrams = await localDB.listDiagrams();
          for (const diagram of localDiagrams) {
              try {
                  const builtIn = this.builtInDiagrams.get(diagram.id);
                  const normalizedDiagram = normalizeLocalDiagramForRegistry(diagram, builtIn);
                  // 注册到内存，但不重复写入 IndexedDB
                  this.dataService.registerDiagram(normalizedDiagram, false);
              } catch (diagramError) {
                  logInvalidLocalDiagram(diagramError);
              }
          }
      } catch (err) {
          logLocalDiagramLoadFailure(err);
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
        logDiagramMissingNodes(diagram.name);
      }
      
      if (!diagram.edges || diagram.edges.length === 0) {
        logDiagramMissingEdges(diagram.name);
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
