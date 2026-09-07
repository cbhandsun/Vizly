// @vitest-environment jsdom

import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  viewport: { x: 0, y: 0, zoom: 1 },
  fitView: vi.fn(),
  getNodes: vi.fn(),
  getEdges: vi.fn(),
  getViewport: vi.fn(),
  setViewport: vi.fn(),
}));

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    fitView: harness.fitView,
    getNodes: harness.getNodes,
    getEdges: harness.getEdges,
    getViewport: harness.getViewport,
    setViewport: harness.setViewport,
  }),
}));

import DiagramControlBridge from '../DiagramControlBridge';
import { requestLayoutCommitFit } from '../diagramControlRequest';
import { BaseReactFlowViewportSemanticContext } from '../baseReactFlowViewportSemanticContext';
import { resolveBaseReactFlowEdgeLabelScale, syncBaseReactFlowZoomClass } from '../baseReactFlowViewport';

describe('DiagramControlBridge layout commit fit', () => {
  const frames: FrameRequestCallback[] = [];

  beforeEach(() => {
    frames.length = 0;
    harness.viewport = { x: 0, y: 0, zoom: 1 };
    harness.fitView.mockReset().mockResolvedValue(true);
    harness.getNodes.mockReset().mockReturnValue([
      { id: 'a', position: { x: 0, y: 0 }, width: 8000, height: 4000, data: {} },
    ]);
    harness.getEdges.mockReset().mockReturnValue([]);
    harness.getViewport.mockReset().mockImplementation(() => harness.viewport);
    harness.setViewport.mockReset().mockImplementation(async viewport => {
      harness.viewport = viewport;
      return true;
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('syncs semantic zoom and resolves only after two paint frames', async () => {
    const container = document.createElement('div');
    container.className = 'diagram-container';
    const previewRoot = document.createElement('div');
    previewRoot.className = 'diagram-preview-root';
    const diagram = document.createElement('div');
    diagram.id = 'diagram-diagram-1';
    const renderer = document.createElement('div');
    renderer.className = 'react-flow__renderer';
    Object.defineProperty(renderer, 'clientWidth', { value: 1280 });
    Object.defineProperty(renderer, 'clientHeight', { value: 720 });
    diagram.appendChild(renderer);
    previewRoot.appendChild(diagram);
    const mount = document.createElement('div');
    previewRoot.appendChild(mount);
    container.appendChild(previewRoot);
    document.body.appendChild(container);
    render(
      <BaseReactFlowViewportSemanticContext.Provider value={viewport => {
        syncBaseReactFlowZoomClass({ container: previewRoot, viewport });
      }}>
        <DiagramControlBridge diagramId="diagram-1" />
      </BaseReactFlowViewportSemanticContext.Provider>,
      { container: mount },
    );
    const controller = new AbortController();
    let settled = false;

    const result = requestLayoutCommitFit({ diagramId: 'diagram-1', signal: controller.signal });
    void result.then(() => { settled = true; });
    await waitFor(() => expect(harness.setViewport).toHaveBeenCalledOnce());
    expect(harness.setViewport.mock.calls[0]?.[1]).toBeUndefined();
    expect(harness.viewport.zoom).toBeLessThan(0.32);
    expect(harness.viewport.x + 8000 * harness.viewport.zoom).toBeLessThanOrEqual(1280);
    expect(harness.viewport.y + 4000 * harness.viewport.zoom).toBeLessThanOrEqual(720);
    expect(previewRoot.classList.contains('diagram-zoomed-out')).toBe(true);

    await act(async () => { frames.shift()?.(0); });
    expect(settled).toBe(false);
    await act(async () => { frames.shift()?.(16); });

    await expect(result).resolves.toBe('applied');
  });

  it('fits retained labels using their target zoom dimensions without another paint correction', async () => {
    const container = document.createElement('div');
    container.id = 'diagram-label-fit';
    container.className = 'react-flow';
    const renderer = document.createElement('div');
    renderer.className = 'react-flow__renderer';
    Object.defineProperty(renderer, 'clientWidth', { value: 1280 });
    Object.defineProperty(renderer, 'clientHeight', { value: 720 });
    container.appendChild(renderer);
    const label = document.createElement('div');
    label.className = 'vizly-edge-label stable-path-edge-label--primary';
    vi.spyOn(label, 'getBoundingClientRect').mockImplementation(() => {
      const { x, y, zoom } = harness.viewport;
      const scale = resolveBaseReactFlowEdgeLabelScale(zoom);
      return new DOMRect(x + (8500 - 500 * scale) * zoom, y + 500 * zoom,
        1000 * scale * zoom, 40 * scale * zoom);
    });
    container.appendChild(label);
    const mount = document.createElement('div');
    container.appendChild(mount);
    document.body.appendChild(container);
    render(<BaseReactFlowViewportSemanticContext.Provider value={viewport => {
      syncBaseReactFlowZoomClass({ container, viewport });
    }}><DiagramControlBridge diagramId="label-fit" /></BaseReactFlowViewportSemanticContext.Provider>, { container: mount });
    const result = requestLayoutCommitFit({ diagramId: 'label-fit', signal: new AbortController().signal });
    await waitFor(() => expect(harness.setViewport).toHaveBeenCalledTimes(1));
    await act(async () => { frames.shift()?.(0); });
    await act(async () => { frames.shift()?.(16); });
    await expect(result).resolves.toBe('applied');
    expect(harness.setViewport).toHaveBeenCalledOnce();
    expect(label.getBoundingClientRect().right).toBeLessThanOrEqual(1280 - 60 - 8);
  });

  it.each(['cancel', 'unmount'] as const)('does not run a fallback after a pending fit is invalidated by %s', async reason => {
    const container = document.createElement('div');
    container.id = 'diagram-cancel-fit';
    container.className = 'react-flow';
    Object.defineProperty(container, 'clientWidth', { value: 1280 });
    Object.defineProperty(container, 'clientHeight', { value: 720 });
    document.body.appendChild(container);
    const failure = new Error('fit application failed after cancellation');
    let rejectApplication: (error: Error) => void = () => { throw Error('expected pending application'); };
    harness.setViewport.mockImplementationOnce(() => new Promise<boolean>((_resolve, reject) => {
      rejectApplication = reject;
    }));
    const syncViewport = vi.fn();
    const view = render(<BaseReactFlowViewportSemanticContext.Provider value={syncViewport}>
      <DiagramControlBridge diagramId="cancel-fit" />
    </BaseReactFlowViewportSemanticContext.Provider>, { container });
    const controller = new AbortController();
    const result = requestLayoutCommitFit({ diagramId: 'cancel-fit', signal: controller.signal });
    await waitFor(() => expect(harness.setViewport).toHaveBeenCalledOnce());
    if (reason === 'cancel') controller.abort();
    else view.unmount();
    syncViewport.mockClear();
    await act(async () => rejectApplication(failure));
    await expect(result).resolves.toBe(reason === 'cancel' ? 'cancelled' : 'failed');
    expect(harness.fitView).not.toHaveBeenCalled();
    expect(syncViewport).not.toHaveBeenCalled();
  });
});
