import type { EdgeTypes } from '@xyflow/react';

type BaseReactFlowEdgeTypeComponents = {
  advancedSmartStepEdge: React.ElementType;
  advancedSmartBezierEdge: React.ElementType;
  advancedSmartStraightEdge: React.ElementType;
  smartOrthogonalEdge: React.ElementType;
  elkEdge: React.ElementType;
  stablePathEdge: React.ElementType;
  canvasRefEdge: React.ElementType;
  editableEdge: React.ElementType;
};

export const createBaseReactFlowMergedEdgeTypes = ({
  edgeTypes,
  components,
}: {
  edgeTypes?: EdgeTypes;
  components: BaseReactFlowEdgeTypeComponents;
}): EdgeTypes => {
  const smartEdges = {
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
  } as unknown as EdgeTypes;
};
