import { describe, expect, it } from 'vitest';

import { STANDARD_PRESET_CANVAS_CACHE_VERSION } from '../../components/diagrams/hooks/standardPresetCanvasCache';
import { BASE_DISPLAY_ROUTING_VERSION } from '../../components/shared/baseReactFlowDisplayCache';
import { RENDERED_PATH_CACHE_VERSION } from '../renderedPathCache';
import { EDGE_ROUTING_CACHE_VERSION } from '../routingVersion';

describe('edge routing cache version', () => {
  it('invalidates every rendered-path cache layer from one version source', () => {
    expect(BASE_DISPLAY_ROUTING_VERSION).toBe(EDGE_ROUTING_CACHE_VERSION);
    expect(RENDERED_PATH_CACHE_VERSION).toBe(EDGE_ROUTING_CACHE_VERSION);
    expect(STANDARD_PRESET_CANVAS_CACHE_VERSION).toBe(EDGE_ROUTING_CACHE_VERSION);
  });
});
