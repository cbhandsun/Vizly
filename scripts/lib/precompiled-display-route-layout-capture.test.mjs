import { describe, expect, it, vi } from 'vitest';

import { clickPrecompiledDisplayRouteLayoutVariant } from './precompiled-display-route-layout-capture.mjs';
import {
  PRECOMPILED_DISPLAY_ROUTE_GENERATION_TARGETS,
  PRECOMPILED_DISPLAY_ROUTE_LAYOUT_TARGETS,
} from './precompiled-display-route-targets.mjs';

describe('precompiled display route layout capture', () => {
  it('keeps only exact replayable layout targets without replacing initial targets', () => {
    expect(PRECOMPILED_DISPLAY_ROUTE_LAYOUT_TARGETS).toEqual([{
      presetId: 'wms-process-flow-v1',
      sourcePath: 'src/data/standardized/WmsProcessFlowStandardData.json',
      variantId: 'domain-lanes-lr',
    }]);
    expect(PRECOMPILED_DISPLAY_ROUTE_GENERATION_TARGETS.map(target => (
      `${target.presetId}:${target.variantId}`
    ))).toEqual([
      'wms-process-flow-v1:initial',
      'logistics-architecture-v1:initial',
      'wms-demand-allocation-strategy-v2:initial',
      'wms-process-flow-v1:domain-lanes-lr',
    ]);
  });

  it('opens the bounded layout menu and clicks an exact visible variant', async () => {
    const session = {
      evaluate: vi.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce({ x: 10, y: 20, clickedAt: 1234 })
        .mockResolvedValueOnce({ appliedKey: 'domain-lanes-lr' }),
      send: vi.fn(),
    };
    const wait = vi.fn();

    await expect(clickPrecompiledDisplayRouteLayoutVariant(
      session,
      'domain-lanes-lr',
      wait,
    )).resolves.toBe(1234);
    expect(wait).toHaveBeenCalledWith(300);
    expect(session.send).toHaveBeenNthCalledWith(1, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 10,
      y: 20,
    });
    expect(session.send).toHaveBeenNthCalledWith(2, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: 10,
      y: 20,
      button: 'left',
      clickCount: 1,
    });
    expect(session.send).toHaveBeenNthCalledWith(3, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: 10,
      y: 20,
      button: 'left',
      clickCount: 1,
    });
    expect(session.evaluate.mock.calls[1][0]).toContain('domain-lanes-lr');
  });

  it('hovers the bounded submenu before retrying and rejects unknown variants', async () => {
    const session = {
      evaluate: vi.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ x: 10, y: 20 })
        .mockResolvedValueOnce({ x: 30, y: 40, clickedAt: 5678 })
        .mockResolvedValueOnce({ appliedKey: 'domain-lanes-lr' }),
      send: vi.fn(),
    };
    const wait = vi.fn();

    await expect(clickPrecompiledDisplayRouteLayoutVariant(
      session,
      'domain-lanes-lr',
      wait,
    )).resolves.toBe(5678);
    expect(session.send).toHaveBeenCalledWith('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 10,
      y: 20,
    });
    expect(session.send).toHaveBeenCalledWith('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: 30,
      y: 40,
      button: 'left',
      clickCount: 1,
    });
    expect(wait).toHaveBeenNthCalledWith(1, 300);
    expect(wait).toHaveBeenNthCalledWith(2, 500);
    await expect(clickPrecompiledDisplayRouteLayoutVariant(
      session,
      '../unsafe',
      wait,
    )).rejects.toThrow(/Unknown precompiled layout variant/);
  });

  it('waits through transient toolbar selection before accepting a layout variant', async () => {
    const session = {
      evaluate: vi.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce({ x: 10, y: 20, clickedAt: 1234 })
        .mockResolvedValueOnce({ appliedKey: 'domain-dagre-lr' })
        .mockResolvedValueOnce({ appliedKey: 'domain-lanes-lr' }),
      send: vi.fn(),
    };
    const wait = vi.fn();

    await expect(clickPrecompiledDisplayRouteLayoutVariant(
      session,
      'domain-lanes-lr',
      wait,
    )).resolves.toBe(1234);
    expect(wait).toHaveBeenCalledWith(250);
  });

  it('fails when a clicked layout variant keeps a different toolbar selection', async () => {
    const session = {
      evaluate: vi.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce({ x: 10, y: 20, clickedAt: 1234 })
        .mockResolvedValue({ appliedKey: 'domain-dagre-lr' }),
      send: vi.fn(),
    };

    await expect(clickPrecompiledDisplayRouteLayoutVariant(
      session,
      'domain-lanes-lr',
      vi.fn(),
    )).rejects.toThrow(/committed a different layout than requested/);
  });
});
