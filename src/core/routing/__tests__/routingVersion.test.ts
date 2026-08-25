import { beforeEach, describe, expect, it } from 'vitest';

import { STANDARD_PRESET_CANVAS_CACHE_VERSION } from '../../components/diagrams/hooks/standardPresetCanvasCache';
import { BASE_DISPLAY_ROUTING_VERSION } from '../../components/shared/baseReactFlowDisplayCache';
import {
  clearRenderedPathCache,
  getRenderedPathCache,
  MAX_RENDERED_PATH_CACHE_SIZE,
  RENDERED_PATH_CACHE_VERSION,
  retainRenderedPathCacheEdges,
  setRenderedPathCacheValue,
} from '../renderedPathCache';
import {
  EDGE_ROUTING_CACHE_VERSION,
  EDGE_ROUTING_VISUAL_VERSION,
} from '../routingVersion';

describe('edge routing cache version', () => {
  beforeEach(() => {
    clearRenderedPathCache();
  });

  it('invalidates every rendered-path cache layer from one version source', () => {
    expect(BASE_DISPLAY_ROUTING_VERSION).toBe(EDGE_ROUTING_CACHE_VERSION);
    expect(RENDERED_PATH_CACHE_VERSION).toBe(EDGE_ROUTING_CACHE_VERSION);
    expect(STANDARD_PRESET_CANVAS_CACHE_VERSION).toBe(EDGE_ROUTING_CACHE_VERSION);
  });

  it('declares an independent renderer-facing commercial contract version', () => {
    expect(EDGE_ROUTING_VISUAL_VERSION).toBe('commercial-hard-gate-v1');
  });

  it('bounds rendered paths and prunes edges that no longer belong to the active graph', () => {
    for (let index = 0; index <= MAX_RENDERED_PATH_CACHE_SIZE; index += 1) {
      setRenderedPathCacheValue(`edge-${index}`, `M ${index} 0`);
    }

    expect(getRenderedPathCache()).toHaveLength(MAX_RENDERED_PATH_CACHE_SIZE);
    expect(getRenderedPathCache().has('edge-0')).toBe(false);

    retainRenderedPathCacheEdges(new Set(['edge-1', 'edge-2']));

    expect([...getRenderedPathCache().keys()]).toEqual(['edge-1', 'edge-2']);
  });
});
