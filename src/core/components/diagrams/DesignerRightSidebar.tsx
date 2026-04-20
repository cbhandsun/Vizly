import React, { useState, useCallback, useEffect } from 'react';
import { Tabs, Tooltip, Button, theme } from 'antd';
import { Node, Edge } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { FaCog, FaRobot, FaChevronRight, FaChevronLeft } from 'react-icons/fa';
import PropertyPanel from './PropertyPanel';
import { DiagramTypePlugin, PluginContext } from '../../types/plugin';

interface DesignerRightSidebarProps {
    activeTab: 'property' | 'ai';
    onTabChange: (tab: 'property' | 'ai') => void;
    aiChatVisible: boolean;
    setAiChatVisible: (v: boolean) => void;
    selectedNodes: Node[];
    selectedEdges: Edge[];
    updateNodesBatch: (ids: string[], data: any, options?: { snapshot?: boolean }) => void;
    updateEdgesBatch: (ids: string[], data: any) => void;
    onBeforeUpdate: () => void;
    isDraggingNode: boolean;
    renderAIChatPanel?: React.ReactNode;
    /** 通知父组件当前面板实际宽度 (0=不可见, 42=收起, 320=展开) */
    onWidthChange?: (width: number) => void;
    showAiCrown?: boolean;
    onAiTabIntercept?: () => boolean;
    activePlugin?: DiagramTypePlugin;
    pluginCtx?: PluginContext;
    isMobile?: boolean; // GAP-11
}

const RAIL_WIDTH = 44; // Matched with exact IconRailSidebar width
/**
 * 右侧边栏：Figma 风格 Icon-tab + 可折叠面板
 * - 折叠态: 42px 宽的垂直 Icon Rail
 * - 展开态: 可拖拽调节宽度（默认 360px）的 Tabs 面板
 */
