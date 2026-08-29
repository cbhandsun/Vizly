import { describe, expect, it, vi } from 'vitest';

import { clickPrecompiledDisplayRouteLayoutVariant } from './precompiled-display-route-layout-capture.mjs';
import {
  PRECOMPILED_DISPLAY_ROUTE_GENERATION_TARGETS,
  PRECOMPILED_DISPLAY_ROUTE_LAYOUT_TARGETS,
} from './precompiled-display-route-targets.mjs';

describe('precompiled display route layout capture', () => {
  it('adds the exact WMS domain-lanes-lr target without replacing initial targets', () => {
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
        .mockResolvedValueOnce(1234),
      send: vi.fn(),
    };
    const wait = vi.fn();

    await expect(clickPrecompiledDisplayRouteLayoutVariant(
      session,
      'domain-lanes-lr',
      wait,
    )).resolves.toBe(1234);
    expect(wait).toHaveBeenCalledWith(300);
    expect(session.send).not.toHaveBeenCalled();
    expect(session.evaluate.mock.calls[1][0]).toContain('domain-lanes-lr');
  });

  it('hovers the bounded submenu before retrying and rejects unknown variants', async () => {
    const session = {
      evaluate: vi.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ x: 10, y: 20 })
        .mockResolvedValueOnce(5678),
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
    expect(wait).toHaveBeenNthCalledWith(1, 300);
    expect(wait).toHaveBeenNthCalledWith(2, 500);
    await expect(clickPrecompiledDisplayRouteLayoutVariant(
      session,
      '../unsafe',
      wait,
    )).rejects.toThrow(/Unknown precompiled layout variant/);
  });
});
