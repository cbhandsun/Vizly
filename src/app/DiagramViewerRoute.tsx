import { ReactFlowProvider } from '@xyflow/react';
import DiagramViewer from '@/components/DiagramViewer';

const DiagramViewerRoute = () => (
  <ReactFlowProvider>
    <DiagramViewer />
  </ReactFlowProvider>
);

export default DiagramViewerRoute;
