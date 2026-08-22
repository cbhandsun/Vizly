import React from 'react';
import type { Edge, Node } from '@xyflow/react';
import type { GlobalToken } from 'antd';

import type { DiagramPanelRenderControls } from '../../types/diagram-components';
import type { DiagramTypePlugin, PluginContext } from '../../types/plugin';

const PropertyPanel = React.lazy(() => import('./PropertyPanel'));

type DesignerRightSidebarContentProps = Readonly<{
    activePlugin?: DiagramTypePlugin;
    activeTab: 'property' | 'ai';
    aiChatVisible: boolean;
    aiLabel: string;
    closeAiPanel: () => void;
    hasLockedSelection: boolean;
    lockedSelectionReason?: string;
    onAiTabIntercept?: () => boolean;
    onBeforeUpdate: () => void;
    onTabChange: (tab: 'property' | 'ai') => void;
    pluginCtx?: PluginContext;
    propertyLabel: string;
    renderAIChatPanel?: (controls: DiagramPanelRenderControls) => React.ReactNode;
    selectedEdges: Edge[];
    selectedNodes: Node[];
    setAiChatVisible: (visible: boolean) => void;
    showAiCrown?: boolean;
    token: GlobalToken;
    updateEdgesBatch: (ids: string[], data: Record<string, unknown>) => void;
    updateNodesBatch: (
        ids: string[],
        data: Record<string, unknown>,
        options?: { snapshot?: boolean },
    ) => void;
}>;

export const DesignerRightSidebarContent = ({
    activePlugin,
    activeTab,
    aiChatVisible,
    aiLabel,
    closeAiPanel,
    hasLockedSelection,
    lockedSelectionReason,
    onAiTabIntercept,
    onBeforeUpdate,
    onTabChange,
    pluginCtx,
    propertyLabel,
    renderAIChatPanel,
    selectedEdges,
    selectedNodes,
    setAiChatVisible,
    showAiCrown,
    token,
    updateEdgesBatch,
    updateNodesBatch,
}: DesignerRightSidebarContentProps) => {
    const tabIdPrefix = React.useId();
    const activateTab = React.useCallback((key: 'property' | 'ai') => {
        if (key === 'ai' && onAiTabIntercept && !onAiTabIntercept()) return;
        onTabChange(key);
        if (key === 'ai' && !aiChatVisible) setAiChatVisible(true);
    }, [aiChatVisible, onAiTabIntercept, onTabChange, setAiChatVisible]);
    const tabs = renderAIChatPanel
        ? [
            { key: 'property' as const, label: propertyLabel },
            { key: 'ai' as const, label: aiLabel },
        ]
        : [{ key: 'property' as const, label: propertyLabel }];
    const customPanel = activeTab === 'property'
        && activePlugin?.renderCustomPropertyPanel
        && pluginCtx
        ? activePlugin.renderCustomPropertyPanel(pluginCtx, selectedNodes, selectedEdges)
        : null;

    return (
        <div style={{ height: '100%', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div
                role="tablist"
                aria-label={propertyLabel}
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    flex: '0 0 auto',
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                {tabs.map(tab => {
                    const selected = activeTab === tab.key;
                    const tabIndex = tabs.findIndex(candidate => candidate.key === tab.key);
                    const tabId = `${tabIdPrefix}-${tab.key}-tab`;
                    const panelId = `${tabIdPrefix}-${tab.key}-panel`;
                    return (
                        <button
                            key={tab.key}
                            id={tabId}
                            type="button"
                            role="tab"
                            aria-controls={panelId}
                            aria-selected={selected}
                            tabIndex={selected ? 0 : -1}
                            onClick={() => activateTab(tab.key)}
                            onKeyDown={event => {
                                let nextIndex: number;
                                if (event.key === 'ArrowLeft') nextIndex = (tabIndex - 1 + tabs.length) % tabs.length;
                                else if (event.key === 'ArrowRight') nextIndex = (tabIndex + 1) % tabs.length;
                                else if (event.key === 'Home') nextIndex = 0;
                                else if (event.key === 'End') nextIndex = tabs.length - 1;
                                else return;
                                event.preventDefault();
                                const nextTab = tabs[nextIndex];
                                activateTab(nextTab.key);
                                document.getElementById(`${tabIdPrefix}-${nextTab.key}-tab`)?.focus();
                            }}
                            style={{
                                minHeight: 40,
                                padding: '8px 16px 6px',
                                border: 0,
                                borderBottom: `2px solid ${selected ? token.colorPrimary : 'transparent'}`,
                                background: 'transparent',
                                color: selected ? token.colorPrimary : token.colorText,
                                cursor: 'pointer',
                                font: 'inherit',
                            }}
                        >
                            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                {tab.label}
                                {tab.key === 'ai' && showAiCrown && (
                                    <span style={{ marginLeft: 4, fontSize: 13 }} title="Pro 功能">👑</span>
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>
            <div
                id={`${tabIdPrefix}-${activeTab}-panel`}
                role="tabpanel"
                aria-labelledby={`${tabIdPrefix}-${activeTab}-tab`}
                style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}
            >
                {activeTab === 'property' ? (
                    <div
                        data-testid="designer-property-scroll-region"
                        style={{
                            height: '100%',
                            width: '100%',
                            flex: '1 1 100%',
                            minHeight: 0,
                            minWidth: 0,
                            overflowY: 'auto',
                            overscrollBehavior: 'contain',
                            padding: '0 8px',
                        }}
                    >
                        {customPanel || (
                            <React.Suspense fallback={null}>
                                <PropertyPanel
                                    selectedNodes={selectedNodes}
                                    selectedEdges={selectedEdges}
                                    onUpdateNodes={(ids, data) => updateNodesBatch(ids, data, { snapshot: false })}
                                    onUpdateEdges={updateEdgesBatch}
                                    onBeforeUpdate={onBeforeUpdate}
                                    disabled={hasLockedSelection}
                                    disabledReason={lockedSelectionReason}
                                    docked
                                />
                            </React.Suspense>
                        )}
                    </div>
                ) : (
                    <div style={{ height: '100%', minWidth: 0, overflow: 'hidden', padding: '0 8px' }}>
                        {renderAIChatPanel?.({ onClose: closeAiPanel })}
                    </div>
                )}
            </div>
        </div>
    );
};
