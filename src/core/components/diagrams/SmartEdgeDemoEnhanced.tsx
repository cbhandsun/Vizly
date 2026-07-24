// src/components/diagrams/SmartEdgeDemoEnhanced.tsx
import React from 'react';
import { ReactFlow, MiniMap, Controls, Background, addEdge, useEdgesState, useNodesState, type Connection } from '@xyflow/react';
import { AdvancedSmartStepEdge } from '../custom-edges/AdvancedSmartEdge';

/**
 * Simple demo showcasing the new Smart Edge features.
 * - Uses `AdvancedSmartEdge` which now relies on `useSmartEdgeContext`.
 * - Allows zooming to see adaptive jitter suppression.
 */
const initialNodes = [
    { id: '1', type: 'default', data: { label: 'Node A' }, position: { x: 0, y: 0 } },
    { id: '2', type: 'default', data: { label: 'Node B' }, position: { x: 300, y: 0 } },
    { id: '3', type: 'default', data: { label: 'Node C' }, position: { x: 150, y: 200 } },
];

const initialEdges = [
    { id: 'e1-2', source: '1', target: '2', type: 'advanced-smart' },
    { id: 'e2-3', source: '2', 'target': '3', type: 'advanced-smart' },
    { id: 'e3-1', source: '3', target: '1', type: 'advanced-smart' },
];

export default function SmartEdgeDemoEnhanced() {
    const [nodes, _setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    const onConnect = (params: Connection) => setEdges((eds) => addEdge({ ...params, type: 'advanced-smart' }, eds));

    return (
        <div style={{ width: '100%', height: '500px' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                edgeTypes={{ 'advanced-smart': AdvancedSmartStepEdge }}
                fitView
            >
                <MiniMap />
                <Controls />
                <Background />
            </ReactFlow>
        </div>
    );
}
