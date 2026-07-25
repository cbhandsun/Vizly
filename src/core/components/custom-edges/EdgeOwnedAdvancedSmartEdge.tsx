import type { EdgeProps } from '@xyflow/react';

import { useEdgeLabelInteractions } from './hooks/useEdgeLabelInteractions';
import { useSmartEdgeRouting } from './hooks/useSmartEdgeRouting';
import { AdvancedSmartEdgeGraphics } from './renderers/AdvancedSmartEdgeGraphics';

export const EdgeOwnedAdvancedSmartEdge = (props: EdgeProps) => {
  const labelManager = useEdgeLabelInteractions(props);
  const router = useSmartEdgeRouting(props);
  return <AdvancedSmartEdgeGraphics router={router} labelManager={labelManager} props={props} />;
};
