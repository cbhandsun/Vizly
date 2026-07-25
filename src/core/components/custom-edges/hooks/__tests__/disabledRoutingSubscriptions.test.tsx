// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EdgeRoutingCoordinator } from '../../../../services/EdgeRoutingCoordinator';
import { LineJumpEngine } from '../../../../services/LineJumpEngine';
import { useChannelRouting } from '../useChannelRouting';
import { useLineJumps } from '../useLineJumps';
import { useSharedTrunks } from '../useSharedTrunks';

describe('disabled routing subscriptions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not instantiate global routing engines for disabled hooks', () => {
    const getLineJumpEngine = vi.spyOn(LineJumpEngine, 'getInstance');
    const getCoordinator = vi.spyOn(EdgeRoutingCoordinator, 'getInstance');

    const { result } = renderHook(() => ({
      channel: useChannelRouting({
        edgeId: 'edge-1',
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        enabled: false,
      }),
      jumps: useLineJumps({
        edgeId: 'edge-1',
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        enabled: false,
      }),
      trunks: useSharedTrunks(false),
    }));

    expect(result.current).toEqual({
      channel: null,
      jumps: { jumps: [], jumpPath: null },
      trunks: [],
    });
    expect(getLineJumpEngine).not.toHaveBeenCalled();
    expect(getCoordinator).not.toHaveBeenCalled();
  });
});
