import React, { useEffect } from 'react';
import {
    useNodesState,
    useEdgesState,
    MarkerType,
    type Edge,
    type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { AdvancedSmartStepEdge } from '../custom-edges/AdvancedSmartEdge';
import BaseReactFlow from '../shared/BaseReactFlow';

// Node generation helper
const generateGraph = (nodeCount: number, edgeDensity: number) => {
    const nodes = [];
    const edges = [];
    const width = 800;
    const height = 600;

    for (let i = 0; i < nodeCount; i++) {
        nodes.push({
            id: `node-${i}`,
            position: {
                x: Math.random() * width,
                y: Math.random() * height,
            },
            data: { label: `Node ${i}` },
            style: { width: 100, height: 50, border: '1px solid #777', borderRadius: 5, background: 'white' },
        });
    }

    // Connect nodes randomly
    for (let i = 0; i < nodeCount; i++) {
        for (let j = 0; j < nodeCount; j++) {
            if (i !== j && Math.random() < edgeDensity) {
                edges.push({
                    id: `edge-${i}-${j}`,
                    source: `node-${i}`,
                    target: `node-${j}`,
                    type: 'smart',
                    markerEnd: { type: MarkerType.ArrowClosed },
                    data: {
                        edgeConfig: {
                            debug: false,
                            bundleStrength: 0.8
                        }
                    }
                });
            }
        }
    }
    return { nodes, edges };
};

const edgeTypes = {
    smart: AdvancedSmartStepEdge,
};

export const PerformanceDemo: React.FC = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    // Initial generation
    useEffect(() => {
        const { nodes: n, edges: e } = generateGraph(15, 0.3); // ~15 nodes, ~60 edges
        setNodes(n);
        setEdges(e);
    }, [setEdges, setNodes]);

    const handleForceRelayout = () => {
        // Just trigger a re-render/update
        setEdges((eds) => [...eds]);
    };

    const handleModifyGraph = () => {
        // Move a node to invalidate "same inputs" but keep graph ID same? 
        // Or actually modify graph structure
        const { nodes: n, edges: e } = generateGraph(15, 0.3);
        setNodes(n);
        setEdges(e);
    };

    return (
        <div style={{ width: '100%', height: '800px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 10, background: '#eee', borderBottom: '1px solid #ccc', display: 'flex', gap: 10, alignItems: 'center' }}>
                <h3>Performance Demo</h3>
                <button onClick={handleForceRelayout}>Force Re-render (Check Cache)</button>
                <button onClick={handleModifyGraph}>Regenerate Graph (Invalidate Cache)</button>
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
                <BaseReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    edgeTypes={edgeTypes}
                    fitView
                    showBackgroundGrid
                    showControls
                    showMiniMap
                />
            </div>
        </div>
    );
};
