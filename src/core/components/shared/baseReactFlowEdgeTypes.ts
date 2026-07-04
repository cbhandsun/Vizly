import type { ComponentType } from 'react';
import type { EdgeTypes } from '@xyflow/react';

type BaseReactFlowEdgeTypeComponents = {
  advancedSmartStepEdge: ComponentType<any>;
  advancedSmartBezierEdge: ComponentType<any>;
  advancedSmartStraightEdge: ComponentType<any>;
  smartOrthogonalEdge: ComponentType<any>;
  elkEdge: ComponentType<any>;
  stablePathEdge: ComponentType<any>;
  canvasRefEdge: ComponentType<any>;
  editableEdge: ComponentType<any>;
};

export const createBaseReactFlowMergedEdgeTypes = ({
  edgeTypes,
  components,
}: {
  edgeTypes?: EdgeTypes;
  components: BaseReactFlowEdgeTypeComponents;
}): EdgeTypes => {
  const smartEdges: Partial<EdgeTypes> = {
    'advanced-smart': components.advancedSmartStepEdge,
    'advanced-smart-step': components.advancedSmartStepEdge,
    'advanced-smart-bezier': components.advancedSmartBezierEdge,
    'advanced-smart-straight': components.advancedSmartStraightEdge,
    smart: components.advancedSmartStepEdge,
    'smart-step': components.advancedSmartStepEdge,
    'smart-bezier': components.advancedSmartBezierEdge,
    'smart-straight': components.advancedSmartStraightEdge,
    'smart-orthogonal': components.smartOrthogonalEdge,
  };

  return {
    elk: components.elkEdge,
    ...smartEdges,
    stablePath: components.stablePathEdge,
    'canvas-ref': components.canvasRefEdge,
    editable: components.editableEdge,
    ...(edgeTypes || {}),
  } as EdgeTypes;
};
