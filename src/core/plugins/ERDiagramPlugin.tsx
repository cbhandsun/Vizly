import React from 'react';
import type { Node, Edge } from '@xyflow/react';
import { Typography } from 'antd';
import { DiagramTypePlugin, PluginContext, SidebarPanel } from '../types/plugin';
import ERDatabaseNode from '../components/custom-nodes/ERDatabaseNode';
import { DatabaseOutlined, TableOutlined, LinkOutlined } from '@ant-design/icons';

const { Text } = Typography;

export class ERDiagramPlugin implements DiagramTypePlugin {
    id = 'er-diagram';
    name = '实体关系图 (ER)';
    version = '1.0';

    async migrate(data: any, _fromVersion: string | undefined): Promise<any> {
        return data;
    }

    parseData(_source: unknown) { return { nodes: [], edges: [] }; }
    serializeData(nodes: Node[], edges: Edge[]) { return { nodes, edges }; }

    getEmptyState() {
        return {
            nodes: [
                {
                    id: 'users-table',
                    type: 'erNode',
                    position: { x: 100, y: 100 },
                    data: {
                        tableName: 'users',
                        themeColor: '#10b981', // green
                        columns: [
                            { name: 'id', type: 'UUID', isPrimary: true },
                            { name: 'email', type: 'VARCHAR(255)' },
                            { name: 'created_at', type: 'TIMESTAMP' }
                        ]
                    }
                },
                {
                    id: 'orders-table',
                    type: 'erNode',
                    position: { x: 450, y: 100 },
                    data: {
                        tableName: 'orders',
                        themeColor: '#3b82f6', // blue
                        columns: [
                            { name: 'id', type: 'UUID', isPrimary: true },
                            { name: 'user_id', type: 'UUID', isForeign: true },
                            { name: 'total_amount', type: 'DECIMAL(10,2)' },
                            { name: 'status', type: 'VARCHAR(50)' }
                        ]
                    }
                }
            ],
            edges: [
                {
                    id: 'e-users-orders',
                    source: 'users-table',
                    target: 'orders-table',
                    sourceHandle: 'right',
                    targetHandle: 'left',
                    type: 'default',
                    label: '1:N',
                    animated: true,
                    style: { stroke: '#94a3b8', strokeWidth: 2 }
                }
            ]
        };
    }

    getSupportedLayouts() { return []; }
    getDefaultLayout() { return ''; }

    getNodeTypes() { 
        return { erNode: ERDatabaseNode }; 
    }
    
    getEdgeTypes() { 
        // fallback to standard edges for now
        return {}; 
    }

    contributeToolbar(_ctx: PluginContext) {
        return null;
    }

    contributeSidebarPanels(_ctx: PluginContext): SidebarPanel[] {
        return [
            {
                id: 'er-components',
                title: '实体库',
                icon: <DatabaseOutlined />,
                content: <ERPalette />
            }
        ];
    }
}

// ====== 侧边栏面板 ======
const ERPalette: React.FC = () => {
    const onDragStart = (event: React.DragEvent, tableDef: any) => {
        event.dataTransfer.setData('application/reactflow', JSON.stringify({
            typeName: 'erNode',
            label: tableDef.tableName,
            config: tableDef
        }));
        event.dataTransfer.effectAllowed = 'move';
    };

    const templates = [
        {
            tableName: 'users',
            themeColor: '#10b981',
            columns: [
                { name: 'id', type: 'UUID', isPrimary: true },
                { name: 'username', type: 'VARCHAR' },
                { name: 'password_hash', type: 'VARCHAR' }
            ]
        },
        {
            tableName: 'products',
            themeColor: '#f59e0b',
            columns: [
                { name: 'id', type: 'BIGINT', isPrimary: true },
                { name: 'name', type: 'VARCHAR(100)' },
                { name: 'price', type: 'DECIMAL(10,2)' }
            ]
        },
        {
            tableName: 'blank_table',
            themeColor: '#64748b',
            columns: [
                { name: 'id', type: 'INT', isPrimary: true },
                { name: 'column_1', type: 'VARCHAR' }
            ]
        }
    ];

    return (
        <div style={{ padding: '16px 12px' }}>
            <div style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
                    预设数据表 (Tables)
                </Text>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                {templates.map((tpl, i) => (
                    <div
                        key={i}
                        draggable
                        onDragStart={(e) => onDragStart(e, tpl)}
                        style={{
                            padding: '12px',
                            border: `1px solid ${tpl.themeColor}40`,
                            borderLeft: `4px solid ${tpl.themeColor}`,
                            borderRadius: '6px',
                            cursor: 'grab',
                            display: 'flex',
                            alignItems: 'center',
                            background: '#ffffff',
                            gap: 12,
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
                        onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                    >
                        <TableOutlined style={{ fontSize: 16, color: tpl.themeColor }} />
                        <span style={{ fontSize: 13, color: '#333', fontWeight: 500, fontFamily: 'monospace' }}>
                            {tpl.tableName}
                        </span>
                    </div>
                ))}
            </div>
            
            <div style={{ marginTop: 24, padding: 12, background: '#f8fafc', borderRadius: 6 }}>
                <Text style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 6 }}>
                    <LinkOutlined />
                    使用连线工具连接表格的锚点来表示外键约束或关联关系。
                </Text>
            </div>
        </div>
    );
};
