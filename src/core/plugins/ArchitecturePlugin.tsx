import React, { useState, useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { Input, Collapse, Button, Tooltip, Divider } from 'antd';
import {
  DiagramTypePlugin,
  PluginContext,
  SidebarPanel
} from '../types/plugin';

import ArchitectureNode, { ArchitectureNodeType } from '../components/custom-nodes/ArchitectureNode';
import ArchitectureEdge from '../components/custom-nodes/ArchitectureEdge';
import {
    DatabaseOutlined, AppstoreOutlined, BuildOutlined, GatewayOutlined,
    ApiOutlined, SwapOutlined, HddOutlined, CloudServerOutlined, LaptopOutlined,
    SearchOutlined, SafetyCertificateOutlined,
    CheckCircleOutlined, WarningOutlined, CloseCircleOutlined, InfoCircleOutlined,
    ApartmentOutlined, NodeIndexOutlined, PartitionOutlined, ColumnWidthOutlined
} from '@ant-design/icons';
import { useTopologyLinter } from '../hooks/useTopologyLinter';
import { useDiagramStore } from '../store/useDiagramStore';

// ====== 插件定义 ======
export class ArchitecturePlugin implements DiagramTypePlugin {
  id = 'architecture-diagram';
  name = '企业数字化架构图';
  version = '1.0';

  async migrate(data: any, fromVersion: string | undefined): Promise<any> {
    console.log(`[ArchitecturePlugin] Migrating data from ${fromVersion || 'legacy'} to ${this.version}`);
    let migratedData = { ...data };
    if (!fromVersion) {
      // Legacy data: ensure all architecture nodes have a type field
      if (Array.isArray(migratedData.nodes)) {
        migratedData.nodes = migratedData.nodes.map((n: any) => ({
          ...n,
          data: {
            ...n.data,
            type: n.data?.type || 'component',
            status: n.data?.status || 'normal',
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
        { id: 'demo-fe', type: 'architectureNode', position: { x: 80, y: 50 },
          data: { label: 'Web 前端', type: 'frontend', description: '用户流量入口' } },
        { id: 'demo-gw', type: 'architectureNode', position: { x: 300, y: 50 },
          data: { label: 'API Gateway', type: 'gateway', themeColor: '#722ed1',
            metrics: [{ label: 'QPS', value: '1.2k', status: 'success' as const }] } },
        { id: 'demo-svc', type: 'architectureNode', position: { x: 520, y: 50 },
          data: { label: '订单服务', type: 'microservice' } },
        { id: 'demo-mq', type: 'architectureNode', position: { x: 520, y: 200 },
          data: { label: 'OrderMQ', type: 'messageQueue' } },
        { id: 'demo-db', type: 'architectureNode', position: { x: 300, y: 200 },
          data: { label: 'OrderDB', type: 'database' } },
        { id: 'demo-cache', type: 'architectureNode', position: { x: 80, y: 200 },
          data: { label: 'Redis', type: 'cache' } },
      ],
      edges: [
        { id: 'e1', source: 'demo-fe', target: 'demo-gw', type: 'archEdge', data: { semantic: 'sync', label: 'HTTP' } },
        { id: 'e2', source: 'demo-gw', target: 'demo-svc', type: 'archEdge', data: { semantic: 'sync', label: 'gRPC' } },
        { id: 'e3', source: 'demo-svc', target: 'demo-mq', type: 'archEdge', data: { semantic: 'async', label: '发布事件' } },
        { id: 'e4', source: 'demo-svc', target: 'demo-db', type: 'archEdge', data: { semantic: 'dataflow', label: 'CRUD' } },
        { id: 'e5', source: 'demo-svc', target: 'demo-cache', type: 'archEdge', data: { semantic: 'dependency', label: '缓存读取' } },
      ]
    };
  }

  getSupportedLayouts() { return ['DomainElkLayout', 'DomainDagreLayout', 'DomainVerticalLayout']; }
  getDefaultLayout() { return 'DomainElkLayout'; }
  getNodeTypes() { return { architectureNode: ArchitectureNode }; }
  getEdgeTypes() { return { archEdge: ArchitectureEdge }; }
  contributeToolbar(ctx: PluginContext) {
    return <ArchitectureToolbar ctx={ctx} />;
  }

  contributeSidebarPanels(ctx: PluginContext): SidebarPanel[] {
    return [
      {
        id: 'arch-components',
        title: '架构组件库',
        icon: <BuildOutlined />,
        content: <ArchitecturePalette />
      },
      {
        id: 'arch-linter',
        title: '合规校验',
        icon: <SafetyCertificateOutlined />,
        content: <LinterPanel ctx={ctx} />
      }
    ];
  }
}

// ====== 组件定义 ======
interface CompDef { type: ArchitectureNodeType | string; typeName?: string; label: string; color: string; icon: React.ReactNode; keywords: string }

const ALL_COMPONENTS: CompDef[] = [
    { type: 'frontend',      label: '终端 Client',   color: '#a0d911', icon: <LaptopOutlined />,       keywords: '前端 浏览器 app web client' },
    { type: 'gateway',       label: '网关 Gateway',  color: '#722ed1', icon: <GatewayOutlined />,      keywords: '网关 api gateway nginx kong 入口' },
    { type: 'microservice',  label: '微服务 Service', color: '#13c2c2', icon: <ApiOutlined />,          keywords: '微服务 service api 接口 grpc' },
    { type: 'messageQueue',  label: '消息队列 MQ',    color: '#eb2f96', icon: <SwapOutlined />,         keywords: '消息 队列 kafka rabbitmq rocketmq mq 事件' },
    { type: 'cache',         label: '缓存 Cache',    color: '#f5222d', icon: <HddOutlined />,          keywords: '缓存 redis memcached cache' },
    { type: 'storage',       label: '存储 Storage',  color: '#fa8c16', icon: <CloudServerOutlined />,  keywords: '存储 s3 oss minio 对象 文件' },
    { type: 'database',      label: '数据库 DB',     color: '#1890ff', icon: <DatabaseOutlined />,     keywords: '数据库 mysql postgres mongodb rds db' },
    { type: 'system',        label: '业务域 System', color: '#2f54eb', icon: <AppstoreOutlined />,     keywords: '业务 系统 域 domain 应用' },
    { type: 'component',     label: '组件 Component', color: '#52c41a', icon: <BuildOutlined />,       keywords: '组件 模块 component module lib' },
];

const CATEGORIES: Array<{ key: string; title: string; types: string[] }> = [
    { key: 'network',  title: '🌐 网络与接入层',   types: ['frontend', 'gateway'] },
    { key: 'compute',  title: '⚙ 计算与服务层',    types: ['microservice', 'component'] },
    { key: 'data',     title: '🗄 数据与存储层',    types: ['database', 'cache', 'storage', 'messageQueue'] },
    { key: 'business', title: '📦 业务域',          types: ['system'] },
];

// ====== 侧边栏面板 ======
const ArchitecturePalette: React.FC = () => {
    const [search, setSearch] = useState('');

    const onDragStart = (event: React.DragEvent, def: CompDef) => {
        event.dataTransfer.setData('application/reactflow', JSON.stringify({
            typeName: def.typeName || 'architectureNode',
            label: def.label.split(' ')[0],
            config: def.typeName ? {} : { type: def.type, themeColor: def.color }
        }));
        event.dataTransfer.effectAllowed = 'move';
    };

    const filtered = useMemo(() => {
        if (!search.trim()) return null; // null = 按分类显示
        const q = search.toLowerCase();
        return ALL_COMPONENTS.filter(c =>
            c.label.toLowerCase().includes(q) || c.keywords.includes(q)
        );
    }, [search]);

    const renderItem = (def: CompDef) => (
        <div
            key={def.type}
            draggable
            onDragStart={(e) => onDragStart(e, def)}
            style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '12px 8px', cursor: 'grab', 
                border: '1px solid rgba(255, 255, 255, 0.4)',
                borderRadius: 12, 
                background: 'rgba(255, 255, 255, 0.6)', 
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                gap: 6, minHeight: 70,
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
            }}
            onMouseEnter={(e) => { 
                e.currentTarget.style.borderColor = `${def.color}40`; 
                e.currentTarget.style.boxShadow = `0 4px 12px ${def.color}20`; 
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.9)';
                e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => { 
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)'; 
                e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.02)'; 
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.6)';
                e.currentTarget.style.transform = 'none';
            }}
        >
            <span style={{ color: def.color, fontSize: 24, lineHeight: 1, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}>{def.icon}</span>
            <span style={{ fontSize: 11, color: '#454d5d', textAlign: 'center', lineHeight: 1.2, fontWeight: 500 }}>{def.label}</span>
        </div>
    );

    // 搜索模式：平铺网格
    if (filtered) {
        return (
            <div style={{ padding: '8px 10px' }}>
                <Input
                    prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                    placeholder="搜索组件..."
                    size="small"
                    allowClear
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ marginBottom: 10 }}
                />
                {filtered.length === 0 ? (
                    <div style={{ color: '#bfbfbf', textAlign: 'center', padding: 16, fontSize: 12 }}>无匹配组件</div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                        {filtered.map(renderItem)}
                    </div>
                )}
            </div>
        );
    }

    // 自定义折叠分类组件
    const CategoryGroup = ({ cat }: { cat: typeof CATEGORIES[0] }) => {
        const [expanded, setExpanded] = useState(true);
        return (
            <div style={{ marginBottom: 16 }}>
                <div 
                    onClick={() => setExpanded(!expanded)}
                    style={{ 
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                        padding: '6px 4px', cursor: 'pointer', userSelect: 'none',
                        color: '@text-color-secondary', fontWeight: 600, fontSize: 12, marginBottom: 8 
                    }}
                >
                    <span style={{ color: '#595959' }}>{cat.title}</span>
                    <span style={{ 
                        fontSize: 10, color: '#bfbfbf', transition: 'transform 0.2s', 
                        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' 
                    }}>▶</span>
                </div>
                <div style={{ 
                    display: expanded ? 'grid' : 'none', 
                    gridTemplateColumns: 'repeat(2, 1fr)', 
                    gap: 8 
                }}>
                    {cat.types.map(t => {
                        const def = ALL_COMPONENTS.find(c => c.type === t);
                        return def ? renderItem(def) : null;
                    })}
                </div>
            </div>
        );
    };

    return (
        <div style={{ padding: '4px 8px' }}>
            <div style={{ 
                position: 'sticky', top: 0, zIndex: 10, 
                background: 'rgba(250, 250, 250, 0.8)', 
                backdropFilter: 'blur(8px)',
                paddingBottom: 12 
            }}>
                <Input
                    prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                    placeholder="搜索组件..."
                    size="small"
                    allowClear
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ 
                        borderRadius: 6, 
                        border: '1px solid #e0e0e0', 
                        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)' 
                    }}
                />
            </div>
            
            <div style={{ marginTop: 4 }}>
                {CATEGORIES.map(cat => (
                    <CategoryGroup key={cat.key} cat={cat} />
                ))}
            </div>
        </div>
    );
};

