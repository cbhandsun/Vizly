import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { Collapse, Typography, Empty, Input, DatePicker, Slider, Select, Divider, Button } from 'antd';
import { SettingOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { PluginContext } from '../../../types/plugin';
import { useTheme } from '../../../themes/useCoreTheme';
import { appMessage } from '../../../utils/antdStaticBridge';
import { getWorkDaysSigned } from '../../../hooks/useProTimelineEngine';
import {
    buildTimelineDateUpdate,
    buildTimelineDeletionPlan,
    readTimelineDate,
    type TimelineDateField,
} from './timelinePropertyActions';
import { createTimelineDateValidationMessage } from './timelineDateValidationFeedback';
import { ProTaskDeleteDialog } from './ProTaskDeleteDialog';

const { Text } = Typography;

export interface ProTimelinePropertyPanelProps {
    ctx: PluginContext;
    selectedNodes: Node[];
    selectedEdges: Edge[];
}

export const ProTimelinePropertyPanel: React.FC<ProTimelinePropertyPanelProps> = ({
    ctx, selectedNodes
}) => {
    const { t } = useTranslation();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [theme] = useTheme();
    const continuousEditRef = useRef<string | null>(null);
    const isDark = theme?.mode === 'dark';
    const labelColor = isDark ? 'rgba(255,255,255,0.45)' : '#8c8c8c';
    const borderColor = isDark ? '#303030' : '#f0f0f0';

    const activeNodeId = selectedNodes && selectedNodes.length === 1 ? selectedNodes[0].id : null;
    const freshNode = selectedNodes && selectedNodes.length === 1 ? selectedNodes[0] : null;
    const nodeData = freshNode ? freshNode.data : null;
    const isGanttTask = nodeData && ['phase', 'milestone', 'summary', 'event'].includes(nodeData.type as string);

    useEffect(() => {
        continuousEditRef.current = null;
    }, [activeNodeId]);

    const updateNodeData = useCallback((key: string, value: unknown, continuous = false) => {
        if (!selectedNodes || !selectedNodes[0]) return;
        const nodeId = selectedNodes[0].id;
        const setNodes = ctx?.setNodes;
        if (!setNodes) return;
        const currentNode = ctx.getNodes().find(node => node.id === nodeId);
        if (!currentNode || Object.is(currentNode.data?.[key], value)) return;

        const editToken = `${nodeId}:${key}`;
        if (!continuous || continuousEditRef.current !== editToken) {
            ctx.takeSnapshot();
            if (continuous) continuousEditRef.current = editToken;
        }
        setNodes((nds: Node[]) => nds.map((n: Node) => {
            if (n.id === nodeId) {
                return { ...n, data: { ...n.data, [key]: value } };
            }
            return n;
        }));
    }, [selectedNodes, ctx]);

    const finishContinuousEdit = useCallback((key: string) => {
        if (!activeNodeId) return;
        if (continuousEditRef.current === `${activeNodeId}:${key}`) {
            continuousEditRef.current = null;
        }
    }, [activeNodeId]);

    const handleDateChange = useCallback((field: TimelineDateField, value: unknown) => {
        if (!nodeData) return;
        const candidate = dayjs.isDayjs(value) && value.isValid()
            ? value.format('YYYY-MM-DD')
            : null;
        const result = buildTimelineDateUpdate(nodeData, field, candidate);
        if (!result.ok) {
            appMessage.warning(createTimelineDateValidationMessage(
                t(`plugins.timeline.propertyPanel.validation.${result.reason}`),
            ));
            return;
        }
        updateNodeData(field, result.updates[field]);
    }, [nodeData, t, updateNodeData]);

    const handleDelete = useCallback(() => {
        if (!activeNodeId || !ctx) return;
        
        const currentNodes = ctx.getNodes();
        const currentEdges = ctx.getEdges();
        const plan = buildTimelineDeletionPlan(currentNodes, currentEdges, activeNodeId);
        if (plan.deletedNodeIds.size === 0) return;

        ctx.takeSnapshot();
        ctx.setNodes(plan.nodes);
        ctx.setEdges(plan.edges);
        appMessage.success(t('plugins.timeline.propertyPanel.deleteSuccess', {
            count: plan.deletedNodeIds.size,
        }));
    }, [activeNodeId, ctx, t]);

    if (!ctx || !selectedNodes) {
        return (
            <div style={{ padding: 24, textAlign: 'center' }}>
                <Empty description={t('plugins.timeline.propertyPanel.empty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
        );
    }

    if (!isGanttTask) {
        return (
            <div style={{ padding: 24, textAlign: 'center' }}>
                <Empty description={t('plugins.timeline.propertyPanel.empty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
        );
    }

    const normalizedStartDate = readTimelineDate(nodeData?.date);
    const normalizedEndDate = readTimelineDate(nodeData?.endDate);
    const startDayjs = normalizedStartDate ? dayjs(normalizedStartDate) : null;
    const endDayjs = normalizedEndDate ? dayjs(normalizedEndDate) : null;
    const baselineStartDate = readTimelineDate(nodeData?.baselineStartDate);
    const baselineEndDate = readTimelineDate(nodeData?.baselineEndDate) ?? baselineStartDate;
    const baselineDiff = baselineStartDate && normalizedStartDate
        ? getWorkDaysSigned(baselineStartDate, normalizedStartDate)
        : null;

    const items = [
        {
            key: 'basic',
            label: t('plugins.timeline.propertyPanel.sections.basic'),
            children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                        <label htmlFor="timeline-task-name" style={{ display: 'block', fontSize: 12, color: labelColor, marginBottom: 4 }}>
                            {t('plugins.timeline.propertyPanel.fields.name')}
                        </label>
                        <Input 
                            id="timeline-task-name"
                            value={nodeData?.label as string || ''} 
                            onChange={e => updateNodeData('label', e.target.value, true)}
                            onBlur={() => finishContinuousEdit('label')}
                            onPressEnter={event => event.currentTarget.blur()}
                        />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: labelColor, marginBottom: 4 }}>{t('plugins.timeline.propertyPanel.fields.type')}</div>
                        <Select
                            aria-label={t('plugins.timeline.propertyPanel.fields.type')}
                            value={nodeData?.type as string || 'phase'}
                            style={{ width: '100%' }}
                            onChange={val => updateNodeData('type', val)}
                            disabled={nodeData?.type === 'summary'}
                            options={[
                                { value: 'phase', label: t('plugins.timeline.propertyPanel.types.phase') },
                                { value: 'milestone', label: t('plugins.timeline.propertyPanel.types.milestone') },
                                { value: 'event', label: t('plugins.timeline.propertyPanel.types.event') }
                            ]}
                        />
                    </div>
                    {nodeData?.type !== 'summary' && (
                        <div>
                            <div style={{ fontSize: 12, color: labelColor, marginBottom: 4 }}>{t('plugins.timeline.propertyPanel.fields.status')}</div>
                            <Select
                                aria-label={t('plugins.timeline.propertyPanel.fields.status')}
                                value={nodeData?.status as string || 'pending'}
                                style={{ width: '100%' }}
                                onChange={val => updateNodeData('status', val)}
                                options={[
                                    { value: 'pending', label: t('plugins.timeline.propertyPanel.statuses.pending') },
                                    { value: 'active', label: t('plugins.timeline.propertyPanel.statuses.active') },
                                    { value: 'done', label: t('plugins.timeline.propertyPanel.statuses.done') },
                                ]}
                            />
                        </div>
                    )}
                    <div>
                        <label htmlFor="timeline-task-assignee" style={{ display: 'block', fontSize: 12, color: labelColor, marginBottom: 4 }}>
                            {t('plugins.timeline.propertyPanel.fields.assignee')}
                        </label>
                        <Input 
                            id="timeline-task-assignee"
                            value={nodeData?.assignee as string || ''} 
                            onChange={e => updateNodeData('assignee', e.target.value, true)}
                            onBlur={() => finishContinuousEdit('assignee')}
                            onPressEnter={event => event.currentTarget.blur()}
                            placeholder={t('plugins.timeline.propertyPanel.placeholders.assignee')}
                        />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: labelColor, marginBottom: 4 }}>{t('plugins.timeline.propertyPanel.fields.priority')}</div>
                        <Select
                            aria-label={t('plugins.timeline.propertyPanel.fields.priority')}
                            value={nodeData?.priority as string || undefined}
                            style={{ width: '100%' }}
                            onChange={val => updateNodeData('priority', val || undefined)}
                            allowClear
                            placeholder={t('plugins.timeline.propertyPanel.placeholders.priority')}
                            options={[
                                { value: 'high', label: t('plugins.timeline.propertyPanel.priorities.high') },
                                { value: 'medium', label: t('plugins.timeline.propertyPanel.priorities.medium') },
                                { value: 'low', label: t('plugins.timeline.propertyPanel.priorities.low') }
                            ]}
                        />
                    </div>
                </div>
            )
        },
        {
            key: 'schedule',
            label: t('plugins.timeline.propertyPanel.sections.schedule'),
            children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                        <div style={{ fontSize: 12, color: labelColor, marginBottom: 4 }}>{t('plugins.timeline.propertyPanel.fields.startDate')}</div>
                        <DatePicker 
                            aria-label={t('plugins.timeline.propertyPanel.fields.startDate')}
                            disabled={nodeData?.type === 'summary'}
                            value={startDayjs}
                            format="YYYY-MM-DD"
                            onChange={val => handleDateChange('date', val)}
                            style={{ width: '100%' }}
                            allowClear={false}
                        />
                    </div>
                    {nodeData?.type !== 'milestone' && (
                        <div>
                            <div style={{ fontSize: 12, color: labelColor, marginBottom: 4 }}>{t('plugins.timeline.propertyPanel.fields.endDate')}</div>
                            <DatePicker 
                                aria-label={t('plugins.timeline.propertyPanel.fields.endDate')}
                                disabled={nodeData?.type === 'summary'}
                                value={endDayjs}
                                format="YYYY-MM-DD"
                                onChange={val => handleDateChange('endDate', val)}
                                style={{ width: '100%' }}
                                allowClear={false}
                            />
                        </div>
                    )}
                    {nodeData?.type !== 'milestone' && nodeData?.type !== 'event' && (
                        <div>
                            <div style={{ fontSize: 12, color: labelColor, marginBottom: 4 }}>
                                {t('plugins.timeline.propertyPanel.fields.progress', { value: (nodeData?.progress as number) || 0 })}
                            </div>
                            <Slider 
                                ariaLabelForHandle={t('plugins.timeline.propertyPanel.fields.progressLabel')}
                                disabled={nodeData?.type === 'summary'}
                                min={0} max={100} 
                                value={(nodeData?.progress as number) || 0} 
                                onChange={val => updateNodeData('progress', val, true)}
                                onChangeComplete={() => finishContinuousEdit('progress')}
                            />
                        </div>
                    )}
                    {baselineStartDate && baselineEndDate && baselineDiff !== null && (
                        <>
                            <Divider style={{ margin: '12px 0' }} />
                            <div>
                                <div style={{ fontSize: 12, color: labelColor, marginBottom: 6 }}>{t('plugins.timeline.propertyPanel.baseline.title')}</div>
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
                                        <span style={{ color: labelColor }}>{t('plugins.timeline.propertyPanel.baseline.date')}:</span>
                                        <span style={{ fontWeight: 500, color: isDark ? '#fff' : '#000' }}>
                                            {baselineStartDate} ~ {baselineEndDate}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ color: labelColor }}>{t('plugins.timeline.propertyPanel.baseline.deviation')}:</span>
                                        {(() => {
                                            const diff = baselineDiff;
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
                                                        {t('plugins.timeline.propertyPanel.baseline.delayed', { count: diff })}
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
                                                        {t('plugins.timeline.propertyPanel.baseline.early', { count: -diff })}
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
                                                    {t('plugins.timeline.propertyPanel.baseline.aligned')}
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
                <Text strong>{t('plugins.timeline.propertyPanel.title')}</Text>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
                <Collapse 
                    defaultActiveKey={['basic', 'schedule']}
                    ghost
                    items={items}
                />
            </div>
            <div style={{ padding: '16px', borderTop: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'center' }}>
                <Button
                    aria-haspopup="dialog"
                    aria-label={t('plugins.timeline.propertyPanel.deleteTask')}
                    type="primary"
                    danger
                    ghost
                    icon={<DeleteOutlined />}
                    style={{ width: '100%', borderRadius: 8 }}
                    onClick={() => setDeleteDialogOpen(true)}
                >
                    {t('plugins.timeline.propertyPanel.deleteTask')}
                </Button>
            </div>
            <ProTaskDeleteDialog
                open={deleteDialogOpen}
                title={t('plugins.timeline.propertyPanel.deleteConfirmTitle')}
                description={t('plugins.timeline.propertyPanel.deleteConfirmDescription')}
                confirmText={t('plugins.timeline.propertyPanel.deleteConfirm')}
                cancelText={t('common.cancel')}
                onCancel={() => setDeleteDialogOpen(false)}
                onConfirm={() => {
                    setDeleteDialogOpen(false);
                    handleDelete();
                }}
            />
        </div>
    );
};
