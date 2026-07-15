import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const exportDiagramToSVG = vi.fn(async () => undefined);

vi.mock('../../../../hooks/useDiagramControls', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../hooks/useDiagramControls')>();
  return actual;
});

vi.mock('../../../../hooks/diagramExportActions', () => ({
  exportDiagramToPNG: vi.fn(),
  exportDiagramToPDF: vi.fn(),
  exportDiagramToSVG,
  exportDiagramToGIF: vi.fn(),
}));

vi.mock('../../../shared/diagramControl', () => ({
  dispatchDiagramControl: vi.fn(),
}));

describe('useFlowchartExportControls', () => {
  it('passes an explicit React Flow snapshot to SVG export actions', async () => {
    const reactFlowInstance = {
      getNodes: vi.fn(() => [{ id: 'n1' }]),
      getEdges: vi.fn(() => [{ id: 'e1', source: 'n1', target: 'n2' }]),
      getViewport: vi.fn(() => ({ x: 1, y: 2, zoom: 1.25 })),
    };
    const { useFlowchartExportControls } = await import('../useFlowchartExportControls');
    const { result } = renderHook(() => useFlowchartExportControls('diagram-1', reactFlowInstance as any));

    expect(result.current.getReactFlowSnapshot()).toEqual({
      nodes: [{ id: 'n1' }],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      viewport: { x: 1, y: 2, zoom: 1.25 },
    });

    await act(async () => {
      await result.current.exportToSVG();
    });

    const context = exportDiagramToSVG.mock.calls[0]?.[0];
    expect(context.diagramId).toBe('diagram-1');
    expect(context.getReactFlowSnapshot()).toEqual({
      nodes: [{ id: 'n1' }],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      viewport: { x: 1, y: 2, zoom: 1.25 },
    });
  });

  it('returns null snapshots until React Flow is initialized', async () => {
    exportDiagramToSVG.mockClear();
    const { useFlowchartExportControls } = await import('../useFlowchartExportControls');
    const { result } = renderHook(() => useFlowchartExportControls('diagram-1', null));

    await act(async () => {
      await result.current.exportToSVG();
    });

    const context = exportDiagramToSVG.mock.calls[0]?.[0];
    expect(context.getReactFlowSnapshot()).toBeNull();
  });
});
