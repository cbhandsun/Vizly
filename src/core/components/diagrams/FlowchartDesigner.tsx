import React from 'react';

import type { DiagramComponentProps } from '../../types/diagram-components';
import { EdgeUpdateProvider } from './EdgeUpdateContext';
import { FlowchartDesignerView } from './FlowchartDesignerView';
import { NodeUpdateProvider } from './NodeUpdateContext';
import { useFlowchartDesignerController } from './useFlowchartDesignerController';
import './FlowchartDesigner.css';
import './ModernControls.css';
import './FlowchartVisualPolish.css';

const FlowchartDesigner: React.FC<DiagramComponentProps> = (props) => {
    const {
        businessData,
        edgeCallbacks,
        updateNodesBatch,
        viewModel,
    } = useFlowchartDesignerController(props);

    return (
        <EdgeUpdateProvider callbacks={edgeCallbacks}>
            <NodeUpdateProvider updateNodesBatch={updateNodesBatch} businessData={businessData}>
                <FlowchartDesignerView model={viewModel} />
            </NodeUpdateProvider>
        </EdgeUpdateProvider>
    );
};

export default FlowchartDesigner;
