import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import { DatabaseOutlined } from '@ant-design/icons';
import './ERDatabaseNode.css';

export interface ERColumn {
    name: string;
    type: string;
    isPrimary?: boolean;
    isForeign?: boolean;
}

export interface ERDatabaseNodeData {
    tableName: string;
    columns: ERColumn[];
    themeColor?: string;
    [key: string]: unknown;
}

const ERDatabaseNode: React.FC<NodeProps<Node<ERDatabaseNodeData>>> = ({ id, data, selected }) => {
    const { tableName, columns = [], themeColor = '#10b981' } = data;

    return (
        <div className={`er-database-node ${selected ? 'selected' : ''}`}>
            {/* Header */}
            <div className="er-header" style={{ backgroundColor: themeColor, color: '#ffffff' }}>
                <DatabaseOutlined className="er-header-icon" />
                <div className="er-header-title">{tableName || 'new_table'}</div>
            </div>

            {/* Columns */}
            <div className="er-column-list">
                {columns.map((col, index) => (
                    <div key={index} className="er-column-row">
                        {/* PK / FK Label */}
                        <div className={`er-column-key ${col.isPrimary ? 'pk' : ''} ${col.isForeign ? 'fk' : ''}`}>
                            {col.isPrimary ? 'PK' : col.isForeign ? 'FK' : ''}
                        </div>
                        
                        <div className="er-column-name">
                            {col.name}
                        </div>

                        <div className="er-column-type">
                            {col.type}
                        </div>

                        {/* Optional Row-level handles for fine-grained connections */}
                        {/* 
                         <Handle type="source" position={Position.Right} id={`col-${index}-right`} className="er-handle" style={{ top: '50%' }} />
                         <Handle type="target" position={Position.Left} id={`col-${index}-left`} className="er-handle" style={{ top: '50%' }} /> 
                        */}
                    </div>
                ))}
                {columns.length === 0 && (
                    <div style={{ padding: '8px 12px', fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>
                        No columns defined.
                    </div>
                )}
            </div>

            {/* Standard Table-Level Handles */}
            <Handle type="target" position={Position.Top} id="top" className="er-handle" isConnectable />
            <Handle type="source" position={Position.Right} id="right" className="er-handle" isConnectable />
            <Handle type="source" position={Position.Bottom} id="bottom" className="er-handle" isConnectable />
            <Handle type="target" position={Position.Left} id="left" className="er-handle" isConnectable />
        </div>
    );
};

export default memo(ERDatabaseNode);