export const DesignerRightSidebar: React.FC<DesignerRightSidebarProps> = React.memo(({
    activeTab,
    onTabChange,
    aiChatVisible,
    setAiChatVisible,
    selectedNodes,
    selectedEdges,
    updateNodesBatch,
    updateEdgesBatch,
    onBeforeUpdate,
    isDraggingNode,
    renderAIChatPanel,
    onWidthChange,
    showAiCrown,
    onAiTabIntercept,
    activePlugin,
    pluginCtx,
    isMobile = false,
}) => {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const hasSelection = selectedNodes.length > 0 || selectedEdges.length > 0;

    // 折叠状态持久化
    const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
        try {
            return localStorage.getItem('designer.rightSidebar.collapsed') === 'true';
        } catch { return false; }
    });

    useEffect(() => {
        try { localStorage.setItem('designer.rightSidebar.collapsed', String(isCollapsed)); } catch { void 0; }
    }, [isCollapsed]);

    // 面板宽度持久化与拖拽逻辑
    const [panelWidth, setPanelWidth] = useState<number>(() => {
        try {
            const saved = localStorage.getItem('designer.rightSidebar.width');
            return saved ? parseInt(saved, 10) : 360;
        } catch { return 360; }
    });

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = panelWidth;

        const onMouseMove = (moveEvent: MouseEvent) => {
            // 向左拖拽（startX > moveEvent.clientX），因为在右侧所以宽度增加
            const deltaX = startX - moveEvent.clientX; 
            const newWidth = Math.max(280, Math.min(800, startWidth + deltaX));
            setPanelWidth(newWidth);
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            // 结束后保存
            setPanelWidth((finalWidth) => {
                try { localStorage.setItem('designer.rightSidebar.width', String(finalWidth)); } catch { void 0; }
                return finalWidth;
            });
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }, [panelWidth]);

    // 选中节点时自动展开
    useEffect(() => {
        if (hasSelection && isCollapsed) {
            setIsCollapsed(false);
        }
    }, [hasSelection]);

    const toggle = useCallback(() => setIsCollapsed(prev => !prev), []);

    const visible = true; // Always true so theme switcher is accessible

    // 通知父组件当前面板实际宽度（用 ref 避免依赖变化）
    const onWidthChangeRef = React.useRef(onWidthChange);
    onWidthChangeRef.current = onWidthChange;
    useEffect(() => {
        const width = visible ? (isCollapsed ? RAIL_WIDTH : panelWidth) : 0;
        onWidthChangeRef.current?.(width);
    }, [visible, isCollapsed, panelWidth]);

    if (!visible) return null;

    const railButtons: { key: 'property'|'ai', icon: React.ReactNode, label: string }[] = [
        { key: 'property', icon: <FaCog />, label: t('propertyPanel.title') }
    ];

    if (renderAIChatPanel) {
        railButtons.push({ key: 'ai', icon: <FaRobot />, label: showAiCrown ? `${t('aiChat.title')} 👑` : t('aiChat.title') });
    }

    return (
        <div
            className="designer-right-sidebar"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{
                position: isMobile ? 'fixed' : 'absolute',
                pointerEvents: 'auto',
                right: isMobile ? 0 : 16,
                left: isMobile ? 0 : 'auto',
                top: isMobile ? 'auto' : 80,
                bottom: isMobile ? 0 : 'auto',
                maxHeight: isMobile ? '85vh' : 'calc(100% - 96px)',
                height: isCollapsed ? (isMobile ? 0 : 'max-content') : (isMobile ? '85vh' : 'calc(100% - 96px)'),
                width: isMobile ? '100%' : (isCollapsed ? RAIL_WIDTH : panelWidth),
                backgroundColor: 'var(--designer-panel-bg, rgba(255, 255, 255, 0.85))',
                backdropFilter: 'var(--designer-blur, blur(20px) saturate(180%))',
                WebkitBackdropFilter: 'var(--designer-blur, blur(20px) saturate(180%))',
                display: 'flex',
                flexDirection: 'row-reverse',
                boxShadow: 'var(--designer-shadow, 0 8px 32px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.04))',
                border: `1px solid var(--designer-border, ${token.colorBorderSecondary})`,
                borderRadius: isMobile ? '24px 24px 0 0' : 'var(--designer-radius, 16px)',
                zIndex: 1020,
                // 只在收起/展开时加动画，拖拽时关闭动画避免卡顿
                transition: isMobile ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
                transform: isMobile && isCollapsed ? 'translateY(100%)' : 'none',
                visibility: isMobile && isCollapsed ? 'hidden' : 'visible'
            }}
        >
            {/* 宽度拖拽把手 */}
            {!isCollapsed && (
                <div
                    className="right-sidebar-resizer"
                    onMouseDown={handleMouseDown}
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: 6,
                        cursor: 'ew-resize',
                        zIndex: 10,
                        background: 'transparent',
                        transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99, 102, 241, 0.3)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                />
            )}

            {/* Icon Rail (始终显示) */}
            <div style={{
                width: RAIL_WIDTH,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                paddingTop: 8,
                gap: 2,
                borderLeft: isCollapsed ? 'none' : `1px solid ${token.colorBorderSecondary}`,
            }}>
                {railButtons.map(btn => (
                    <Tooltip 
                        key={btn.key} 
                        title={btn.label} 
                        placement="left"
                        mouseEnterDelay={0.3}
                        styles={{ root: { pointerEvents: 'none' } }}
                        getPopupContainer={(node) => node.closest('.diagram-root') as HTMLElement || document.body}
                    >
                        <Button
                            type="text"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (btn.key === 'ai' && onAiTabIntercept && !onAiTabIntercept()) {
                                    return;
                                }
                                if (isCollapsed) {
                                    setIsCollapsed(false);
                                    onTabChange(btn.key);
                                    if (btn.key === 'ai') setAiChatVisible(true);
                                } else if (activeTab === btn.key) {
                                    setIsCollapsed(true);
                                } else {
                                    onTabChange(btn.key);
                                    if (btn.key === 'ai') setAiChatVisible(true);
                                }
                            }}
                            icon={btn.icon}
                            style={{
                                width: 32,
                                height: 32,
                                borderRadius: 6,
                                border: 'none',
                                background: (!isCollapsed && activeTab === btn.key)
                                    ? token.colorPrimaryBg
                                    : 'transparent',
                                color: (!isCollapsed && activeTab === btn.key)
                                    ? token.colorPrimary
                                    : token.colorTextSecondary,
                                fontSize: 16,
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={e => {
                                if (isCollapsed || activeTab !== btn.key) {
                                    e.currentTarget.style.background = token.colorFillTertiary;
                                }
                            }}
                            onMouseLeave={e => {
                                if (isCollapsed || activeTab !== btn.key) {
                                    e.currentTarget.style.background = 'transparent';
                                }
                            }}
                        />
                    </Tooltip>
                ))}

                {/* 分隔线 */}
                <div style={{ width: 20, height: 1, background: token.colorBorderSecondary, margin: '6px 0' }} />

                {/* 折叠/展开按钮 */}
                <Tooltip 
                    title={isCollapsed ? '展开面板' : '收起面板'} 
                    placement="left"
                    mouseEnterDelay={0.3}
                    styles={{ root: { pointerEvents: 'none' } }}
                    getPopupContainer={(node) => node.closest('.diagram-root') as HTMLElement || document.body}
                >
                    <Button
                        type="text"
                        onClick={(e) => { e.stopPropagation(); toggle(); }}
                        icon={isCollapsed ? <FaChevronLeft /> : <FaChevronRight />}
                        style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            border: 'none',
                            background: 'transparent',
                            color: token.colorTextTertiary,
                            fontSize: 12,
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = token.colorFillTertiary}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    />
                </Tooltip>
            </div>

            {/* Panel Content (折叠时隐藏) */}
            {!isCollapsed && (
                <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    minWidth: 0,
                    animation: isMobile ? 'none' : 'drawerSlideIn 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    paddingBottom: isMobile ? 'env(safe-area-inset-bottom, 20px)' : 0,
                }}>
                    <Tabs
                        activeKey={activeTab}
                        onChange={(key: string) => {
                            if (key === 'ai' && onAiTabIntercept && !onAiTabIntercept()) {
                                return;
                            }
                            onTabChange(key as 'property' | 'ai');
                            if (key === 'ai' && !aiChatVisible) {
                                setAiChatVisible(true);
                            }
                        }}
                        centered
                        size="small"
                        items={[
                            {
                                key: 'property',
                                label: t('propertyPanel.title'),
                                children: (
                                    <div style={{ height: '100%', overflow: 'auto', padding: '0 8px' }}>
                                {(() => {
                                    const CustomPanel = activePlugin?.renderCustomPropertyPanel && pluginCtx 
                                        ? activePlugin.renderCustomPropertyPanel(pluginCtx, selectedNodes, selectedEdges) 
                                        : null;
                                        
                                    return CustomPanel || (
                                        <PropertyPanel
                                            selectedNodes={selectedNodes}
                                            selectedEdges={selectedEdges}
                                            onUpdateNodes={(ids, data) => updateNodesBatch(ids, data, { snapshot: false })}
                                            onUpdateEdges={updateEdgesBatch}
                                            onBeforeUpdate={onBeforeUpdate}
                                            disabled={isDraggingNode}
                                            docked={true}
                                        />
                                    );
                                })()}
                                    </div>
                                )
                            },
                            ...(renderAIChatPanel ? [{
                                key: 'ai',
                                label: <span style={{ display: 'flex', alignItems: 'center' }}>{t('aiChat.title')} {showAiCrown && <span style={{ marginLeft: 4, fontSize: '13px' }} title="Pro 功能">👑</span>}</span>,
                                children: (
                                    <div style={{ height: '100%', padding: '0 8px' }}>
                                        {renderAIChatPanel}
                                    </div>
                                )
                            }] : [])
                        ]}
                        style={{ height: '100%' }}
                        tabBarStyle={{
                            margin: 0,
                            padding: '0 16px',
                            background: 'transparent',
                            borderBottom: `1px solid ${token.colorBorderSecondary}`,
                            height: 48, // matching the global header scale
                        }}
                    />
                </div>
            )}
        </div>
    );
});

DesignerRightSidebar.displayName = 'DesignerRightSidebar';
