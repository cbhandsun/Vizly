// Type definitions for diagram data updates
import { Edge } from '@xyflow/react';
import type { FlowchartNodeData, FlowchartShape } from './flowchart-node';

/**
 * Type-safe interface for node data updates
 * Used in PropertyPanel and diagram actions to ensure type safety
 */
export interface NodeDataUpdate {
    // Node data properties
    label?: string;
    description?: string;
    icon?: string;
    shape?: FlowchartShape;
    domain?: string;
    domainClass?: string;
    sequence?: number;
    themeColor?: string;

    // Theme properties
    theme?: {
        main?: string;
        border?: string;
        background?: string;
        text?: string;
    };

    // Style properties
    style?: Partial<React.CSSProperties>;

    // Data property for explicit data updates
    data?: Partial<FlowchartNodeData>;

    // Allow additional data properties for extensibility
    [key: string]: unknown;
}

/**
 * Type-safe interface for edge data updates
 * Used in PropertyPanel to update edge properties
 */
export interface EdgeDataUpdate {
    // Style properties - compatible with React.CSSProperties
    style?: Partial<React.CSSProperties>;

    // Marker properties  
    markerEnd?: Edge['markerEnd'];
    markerStart?: Edge['markerStart'];

    animated?: boolean;

    // Edge type
    type?: string;

    // Data properties
    data?: {
        label?: string;
        manualHandles?: boolean;
        auto?: unknown[];
        [key: string]: unknown;
    };

    // Label (can be at top level or in data)
    label?: string;

    // Allow additional properties for extensibility
    [key: string]: unknown;
}

/**
 * Helper type for batch node updates
 */
export interface NodeBatchUpdate {
    ids: string[];
    data: NodeDataUpdate;
    snapshot?: boolean;
}

/**
 * Helper type for batch edge updates
 */
export interface EdgeBatchUpdate {
    ids: string[];
    data: EdgeDataUpdate;
}
