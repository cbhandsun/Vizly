import React, { useState, useEffect } from 'react';
import { Input, Spin, Empty, Tooltip, Typography } from 'antd';
import { SearchOutlined, CloudDownloadOutlined, FireOutlined } from '@ant-design/icons';
import { Icon } from '@iconify/react';
import { PluginContext } from '../../types/plugin';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { isSafeIconifyIconName, searchIconifyIcons } from '@/core/utils/iconifySecurity';
import { logDiagramIconExplorerFetchFailure } from '../shared/iconSearchLogging';


const { Text } = Typography;

interface IconExplorerProps {
    ctx: PluginContext;
}

const POPULAR_COLLECTIONS = [
    { prefix: 'logos', title: '品牌 Logos', icon: 'logos:react' },
    { prefix: 'logos:aws', title: 'AWS 云服务', icon: 'logos:aws' },
    { prefix: 'logos:azure', title: 'Azure 云', icon: 'logos:microsoft-azure' },
    { prefix: 'logos:google-cloud', title: 'Google Cloud', icon: 'logos:google-cloud' },
    { prefix: 'mdi', title: 'Material Design', icon: 'mdi:material-design' },
    { prefix: 'carbon', title: 'IBM Carbon', icon: 'carbon:carbon' },
];

export const IconExplorer: React.FC<IconExplorerProps> = ({ ctx: _ctx }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [debouncedQuery, setDebouncedQuery] = useState('');

    // Debounce search query
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(query);
        }, 500);
        return () => clearTimeout(timer);
    }, [query]);

    useEffect(() => {
        if (!debouncedQuery.trim()) return;

        const controller = new AbortController();
        const fetchIcons = async () => {
            setLoading(true);
            try {
                const data = await searchIconifyIcons(
                    { query: debouncedQuery, limit: 100 },
                    { signal: controller.signal },
                );
                setResults(data.icons);
            } catch (error) {
                if (controller.signal.aborted) return;
                logDiagramIconExplorerFetchFailure(error);
                appMessage.error('搜索图标失败，请检查网络连接');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };

        queueMicrotask(() => {
            if (!controller.signal.aborted) void fetchIcons();
        });
        return () => controller.abort();
    }, [debouncedQuery]);

    const visibleResults = debouncedQuery.trim() ? results : [];
    const visibleLoading = Boolean(debouncedQuery.trim()) && loading;

    const onDragStart = (event: React.DragEvent, iconName: string) => {
        if (!isSafeIconifyIconName(iconName)) {
            event.preventDefault();
            return;
        }
        const target = event.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        
        // Structure the payload for useDiagramDragDrop
        event.dataTransfer.setData('application/reactflow', JSON.stringify({
            type: 'iconNode',
            typeName: 'iconNode',
            label: iconName.split(':').pop() || 'Icon',
            config: {
                icon: iconName,
                // Default styles
                width: 64,
                height: 64,
            },
            offsetX: rect.width / 2,
            offsetY: rect.height / 2,
            clientWidth: rect.width,
            clientHeight: rect.height
        }));
        event.dataTransfer.effectAllowed = 'move';
    };

    const handlePresetClick = (prefix: string) => {
        setQuery(prefix.includes(':') ? prefix.split(':')[1] : prefix);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Search Bar */}
            <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <Input
                    prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                    placeholder="搜索 100,000+ 图标..."
                    allowClear
                    size="small"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    style={{ borderRadius: 8, background: 'rgba(255,255,255,0.6)' }}
                />
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                {!query && (
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#8c8c8c', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <FireOutlined style={{ color: '#ff4d4f' }} /> 热门图标库
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                            {POPULAR_COLLECTIONS.map(item => (
                                <div
                                    key={item.prefix}
                                    onClick={() => handlePresetClick(item.prefix)}
                                    style={{
                                        padding: '10px 8px',
                                        background: 'rgba(255,255,255,0.5)',
                                        border: '1px solid rgba(0,0,0,0.05)',
                                        borderRadius: 8,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: 6
                                    }}
                                    className="popular-item-hover"
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = '#fff';
                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.5)';
                                        e.currentTarget.style.boxShadow = 'none';
                                    }}
                                >
                                    <Icon icon={item.icon} style={{ fontSize: 24 }} />
                                    <Text style={{ fontSize: 10, fontWeight: 500 }}>{item.title}</Text>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {visibleLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                        <Spin size="small" tip="检索中..." />
                    </div>
                ) : visibleResults.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                        {visibleResults.map(iconName => (
                            <Tooltip key={iconName} title={iconName} placement="right">
                                <div
                                    draggable
                                    onDragStart={(e) => onDragStart(e, iconName)}
                                    style={{
                                        aspectRatio: '1',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: 'rgba(255,255,255,0.7)',
                                        border: '1px solid rgba(0,0,0,0.05)',
                                        borderRadius: 8,
                                        cursor: 'grab',
                                        padding: 8,
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = '#fff';
                                        e.currentTarget.style.borderColor = '#1890ff';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.7)';
                                        e.currentTarget.style.borderColor = 'rgba(0,0,0,0.05)';
                                    }}
                                >
                                    <Icon icon={iconName} style={{ fontSize: 28, width: '100%', height: '100%' }} />
                                </div>
                            </Tooltip>
                        ))}
                    </div>
                ) : query && !visibleLoading ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未找到匹配图标" />
                ) : null}
            </div>

            {/* Footer / Tip */}
            <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.02)', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                <Text type="secondary" style={{ fontSize: 10 }}>
                    <CloudDownloadOutlined style={{ marginRight: 4 }} />
                    直接拖拽图标到画布即可插入
                </Text>
            </div>
        </div>
    );
};
