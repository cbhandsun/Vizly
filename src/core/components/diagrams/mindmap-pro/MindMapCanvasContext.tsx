import React, { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useMindMapOrchestrator } from '../hooks/useMindMapOrchestrator';

export const MindMapCanvasContext: React.FC = () => {
    const { getNodes, getEdges, setNodes, setEdges } = useReactFlow();
    
    // We proxy takeSnapshot to the globally registered handler in FlowchartDesigner
    const takeSnapshot = useCallback(() => {
        window.dispatchEvent(new CustomEvent('diagram:save-snapshot'));
    }, []);

    // Provide reactive getters by utilizing useReactFlow internal state, but 
    // actually useMindMapOrchestrator was expecting raw nodes/edges passed in as normal props.
    // Wait, useMindMapOrchestrator expects reactive nodes and edges. It runs useEffects on them!
    
    // Let's use `useNodes()` and `useEdges()` since orchestrator expects reactive changes.
    // Actually, `useReactFlow` provides `getNodes` and `getEdges` which are functions.
    // Let's look at `useMindMapOrchestrator`...
    return <MindMapOrchestratorRunner takeSnapshot={takeSnapshot} />;
};

import { useNodes, useEdges } from '@xyflow/react';

const MindMapOrchestratorRunner: React.FC<{ takeSnapshot: () => void }> = ({ takeSnapshot }) => {
    const nodes = useNodes();
    const edges = useEdges();
    const { setNodes, setEdges } = useReactFlow();

    useMindMapOrchestrator(nodes, edges, setNodes, setEdges, takeSnapshot);

    return null; // Implicit headless component, zero UI, pure logic orchestrator
};
