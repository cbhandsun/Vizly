/**
 * 数据服务层
 * 提供统一的数据访问接口，支持数据获取、转换、缓存和验证
 */

import type {
  StandardDiagramData,
  StandardNodeData,
  StandardEdgeData,
  DiagramType,
  DataQuery,
  QueryResult,
  DataAdapter,
  CacheManager,
  CacheItem,
  ThemeMetadata,
  DomainTheme
} from '@/core';
import { EdgeFactory } from '@/core';
import { NodeFactory } from '@/core';
import { unifiedStorage as storageService } from './UnifiedStorageService';

// === 缓存管理器实现 ===

class MemoryCacheManager implements CacheManager {
  private cache = new Map<string, CacheItem>();
  private readonly defaultTTL = 5 * 60 * 1000; // 5分钟

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    const now = Date.now();
    if (now > item.timestamp + item.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.data as T;
  }

  set<T>(key: string, data: T, ttl?: number): void {
    const item: CacheItem<T> = {
      key,
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL
    };
    this.cache.set(key, item);
  }

  has(key: string): boolean {
    return this.cache.has(key) && this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// === 数据验证器 ===

class DataValidator {
  static validateNodeData(node: StandardNodeData): boolean {
    const isDescriptionObject = typeof node.description === 'object' &&
      node.description !== null &&
      'title' in node.description &&
      'details' in node.description;

    return !!(
      node.id &&
      (typeof node.description === 'string' || isDescriptionObject) &&
      node.domain &&
      typeof node.id === 'string' &&
      typeof node.domain === 'string'
    );
  }

  static validateEdgeData(edge: StandardEdgeData): boolean {
    return !!(
      edge.id &&
      edge.source &&
      edge.target &&
      typeof edge.id === 'string' &&
      typeof edge.source === 'string' &&
      typeof edge.target === 'string'
    );
  }

  static validateDiagramData(diagram: StandardDiagramData): boolean {
    if (!diagram || !diagram.id || !diagram.name || !diagram.type) {
      return false;
    }

    // 验证节点
    if (!Array.isArray(diagram.nodes) ||
      !diagram.nodes.every(node => this.validateNodeData(node))) {
      return false;
    }

    // 验证边缘
    if (!Array.isArray(diagram.edges) ||
      !diagram.edges.every(edge => this.validateEdgeData(edge))) {
      return false;
    }

    return true;
  }
}

// === 数据适配器基类 ===

abstract class BaseDataAdapter<T = any> implements DataAdapter<T> {
  abstract toStandard(rawData: T): StandardDiagramData;
  abstract fromStandard(standardData: StandardDiagramData): T;

  validate(data: T): boolean {
    try {
      const standardData = this.toStandard(data);
      return DataValidator.validateDiagramData(standardData);
    } catch {
      return false;
    }
  }
}

// === 数据服务主类 ===

/**
 * @class DataService
 */
export class DataService {
  private static instance: DataService;
  private cache: CacheManager;
  private adapters = new Map<DiagramType, DataAdapter>();
  private dataRegistry = new Map<string, StandardDiagramData>();

  private constructor() {
    this.cache = new MemoryCacheManager();
  }

  static getInstance(): DataService {
    if (!DataService.instance) {
      DataService.instance = new DataService();
    }
    return DataService.instance;
  }

  // === 适配器管理 ===

  registerAdapter<T>(type: DiagramType, adapter: DataAdapter<T>): void {
    this.adapters.set(type, adapter);
  }

  getAdapter<T>(type: DiagramType): DataAdapter<T> | null {
    return this.adapters.get(type) as DataAdapter<T> || null;
  }

  // === 数据注册与获取 ===

  registerDiagram(diagram: StandardDiagramData): void {
    if (!diagram || !diagram.id) {
      throw new Error(`Invalid diagram data: ${diagram?.id || 'null/undefined'}`);
    }

    if (!DataValidator.validateDiagramData(diagram)) {
      console.warn(`[DataService] Diagram "${diagram.id}" did not pass strict validation, registering with lenient mode.`);
    }

    this.dataRegistry.set(diagram.id, diagram);
    this.cache.set(`diagram:${diagram.id}`, diagram);
  }

  getDiagram(id: string): StandardDiagramData | null {
    // 先从缓存获取
    const cached = this.cache.get<StandardDiagramData>(`diagram:${id}`);
    if (cached) return cached;

    // 从注册表获取
    const diagram = this.dataRegistry.get(id);
    if (diagram) {
      this.cache.set(`diagram:${id}`, diagram);
      return diagram;
    }

    return null;
  }

  deleteDiagram(id: string): void {
    this.dataRegistry.delete(id);
    this.cache.delete(`diagram:${id}`);
  }

  // === 数据查询 ===

  queryDiagrams(query: DataQuery = {}): QueryResult<StandardDiagramData> {
    const cacheKey = `query:${JSON.stringify(query)}`;
    const cached = this.cache.get<QueryResult<StandardDiagramData>>(cacheKey);
    if (cached) return cached;

    let results = Array.from(this.dataRegistry.values());

    // 按类型过滤
    if (query.type) {
      results = results.filter(d => d.type === query.type);
    }

    // 按域过滤
    if (query.domain) {
      results = results.filter(d =>
        d.nodes.some(n => n.domain === query.domain)
      );
    }

    // 按主题过滤
    if (query.theme) {
      results = results.filter(d => d.theme.name === query.theme);
    }

    // 按标签过滤
    if (query.tags && query.tags.length > 0) {
      results = results.filter(d =>
        query.tags!.some(tag =>
          d.metadata?.tags?.includes(tag)
        )
      );
    }

    // 文本搜索
    if (query.search) {
      const searchLower = query.search.toLowerCase();
      results = results.filter(d =>
        d.name.toLowerCase().includes(searchLower) ||
        d.metadata?.description?.toLowerCase().includes(searchLower) ||
        d.nodes.some(n =>
          n.description.toLowerCase().includes(searchLower)
        )
      );
    }

    const result: QueryResult<StandardDiagramData> = {
      data: results,
      total: results.length
    };

    this.cache.set(cacheKey, result, 2 * 60 * 1000); // 2分钟缓存
    return result;
  }

  // === 节点数据管理 ===

  getNodesByDomain(diagramId: string, domain: string): StandardNodeData[] {
    const diagram = this.getDiagram(diagramId);
    if (!diagram) return [];

    return diagram.nodes.filter(node => node.domain === domain);
  }

  getNodeById(diagramId: string, nodeId: string): StandardNodeData | null {
    const diagram = this.getDiagram(diagramId);
    if (!diagram) return null;

    return diagram.nodes.find(node => node.id === nodeId) || null;
  }

  // === 边缘数据管理 ===

  getEdgesByType(diagramId: string, type: StandardEdgeData['type']): StandardEdgeData[] {
    const diagram = this.getDiagram(diagramId);
    if (!diagram) return [];

    return diagram.edges.filter(edge => edge.type === type);
  }

  getEdgesForNode(diagramId: string, nodeId: string): {
    incoming: StandardEdgeData[];
    outgoing: StandardEdgeData[];
  } {
    const diagram = this.getDiagram(diagramId);
    if (!diagram) return { incoming: [], outgoing: [] };

    const incoming = diagram.edges.filter(edge => edge.target === nodeId);
    const outgoing = diagram.edges.filter(edge => edge.source === nodeId);

    return { incoming, outgoing };
  }

  // === 主题数据管理 ===

  getThemeForDomain(diagramId: string, domain: string): DomainTheme | null {
    const diagram = this.getDiagram(diagramId);
    if (!diagram) return null;

    return diagram.theme.domains[domain] || null;
  }

  getAllDomains(diagramId: string): string[] {
    const diagram = this.getDiagram(diagramId);
    if (!diagram) return [];

    const domains = new Set<string>();
    diagram.nodes.forEach(node => domains.add(node.domain));
    return Array.from(domains);
  }

  // === 数据转换 ===

  convertToStandard<T>(type: DiagramType, rawData: T): StandardDiagramData {
    const adapter = this.getAdapter<T>(type);
    if (!adapter) {
      throw new Error(`No adapter registered for type: ${type}`);
    }

    return adapter.toStandard(rawData);
  }

  convertFromStandard<T>(type: DiagramType, standardData: StandardDiagramData): T {
    const adapter = this.getAdapter<T>(type);
    if (!adapter) {
      throw new Error(`No adapter registered for type: ${type}`);
    }

    return adapter.fromStandard(standardData);
  }

  // === 缓存管理 ===

  clearCache(): void {
    this.cache.clear();
  }

  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size(),
      keys: Array.from((this.cache as any).cache.keys())
    };
  }

  // === 数据导入导出 ===

  exportDiagram(id: string): StandardDiagramData | null {
    return this.getDiagram(id);
  }

  importDiagram(diagram: StandardDiagramData): void {
    this.registerDiagram(diagram);
  }

  exportAllDiagrams(): StandardDiagramData[] {
    return Array.from(this.dataRegistry.values());
  }

  importDiagrams(diagrams: StandardDiagramData[]): void {
    diagrams.forEach(diagram => this.registerDiagram(diagram));
  }

  // === 外部存储集成 ===

  async loadFromStorage(key: string): Promise<StandardDiagramData | null> {
    try {
      const savedData = await storageService.loadDiagram(key);
      const diagramContent = savedData.content as StandardDiagramData;

      if (diagramContent && DataValidator.validateDiagramData(diagramContent)) {
        // 注册到内存以便后续使用
        this.registerDiagram(diagramContent);
        return diagramContent;
      }
      console.error('Loaded data is not a valid diagram');
      return null;
    } catch (error) {
      console.error('Failed to load from storage:', error);
      throw error;
    }
  }
}

// === 导出单例实例 ===
export const dataService = DataService.getInstance();

// === 导出其他类 ===
export { DataValidator, BaseDataAdapter, MemoryCacheManager };
