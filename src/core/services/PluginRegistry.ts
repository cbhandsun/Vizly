import { DiagramTypePlugin } from '../types';

export class PluginRegistry {
  private static instance: PluginRegistry;
  private plugins: Map<string, DiagramTypePlugin> = new Map();
  private activeStatus: Map<string, boolean> = new Map();
  private defaultPluginId: string | null = null;
  private STORAGE_KEY = 'vizly_plugin_status';

  private constructor() {}

  public static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
    }
    return PluginRegistry.instance;
  }

  public register(plugin: DiagramTypePlugin, isDefault: boolean = false): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`[PluginRegistry] Plugin with id ${plugin.id} is already registered. Overwriting.`);
    }
    this.plugins.set(plugin.id, plugin);
    
    // 初始化激活状态 (从缓存读取或默认开启)
    const savedStatus = this.loadStatus();
    this.activeStatus.set(plugin.id, savedStatus[plugin.id] ?? true);

    if (isDefault || !this.defaultPluginId) {
      this.defaultPluginId = plugin.id;
    }
  }

  public setPluginActive(id: string, active: boolean): void {
    if (this.plugins.has(id)) {
      this.activeStatus.set(id, active);
      this.saveStatus();
      // 触发全局事件，告知应用插件状态变更
      window.dispatchEvent(new CustomEvent('vizly:plugin-status-change', { detail: { id, active } }));
    }
  }

  public isPluginActive(id: string): boolean {
    return this.activeStatus.get(id) ?? true;
  }

  private saveStatus(): void {
    const statusObj = Object.fromEntries(this.activeStatus);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(statusObj));
  }

  private loadStatus(): Record<string, boolean> {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }

  public getPlugin(id: string): DiagramTypePlugin | undefined {
    return this.plugins.get(id);
  }

  public getDefaultPlugin(): DiagramTypePlugin | undefined {
    if (this.defaultPluginId) {
      return this.plugins.get(this.defaultPluginId);
    }
    return undefined;
  }

  public getAllPlugins(): DiagramTypePlugin[] {
    return Array.from(this.plugins.values());
  }

  public unregister(id: string): void {
    this.plugins.delete(id);
    if (this.defaultPluginId === id) {
      this.defaultPluginId = this.plugins.size > 0 ? (this.plugins.keys().next().value || null) : null;
    }
  }
}
