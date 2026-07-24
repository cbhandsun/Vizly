// @vitest-environment jsdom

import type { Node } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  coerceFlowchartEditorCommandDetail,
  createFlowchartEditorCommandEventHandler,
  createViewportCenteredNode,
  findFlowchartEditorCommandExportButton,
  handleFlowchartEditorCommand,
  readFlowchartEditorCommandWindowSize,
  resolveFlowchartLayoutDirection,
  resolveFlowchartLayoutEngine,
} from '../flowchartEditorCommand';

describe('flowchartEditorCommand', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('normalizes layout strategy names and directions from UI command payloads', () => {
    expect(resolveFlowchartLayoutEngine('Domain Vertical Layout')).toBe('domain-vertical');
    expect(resolveFlowchartLayoutEngine('domain_elk')).toBe('domain-elk');
    expect(resolveFlowchartLayoutEngine('unknown-layout')).toBe('domain-vertical');

    expect(resolveFlowchartLayoutDirection('LR')).toBe('LR');
    expect(resolveFlowchartLayoutDirection('rl')).toBe('LR');
    expect(resolveFlowchartLayoutDirection('tb')).toBe('TB');
    expect(resolveFlowchartLayoutDirection(undefined)).toBe('TB');
  });

  it('coerces command event detail at the window event boundary', () => {
    expect(coerceFlowchartEditorCommandDetail({
      action: 'apply-layout',
      strategy: ' Domain Vertical Layout ',
      nodeLayout: ' grid ',
      direction: ' LR ',
    })).toEqual({
      action: 'apply-layout',
      strategy: 'Domain Vertical Layout',
      nodeLayout: 'grid',
      direction: 'LR',
    });

    expect(coerceFlowchartEditorCommandDetail(null)).toBeNull();
    expect(coerceFlowchartEditorCommandDetail([])).toBeNull();
    expect(coerceFlowchartEditorCommandDetail({})).toBeNull();
    expect(coerceFlowchartEditorCommandDetail({ action: 'unknown' })).toBeNull();
    expect(coerceFlowchartEditorCommandDetail({
      action: 'apply-layout',
      strategy: 'x'.repeat(81),
    })).toBeNull();
    expect(coerceFlowchartEditorCommandDetail({
      action: 'apply-layout',
      nodeLayout: '<script>',
    })).toBeNull();
  });

  it('creates a viewport-centered node using the first available plugin node type', () => {
    const node = createViewportCenteredNode({
      reactFlowInstance: {
        getViewport: () => ({ x: 100, y: 80, zoom: 2 }),
      },
      activePlugin: {
        getNodeTypes: () => ({ flowchart: {}, custom: {} }),
      },
      label: '新节点',
      windowWidth: 1200,
      windowHeight: 800,
      createNodeId: () => 'node-fixed',
    });

    expect(node).toEqual({
      id: 'node-fixed',
      type: 'flowchart',
      position: { x: 250, y: 160 },
      data: { label: '新节点' },
      selected: true,
    });
  });

  it('routes apply-layout commands through the shared helper', () => {
    const handleStrategyLayout = vi.fn();

    const handled = handleFlowchartEditorCommand({
      detail: {
        action: 'apply-layout',
        strategy: 'domain_dagre_layout',
        nodeLayout: 'grid',
        direction: 'RL',
      },
      handleSmartLayout: vi.fn(),
      handleStrategyLayout,
      handleExport: vi.fn(),
      findToolbarExportButton: () => null,
      setAiChatVisible: vi.fn(),
      setActiveRightTab: vi.fn(),
      reactFlowInstance: null,
      setNodes: vi.fn(),
      newNodeLabel: 'New Node',
      windowWidth: 1200,
      windowHeight: 800,
      confirmClearCanvas: vi.fn(),
    });

    expect(handled).toBe(true);
    expect(handleStrategyLayout).toHaveBeenCalledWith('dagre', 'grid', 'LR');
  });

  it('adds a viewport-centered node for add-node commands', () => {
    const setNodes = vi.fn((updater: (nodes: Node[]) => Node[]) => updater([]));

    const handled = handleFlowchartEditorCommand({
      detail: { action: 'add-node' },
      handleSmartLayout: vi.fn(),
      handleStrategyLayout: vi.fn(),
      handleExport: vi.fn(),
      findToolbarExportButton: () => null,
      setAiChatVisible: vi.fn(),
      setActiveRightTab: vi.fn(),
      reactFlowInstance: {
        getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      },
      activePlugin: {
        getNodeTypes: () => ({ custom: {} }),
      },
      setNodes,
      newNodeLabel: 'New Node',
      windowWidth: 1000,
      windowHeight: 800,
      confirmClearCanvas: vi.fn(),
    });

    expect(handled).toBe(true);
    const addedNode = setNodes.mock.results[0]?.value?.[0];
    expect(addedNode.position).toEqual({ x: 500, y: 400 });
    expect(addedNode.data).toEqual({ label: 'New Node' });
    expect(addedNode.type).toBe('custom');
  });

  it('falls back to export handler and clear-canvas callback when needed', () => {
    const handleExport = vi.fn();
    const confirmClearCanvas = vi.fn();
    const click = vi.fn();

    expect(handleFlowchartEditorCommand({
      detail: { action: 'export-png' },
      handleSmartLayout: vi.fn(),
      handleStrategyLayout: vi.fn(),
      handleExport,
      findToolbarExportButton: () => ({ click }),
      setAiChatVisible: vi.fn(),
      setActiveRightTab: vi.fn(),
      reactFlowInstance: null,
      setNodes: vi.fn(),
      newNodeLabel: 'New Node',
      windowWidth: 1000,
      windowHeight: 800,
      confirmClearCanvas,
    })).toBe(true);
    expect(click).toHaveBeenCalled();
    expect(handleExport).not.toHaveBeenCalled();

    expect(handleFlowchartEditorCommand({
      detail: { action: 'export-png' },
      handleSmartLayout: vi.fn(),
      handleStrategyLayout: vi.fn(),
      handleExport,
      findToolbarExportButton: () => null,
      setAiChatVisible: vi.fn(),
      setActiveRightTab: vi.fn(),
      reactFlowInstance: null,
      setNodes: vi.fn(),
      newNodeLabel: 'New Node',
      windowWidth: 1000,
      windowHeight: 800,
      confirmClearCanvas,
    })).toBe(true);
    expect(handleExport).toHaveBeenCalled();

    expect(handleFlowchartEditorCommand({
      detail: { action: 'clear-canvas' },
      handleSmartLayout: vi.fn(),
      handleStrategyLayout: vi.fn(),
      handleExport: vi.fn(),
      findToolbarExportButton: () => null,
      setAiChatVisible: vi.fn(),
      setActiveRightTab: vi.fn(),
      reactFlowInstance: null,
      setNodes: vi.fn(),
      newNodeLabel: 'New Node',
      windowWidth: 1000,
      windowHeight: 800,
      confirmClearCanvas,
    })).toBe(true);
    expect(confirmClearCanvas).toHaveBeenCalled();
  });

  it('creates an event handler that forwards custom event detail through the shared command logic', () => {
    const handleStrategyLayout = vi.fn();
    const handler = createFlowchartEditorCommandEventHandler({
      handleSmartLayout: vi.fn(),
      handleStrategyLayout,
      handleExport: vi.fn(),
      findToolbarExportButton: () => null,
      setAiChatVisible: vi.fn(),
      setActiveRightTab: vi.fn(),
      reactFlowInstance: null,
      setNodes: vi.fn(),
      newNodeLabel: 'New Node',
      windowWidth: 1200,
      windowHeight: 800,
      confirmClearCanvas: vi.fn(),
    });

    const handled = handler({
      detail: {
        action: 'apply-layout',
        strategy: 'domain horizontal layout',
        nodeLayout: 'tree',
        direction: 'TB',
      },
    });

    expect(handled).toBe(true);
    expect(handleStrategyLayout).toHaveBeenCalledWith('domain-horizontal', 'tree', 'TB');
  });

  it('rejects empty, malformed, and type-confused custom event detail without side effects', () => {
    const handleSmartLayout = vi.fn();
    const handleStrategyLayout = vi.fn();
    const setNodes = vi.fn();
    const handler = createFlowchartEditorCommandEventHandler({
      handleSmartLayout,
      handleStrategyLayout,
      handleExport: vi.fn(),
      findToolbarExportButton: () => null,
      setAiChatVisible: vi.fn(),
      setActiveRightTab: vi.fn(),
      reactFlowInstance: null,
      setNodes,
      newNodeLabel: 'New Node',
      windowWidth: 1200,
      windowHeight: 800,
      confirmClearCanvas: vi.fn(),
    });

    expect(handler({})).toBe(false);
    expect(handler({ detail: null })).toBe(false);
    expect(handler({ detail: 'smart-layout' })).toBe(false);
    expect(handler({ detail: { action: { toString: () => 'smart-layout' } } })).toBe(false);

    expect(handleSmartLayout).not.toHaveBeenCalled();
    expect(handleStrategyLayout).not.toHaveBeenCalled();
    expect(setNodes).not.toHaveBeenCalled();
  });

  it('reads the editor command environment from the window and toolbar DOM', () => {
    vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 });
    document.body.innerHTML = '<button data-id="toolbar-export-btn"></button>';

    expect(readFlowchartEditorCommandWindowSize()).toEqual({ width: 1440, height: 900 });
    expect(findFlowchartEditorCommandExportButton()).toBeInstanceOf(HTMLButtonElement);
  });

  it('returns false for add-node without a react flow instance or unknown commands', () => {
    const setNodes = vi.fn();

    expect(handleFlowchartEditorCommand({
      detail: { action: 'add-node' },
      handleSmartLayout: vi.fn(),
      handleStrategyLayout: vi.fn(),
      handleExport: vi.fn(),
      findToolbarExportButton: () => null,
      setAiChatVisible: vi.fn(),
      setActiveRightTab: vi.fn(),
      reactFlowInstance: null,
      setNodes,
      newNodeLabel: 'New Node',
      windowWidth: 1000,
      windowHeight: 800,
      confirmClearCanvas: vi.fn(),
    })).toBe(false);

    expect(handleFlowchartEditorCommand({
      detail: { action: 'unknown' },
      handleSmartLayout: vi.fn(),
      handleStrategyLayout: vi.fn(),
      handleExport: vi.fn(),
      findToolbarExportButton: () => null,
      setAiChatVisible: vi.fn(),
      setActiveRightTab: vi.fn(),
      reactFlowInstance: null,
      setNodes,
      newNodeLabel: 'New Node',
      windowWidth: 1000,
      windowHeight: 800,
      confirmClearCanvas: vi.fn(),
    })).toBe(false);

    expect(setNodes).not.toHaveBeenCalled();
  });
});
