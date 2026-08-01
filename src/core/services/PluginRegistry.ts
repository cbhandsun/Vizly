import { DiagramTypePlugin, PluginContext } from '../types';
import { safeLog } from '../utils/consoleCleanup';
import { redactSensitiveLogValue } from '../utils/logSecurity';
import { logUiStorageReadFailure, logUiStorageWriteFailure } from '../utils/uiStorageLogging';
import { safeJsonParseWithLimit } from '../utils/jsonUtils';

export class PluginRegistry {
  private static instance: PluginRegistry;
  private plugins: Map<string, DiagramTypePlugin> = new Map();
  private activeStatus: Map<string, boolean> = new Map();
  private defaultPluginId: string | null = null;
  private STORAGE_KEY = 'vizly_plugin_status';
  private readonly MAX_AI_TOKEN_LENGTH = 80;
  private readonly SAFE_AI_TOKEN_PATTERN = /^[A-Za-z0-9_.:-]+$/;
  private readonly MAX_PLUGIN_ID_LENGTH = 80;
  private readonly SAFE_PLUGIN_ID_PATTERN = /^[A-Za-z0-9_.:-]+$/;
  private readonly BLOCKED_PLUGIN_IDS = new Set(['__proto__', 'prototype', 'constructor']);
  private readonly MAX_STATUS_JSON_LENGTH = 128 * 1024;

  private constructor() {}

  public static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
      // ⭐ [GAP-12] DX: 暴露至控制台用于实时调试
      if (typeof window !== 'undefined') {
        const runtimeWindow = window as Window & { __vizly_plugins?: PluginRegistry };
        runtimeWindow.__vizly_plugins = PluginRegistry.instance;
      }
    }
    return PluginRegistry.instance;
  }

  public register(plugin: DiagramTypePlugin, isDefault: boolean = false): void {
    if (!this.isSafePluginId(plugin.id)) {
      safeLog.warn('[PluginRegistry] Rejected plugin with unsafe id:', redactSensitiveLogValue(plugin.id));
      return;
    }

    if (this.plugins.has(plugin.id)) {
      safeLog.warn('[PluginRegistry] Plugin with id is already registered. Overwriting.', plugin.id);
    }
    this.plugins.set(plugin.id, plugin);
    
    // 初始化激活状态 (从缓存读取或默认开启)
    const savedStatus = this.loadStatus();
    this.activeStatus.set(plugin.id, savedStatus[plugin.id] ?? true);

    if (isDefault || !this.defaultPluginId) {
      this.defaultPluginId = plugin.id;
    }
  }

  public setPluginActive(id: string, active: boolean): boolean {
    if (!this.isSafePluginId(id) || !this.plugins.has(id)) return false;

    const previous = this.activeStatus.get(id);
    this.activeStatus.set(id, active);
    if (!this.saveStatus()) {
      if (previous === undefined) {
        this.activeStatus.delete(id);
      } else {
        this.activeStatus.set(id, previous);
      }
      return false;
    }

    // 仅在状态持久化成功后通知运行时，避免 UI 与刷新后的状态分叉。
    window.dispatchEvent(new CustomEvent('vizly:plugin-status-change', { detail: { id, active } }));
    return true;
  }

  public isPluginActive(id: string): boolean {
    if (!this.isSafePluginId(id)) return false;
    return this.activeStatus.get(id) ?? true;
  }

  private saveStatus(): boolean {
    const statusObj = Object.fromEntries(
      Array.from(this.activeStatus).filter(([id, active]) => this.isSafePluginId(id) && typeof active === 'boolean')
    );
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(statusObj));
      return true;
    } catch (error) {
      logUiStorageWriteFailure('PluginRegistry.saveStatus', this.STORAGE_KEY, error);
      return false;
    }
  }

  private loadStatus(): Record<string, boolean> {
    const raw = (() => {
      try {
        return localStorage.getItem(this.STORAGE_KEY);
      } catch (error) {
        logUiStorageReadFailure('PluginRegistry.loadStatus', this.STORAGE_KEY, error);
        return null;
      }
    })();

    const saved = this.parseStoredStatus(raw);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(saved).filter((entry): entry is [string, boolean] => (
        this.isSafePluginId(entry[0]) && typeof entry[1] === 'boolean'
      ))
    );
  }

  private parseStoredStatus(raw: string | null): unknown {
    return safeJsonParseWithLimit<unknown>(raw, {}, {
      maxLength: this.MAX_STATUS_JSON_LENGTH,
      onFailure: (error) => {
        logUiStorageReadFailure('PluginRegistry.loadStatus', this.STORAGE_KEY, error);
      },
      buildOversizeError: () => new Error('Plugin status JSON is too large.'),
    });
  }

  public getPlugin(id: string): DiagramTypePlugin | undefined {
    if (!this.isSafePluginId(id)) return undefined;
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
    if (!this.isSafePluginId(id)) return;
    this.plugins.delete(id);
    if (this.defaultPluginId === id) {
      this.defaultPluginId = this.plugins.size > 0 ? (this.plugins.keys().next().value || null) : null;
    }
  }

  /**
   * [GAP-10] 指令分发器：执行特定插件的 AI 动作
   */
  public async executeAIAction(pluginId: string, action: string, params: unknown, ctx: PluginContext): Promise<boolean> {
    if (!this.isSafeAIToken(pluginId) || !this.isSafeAIToken(action)) {
      safeLog.warn('[PluginRegistry] Rejected unsafe AI action target:', redactSensitiveLogValue({ pluginId, action }));
      return false;
    }

    const plugin = this.getPlugin(pluginId);
    if (!plugin) {
      safeLog.warn(`[PluginRegistry] Plugin ${pluginId} not found, skipping AI action: ${action}`);
      return false;
    }

    if (!this.isPluginActive(pluginId)) {
      safeLog.warn(`[PluginRegistry] Plugin ${pluginId} is disabled, skipping AI action: ${action}`);
      return false;
    }

    if (!plugin.onAIAction) {
      return false; // 插件未实现 AI 处理逻辑，交由默认兜底
    }

    try {
      return await plugin.onAIAction(action, params, ctx);
    } catch (error) {
      safeLog.error(
        `[PluginRegistry] Error executing AI action "${action}" in plugin "${pluginId}":`,
        redactSensitiveLogValue(error)
      );
      return false;
    }
  }

  private isSafeAIToken(value: unknown): value is string {
    return typeof value === 'string'
      && value.trim().length > 0
      && value.length <= this.MAX_AI_TOKEN_LENGTH
      && this.SAFE_AI_TOKEN_PATTERN.test(value);
  }

  private isSafePluginId(value: unknown): value is string {
    return typeof value === 'string'
      && value.trim().length > 0
      && value.length <= this.MAX_PLUGIN_ID_LENGTH
      && !this.BLOCKED_PLUGIN_IDS.has(value)
      && this.SAFE_PLUGIN_ID_PATTERN.test(value);
  }
}
