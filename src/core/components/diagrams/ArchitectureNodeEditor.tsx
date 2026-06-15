import React from 'react';
import { Node } from '@xyflow/react';
import { ArchitectureNodeData } from '../custom-nodes/ArchitectureNode';
import { NodeDataUpdate } from '../../types/diagram-updates';
import { Form, Select, Typography, Input, Card, Badge, Space, Button } from 'antd';
import { DashboardOutlined, SafetyCertificateOutlined, SearchOutlined } from '@ant-design/icons';
import { Icon } from '@iconify/react';

const { Text } = Typography;

interface ArchitectureNodeEditorProps {
    selectedNodes: Node[];
    updateNodes: (partialData: NodeDataUpdate) => void;
    armSnapshot: () => void;
    onShowIconExplorer?: (onSelect: (icon: string) => void) => void;
    disabled: boolean;
}

export const ArchitectureNodeEditor: React.FC<ArchitectureNodeEditorProps> = ({
    selectedNodes, updateNodes, armSnapshot, onShowIconExplorer, disabled
}) => {
    if (selectedNodes.length !== 1) {
        return <Text type="secondary">请选择单个架构节点进行编辑</Text>;
    }

    const node = selectedNodes[0];
    const data = node.data as ArchitectureNodeData;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Form layout="vertical" size="small">
                <Form.Item label="资源维度 (Type)">
                    <Select
                        value={data.type}
                        onChange={(val) => { armSnapshot(); updateNodes({ data: { type: val } }); }}
                        disabled={disabled}
                        options={[
                            { label: 'Frontend / Client', value: 'frontend' },
                            { label: 'Gateway / Proxy', value: 'gateway' },
                            { label: 'Microservice / Compute', value: 'microservice' },
                            { label: 'Message Queue / Topic', value: 'messageQueue' },
                            { label: 'Cache / Memory DB', value: 'cache' },
                            { label: 'Database / RDBMS', value: 'database' },
                            { label: 'Storage / Object Store', value: 'storage' },
                            { label: 'Component / Module', value: 'component' },
                            { label: 'System / Group', value: 'system' },
                        ]}
                    />
                </Form.Item>
                <Form.Item label="图标 (Icon)">
                    <Space.Compact style={{ width: '100%' }}>
                        <Input
                            prefix={data.icon ? <Icon icon={data.icon} /> : <SearchOutlined />}
                            placeholder="选择图标..."
                            value={data.icon || ''}
                            readOnly
                            onClick={() => onShowIconExplorer?.((icon) => {
                                armSnapshot();
                                updateNodes({ data: { icon } });
                            })}
                            disabled={disabled}
                            style={{ cursor: 'pointer' }}
                        />
                        <Button
                            icon={<SearchOutlined />}
                            onClick={() => onShowIconExplorer?.((icon) => {
                                armSnapshot();
                                updateNodes({ data: { icon } });
                            })}
                            disabled={disabled}
                        >
                            搜索
                        </Button>
                        {data.icon && (
                            <Button
                                onClick={() => {
                                    armSnapshot();
                                    updateNodes({ data: { icon: undefined } });
                                }}
                                disabled={disabled}
                            >
                                清除
                            </Button>
                        )}
                    </Space.Compact>
                </Form.Item>
                <Form.Item label="健康状态 (Status)">
                    <Select
                        value={data.status || 'normal'}
                        onChange={(val) => { armSnapshot(); updateNodes({ data: { status: val } }); }}
                        disabled={disabled}
                        options={[
                            { label: <Space><Badge status="success" /> 正常运转 (Normal)</Space>, value: 'normal' },
                            { label: <Space><Badge status="warning" /> 告警预警 (Warning)</Space>, value: 'warning' },
                            { label: <Space><Badge status="error" /> 异常阻断 (Error)</Space>, value: 'error' },
                        ]}
                    />
                </Form.Item>
            </Form>

            {data.metrics && data.metrics.length > 0 && (
                <Card size="small" title={<Space><DashboardOutlined /> 实况指标面板</Space>} styles={{ body: { padding: '8px' } }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {data.metrics.map((m, idx) => (
                            <div key={idx} style={{ background: '#fafafa', padding: '6px 8px', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                                <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 2 }}>{m.label}</div>
                                <div style={{ fontSize: 14, fontWeight: 500, color: '#262626' }}>{m.value}</div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {data.linterErrors && data.linterErrors.length > 0 && (
                <Card size="small" title={<Space><SafetyCertificateOutlined style={{color: '#f5222d'}} /> 架构合规风险</Space>} styles={{ body: { padding: '8px' } }}>
                     {data.linterErrors.map((err, idx) => (
                         <div key={idx} style={{ color: '#f5222d', fontSize: 12, marginBottom: 4, display: 'flex', alignItems: 'flex-start' }}>
                             <span style={{ marginRight: 4 }}>•</span> {err}
                         </div>
                     ))}
                </Card>
            )}
        </div>
    );
};
