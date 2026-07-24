import React from 'react';
import type { Node, Edge } from '@xyflow/react';
import { Typography } from 'antd';
import { DiagramTypePlugin, PluginContext, SidebarPanel } from '../types/plugin';
import SwimLaneNode from '../components/custom-nodes/SwimLaneNode';
import { MenuOutlined, BorderHorizontalOutlined, BorderVerticleOutlined } from '@ant-design/icons';

const { Text } = Typography;

export class SwimlanePlugin implements DiagramTypePlugin {
    id = 'swimlane-diagram';
    name = '泳道图';
    version = '1.0';

    async migrate<T>(data: T, _fromVersion: string | undefined): Promise<T> {
        return data;
    }

    parseData(_source: unknown) { return { nodes: [], edges: [] }; }
    serializeData(nodes: Node[], edges: Edge[]) { return { nodes, edges }; }

    getEmptyState() {
        return {
            nodes: [
                {
                    id: 'swimlane-1',
                    type: 'swimlane',
                    position: { x: 100, y: 100 },
                    data: { label: '业务流程 (水平)', direction: 'horizontal' },
                    style: { width: 800, height: 400 },
                    zIndex: -2,
                }
            ],
            edges: []
        };
    }

    getSupportedLayouts() { return []; }
    getDefaultLayout() { return ''; }

    getNodeTypes() { 
        return { swimlane: SwimLaneNode }; 
    }
    
    getEdgeTypes() { 
        return {}; 
    }

    contributeToolbar(_ctx: PluginContext) {
        return null;
    }

    contributeSidebarPanels(_ctx: PluginContext): SidebarPanel[] {
        return [
            {
                id: 'swimlane-components',
                title: '泳道组件',
                icon: <MenuOutlined />,
                content: <SwimlanePalette />
            }
        ];
    }
}

// ====== 侧边栏面板 ======
const SwimlanePalette: React.FC = () => {
    const onDragStart = (event: React.DragEvent, direction: 'horizontal' | 'vertical') => {
        event.dataTransfer.setData('application/reactflow', JSON.stringify({
            typeName: 'swimlane',
            label: direction === 'horizontal' ? '水平泳道' : '垂直泳道',
            config: { direction }
        }));
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <div style={{ padding: '16px 12px' }}>
            <div style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
                    基础泳道库 (Swimlanes)
                </Text>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div
                    draggable
                    onDragStart={(e) => onDragStart(e, 'horizontal')}
                    style={{
                        padding: '12px 8px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        cursor: 'grab',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#ffffff',
                        gap: 8,
                        transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#6366f1';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(99, 102, 241, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb';
                        e.currentTarget.style.boxShadow = 'none';
                    }}
                >
                    <BorderHorizontalOutlined style={{ fontSize: 24, color: '#6366f1' }} />
                    <span style={{ fontSize: 12, color: '#374151' }}>水平泳道</span>
                </div>

                <div
                    draggable
                    onDragStart={(e) => onDragStart(e, 'vertical')}
                    style={{
                        padding: '12px 8px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        cursor: 'grab',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#ffffff',
                        gap: 8,
                        transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#6366f1';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(99, 102, 241, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb';
                        e.currentTarget.style.boxShadow = 'none';
                    }}
                >
                    <BorderVerticleOutlined style={{ fontSize: 24, color: '#6366f1' }} />
                    <span style={{ fontSize: 12, color: '#374151' }}>垂直泳道</span>
                </div>
            </div>
            
            <div style={{ marginTop: 24 }}>
                <Text style={{ fontSize: 12, color: '#9ca3af' }}>
                    提示: 将泳道拖入画布后，您可以点击泳道上方的 "+" 号动态增加子通道。可配合通用画布的组件使用。
                </Text>
            </div>
        </div>
    );
};
