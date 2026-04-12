const fs = require('fs');

const path = 'e:/DEV/WorkSpace/Antigravity-WS/Vizly/src/core/plugins/FlowchartPlugin.tsx';
let content = fs.readFileSync(path, 'utf-8');

// Insert imports securely if they don't exist
if (!content.includes("import { Input")) {
    content = content.replace("import { theme, Tooltip, Typography, Collapse } from 'antd';", "import { theme, Tooltip, Typography, Collapse, Input } from 'antd';");
}
if (!content.includes("SearchOutlined")) {
    content = content.replace("import { FaShapes", "import { SearchOutlined } from '@ant-design/icons';\nimport { useState } from 'react';\nimport { FaShapes");
}

// Extract onDragStart mapping content exactly
const onDragStartRegion = content.substring(content.indexOf('const onDragStart = '), content.indexOf('const renderDraggableItem'));

// The new core component code
const newShapesPanelCode = `export const FlowchartShapesPanel: React.FC<{ ctx: PluginContext }> = ({ ctx }) => {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const [search, setSearch] = useState('');

    ` + onDragStartRegion + `
    const renderDraggableItem = (label: string, icon: React.ReactNode, type: string, typeName: string, config: NodeConfig) => {
        return (
            <Tooltip key={label} title={label} placement="right">
                <div
                    draggable
                    onDragStart={(event) => onDragStart(event, type, typeName, label, config)}
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
                        e.currentTarget.style.borderColor = 'rgba(24, 144, 255, 0.4)'; 
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(24, 144, 255, 0.15)'; 
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
                    <div style={{ fontSize: 24, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}>
                        {icon}
                    </div>
                    <Text style={{ fontSize: 10, textAlign: 'center', lineHeight: 1.2, color: '#454d5d', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', fontWeight: 500 }}>
                        {label}
                    </Text>
                </div>
            </Tooltip>
        );
    };

    const ALL_ITEMS = [
        // Basic
        { category: 'basic', label: 'Circle', icon: <ShapePreview shape="circle" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'ellipse', icon: 'circle', theme: { main: '#2196F3', border: '#1e88e5', text: '#fff' } } },
        { category: 'basic', label: 'Rect', icon: <ShapePreview shape="rectangle" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'square', theme: { main: '#2196F3', border: '#1e88e5', text: '#fff' } } },
        { category: 'basic', label: 'Diamond', icon: <ShapePreview shape="diamond" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'diamond', icon: 'question', theme: { main: '#2196F3', border: '#1e88e5', text: '#fff' } } },
        { category: 'basic', label: 'Triangle', icon: <ShapePreview shape="triangle" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'triangle', icon: 'play', theme: { main: '#2196F3', border: '#1e88e5', text: '#fff' } } },
        { category: 'basic', label: 'Hexagon', icon: <ShapePreview shape="hexagon" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'hexagon', icon: 'hexagon', theme: { main: '#2196F3', border: '#1e88e5', text: '#fff' } } },
        { category: 'basic', label: 'Star', icon: <ShapePreview shape="star" color="#F59E0B" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'star', icon: 'star', theme: { main: '#FFC107', border: '#FFB300', text: '#fff' } } },
        { category: 'basic', label: 'Pill', icon: <ShapePreview shape="pill" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'pill', icon: 'play', theme: { main: '#2196F3', border: '#1e88e5', text: '#fff' } } },
        { category: 'basic', label: 'Note', icon: <ShapePreview shape="note" color="#F59E0B" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'note', icon: 'note', theme: { main: '#FFEB3B', border: '#FDD835', text: '#000' } } },
        
        // Flow Control
        { category: 'flow-control', label: t('designer.toolbar.start'), icon: <ShapePreview shape="pill" color="#4CAF50" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'pill', icon: 'play', theme: { main: '#4CAF50', border: '#43a047', text: '#fff' } } },
        { category: 'flow-control', label: t('designer.toolbar.process'), icon: <ShapePreview shape="rectangle" color="#2196F3" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'square', theme: { main: '#2196F3', border: '#1e88e5', text: '#fff' } } },
        { category: 'flow-control', label: t('designer.toolbar.decision'), icon: <ShapePreview shape="diamond" color="#ff9800" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'diamond', icon: 'question', theme: { main: '#ff9800', border: '#fb8c00', text: '#fff' } } },
        { category: 'flow-control', label: t('designer.toolbar.end'), icon: <ShapePreview shape="pill" color="#f44336" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'pill', icon: 'stop', theme: { main: '#f44336', border: '#e53935', text: '#fff' } } },

        // Data IO
        { category: 'data-io', label: t('designer.toolbar.database'), icon: <ShapePreview shape="database" color="#9C27B0" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'database', icon: 'database', theme: { main: '#9C27B0', border: '#8e24aa', text: '#fff' } } },
        { category: 'data-io', label: t('designer.sidebar.parallelogram'), icon: <ShapePreview shape="parallelogram" color="#00BCD4" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'parallelogram', icon: 'arrow', theme: { main: '#00BCD4', border: '#00ACC1', text: '#fff' } } },
        { category: 'data-io', label: t('designer.sidebar.document'), icon: <ShapePreview shape="document" color="#2196F3" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'document', icon: 'file', theme: { main: '#2196F3', border: '#1e88e5', text: '#fff' } } },
        { category: 'data-io', label: t('designer.sidebar.multiDocument'), icon: <ShapePreview shape="multi-document" color="#1565C0" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'multi-document', icon: 'file', theme: { main: '#1565C0', border: '#0D47A1', text: '#fff' } } },
        { category: 'data-io', label: t('designer.sidebar.cloud'), icon: <ShapePreview shape="cloud" color="#03A9F4" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'cloud', icon: 'cloud', theme: { main: '#03A9F4', border: '#039BE5', text: '#fff' } } },
        { category: 'data-io', label: t('designer.toolbar.module'), icon: <FaThLarge style={{ color: '#607d8b' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'th-large', theme: { main: '#607d8b', border: '#546e7a', text: '#fff' } } },
        { category: 'data-io', label: t('designer.toolbar.image'), icon: <FaImage style={{ color: '#795548' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'image', theme: { main: '#795548', border: '#6d4c41', text: '#fff' } } },

        // Containers
        { category: 'containers', label: t('designer.sidebar.domainGroup'), icon: <FaLayerGroup style={{ color: '#3F51B5' }} />, type: 'titleGroup', typeName: 'titleGroup', config: { themeColor: '#3F51B5', domainClass: 'core' } },
        { category: 'containers', label: t('designer.sidebar.subGroup'), icon: <FaBox style={{ color: '#673AB7' }} />, type: 'subGroup', typeName: 'subGroup', config: { themeColor: '#673AB7' } },
        { category: 'containers', label: 'Swimlane', icon: <FaStream style={{ color: '#6366f1' }} />, type: 'swimlane', typeName: 'swimlane', config: { label: 'Swimlane', direction: 'horizontal', lanes: [{ id: 'lane-1', label: '用户', color: '#3b82f6' }] } },

        // Tech Icons
        { category: 'tech-icons', label: t('designer.sidebar.server'), icon: <FaServer style={{ color: '#455A64' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'server', theme: { main: '#455A64', border: '#37474F', text: '#fff' } } },
        { category: 'tech-icons', label: t('designer.sidebar.network'), icon: <FaNetworkWired style={{ color: '#0288D1' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'network', theme: { main: '#0288D1', border: '#0277BD', text: '#fff' } } },
        { category: 'tech-icons', label: t('designer.sidebar.security'), icon: <FaLock style={{ color: '#E65100' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'lock', theme: { main: '#E65100', border: '#BF360C', text: '#fff' } } },
        { category: 'tech-icons', label: 'API', icon: <FaPlug style={{ color: '#00897B' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'plug', theme: { main: '#00897B', border: '#00796B', text: '#fff' } } },
        { category: 'tech-icons', label: t('designer.sidebar.user'), icon: <FaUser style={{ color: '#5C6BC0' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'ellipse', icon: 'user', theme: { main: '#5C6BC0', border: '#3F51B5', text: '#fff' } } },
        { category: 'tech-icons', label: t('designer.sidebar.email'), icon: <FaEnvelope style={{ color: '#D32F2F' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'envelope', theme: { main: '#D32F2F', border: '#C62828', text: '#fff' } } },
        { category: 'tech-icons', label: t('designer.sidebar.notification'), icon: <FaBell style={{ color: '#FF8F00' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'bell', theme: { main: '#FF8F00', border: '#FF6F00', text: '#fff' } } },
        { category: 'tech-icons', label: t('designer.sidebar.settings'), icon: <FaCog style={{ color: '#78909C' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'cog', theme: { main: '#78909C', border: '#607D8B', text: '#fff' } } },
        { category: 'tech-icons', label: t('designer.sidebar.code'), icon: <FaCode style={{ color: '#7B1FA2' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'code', theme: { main: '#7B1FA2', border: '#6A1B9A', text: '#fff' } } },
        { category: 'tech-icons', label: t('designer.sidebar.terminal'), icon: <FaTerminal style={{ color: '#212121' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'terminal', theme: { main: '#212121', border: '#000', text: '#0f0' } } },

        // Special
        { category: 'special', label: t('designer.sidebar.connector'), icon: <ShapePreview shape="circle" color="#E91E63" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'circle', icon: 'circle', theme: { main: '#E91E63', border: '#C2185B', text: '#fff' } } },
        { category: 'special', label: t('designer.sidebar.offPageConnector'), icon: <ShapePreview shape="off-page" color="#673AB7" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'off-page', icon: 'arrow', theme: { main: '#673AB7', border: '#512DA8', text: '#fff' } } },
        { category: 'special', label: t('designer.sidebar.internalStorage'), icon: <ShapePreview shape="internal-storage" color="#455A64" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'internal-storage', icon: 'database', theme: { main: '#455A64', border: '#37474F', text: '#fff' } } },
        { category: 'special', label: 'Arrow Timeline', icon: <FaChevronRight style={{ color: '#00BCD4' }} />, type: 'arrowTimeline', typeName: 'arrowTimeline', config: {} },
    ];

    const CATEGORIES_DEF = [
        { key: 'basic', title: t('designer.sidebar.basic') },
        { key: 'flow-control', title: t('designer.sidebar.flowControl') },
        { key: 'data-io', title: t('designer.sidebar.dataIO') },
        { key: 'containers', title: t('designer.sidebar.containers') },
        { key: 'tech-icons', title: t('designer.sidebar.techIcons') },
        { key: 'special', title: t('designer.sidebar.special') }
    ];

    const filteredItems = search.trim() 
        ? ALL_ITEMS.filter(it => it.label.toLowerCase().includes(search.toLowerCase()))
        : null;

    if (filteredItems) {
        return (
            <div style={{ padding: '8px 10px' }}>
                <Input
                    prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                    placeholder="搜索组件..."
                    size="small"
                    allowClear
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ marginBottom: 10, borderRadius: 6, border: '1px solid #e0e0e0', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)' }}
                />
                {filteredItems.length === 0 ? (
                    <div style={{ color: '#bfbfbf', textAlign: 'center', padding: 16, fontSize: 12 }}>无匹配组件</div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                        {filteredItems.map(it => renderDraggableItem(it.label, it.icon, it.type, it.typeName, it.config as NodeConfig))}
                    </div>
                )}
            </div>
        );
    }

    const CategoryGroup = ({ cat }: { cat: {key: string, title: string} }) => {
        const [expanded, setExpanded] = useState(true);
        const childrenItems = ALL_ITEMS.filter(it => it.category === cat.key);
        if (childrenItems.length === 0) return null;
        
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
                    {childrenItems.map(it => renderDraggableItem(it.label, it.icon, it.type, it.typeName, it.config as NodeConfig))}
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
                {CATEGORIES_DEF.map(cat => (
                    <CategoryGroup key={cat.key} cat={cat} />
                ))}
            </div>
        </div>
    );
};
`;

const startIdx = content.indexOf('export const FlowchartShapesPanel');
content = content.substring(0, startIdx) + newShapesPanelCode;
fs.writeFileSync(path, content, 'utf-8');
