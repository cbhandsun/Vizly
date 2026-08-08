import React from 'react';
import { Badge } from 'antd';
import {
    FaPlus, FaLayerGroup, FaCogs, FaRobot,
    FaBars, FaUndo, FaRedo
} from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import './MobileBottomDock.css';

interface MobileBottomDockProps {
    onAddClick: () => void;
    onPropertyClick: () => void;
    onLayerClick: () => void;
    onSettingsClick?: () => void;
    onAiClick: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    editingDisabled?: boolean;
    selectedCount: number;
    selectedNodesCount?: number;
    selectedEdgesCount?: number;
    activeTab: 'property' | 'ai' | null;
}

/**
 * GAP-11 Phase 2: Mobile Bottom Dock
 * 提供移动端优先的导航快捷入口，采用高透玻璃拟态设计 (Hyper-Glass)
 */
export const MobileBottomDock: React.FC<MobileBottomDockProps> = ({
    onAddClick,
    onPropertyClick,
    onLayerClick,
    onSettingsClick,
    onAiClick,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    editingDisabled = false,
    selectedCount,
    selectedNodesCount,
    selectedEdgesCount,
    activeTab
}) => {
    const { t } = useTranslation();
    const hasDetailedSelection = selectedNodesCount !== undefined && selectedEdgesCount !== undefined;
    const propertyLabel = selectedCount > 0 && hasDetailedSelection
        ? t(
            'designer.mobileDock.propertiesSelectionSummary',
            '属性—已选择：节点 {{nodes}} 个，连线 {{edges}} 条',
            { nodes: selectedNodesCount, edges: selectedEdgesCount },
        )
        : selectedCount > 0
            ? t('designer.mobileDock.propertiesSelected', '属性（已选择 {{count}} 项）', { count: selectedCount })
        : t('designer.mobileDock.properties', '属性');

    return (
        <div className="mobile-bottom-dock-wrapper">
            <div className="mobile-bottom-dock">
                <div className="mobile-bottom-dock-actions">
                    {/* Add Button - Primary Action */}
                    <button
                        type="button"
                        className="mobile-dock-btn primary"
                        onClick={onAddClick}
                        disabled={editingDisabled}
                        aria-label={t('designer.mobileDock.add', '添加组件')}
                    >
                        <FaPlus />
                    </button>

                    {/* Property / Selection State */}
                    <button 
                        type="button"
                        className={`mobile-dock-btn ${activeTab === 'property' ? 'active' : ''}`}
                        onClick={onPropertyClick}
                        disabled={editingDisabled}
                        aria-label={propertyLabel}
                        aria-haspopup="dialog"
                        aria-expanded={activeTab === 'property'}
                    >
                        <Badge count={selectedCount} size="small" offset={[2, -2]}>
                            <FaBars style={{ fontSize: 18 }} />
                        </Badge>
                        <span className="dock-label">{t('designer.mobileDock.properties', '属性')}</span>
                    </button>
                    {selectedCount > 0 && hasDetailedSelection && (
                        <span
                            role="status"
                            aria-live="polite"
                            aria-atomic="true"
                            style={{
                                position: 'absolute',
                                width: 1,
                                height: 1,
                                padding: 0,
                                margin: -1,
                                overflow: 'hidden',
                                clip: 'rect(0, 0, 0, 0)',
                                whiteSpace: 'nowrap',
                                border: 0,
                            }}
                        >
                            {propertyLabel}
                        </span>
                    )}

                    {/* Layers */}
                    <button
                        type="button"
                        className="mobile-dock-btn"
                        onClick={onLayerClick}
                        aria-label={t('designer.mobileDock.layers', '图层')}
                        aria-haspopup="dialog"
                    >
                        <FaLayerGroup />
                        <span className="dock-label">{t('designer.mobileDock.layers', '图层')}</span>
                    </button>

                    {/* AI Assistant */}
                    <button 
                        type="button"
                        className={`mobile-dock-btn ai-btn ${activeTab === 'ai' ? 'active' : ''}`}
                        onClick={onAiClick}
                        disabled={editingDisabled}
                        aria-label={t('designer.mobileDock.ai', 'AI 助手')}
                        aria-haspopup="dialog"
                        aria-expanded={activeTab === 'ai'}
                    >
                        <FaRobot />
                        <span className="dock-label">{t('designer.mobileDock.aiShort', 'AI')}</span>
                    </button>

                    {/* History / More */}
                    <button
                        type="button"
                        className="mobile-dock-btn mini"
                        disabled={!canUndo}
                        onClick={onUndo}
                        aria-label={t('designer.toolbar.undo', '撤销')}
                    >
                        <FaUndo />
                    </button>
                    <button
                        type="button"
                        className="mobile-dock-btn mini"
                        disabled={!canRedo}
                        onClick={onRedo}
                        aria-label={t('designer.toolbar.redo', '重做')}
                    >
                        <FaRedo />
                    </button>
                    {onSettingsClick && (
                        <button
                            type="button"
                            data-settings-focus-return="primary"
                            className="mobile-dock-btn settings"
                            onClick={onSettingsClick}
                            aria-label={t('designer.mobileDock.settings', '设置')}
                        >
                            <FaCogs />
                        </button>
                    )}
                </div>
            </div>
            {/* iOS Home Indicator Safe Area Spacer */}
            <div className="mobile-safe-area-bottom" />
        </div>
    );
};
