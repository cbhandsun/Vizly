import '@vizly/core/style.css';
import '@xyflow/react/dist/style.css';
import { ReactFlowProvider } from '@xyflow/react';
import DiagramViewer from '@/components/DiagramViewer';

const DiagramViewerRoute = () => (
  <ReactFlowProvider>
    <DiagramViewer />
  </ReactFlowProvider>
);

export default DiagramViewerRoute;
