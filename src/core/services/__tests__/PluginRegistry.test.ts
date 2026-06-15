import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginRegistry } from '../PluginRegistry';
import type { DiagramTypePlugin, PluginContext } from '../../types';

const plugin = (id: string, onAIAction?: DiagramTypePlugin['onAIAction']): DiagramTypePlugin => ({
  id,
  name: id,
  version: '1.0.0',
  description: `${id} plugin`,
  diagramTypes: [],
  onAIAction,
});

const resetSingleton = () => {
  (PluginRegistry as unknown as { instance?: PluginRegistry }).instance = undefined;
};

describe('PluginRegistry', () => {
  beforeEach(() => {
    resetSingleton();
    localStorage.clear();
  });

  afterEach(() => {
    resetSingleton();
    vi.restoreAllMocks();
    localStorage.clear();
    delete (window as unknown as { __vizly_plugins?: unknown }).__vizly_plugins;
  });

  it('registers plugins, exposes the singleton for debugging, and resolves defaults', () => {
    const registry = PluginRegistry.getInstance();
    const first = plugin('first');
    const second = plugin('second');

    registry.register(first);
    registry.register(second, true);

    expect((window as unknown as { __vizly_plugins?: PluginRegistry }).__vizly_plugins).toBe(registry);
    expect(registry.getPlugin('first')).toBe(first);
    expect(registry.getDefaultPlugin()).toBe(second);
    expect(registry.getAllPlugins()).toEqual([first, second]);
    expect(registry.isPluginActive('missing')).toBe(true);
  });

  it('loads persisted active status and dispatches status-change events', () => {
    localStorage.setItem('vizly_plugin_status', JSON.stringify({ flow: false }));
    const registry = PluginRegistry.getInstance();
    const listener = vi.fn();
    window.addEventListener('vizly:plugin-status-change', listener);

    registry.register(plugin('flow'));
    expect(registry.isPluginActive('flow')).toBe(false);

    registry.setPluginActive('flow', true);

    expect(registry.isPluginActive('flow')).toBe(true);
    expect(JSON.parse(localStorage.getItem('vizly_plugin_status') ?? '{}')).toEqual({ flow: true });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: { id: 'flow', active: true },
    }));

    registry.setPluginActive('missing', false);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('vizly:plugin-status-change', listener);
  });

  it('falls back to default active status when persisted status is invalid JSON', () => {
    localStorage.setItem('vizly_plugin_status', '{broken');
    const registry = PluginRegistry.getInstance();

    registry.register(plugin('flow'));

    expect(registry.isPluginActive('flow')).toBe(true);
  });

  it('ignores wrong-shaped or non-boolean persisted status values', () => {
    localStorage.setItem('vizly_plugin_status', JSON.stringify({
      flow: 'false',
      mindmap: false,
      list: [],
      '__proto__': false,
      'bad<script>': false,
    }));
    const registry = PluginRegistry.getInstance();

    registry.register(plugin('flow'));
    registry.register(plugin('mindmap'));
    registry.register(plugin('list'));

    expect(registry.isPluginActive('flow')).toBe(true);
    expect(registry.isPluginActive('mindmap')).toBe(false);
    expect(registry.isPluginActive('list')).toBe(true);
    expect(registry.isPluginActive('__proto__')).toBe(false);
    expect(registry.isPluginActive('bad<script>')).toBe(false);
  });

  it('rejects unsafe plugin ids before registration or status persistence', () => {
    const registry = PluginRegistry.getInstance();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const listener = vi.fn();
    window.addEventListener('vizly:plugin-status-change', listener);

    registry.register(plugin('bad<script>'));
    registry.register(plugin('__proto__'));
    registry.register(plugin('safe-plugin'));
    registry.setPluginActive('bad<script>', false);
    registry.setPluginActive('__proto__', false);
    registry.setPluginActive('safe-plugin', false);

    expect(registry.getPlugin('bad<script>')).toBeUndefined();
    expect(registry.getPlugin('__proto__')).toBeUndefined();
    expect(registry.getPlugin('safe-plugin')).toBeDefined();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('vizly_plugin_status') ?? '{}')).toEqual({ 'safe-plugin': false });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Rejected plugin with unsafe id'));

    window.removeEventListener('vizly:plugin-status-change', listener);
  });

  it('unregisters plugins and promotes the next plugin as default', () => {
    const registry = PluginRegistry.getInstance();
    const first = plugin('first');
    const second = plugin('second');

    registry.register(first);
    registry.register(second);
    registry.unregister('first');

    expect(registry.getPlugin('first')).toBeUndefined();
    expect(registry.getDefaultPlugin()).toBe(second);

    registry.unregister('second');
    expect(registry.getDefaultPlugin()).toBeUndefined();
  });

  it('executes plugin AI actions and handles missing or throwing handlers', async () => {
    const registry = PluginRegistry.getInstance();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ctx = {} as PluginContext;

    registry.register(plugin('ai', vi.fn().mockResolvedValue(true)));
    registry.register(plugin('plain'));
    registry.register(plugin('throwing', vi.fn().mockRejectedValue(new Error('boom'))));

    await expect(registry.executeAIAction('ai', 'create', { id: 1 }, ctx)).resolves.toBe(true);
    await expect(registry.executeAIAction('plain', 'create', {}, ctx)).resolves.toBe(false);
    await expect(registry.executeAIAction('missing', 'create', {}, ctx)).resolves.toBe(false);
    await expect(registry.executeAIAction('throwing', 'create', {}, ctx)).resolves.toBe(false);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Plugin missing not found'));
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error executing AI action "create"'),
      expect.any(Error)
    );
  });

  it('does not execute AI actions for disabled plugins', async () => {
    const registry = PluginRegistry.getInstance();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const aiHandler = vi.fn().mockResolvedValue(true);

    registry.register(plugin('ai', aiHandler));
    registry.setPluginActive('ai', false);

    await expect(registry.executeAIAction('ai', 'create', {}, {} as PluginContext)).resolves.toBe(false);

    expect(aiHandler).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Plugin ai is disabled'));
  });

  it('rejects unsafe AI action targets before plugin dispatch', async () => {
    const registry = PluginRegistry.getInstance();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const aiHandler = vi.fn().mockResolvedValue(true);

    registry.register(plugin('ai', aiHandler));

    await expect(registry.executeAIAction('ai<script>', 'create', {}, {} as PluginContext)).resolves.toBe(false);
    await expect(registry.executeAIAction('ai', 'create;delete', {}, {} as PluginContext)).resolves.toBe(false);

    expect(aiHandler).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Rejected unsafe AI action target'));
  });
});
