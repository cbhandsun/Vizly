import React, { useCallback, useMemo } from 'react';
import { Node, Edge } from '@xyflow/react';
import { Collapse, Typography, Empty, Input, DatePicker, Slider, Select, Divider } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { PluginContext } from '../../../types/plugin';
import { useTheme } from '../../../themes/useCoreTheme';

const { Text } = Typography;

export interface ProTimelinePropertyPanelProps {
    ctx: PluginContext;
    selectedNodes: Node[];
    selectedEdges: Edge[];
}

export const ProTimelinePropertyPanel: React.FC<ProTimelinePropertyPanelProps> = ({
    ctx, selectedNodes
}) => {
    if (!ctx || !selectedNodes) {
        return (
            <div style={{ padding: 24, textAlign: 'center' }}>
                <Empty description="请选择甘特图任务进行编辑" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
        );
    }
    const { setNodes } = ctx;

    const activeNodeId = selectedNodes.length === 1 ? selectedNodes[0].id : null;
    const freshNode = selectedNodes.length === 1 ? selectedNodes[0] : null;
    const nodeData = freshNode ? freshNode.data : null;
    const isGanttTask = nodeData && ['phase', 'milestone', 'summary', 'event'].includes(nodeData.type as string);
    const [theme] = useTheme();
    const isDark = theme?.mode === 'dark';
    const labelColor = isDark ? 'rgba(255,255,255,0.45)' : '#8c8c8c';
    const borderColor = isDark ? '#303030' : '#f0f0f0';

    const updateNodeData = useCallback((key: string, value: any) => {
        if (!selectedNodes[0]) return;
        const nodeId = selectedNodes[0].id;
        setNodes((nds: Node[]) => nds.map((n: Node) => {
            if (n.id === nodeId) {
                return { ...n, data: { ...n.data, [key]: value } };
            }
            return n;
        }));
    }, [selectedNodes, setNodes]);

    if (!isGanttTask) {
        return (
            <div style={{ padding: 24, textAlign: 'center' }}>
                <Empty description="请选择甘特图任务进行编辑" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
        );
    }

    const startDayjs = nodeData?.date ? dayjs(nodeData.date as string) : null;
    const endDayjs = nodeData?.endDate ? dayjs(nodeData.endDate as string) : null;

    const items = [
        {
            key: 'basic',
            label: '基础信息',
            children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                        <div style={{ fontSize: 12, color: labelColor, marginBottom: 4 }}>任务名称</div>
                        <Input 
                            value={nodeData?.label as string || ''} 
                            onChange={e => updateNodeData('label', e.target.value)} 
                        />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: labelColor, marginBottom: 4 }}>任务类型</div>
                        <Select
                            value={nodeData?.type as string || 'phase'}
                            style={{ width: '100%' }}
                            onChange={val => updateNodeData('type', val)}
                            disabled={nodeData?.type === 'summary'} // 不允许随便把汇总条改掉
                            options={[
                                { value: 'phase', label: '阶段 (Phase)' },
                                { value: 'milestone', label: '里程碑 (Milestone)' },
                                { value: 'event', label: '事件 (Event)' }
                            ]}
                        />
                    </div>
                    {nodeData?.type !== 'summary' && (
                        <div>
                            <div style={{ fontSize: 12, color: labelColor, marginBottom: 4 }}>状态</div>
                            <Select
                                value={nodeData?.status as string || 'pending'}
                                style={{ width: '100%' }}
                                onChange={val => updateNodeData('status', val)}
                                options={[
                                    { value: 'pending', label: '待开始' },
                                    { value: 'active', label: '进行中' },
                                    { value: 'done', label: '已完成' },
                                ]}
                            />
                        </div>
                    )}
                </div>
            )
        },
        {
            key: 'schedule',
            label: '排期与进度',
            children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                        <div style={{ fontSize: 12, color: labelColor, marginBottom: 4 }}>起始日期</div>
                        <DatePicker 
                            disabled={nodeData?.type === 'summary'}
                            value={startDayjs}
                            format="YYYY-MM-DD"
                            onChange={val => updateNodeData('date', val ? val.format('YYYY-MM-DD') : undefined)}
                            style={{ width: '100%' }}
                            allowClear={false}
                        />
                    </div>
                    {nodeData?.type !== 'milestone' && (
                        <div>
                            <div style={{ fontSize: 12, color: labelColor, marginBottom: 4 }}>结束日期</div>
                            <DatePicker 
                                disabled={nodeData?.type === 'summary'}
                                value={endDayjs}
                                format="YYYY-MM-DD"
                                onChange={val => updateNodeData('endDate', val ? val.format('YYYY-MM-DD') : undefined)}
                                style={{ width: '100%' }}
                                allowClear={false}
                            />
                        </div>
                    )}
                    {nodeData?.type !== 'milestone' && nodeData?.type !== 'event' && (
                        <div>
                            <div style={{ fontSize: 12, color: labelColor, marginBottom: 4 }}>当前进度 {(nodeData?.progress as number) || 0}%</div>
                            <Slider 
                                disabled={nodeData?.type === 'summary'}
                                min={0} max={100} 
                                value={(nodeData?.progress as number) || 0} 
                                onChange={val => updateNodeData('progress', val)} 
                            />
                        </div>
                    )}
                </div>
            )
        }
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${borderColor}` }}>
                <SettingOutlined />
                <Text strong>面板属性</Text>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
                <Collapse 
                    defaultActiveKey={['basic', 'schedule']}
                    ghost
                    items={items}
                />
            </div>
        </div>
    );
};
