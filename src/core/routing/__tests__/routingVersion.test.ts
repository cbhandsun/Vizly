import { describe, expect, it } from 'vitest';

import { STANDARD_PRESET_CANVAS_CACHE_VERSION } from '../../components/diagrams/hooks/standardPresetCanvasCache';
import { BASE_DISPLAY_ROUTING_VERSION } from '../../components/shared/baseReactFlowDisplayCache';
import {
  EDGE_ROUTING_CACHE_VERSION,
  EDGE_ROUTING_VISUAL_VERSION,
} from '../routingVersion';

describe('edge routing cache version', () => {
  it('invalidates every active routing cache layer from one version source', () => {
    expect(BASE_DISPLAY_ROUTING_VERSION).toBe(EDGE_ROUTING_CACHE_VERSION);
    expect(STANDARD_PRESET_CANVAS_CACHE_VERSION).toBe(EDGE_ROUTING_CACHE_VERSION);
  });

  it('declares an independent renderer-facing commercial contract version', () => {
    expect(EDGE_ROUTING_VISUAL_VERSION).toBe('commercial-hard-gate-v1');
  });
});
