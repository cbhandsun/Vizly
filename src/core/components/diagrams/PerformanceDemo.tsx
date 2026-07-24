import React, { useState, useEffect } from 'react';
import {
    ReactFlow,
    useNodesState,
    useEdgesState,
    Background,
    Controls,
    MiniMap,
    MarkerType,
    type Edge,
    type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { AdvancedSmartStepEdge } from '../custom-edges/AdvancedSmartEdge';
import WorkerPool from '../../workers/WorkerPool';

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

type WorkerPoolStats = ReturnType<WorkerPool['getStats']>;

export const PerformanceDemo: React.FC = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [stats, setStats] = useState<WorkerPoolStats | null>(null);

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
        // Mark pool dirty
        WorkerPool.getInstance().markDirty();
    };

    const updateStats = () => {
        const pool = WorkerPool.getInstance();
        setStats(pool.getStats());
    };

    // Poll for stats
    useEffect(() => {
        const timer = setInterval(updateStats, 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div style={{ width: '100%', height: '800px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 10, background: '#eee', borderBottom: '1px solid #ccc', display: 'flex', gap: 10, alignItems: 'center' }}>
                <h3>Performance Demo</h3>
                <button onClick={handleForceRelayout}>Force Re-render (Check Cache)</button>
                <button onClick={handleModifyGraph}>Regenerate Graph (Invalidate Cache)</button>
                <div style={{ marginLeft: 20 }}>
                    <strong>Workers:</strong> {stats?.poolSize || 0} |
                    <strong> Busy:</strong> {stats?.busyCount || 0} |
                    <strong> Queue:</strong> {stats?.queueLength || 0}
                </div>
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    edgeTypes={edgeTypes}
                    fitView
                >
                    <Background />
                    <Controls />
                    <MiniMap />
                </ReactFlow>
            </div>
        </div>
    );
};