// ====== 合规校验面板 ======
const SEVERITY_CONFIG = {
    error:   { color: '#f5222d', icon: <CloseCircleOutlined />,  label: '错误' },
    warning: { color: '#faad14', icon: <WarningOutlined />,      label: '警告' },
    info:    { color: '#1890ff', icon: <InfoCircleOutlined />,    label: '提示' },
};

// ====== 架构图专属工具栏 ======
const ArchitectureToolbar: React.FC<{ ctx: PluginContext }> = ({ ctx }) => {
    if (!ctx) return null;

    const handleAutoLayout = () => {
        // Dispatch layout event to the designer
        window.dispatchEvent(new CustomEvent('diagram:requestLayout', {
            detail: { strategy: 'DomainElkLayout' }
        }));
    };

    const handleToggleDirection = () => {
        window.dispatchEvent(new CustomEvent('diagram:toggleDirection'));
    };

    const handleAddRelationship = () => {
        const nodes = ctx.getNodes();
        const selected = nodes.filter(n => n.selected);
        if (selected.length === 2) {
            const newEdge = {
                id: `arch-e-${Date.now()}`,
                source: selected[0].id,
                target: selected[1].id,
                type: 'archEdge',
                data: { semantic: 'dependency', label: '依赖' }
            };
            ctx.setEdges(eds => [...eds, newEdge as any]);
            
            // Trigger smart layout after a tiny delay so state resolves
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('diagram:requestLayout', {
                    detail: { strategy: 'DomainElkLayout' }
                }));
            }, 50);
        }
    };

    const selectedCount = ctx.getNodes().filter(n => n.selected).length;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', borderLeft: '1px solid #e8e8e8', marginLeft: 8 }}>
            <Tooltip title="ELK 智能布局">
                <Button size="small" type="text" icon={<ApartmentOutlined />} onClick={handleAutoLayout} />
            </Tooltip>
            <Tooltip title="切换流向">
                <Button size="small" type="text" icon={<PartitionOutlined />} onClick={handleToggleDirection} />
            </Tooltip>

            <Divider orientation="vertical" style={{ height: 16, margin: '0 2px' }} />

            <Tooltip title={selectedCount === 2 ? '建立依赖关系' : '请选中两个节点'}>
                <Button size="small" type="text" icon={<NodeIndexOutlined />} onClick={handleAddRelationship} disabled={selectedCount !== 2} />
            </Tooltip>
        </div>
    );
};

