import React, { useState, useEffect } from 'react';
import { Input, Spin, Empty, Tooltip, Typography } from 'antd';
import { SearchOutlined, CloudDownloadOutlined, FireOutlined } from '@ant-design/icons';
import { Icon } from '@iconify/react';
import { useTranslation } from 'react-i18next';
import { PluginContext } from '../../types/plugin';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { isSafeIconifyIconName, searchIconifyIcons } from '@/core/utils/iconifySecurity';
import { logDiagramIconExplorerFetchFailure } from '../shared/iconSearchLogging';
import { AccessibleInputClearIcon } from './AccessibleInputClearIcon';


const { Text } = Typography;

interface IconExplorerProps {
    ctx: PluginContext;
}

const POPULAR_COLLECTIONS = [
    { prefix: 'logos', titleKey: 'designer.iconExplorer.collections.brands', icon: 'logos:react' },
    { prefix: 'logos:aws', titleKey: 'designer.iconExplorer.collections.aws', icon: 'logos:aws' },
    { prefix: 'logos:azure', titleKey: 'designer.iconExplorer.collections.azure', icon: 'logos:microsoft-azure' },
    { prefix: 'logos:google-cloud', titleKey: 'designer.iconExplorer.collections.googleCloud', icon: 'logos:google-cloud' },
    { prefix: 'mdi', titleKey: 'designer.iconExplorer.collections.materialDesign', icon: 'mdi:material-design' },
    { prefix: 'carbon', titleKey: 'designer.iconExplorer.collections.ibmCarbon', icon: 'carbon:carbon' },
];

const createIconNodeData = (iconName: string) => ({
    label: iconName.split(':').pop() || 'Icon',
    icon: iconName,
    width: 64,
    height: 64,
});

export const IconExplorer: React.FC<IconExplorerProps> = ({ ctx }) => {
    const { t } = useTranslation();
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
                appMessage.error(t('designer.iconExplorer.searchFailed'));
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };

        queueMicrotask(() => {
            if (!controller.signal.aborted) void fetchIcons();
        });
        return () => controller.abort();
    }, [debouncedQuery, t]);

    const visibleResults = debouncedQuery.trim() ? results : [];
    const visibleLoading = Boolean(debouncedQuery.trim()) && loading;

    const onDragStart = (event: React.DragEvent, iconName: string) => {
        if (!isSafeIconifyIconName(iconName)) {
            event.preventDefault();
            return;
        }
        const target = event.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        const iconData = createIconNodeData(iconName);
        
        // Structure the payload for useDiagramDragDrop
        event.dataTransfer.setData('application/reactflow', JSON.stringify({
            type: 'iconNode',
            typeName: 'iconNode',
            label: iconData.label,
            config: iconData,
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
                    placeholder={t('designer.iconExplorer.searchPlaceholder')}
                    aria-label={t('designer.iconExplorer.searchLabel')}
                    allowClear={{ clearIcon: <AccessibleInputClearIcon label={t('designer.iconExplorer.clearSearch')} /> }}
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
                            <FireOutlined style={{ color: '#ff4d4f' }} /> {t('designer.iconExplorer.popularCollections')}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                            {POPULAR_COLLECTIONS.map(item => {
                                const title = t(item.titleKey);
                                return (
                                <button
                                    type="button"
                                    key={item.prefix}
                                    onClick={() => handlePresetClick(item.prefix)}
                                    aria-label={t('designer.iconExplorer.searchCollection', { collection: title })}
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
                                    <Text style={{ fontSize: 10, fontWeight: 500 }}>{title}</Text>
                                </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {visibleLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                        <Spin size="small" tip={t('designer.iconExplorer.searching')} />
                    </div>
                ) : visibleResults.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                        {visibleResults.map(iconName => (
                            <Tooltip key={iconName} title={iconName} placement="right">
                                <button
                                    type="button"
                                    draggable
                                    onDragStart={(e) => onDragStart(e, iconName)}
                                    onClick={() => ctx.addNode('iconNode', createIconNodeData(iconName))}
                                    aria-label={t('designer.iconExplorer.addIcon', { icon: iconName })}
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
                                </button>
                            </Tooltip>
                        ))}
                    </div>
                ) : query && !visibleLoading ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('designer.iconExplorer.noResults')} />
                ) : null}
            </div>

            {/* Footer / Tip */}
            <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.02)', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                <Text type="secondary" style={{ fontSize: 10 }}>
                    <CloudDownloadOutlined style={{ marginRight: 4 }} />
                    {t('designer.iconExplorer.addOrDragHint')}
                </Text>
            </div>
        </div>
    );
};
