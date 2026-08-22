import { describe, expect, it } from 'vitest';

import { getStableFlowchartPluginNodeTypes } from '../flowchartPluginRenderers';

describe('flowchartPluginRenderers', () => {
  it('keeps legacy workspace timeline nodes on the timeline renderer', () => {
    const nodeTypes = getStableFlowchartPluginNodeTypes(undefined);

    expect(nodeTypes.timeline).toBe(nodeTypes.timelineNode);
  });
});
