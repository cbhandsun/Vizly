import React, { useState, useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { Input, Button, Tooltip, Divider } from 'antd';
import { useTranslation } from 'react-i18next';
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
    ApartmentOutlined, NodeIndexOutlined, PartitionOutlined, LoadingOutlined
} from '@ant-design/icons';
import { useTopologyLinter } from '../hooks/useTopologyLinter';
import { useDiagramStore } from '../store/useDiagramStore';
import { AccessibleInputClearIcon } from '../components/diagrams/AccessibleInputClearIcon';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const migrateArchitectureNode = (value: unknown): unknown => {
  if (!isRecord(value)) return value;
  const data = isRecord(value.data) ? value.data : {};
  return {
    ...value,
    data: {
      ...data,
      type: typeof data.type === 'string' && data.type ? data.type : 'component',
      status: typeof data.status === 'string' && data.status ? data.status : 'normal',
    },
  };
};

// ====== 插件定义 ======
export class ArchitecturePlugin implements DiagramTypePlugin {
  id = 'architecture-diagram';
  name = '企业数字化架构图';
  version = '1.1.0';
  description = '专为企业架构师设计的绘图工具，内置合规性校验 (Linter)、分层拓扑布局与标准化组件库。';
  author = 'Vizly Core';
  category = 'Productivity' as const;
  tags = ['Enterprise', 'Architecture', 'Governance'];
  brandColor = '#722ed1';

