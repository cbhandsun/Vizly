import React from 'react';
import { Flex, Badge } from 'antd';
import {
    FaPlus, FaLayerGroup, FaCogs, FaRobot,
    FaBars, FaUndo, FaRedo
} from 'react-icons/fa';
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
    selectedCount: number;
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
    selectedCount,
    activeTab
}) => {
    return (
        <div className="mobile-bottom-dock-wrapper">
            <div className="mobile-bottom-dock">
                <Flex align="center" justify="space-around" style={{ width: '100%', height: '100%' }}>
                    {/* Add Button - Primary Action */}
                    <button className="mobile-dock-btn primary" onClick={onAddClick}>
                        <FaPlus />
                    </button>

                    {/* Property / Selection State */}
                    <button 
                        className={`mobile-dock-btn ${activeTab === 'property' ? 'active' : ''}`}
                        onClick={onPropertyClick}
                    >
                        <Badge count={selectedCount} size="small" offset={[2, -2]}>
                            <FaBars style={{ fontSize: 18 }} />
                        </Badge>
                        <span className="dock-label">属性</span>
                    </button>

                    {/* Layers */}
                    <button className="mobile-dock-btn" onClick={onLayerClick}>
                        <FaLayerGroup />
                        <span className="dock-label">图层</span>
                    </button>

                    {/* AI Assistant */}
                    <button 
                        className={`mobile-dock-btn ai-btn ${activeTab === 'ai' ? 'active' : ''}`}
                        onClick={onAiClick}
                    >
                        <FaRobot />
                        <span className="dock-label">AI</span>
                    </button>

                    {/* History / More */}
                    <div className="mobile-dock-group">
                        <div className="flex flex-col gap-1 items-center">
                            <button 
                                className="mobile-dock-btn mini" 
                                disabled={!canUndo} 
                                onClick={onUndo}
                            >
                                <FaUndo />
                            </button>
                            <button 
                                className="mobile-dock-btn mini" 
                                disabled={!canRedo} 
                                onClick={onRedo}
                            >
                                <FaRedo />
                            </button>
                        </div>
                        {onSettingsClick && (
                            <button className="mobile-dock-btn" onClick={onSettingsClick}>
                                <FaCogs />
                            </button>
                        )}
                    </div>
                </Flex>
            </div>
            {/* iOS Home Indicator Safe Area Spacer */}
            <div className="mobile-safe-area-bottom" />
        </div>
    );
};
