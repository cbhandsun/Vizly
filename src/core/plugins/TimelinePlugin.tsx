import React from 'react';
import type { Node, Edge } from '@xyflow/react';
import {
  DiagramTypePlugin,
  PluginContext,
  SidebarPanel
} from '../types/plugin';

import { CalendarOutlined, ClockCircleOutlined, FlagOutlined, CheckCircleFilled, SyncOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import ProTimelineCanvas from '../components/diagrams/timeline-pro/ProTimelineCanvas';
import { ProTimelinePropertyPanel } from '../components/diagrams/timeline-pro/ProTimelinePropertyPanel';
import dayjs from 'dayjs';

export class TimelinePlugin implements DiagramTypePlugin {
  id = 'timeline-diagram';
  name = '项目级时间线图 (Pro)';
  version = '1.1.0';
  description = 'Pro 级甘特图与时间线引擎，支持阶段推演、依赖联动与原子级随动演练，是项目管理与路线图规划的神兵利器。';
  author = 'Vizly Core';
  category = 'Productivity';
  tags = ['Gantt', 'Project', 'Timeline'];
  brandColor = '#52c41a';

  hideDefaultSidebar = true;
  
  async migrate(data: any, fromVersion: string | undefined): Promise<any> {
      console.log(`[TimelinePlugin] Migrating data from version ${fromVersion || '1.0'} to ${this.version}`);
      let migratedData = { ...data };
      
      // Example Migration: From 1.0 (or undefined) to 1.1
      // Clean up legacy node properties or enforce new schema defaults
      if (!fromVersion || fromVersion === '1.0') {
          if (Array.isArray(migratedData.nodes)) {
              migratedData.nodes = migratedData.nodes.map((n: any) => ({
                  ...n,
                  data: {
                      ...n.data,
                      // Ensure every timeline node has a status (legacy data might be missing it)
                      status: n.data?.status || 'pending',
                      // Ensure date strings are standardized if needed
                      date: n.data?.date || new Date().toISOString().split('T')[0]
                  }
              }));
          }
      }

      return migratedData;
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
      return <ProTimelineCanvas />;
  }

  contributeSidebarPanels(_ctx: PluginContext): SidebarPanel[] {
    return [{
      id: 'timeline-components',
      title: '时间轴组件',
      icon: <ClockCircleOutlined />,
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
      const sourceNode = nodes.find(n => n.id === source);
      const targetNode = nodes.find(n => n.id === target);
      if (!sourceNode || !targetNode) return false;

      // Rule 1: Time Causality (Source must not occur after target)
      // For spans (phases), use endDate as completion time, otherwise use date
      const sDateStr = sourceNode.data?.endDate || sourceNode.data?.date;
      const tDateStr = targetNode.data?.date;

      if (sDateStr && tDateStr) {
          const sTime = dayjs(sDateStr as string).valueOf();
          const tTime = dayjs(tDateStr as string).valueOf();
          // Reject reverse-time connections
          if (sTime > tTime) {
              return false;
          }
      }

      // Rule 2: Prevent Cyclic Dependencies (check if path exists from target -> source)
      const edges = ctx.getEdges();
      const hasPath = (current: string, destination: string, visited: Set<string> = new Set()): boolean => {
          if (current === destination) return true;
          if (visited.has(current)) return false;
          visited.add(current);
          const outEdges = edges.filter(e => e.source === current);
          return outEdges.some(e => hasPath(e.target, destination, visited));
      };

      if (hasPath(target, source)) {
          return false;
      }

      return true;
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
            config: { type, status, date: new Date().toISOString().split('T')[0] },
            offsetX, offsetY
        }));
        event.dataTransfer.effectAllowed = 'move';
    };

    const items = [
        { type: 'event',     label: '普通事件',  color: '#1890ff', icon: <ClockCircleOutlined style={{ color: '#1890ff' }} />, bg: '#e6f7ff' },
        { type: 'phase',     label: '时间阶段',  color: '#52c41a', icon: <CalendarOutlined style={{ color: '#52c41a' }} />,    bg: '#f6ffed' },
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
// ====== 智能控制栏 ======
// ====== 智能控制栏 (精简版) ======
import { Tooltip, Divider } from 'antd';
import { FullscreenOutlined, AimOutlined } from '@ant-design/icons';

const TimelineSmartActionBar: React.FC<{ ctx: PluginContext }> = ({ ctx }) => {
    if (!ctx) return null;
    const { nodes = [], setNodes, setEdges } = ctx;

    const handleAppendNode = (type: 'event' | 'phase' | 'milestone') => {
        const timelineNodes = nodes.filter(n => ['phase', 'event', 'milestone'].includes(n.data.type as string) || n.type === 'timelineNode');
        
        let prevNodeId: string | null = null;
        let newNodeDate = new Date().toISOString().split('T')[0];
        
        if (timelineNodes.length > 0) {
            const latestNode = timelineNodes.reduce((prev, current) => {
                const prevD = new Date(prev.data.date as string).getTime();
                const currD = new Date(current.data.date as string).getTime();
                return prevD > currD ? prev : current;
            });
            prevNodeId = latestNode.id;
            newNodeDate = dayjs(latestNode.data.endDate as string || latestNode.data.date as string).add(2, 'day').format('YYYY-MM-DD');
        }

        const newNodeId = `tl-node-${Date.now()}`;
        const defaultLabel = type === 'event' ? '新事件' : type === 'phase' ? '新阶段' : '新里程碑';
        
        const newNode: Node = {
            id: newNodeId,
            type: 'timelineNode',
            position: { x: 0, y: 0 },
            data: { 
                type, 
                label: defaultLabel, 
                status: 'pending', 
                date: newNodeDate,
                ...(type === 'phase' ? {
                    progress: 0,
                    endDate: dayjs(newNodeDate).add(14, 'day').format('YYYY-MM-DD')
                } : {})
            }
        };

        setNodes(nds => [...nds, newNode]);

        if (prevNodeId) {
            const newEdge: Edge = {
                id: `te-${Date.now()}`,
                source: prevNodeId,
                target: newNodeId,
                type: 'smoothstep',
                style: { stroke: '#d9d9d9', strokeWidth: 2 }
            };
            setEdges(eds => [...eds, newEdge]);
        }
    };

    const handleFocusToday = () => {
        window.dispatchEvent(new CustomEvent('timeline:focusToday'));
    };

    const handleFitView = () => {
        window.dispatchEvent(new CustomEvent('timeline:fitAll'));
    };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', borderLeft: '1px solid #e8e8e8', marginLeft: 8 }}>
            {/* 追加操作 */}
            <Tooltip title="追加事件">
                <Button size="small" type="text" icon={<ClockCircleOutlined style={{ color: '#1890ff' }} />} onClick={() => handleAppendNode('event')} />
            </Tooltip>
            <Tooltip title="追加阶段">
                <Button size="small" type="text" icon={<CalendarOutlined style={{ color: '#52c41a' }} />} onClick={() => handleAppendNode('phase')} />
            </Tooltip>
            <Tooltip title="追加里程碑">
                <Button size="small" type="text" icon={<FlagOutlined style={{ color: '#cf1322' }} />} onClick={() => handleAppendNode('milestone')} />
            </Tooltip>

            <Divider orientation="vertical" style={{ height: 16, margin: '0 2px' }} />

            {/* 视图操作 */}
            <Tooltip title="今天居中">
                <Button size="small" type="text" icon={<AimOutlined />} onClick={handleFocusToday} />
            </Tooltip>
            <Tooltip title="适应全部">
                <Button size="small" type="text" icon={<FullscreenOutlined />} onClick={handleFitView} />
            </Tooltip>
        </div>
    );
};