  async migrate(data: unknown, fromVersion: string | undefined): Promise<unknown> {
    if (!isRecord(data)) return data;
    const migratedData = { ...data };
    if (!fromVersion) {
      // Legacy data: ensure all architecture nodes have a type field
      if (Array.isArray(migratedData.nodes)) {
        migratedData.nodes = migratedData.nodes.map(migrateArchitectureNode);
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
        content: <ArchitecturePalette ctx={ctx} />
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
interface CompDef {
    type: ArchitectureNodeType | string;
    typeName?: string;
    labelKey: string;
    color: string;
    icon: React.ReactNode;
    keywords: string;
}

const ARCHITECTURE_SEARCH_MAX_LENGTH = 100;

const ALL_COMPONENTS: CompDef[] = [
    { type: 'frontend',      labelKey: 'designer.architecture.components.frontend',     color: '#a0d911', icon: <LaptopOutlined />,       keywords: '前端 浏览器 app web client' },
    { type: 'gateway',       labelKey: 'designer.architecture.components.gateway',      color: '#722ed1', icon: <GatewayOutlined />,      keywords: '网关 api gateway nginx kong 入口' },
    { type: 'microservice',  labelKey: 'designer.architecture.components.microservice', color: '#13c2c2', icon: <ApiOutlined />,          keywords: '微服务 service api 接口 grpc' },
    { type: 'messageQueue',  labelKey: 'designer.architecture.components.messageQueue', color: '#eb2f96', icon: <SwapOutlined />,         keywords: '消息 队列 kafka rabbitmq rocketmq mq 事件' },
    { type: 'cache',         labelKey: 'designer.architecture.components.cache',        color: '#f5222d', icon: <HddOutlined />,          keywords: '缓存 redis memcached cache' },
    { type: 'storage',       labelKey: 'designer.architecture.components.storage',      color: '#fa8c16', icon: <CloudServerOutlined />,  keywords: '存储 s3 oss minio 对象 文件' },
    { type: 'database',      labelKey: 'designer.architecture.components.database',     color: '#1890ff', icon: <DatabaseOutlined />,     keywords: '数据库 mysql postgres mongodb rds db' },
    { type: 'system',        labelKey: 'designer.architecture.components.system',       color: '#2f54eb', icon: <AppstoreOutlined />,     keywords: '业务 系统 域 domain 应用' },
    { type: 'component',     labelKey: 'designer.architecture.components.component',    color: '#52c41a', icon: <BuildOutlined />,        keywords: '组件 模块 component module lib' },
];

const CATEGORIES: Array<{ key: string; titleKey: string; types: string[] }> = [
    { key: 'network',  titleKey: 'designer.architecture.categories.network',  types: ['frontend', 'gateway'] },
    { key: 'compute',  titleKey: 'designer.architecture.categories.compute',  types: ['microservice', 'component'] },
    { key: 'data',     titleKey: 'designer.architecture.categories.data',     types: ['database', 'cache', 'storage', 'messageQueue'] },
    { key: 'business', titleKey: 'designer.architecture.categories.business', types: ['system'] },
];

// ====== 侧边栏面板 ======
const ArchitecturePalette: React.FC<{ ctx: PluginContext }> = ({ ctx }) => {
    const { t } = useTranslation();
    const [search, setSearch] = useState('');

    const onDragStart = (event: React.DragEvent, def: CompDef) => {
        const label = t(def.labelKey);
        event.dataTransfer.setData('application/reactflow', JSON.stringify({
            typeName: def.typeName || 'architectureNode',
            label,
            config: def.typeName ? {} : { type: def.type, themeColor: def.color }
        }));
        event.dataTransfer.effectAllowed = 'move';
    };

    const filtered = useMemo(() => {
        if (!search.trim()) return null; // null = 按分类显示
        const q = search.trim().toLowerCase();
        return ALL_COMPONENTS.filter(c =>
            t(c.labelKey).toLowerCase().includes(q) || c.keywords.includes(q)
        );
    }, [search, t]);

    const renderItem = (def: CompDef) => {
        const label = t(def.labelKey);
        return (
            <button
                type="button"
                key={def.type}
                draggable
                onDragStart={(e) => onDragStart(e, def)}
                onClick={() => {
                    ctx.addNode(def.typeName || 'architectureNode', {
                        label,
                        ...(def.typeName ? {} : { type: def.type, themeColor: def.color })
                    });
                }}
                aria-label={t('designer.architecture.addComponent', { component: label })}
                style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    width: '100%', padding: '12px 8px', cursor: 'grab', font: 'inherit',
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
                <span style={{ fontSize: 11, color: '#454d5d', textAlign: 'center', lineHeight: 1.2, fontWeight: 500 }}>{label}</span>
            </button>
        );
    };

    // 自定义折叠分类组件
    const CategoryGroup = ({ cat }: { cat: typeof CATEGORIES[0] }) => {
        const [expanded, setExpanded] = useState(true);
        const contentId = `architecture-category-${cat.key}`;
        return (
            <div style={{ marginBottom: 16 }}>
                <button
                    type="button"
                    onClick={() => setExpanded(!expanded)}
                    aria-expanded={expanded}
                    aria-controls={contentId}
                    style={{ 
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                        width: '100%', padding: '6px 4px', cursor: 'pointer', userSelect: 'none',
                        background: 'transparent', border: 0, font: 'inherit',
                        color: '@text-color-secondary', fontWeight: 600, fontSize: 12, marginBottom: 8 
                    }}
                >
                    <span style={{ color: '#595959' }}>{t(cat.titleKey)}</span>
                    <span style={{ 
                        fontSize: 10, color: '#bfbfbf', transition: 'transform 0.2s', 
                        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' 
                    }} aria-hidden="true">›</span>
                </button>
                <div id={contentId} style={{
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
                    placeholder={t('designer.sidebar.searchComponents')}
                    aria-label={t('designer.sidebar.searchComponents')}
                    maxLength={ARCHITECTURE_SEARCH_MAX_LENGTH}
                    size="small"
                    allowClear={{ clearIcon: <AccessibleInputClearIcon label={t('designer.sidebar.clearSearch')} /> }}
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
                {filtered ? (
                    filtered.length === 0 ? (
                        <div
                            role="status"
                            aria-live="polite"
                            aria-atomic="true"
                            style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                                color: '#667085', textAlign: 'center', padding: '28px 16px', fontSize: 12,
                            }}
                        >
                            <span>{t('designer.sidebar.noComponentsFound', { query: search.trim() })}</span>
                            <Button size="small" onClick={() => setSearch('')}>
                                {t('designer.sidebar.showAllComponents')}
                            </Button>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                            {filtered.map(renderItem)}
                        </div>
                    )
                ) : (
                    CATEGORIES.map(cat => (
                        <CategoryGroup key={cat.key} cat={cat} />
                    ))
                )}
            </div>
        </div>
    );
};

// ====== 合规校验面板 ======
const SEVERITY_CONFIG = {
    error: { color: '#f5222d', icon: <CloseCircleOutlined />, labelKey: 'designer.architecture.validation.severity.error' },
    warning: { color: '#faad14', icon: <WarningOutlined />, labelKey: 'designer.architecture.validation.severity.warning' },
    info: { color: '#1890ff', icon: <InfoCircleOutlined />, labelKey: 'designer.architecture.validation.severity.info' },
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
            const newEdge: Edge = {
                id: `arch-e-${Date.now()}`,
                source: selected[0].id,
                target: selected[1].id,
                type: 'archEdge',
                data: { semantic: 'dependency', label: '依赖' }
            };
            ctx.setEdges(eds => [...eds, newEdge]);
            
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
    const { t } = useTranslation();
    const nodes = useDiagramStore(state => state.nodes);
    const edges = useDiagramStore(state => state.edges);
    const { violations, isPending } = useTopologyLinter(nodes, edges);

    const errorCount = violations.filter(violation => violation.severity === 'error').length;
    const warnCount = violations.filter(violation => violation.severity === 'warning').length;
    const infoCount = violations.filter(violation => violation.severity === 'info').length;

    if (nodes.length === 0) {
        return (
            <div role="status" aria-live="polite" style={{ padding: 16, textAlign: 'center' }}>
                <InfoCircleOutlined aria-hidden="true" style={{ fontSize: 32, color: '#667085', marginBottom: 8 }} />
                <div style={{ fontSize: 13, color: '#344054', fontWeight: 600 }}>
                    {t('designer.architecture.validation.empty.title')}
                </div>
                <div style={{ fontSize: 12, color: '#667085', marginTop: 4 }}>
                    {t('designer.architecture.validation.empty.description')}
                </div>
            </div>
        );
    }

    if (isPending) {
        return (
            <div role="status" aria-live="polite" style={{ padding: 16, textAlign: 'center' }}>
                <LoadingOutlined aria-hidden="true" spin style={{ fontSize: 32, color: '#1677ff', marginBottom: 8 }} />
                <div style={{ fontSize: 13, color: '#344054', fontWeight: 600 }}>
                    {t('designer.architecture.validation.checking.title')}
                </div>
                <div style={{ fontSize: 12, color: '#667085', marginTop: 4 }}>
                    {t('designer.architecture.validation.checking.description')}
                </div>
            </div>
        );
    }

    if (violations.length === 0) {
        return (
            <div role="status" aria-live="polite" style={{ padding: 16, textAlign: 'center' }}>
                <CheckCircleOutlined aria-hidden="true" style={{ fontSize: 32, color: '#389e0d', marginBottom: 8 }} />
                <div style={{ fontSize: 13, color: '#237804', fontWeight: 600 }}>
                    {t('designer.architecture.validation.compliant.title')}
                </div>
                <div style={{ fontSize: 12, color: '#667085', marginTop: 4 }}>
                    {t('designer.architecture.validation.compliant.description', {
                        nodeCount: nodes.length,
                        edgeCount: edges.length,
                    })}
                </div>
            </div>
        );
    }

    return (
        <div style={{ padding: '8px 10px' }}>
            <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                style={{ display: 'flex', gap: 12, marginBottom: 10, padding: '6px 8px', background: '#fafafa', borderRadius: 6, fontSize: 12 }}
            >
                {errorCount > 0 && <span style={{ color: '#cf1322' }}><CloseCircleOutlined aria-hidden="true" /> {t('designer.architecture.validation.summary.error', { count: errorCount })}</span>}
                {warnCount > 0 && <span style={{ color: '#ad6800' }}><WarningOutlined aria-hidden="true" /> {t('designer.architecture.validation.summary.warning', { count: warnCount })}</span>}
                {infoCount > 0 && <span style={{ color: '#0958d9' }}><InfoCircleOutlined aria-hidden="true" /> {t('designer.architecture.validation.summary.info', { count: infoCount })}</span>}
            </div>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
                {violations.map(violation => {
                    const severity = SEVERITY_CONFIG[violation.severity];
                    const message = violation.messageKey
                        ? t(violation.messageKey, { defaultValue: violation.message })
                        : violation.message;
                    const focusNodeId = violation.targetId || violation.sourceId;
                    return (
                        <li key={`${violation.ruleId}:${violation.edgeId || violation.sourceId}:${violation.targetId}`}>
                            <button
                                type="button"
                                aria-label={t('designer.architecture.validation.inspectIssue', {
                                    ruleId: violation.ruleId,
                                    message,
                                })}
                                style={{
                                    width: '100%', textAlign: 'left', font: 'inherit',
                                    padding: '6px 8px', borderRadius: 6,
                                    border: `1px solid ${severity.color}30`,
                                    background: `${severity.color}08`,
                                    fontSize: 12, lineHeight: 1.5,
                                    cursor: 'pointer', transition: 'all 0.2s',
                                }}
                                onClick={() => {
                                    ctx.setNodes(currentNodes => currentNodes.map(node => ({
                                        ...node,
                                        selected: !violation.edgeId && node.id === focusNodeId,
                                    })));
                                    ctx.setEdges(currentEdges => currentEdges.map(edge => ({
                                        ...edge,
                                        selected: Boolean(violation.edgeId) && edge.id === violation.edgeId,
                                    })));
                                    window.dispatchEvent(new CustomEvent('editor:focus-entity', {
                                        detail: violation.edgeId
                                            ? { edgeId: violation.edgeId }
                                            : { nodeId: focusNodeId },
                                    }));
                                }}
                                onMouseEnter={(event) => { event.currentTarget.style.background = `${severity.color}15`; }}
                                onMouseLeave={(event) => { event.currentTarget.style.background = `${severity.color}08`; }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                                    <span style={{ color: severity.color }} aria-hidden="true">{severity.icon}</span>
                                    <strong style={{ color: severity.color, fontSize: 11 }}>{violation.ruleId}</strong>
                                    <span style={{ color: '#667085', fontSize: 11 }}>{t(severity.labelKey)}</span>
                                </div>
                                <div style={{ color: '#344054' }}>{message}</div>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};