const LinterPanel: React.FC<{ ctx: PluginContext }> = ({ ctx }) => {
    // 订阅 Store 来做高频率更新（如果面板需要实时反映节点移动后的校验结果）
    const nodes = useDiagramStore(s => s.nodes);
    const edges = useDiagramStore(s => s.edges);
    const { violations } = useTopologyLinter(nodes, edges);

    const errorCount = violations.filter(v => v.severity === 'error').length;
    const warnCount = violations.filter(v => v.severity === 'warning').length;
    const infoCount = violations.filter(v => v.severity === 'info').length;

    if (violations.length === 0) {
        return (
            <div style={{ padding: 16, textAlign: 'center' }}>
                <CheckCircleOutlined style={{ fontSize: 32, color: '#52c41a', marginBottom: 8 }} />
                <div style={{ fontSize: 13, color: '#52c41a', fontWeight: 600 }}>架构合规</div>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>当前拓扑未检出违规连线</div>
            </div>
        );
    }

    return (
        <div style={{ padding: '8px 10px' }}>
            {/* 统计条 */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 10, padding: '6px 8px', background: '#fafafa', borderRadius: 6, fontSize: 12 }}>
                {errorCount > 0 && <span style={{ color: '#f5222d' }}><CloseCircleOutlined /> {errorCount} 错误</span>}
                {warnCount > 0 && <span style={{ color: '#faad14' }}><WarningOutlined /> {warnCount} 警告</span>}
                {infoCount > 0 && <span style={{ color: '#1890ff' }}><InfoCircleOutlined /> {infoCount} 提示</span>}
            </div>
            {/* 违规列表 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {violations.map((v, i) => {
                    const sev = SEVERITY_CONFIG[v.severity];
                    return (
                        <div 
                            key={i} 
                            style={{
                                padding: '6px 8px', borderRadius: 6,
                                border: `1px solid ${sev.color}30`,
                                background: `${sev.color}08`,
                                fontSize: 12, lineHeight: 1.5,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                            onClick={() => {
                                window.dispatchEvent(new CustomEvent('editor:focus-entity', {
                                    detail: { edgeId: v.edgeId, nodeId: v.targetId }
                                }));
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = `${sev.color}15`; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = `${sev.color}08`; }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                                <span style={{ color: sev.color }}>{sev.icon}</span>
                                <strong style={{ color: sev.color, fontSize: 11 }}>{v.ruleId}</strong>
                            </div>
                            <div style={{ color: '#595959' }}>{v.message}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
