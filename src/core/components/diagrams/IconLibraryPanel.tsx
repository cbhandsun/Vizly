import React, { useState, useEffect, useRef } from 'react';
import { Input, Spin, Empty, theme, Tooltip } from 'antd';
import { FaSearch } from 'react-icons/fa';
import { Icon } from '@iconify/react';
import { useTranslation } from 'react-i18next';
import { isSafeIconifyIconName, searchIconifyIcons } from '../../utils/iconifySecurity';
import { logIconLibraryPanelSearchFailure } from '../shared/iconSearchLogging';


interface IconResult {
    prefix: string;
    name: string;
    id: string; // prefix:name
}

// Implement basic debounce hook
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

export const IconLibraryPanel: React.FC = () => {
    const { token } = theme.useToken();
    const { t } = useTranslation();
    const [searchTerm, setSearchTerm] = useState('aws');
    const debouncedSearch = useDebounce(searchTerm, 500);
    
    const [icons, setIcons] = useState<IconResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const CACHE = useRef<Record<string, IconResult[]>>({});

    useEffect(() => {
        if (!debouncedSearch.trim()) {
            setIcons([]);
            return;
        }

        const controller = new AbortController();
        const fetchIcons = async () => {
            const query = debouncedSearch.trim();
            if (CACHE.current[query]) {
                setIcons(CACHE.current[query]);
                return;
            }

            setLoading(true);
            setError(null);
            try {
                // Call Iconify public search API
                const data = await searchIconifyIcons(
                    { query, limit: 60 },
                    { signal: controller.signal },
                );
                if (data.icons.length) {
                    const results: IconResult[] = data.icons.map((id) => {
                        const [prefix, name] = id.split(':');
                        return { prefix, name, id };
                    });
                    CACHE.current[query] = results;
                    setIcons(results);
                } else {
                    setIcons([]);
                }
            } catch (err: unknown) {
                if (controller.signal.aborted) return;
                logIconLibraryPanelSearchFailure(err);
                setError(err instanceof Error ? err.message : "Failed to load icons");
                setIcons([]);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };

        void fetchIcons();
        return () => controller.abort();
    }, [debouncedSearch]);

    const onDragStart = (event: React.DragEvent, iconId: string) => {
        if (!isSafeIconifyIconName(iconId)) {
            event.preventDefault();
            return;
        }
        event.dataTransfer.setData('application/reactflow', JSON.stringify({
            type: 'iconNode',
            typeName: 'iconNode',
            label: '',
            config: {
                icon: iconId,
                width: 64,   // Default initial width/height
                height: 64,
            },
            // We set default dimensions so the drop calculates offsets correctly
            clientWidth: 64,
            clientHeight: 64
        }));
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', padding: '0 12px 12px 12px' }}>
            <div style={{ marginBottom: 12 }}>
                <Input
                    prefix={<FaSearch style={{ color: token.colorTextDescription }} />}
                    placeholder={t('designer.sidebar.searchIcons', 'Search icons (e.g., aws, react)')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    allowClear
                    size="small"
                />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {loading && icons.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>
                ) : error ? (
                    <div style={{ padding: 24, textAlign: 'center', color: token.colorError }}>{error}</div>
                ) : icons.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('designer.sidebar.noIconsFound', 'No icons found')} />
                ) : (
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', 
                        gap: 8,
                        padding: 4
                    }}>
                        {icons.map((icon) => (
                            <Tooltip key={icon.id} title={icon.name} placement="right">
                                <div
                                    draggable
                                    onDragStart={(e) => onDragStart(e, icon.id)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '12px 8px',
                                        cursor: 'grab',
                                        border: `1px solid ${token.colorBorderSecondary}`,
                                        borderRadius: token.borderRadius,
                                        backgroundColor: token.colorBgContainer,
                                        transition: 'all 0.2s ease',
                                        aspectRatio: '1'
                                    }}
                                    onMouseEnter={(e) => {
                                        const el = e.currentTarget;
                                        el.style.borderColor = token.colorPrimary;
                                        el.style.boxShadow = `0 4px 12px ${token.colorPrimaryBg}`;
                                        el.style.transform = 'translateY(-2px)';
                                    }}
                                    onMouseLeave={(e) => {
                                        const el = e.currentTarget;
                                        el.style.borderColor = token.colorBorderSecondary;
                                        el.style.boxShadow = 'none';
                                        el.style.transform = 'none';
                                    }}
                                >
                                    <Icon 
                                        icon={icon.id} 
                                        style={{ fontSize: 28, color: token.colorText }} 
                                    />
                                </div>
                            </Tooltip>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
