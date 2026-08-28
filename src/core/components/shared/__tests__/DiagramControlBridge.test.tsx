// @vitest-environment jsdom

import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  viewport: { x: 0, y: 0, zoom: 1 },
  fitView: vi.fn(),
  getNodes: vi.fn(),
  getViewport: vi.fn(),
  setViewport: vi.fn(),
}));

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    fitView: harness.fitView,
    getNodes: harness.getNodes,
    getViewport: harness.getViewport,
    setViewport: harness.setViewport,
  }),
}));

import DiagramControlBridge from '../DiagramControlBridge';
import { requestLayoutCommitFit } from '../diagramControlRequest';
import { BaseReactFlowViewportSemanticContext } from '../baseReactFlowViewportSemanticContext';
import { syncBaseReactFlowZoomClass } from '../baseReactFlowViewport';

describe('DiagramControlBridge layout commit fit', () => {
  const frames: FrameRequestCallback[] = [];

  beforeEach(() => {
    frames.length = 0;
    harness.viewport = { x: 0, y: 0, zoom: 1 };
    harness.fitView.mockReset().mockResolvedValue(true);
    harness.getNodes.mockReset().mockReturnValue([
      { id: 'a', position: { x: 0, y: 0 }, width: 8000, height: 4000, data: {} },
    ]);
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
    expect(previewRoot.classList.contains('diagram-zoomed-out')).toBe(true);

    await act(async () => { frames.shift()?.(0); });
    expect(settled).toBe(false);
    await act(async () => { frames.shift()?.(16); });

    await expect(result).resolves.toBe('applied');
  });
});
