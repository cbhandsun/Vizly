import { DiagramTypePlugin } from '../types';

export class PluginRegistry {
  private static instance: PluginRegistry;
  private plugins: Map<string, DiagramTypePlugin> = new Map();
  private defaultPluginId: string | null = null;

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
    if (isDefault || !this.defaultPluginId) {
      this.defaultPluginId = plugin.id;
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
