import React, { useCallback } from 'react';
import { Node, Edge } from '@xyflow/react';
import { Collapse, Typography, Empty, Input, DatePicker, Slider, Select, Divider, Button, Popconfirm } from 'antd';
import { SettingOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { PluginContext } from '../../../types/plugin';
import { useTheme } from '../../../themes/useCoreTheme';
import { appMessage } from '../../../utils/antdStaticBridge';
import { getWorkDaysSigned } from '../../../hooks/useProTimelineEngine';

const { Text } = Typography;

export interface ProTimelinePropertyPanelProps {
    ctx: PluginContext;
    selectedNodes: Node[];
    selectedEdges: Edge[];
}

export const ProTimelinePropertyPanel: React.FC<ProTimelinePropertyPanelProps> = ({
    ctx, selectedNodes
}) => {
    const [theme] = useTheme();
    const isDark = theme?.mode === 'dark';
    const labelColor = isDark ? 'rgba(255,255,255,0.45)' : '#8c8c8c';
    const borderColor = isDark ? '#303030' : '#f0f0f0';

    const activeNodeId = selectedNodes && selectedNodes.length === 1 ? selectedNodes[0].id : null;
    const freshNode = selectedNodes && selectedNodes.length === 1 ? selectedNodes[0] : null;
    const nodeData = freshNode ? freshNode.data : null;
    const isGanttTask = nodeData && ['phase', 'milestone', 'summary', 'event'].includes(nodeData.type as string);

    const updateNodeData = useCallback((key: string, value: any) => {
        if (!selectedNodes || !selectedNodes[0]) return;
        const nodeId = selectedNodes[0].id;
        const setNodes = ctx?.setNodes;
        if (!setNodes) return;
        setNodes((nds: Node[]) => nds.map((n: Node) => {
            if (n.id === nodeId) {
                return { ...n, data: { ...n.data, [key]: value } };
            }
            return n;
        }));
    }, [selectedNodes, ctx]);

    const handleDelete = useCallback(() => {
        if (!activeNodeId || !ctx) return;
        
        // 1. 递归收集要删除的节点ID及其后代ID
        const currentNodes = ctx.getNodes();
        const toDeleteIds = new Set<string>();
        toDeleteIds.add(activeNodeId);

        const collectDescendants = (parentId: string) => {
            currentNodes.forEach(n => {
                if (n.data?.parentId === parentId) {
                    if (!toDeleteIds.has(n.id)) {
                        toDeleteIds.add(n.id);
                        collectDescendants(n.id);
                    }
                }
            });
        };
        collectDescendants(activeNodeId);

        // 2. 更新 nodes 和 edges 状态
        ctx.setNodes((ns: Node[]) => ns.filter(n => !toDeleteIds.has(n.id)));
        ctx.setEdges((eds: Edge[]) => eds.filter(e => !toDeleteIds.has(e.source) && !toDeleteIds.has(e.target)));
        
        appMessage.success('任务及子任务删除成功！');
    }, [activeNodeId, ctx]);

    if (!ctx || !selectedNodes) {
        return (
            <div style={{ padding: 24, textAlign: 'center' }}>
                <Empty description="请选择甘特图任务进行编辑" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
        );
    }

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
                    <div>
                        <div style={{ fontSize: 12, color: labelColor, marginBottom: 4 }}>负责人</div>
                        <Input 
                            value={nodeData?.assignee as string || ''} 
                            onChange={e => updateNodeData('assignee', e.target.value)} 
                            placeholder="请输入负责人姓名"
                        />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: labelColor, marginBottom: 4 }}>优先级</div>
                        <Select
                            value={nodeData?.priority as string || undefined}
                            style={{ width: '100%' }}
                            onChange={val => updateNodeData('priority', val || undefined)}
                            allowClear
                            placeholder="请选择优先级"
                            options={[
                                { value: 'high', label: '高' },
                                { value: 'medium', label: '中' },
                                { value: 'low', label: '低' }
                            ]}
                        />
                    </div>
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
                    {Boolean(nodeData?.baselineStartDate) && (
                        <>
                            <Divider style={{ margin: '12px 0' }} />
                            <div>
                                <div style={{ fontSize: 12, color: labelColor, marginBottom: 6 }}>项目基线排期</div>
                                <div style={{ 
                                    padding: '8px 12px', 
                                    background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#fafafa', 
                                    borderRadius: 6,
                                    border: `1px dashed ${borderColor}`,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 6
                                }}>
                                    <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: labelColor }}>基线日期:</span>
                                        <span style={{ fontWeight: 500, color: isDark ? '#fff' : '#000' }}>
                                            {nodeData.baselineStartDate as string} ~ {nodeData.baselineEndDate as string || nodeData.baselineStartDate as string}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ color: labelColor }}>排期偏差:</span>
                                        {(() => {
                                            const diff = getWorkDaysSigned(nodeData.baselineStartDate as string, nodeData.date as string);
                                            if (diff > 0) {
                                                return (
                                                    <span style={{ 
                                                        color: '#ff4d4f', 
                                                        background: isDark ? 'rgba(255, 77, 79, 0.15)' : 'rgba(255, 77, 79, 0.08)',
                                                        padding: '2px 8px',
                                                        borderRadius: 4,
                                                        fontSize: 11,
                                                        fontWeight: 600
                                                    }}>
                                                        延迟 {diff} 工作日
                                                    </span>
                                                );
                                            }
                                            if (diff < 0) {
                                                return (
                                                    <span style={{ 
                                                        color: '#52c41a', 
                                                        background: isDark ? 'rgba(82, 196, 26, 0.15)' : 'rgba(82, 196, 26, 0.08)',
                                                        padding: '2px 8px',
                                                        borderRadius: 4,
                                                        fontSize: 11,
                                                        fontWeight: 600
                                                    }}>
                                                        提前 {-diff} 工作日
                                                    </span>
                                                );
                                            }
                                            return (
                                                <span style={{ 
                                                    color: labelColor, 
                                                    background: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                                                    padding: '2px 8px',
                                                    borderRadius: 4,
                                                    fontSize: 11
                                                }}>
                                                    对齐无偏差
                                                </span>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </>
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
            {/* 底部删除按钮区 */}
            <div style={{ padding: '16px', borderTop: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'center' }}>
                <Popconfirm
                    title="确定要删除该任务吗？"
                    description="删除该任务将会级联删除其所有子任务以及相关连线，此操作不可逆。"
                    onConfirm={handleDelete}
                    okText="确定删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                >
                    <Button 
                        type="primary" 
                        danger 
                        ghost 
                        icon={<DeleteOutlined />}
                        style={{ width: '100%', borderRadius: 8 }}
                    >
                        删除该任务
                    </Button>
                </Popconfirm>
            </div>
        </div>
    );
};
