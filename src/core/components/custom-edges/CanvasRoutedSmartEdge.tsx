import type { EdgeProps } from '@xyflow/react';

import { useCanvasRoutedEdge } from './hooks/useCanvasRoutedEdge';
import { useEdgeLabelInteractions } from './hooks/useEdgeLabelInteractions';
import { AdvancedSmartEdgeGraphics } from './renderers/AdvancedSmartEdgeGraphics';

export const CanvasRoutedSmartEdge = (props: EdgeProps) => {
  const labelManager = useEdgeLabelInteractions(props);
  const router = useCanvasRoutedEdge(props);
  return <AdvancedSmartEdgeGraphics router={router} labelManager={labelManager} props={props} />;
};
