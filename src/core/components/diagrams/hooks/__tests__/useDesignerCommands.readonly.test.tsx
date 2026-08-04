// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

import { useDesignerCommands } from '../useDesignerCommands';

describe('useDesignerCommands read-only policy', () => {
  it('disables and guards mutation commands while preserving view and export commands', async () => {
    const handleExport = vi.fn();
    const handleOpenJsonEditor = vi.fn();
    const handleSmartLayout = vi.fn();
    const undo = vi.fn();

    const { result } = renderHook(() => useDesignerCommands({
      reactFlowInstance: null,
      handleFitView: vi.fn(),
      handleGridRotate: vi.fn(),
      setAutoRoutingEnabled: vi.fn(),
      canUndo: true,
      canRedo: true,
      undo,
      redo: vi.fn(),
      handleCopyWithToast: vi.fn(),
      handlePasteWithToast: vi.fn(),
      handleCutWithToast: vi.fn(),
      handleDeleteWithToast: vi.fn(),
      handleDuplicateWithToast: vi.fn(),
      handleSelectAll: vi.fn(),
      handleGroupWithToast: vi.fn(),
      handleUngroupWithToast: vi.fn(),
      handleExport,
      handleExportMermaid: vi.fn(),
      handleCopyAsMermaid: vi.fn(),
      handleImport: vi.fn(),
      editingEnabled: false,
      handleOpenJsonEditor,
      handleStrategyLayout: vi.fn(),
      handleSmartLayout,
      setShowShortcuts: vi.fn(),
      isCommentMode: false,
      setIsCommentMode: vi.fn(),
      selectedNodes: [],
      selectedEdges: [],
    }));

    await waitFor(() => {
      expect(result.current.commandPaletteItems.some(item => item.id === 'node.add')).toBe(true);
    });

    for (const id of ['node.add', 'node.clear', 'edit.undo', 'file.editJson', 'layout.smart']) {
      const item = result.current.commandPaletteItems.find(candidate => candidate.id === id);
      expect(item?.disabled).toBe(true);
      item?.onSelect();
    }

    const exportItem = result.current.commandPaletteItems.find(item => item.id === 'file.export');
    expect(exportItem?.disabled).not.toBe(true);
    exportItem?.onSelect();

    expect(undo).not.toHaveBeenCalled();
    expect(handleOpenJsonEditor).not.toHaveBeenCalled();
    expect(handleSmartLayout).not.toHaveBeenCalled();
    expect(handleExport).toHaveBeenCalledTimes(1);
  });
});
