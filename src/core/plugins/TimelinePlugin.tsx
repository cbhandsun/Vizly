import React from 'react';
import type { Node, Edge } from '@xyflow/react';
import {
  DiagramTypePlugin,
  PluginContext,
  SidebarPanel
} from '../types/plugin';

import { FlagOutlined, CheckCircleFilled, SyncOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import ProTimelineCanvas from '../components/diagrams/timeline-pro/ProTimelineCanvas';
import { ProTimelinePropertyPanel } from '../components/diagrams/timeline-pro/ProTimelinePropertyPanel';
import { Calendar, Clock } from 'lucide-react';
import { todayDateOnly } from '../utils/dateOnly';
import { validateProTimelineDependencyConnection } from '../components/diagrams/timeline-pro/proTimelineDependencyConnection';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { buildTimelineAppendPlan, type TimelineAppendType } from './timelineToolbarActions';
import './TimelinePlugin.css';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const migrateTimelineNode = (value: unknown): unknown => {
  if (!isRecord(value)) return value;
  const data = isRecord(value.data) ? value.data : {};
  return {
    ...value,
    data: {
      ...data,
      status: typeof data.status === 'string' && data.status ? data.status : 'pending',
      date: typeof data.date === 'string' && data.date ? data.date : todayDateOnly(),
    },
  };
};

export class TimelinePlugin implements DiagramTypePlugin {
  id = 'timeline-diagram';
  get name() {
    return i18n.t('plugins.timeline.title');
  }
  version = '1.1.0';
  get description() {
    return i18n.t('plugins.timeline.description');
  }
  author = 'Vizly Core';
  category: 'Core' | 'Productivity' | 'Integration' | 'Beta' = 'Productivity';
  tags = ['Gantt', 'Project', 'Timeline'];
  brandColor = '#52c41a';

  replacesDefaultCanvas = true;
  hideDefaultSidebar = true;
  hideContextToolbar = true;
  hideMiniMap = true;
  hideGridControls = true;
  hideLayoutControls = true;
  hideFlowFocusControls = true;
  hideZoomControls = true;
  hideCenterIsland = true;
  
  async migrate<T>(data: T, fromVersion: string | undefined): Promise<T> {
      if (!isRecord(data)) return data;
      const migratedData: Record<string, unknown> = { ...data };
      
      // Example Migration: From 1.0 (or undefined) to 1.1
      // Clean up legacy node properties or enforce new schema defaults
      if (!fromVersion || fromVersion === '1.0') {
          if (Array.isArray(migratedData.nodes)) {
              migratedData.nodes = migratedData.nodes.map(migrateTimelineNode);
          }
      }

      return migratedData as T;
  }

  parseData(_source: unknown) { return { nodes: [], edges: [] }; }
  serializeData(nodes: Node[], edges: Edge[]) { return { nodes, edges }; }

  getEmptyState() {
    return {
      nodes: [
        {
          id: 'tl-kickoff', type: 'timelineNode', position: { x: 0, y: 120 },
          data: { label: '项目启动', type: 'event', status: 'done', date: '2026-04-01', description: '需求冻结，正式启动研发' }
        },
        {
          id: 'tl-dev', type: 'timelineNode', position: { x: 280, y: 120 },
          data: { label: '核心研发阶段', type: 'phase', status: 'active', date: '2026-04-01', endDate: '2026-04-15', description: '后端微服务重构 + 前端组件开发', progress: 65 }
        },
        {
          id: 'tl-alpha', type: 'timelineNode', position: { x: 560, y: 120 },
          data: { label: 'Alpha 发布', type: 'milestone', status: 'pending', date: '2026-04-15', description: '内部测试版本' }
        },
        {
          id: 'tl-test', type: 'timelineNode', position: { x: 780, y: 120 },
          data: { label: '集成测试', type: 'phase', status: 'pending', date: '2026-04-15', endDate: '2026-04-25', description: 'E2E + 性能压测', progress: 0 }
        },
        {
          id: 'tl-launch', type: 'timelineNode', position: { x: 1060, y: 120 },
          data: { label: '正式上线', type: 'milestone', status: 'pending', date: '2026-04-30' }
        },
      ],
      edges: [
        { id: 'te1', source: 'tl-kickoff', target: 'tl-dev', type: 'smoothstep', style: { stroke: '#52c41a', strokeWidth: 3 }, animated: true },
        { id: 'te2', source: 'tl-dev', target: 'tl-alpha', type: 'smoothstep', style: { stroke: '#1890ff', strokeWidth: 3 }, animated: true },
        { id: 'te3', source: 'tl-alpha', target: 'tl-test', type: 'smoothstep', style: { stroke: '#d9d9d9', strokeWidth: 2 } },
        { id: 'te4', source: 'tl-test', target: 'tl-launch', type: 'smoothstep', style: { stroke: '#d9d9d9', strokeWidth: 2 } },
      ]
    };
  }

  getSupportedLayouts() { return ['DomainHorizontalLayout']; }
  getDefaultLayout() { return 'DomainHorizontalLayout'; }
  getNodeTypes() { return {}; }
  getEdgeTypes() { return {}; }
  
  contributeToolbar(ctx: PluginContext) {
      return <TimelineSmartActionBar ctx={ctx} />;
  }

  contributeCanvasComponents(ctx: PluginContext) {
      return <ProTimelineCanvas ctx={ctx} />;
  }

  contributeSidebarPanels(_ctx: PluginContext): SidebarPanel[] {
    return [{
      id: 'timeline-components',
      title: '时间轴组件',
      icon: <Clock size={14} strokeWidth={2} />,
      content: <TimelinePalette />
    }];
  }

  renderCustomPropertyPanel(ctx: PluginContext, selectedNodes: Node[], selectedEdges: Edge[]): React.ReactNode {
    return <ProTimelinePropertyPanel ctx={ctx} selectedNodes={selectedNodes} selectedEdges={selectedEdges} />;
  }

  onValidateConnection(connection: import('@xyflow/react').Connection, ctx: PluginContext): boolean {
      const { source, target } = connection;
      if (!source || !target || source === target) return false;

      const nodes = ctx.getNodes();
      return validateProTimelineDependencyConnection({
          sourceId: source,
          targetId: target,
          tasks: nodes.map((node) => ({
              id: node.id,
              startDate: node.data?.date ?? node.data?.startDate,
              endDate: node.data?.endDate ?? node.data?.date ?? node.data?.startDate,
          })),
          edges: ctx.getEdges(),
      }).ok;
  }
}

// ====== 侧边栏面板 ======
const TimelinePalette: React.FC = () => {
    const onDragStart = (event: React.DragEvent, type: string, defaultLabel: string, status: string = 'pending') => {
        const target = event.target as HTMLElement;
        const bcr = target.getBoundingClientRect();
        const offsetX = event.clientX - bcr.left;
        const offsetY = event.clientY - bcr.top;

        event.dataTransfer.setData('application/reactflow', JSON.stringify({
            typeName: 'timelineNode',
            label: defaultLabel,
            config: { type, status, date: todayDateOnly() },
            offsetX, offsetY
        }));
        event.dataTransfer.effectAllowed = 'move';
    };

    const items = [
        { type: 'event',     label: '普通事件',  color: '#1890ff', icon: <Clock size={18} color="#1890ff" strokeWidth={2} />, bg: '#e6f7ff' },
        { type: 'phase',     label: '时间阶段',  color: '#52c41a', icon: <Calendar size={18} color="#52c41a" strokeWidth={2} />,    bg: '#f6ffed' },
        { type: 'milestone', label: '里程碑',    color: '#cf1322', icon: <FlagOutlined style={{ color: '#cf1322' }} />,         bg: '#fff1f0' },
    ];

    return (
        <div style={{ padding: '4px 8px' }}>
            <p style={{ marginBottom: 12, color: '#8c8c8c', fontSize: 12, paddingLeft: 4 }}>拖拽时间节点到画布中：</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {items.map(item => (
                    <div
                        key={item.type}
                        draggable
                        onDragStart={(e) => onDragStart(e, item.type, item.label)}
                        style={{
                            padding: '14px 16px', background: 'rgba(255, 255, 255, 0.6)', 
                            border: `1px solid ${item.color}40`,
                            borderRadius: item.type === 'milestone' ? 24 : 12,
                            cursor: 'grab', display: 'flex', alignItems: 'center', gap: 12,
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', 
                            fontSize: 13, color: '#262626',
                            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                        }}
                        onMouseEnter={(e) => { 
                            e.currentTarget.style.boxShadow = `0 4px 12px ${item.color}20`; 
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.9)';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.borderColor = `${item.color}80`;
                        }}
                        onMouseLeave={(e) => { 
                            e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.02)'; 
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.6)';
                            e.currentTarget.style.transform = 'none';
                            e.currentTarget.style.borderColor = `${item.color}40`;
                        }}
                    >
                        <span style={{ fontSize: 20, display: 'flex', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}>{item.icon}</span>
                        <span style={{ fontWeight: 600, color: '#454d5d' }}>{item.label}</span>
                    </div>
                ))}
            </div>

            {/* 状态标注说明 */}
            <div style={{ marginTop: 16, padding: '8px 10px', background: '#fafafa', borderRadius: 6, fontSize: 11, color: '#8c8c8c' }}>
                <div style={{ fontWeight: 500, marginBottom: 6, color: '#595959' }}>状态标注：</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircleFilled style={{ color: '#52c41a', fontSize: 12 }} /> <span>已完成 — 轴心点实心填充</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <SyncOutlined spin style={{ color: '#1890ff', fontSize: 12 }} /> <span>进行中 — 旋转动画图标</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <MinusCircleOutlined style={{ color: '#bfbfbf', fontSize: 12 }} /> <span>待开始 — 灰色空心</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
const TimelineSmartActionBar: React.FC<{ ctx: PluginContext }> = ({ ctx }) => {
    const { t } = useTranslation();
    if (!ctx) return null;
    const { setNodes, setEdges } = ctx;

    const handleAppendNode = (type: TimelineAppendType) => {
        const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const plan = buildTimelineAppendPlan({
            nodes: ctx.getNodes(),
            type,
            nodeId: `tl-node-${token}`,
            edgeId: `te-${token}`,
            label: t(`plugins.timeline.labels.${type}`),
            fallbackDate: todayDateOnly(),
        });

        ctx.takeSnapshot();
        setNodes(nodes => [
            ...nodes.map(node => ({ ...node, selected: false })),
            plan.node,
        ]);
        const appendedEdge = plan.edge;
        if (appendedEdge) {
            setEdges(edges => [...edges, appendedEdge]);
        }
        appMessage.success(t('plugins.timeline.toolbar.created', {
            item: t(`plugins.timeline.labels.${type}`),
        }));
    };

    return (
        <div className="timeline-plugin-toolbar">
            <Tooltip title={t('plugins.timeline.toolbar.addEvent')}>
                <Button className="timeline-plugin-toolbar__action" type="text" aria-label={t('plugins.timeline.toolbar.addEvent')} icon={<Clock aria-hidden="true" size={16} color="#1890ff" strokeWidth={2} />} onClick={() => handleAppendNode('event')} />
            </Tooltip>
            <Tooltip title={t('plugins.timeline.toolbar.addPhase')}>
                <Button className="timeline-plugin-toolbar__action" type="text" aria-label={t('plugins.timeline.toolbar.addPhase')} icon={<Calendar aria-hidden="true" size={16} color="#52c41a" strokeWidth={2} />} onClick={() => handleAppendNode('phase')} />
            </Tooltip>
            <Tooltip title={t('plugins.timeline.toolbar.addMilestone')}>
                <Button className="timeline-plugin-toolbar__action" type="text" aria-label={t('plugins.timeline.toolbar.addMilestone')} icon={<FlagOutlined aria-hidden="true" style={{ color: '#cf1322' }} />} onClick={() => handleAppendNode('milestone')} />
            </Tooltip>
        </div>
    );
};

