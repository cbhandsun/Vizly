import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'antd';
import { FaPalette, FaCheck } from 'react-icons/fa';
import { useConfigIntegration } from '@/core/hooks/useConfigIntegration';
import { useTheme } from '@/core/themes/useCoreTheme';
import type { ThemePreset } from '@/core/themes/types/ThemeTypes';

interface ThemeSwitcherPanelProps {
    className?: string;
    style?: React.CSSProperties;
}

export const ThemeSwitcherPanel: React.FC<ThemeSwitcherPanelProps> = ({ className = '', style }) => {
    useTranslation();
    const { token } = theme.useToken();
    const [state] = useConfigIntegration();
    const [currentTheme, setTheme] = useTheme();
    
    const [presets, setPresets] = useState<ThemePreset[]>([]);
    
    // Load presets
    useEffect(() => {
        if (!state.integration) return;
        
        const loadData = async () => {
            try {
                const presetManager = state.integration!.getPresetManager();
                const allPresets = await presetManager.getAllPresets();
                setPresets(allPresets);
            } catch (error) {
                console.error('Failed to load theme data:', error);
            }
        };
        
        if (state.isReady) {
            loadData();
        }
    }, [state.integration, state.isReady]);

    const handleApplyPreset = async (preset: ThemePreset) => {
        try {
            if (!state.integration) return;

            const presetManager = state.integration.getPresetManager();
            const _themeObj = presetManager.applyPreset(preset.id);
            await setTheme(preset.id);
            
            // Broadcast global event
            window.dispatchEvent(new CustomEvent('diagram-global-theme-changed', { detail: preset.id }));
        } catch (error) {
            console.error('Failed to apply preset:', error);
        }
    };

    if (!state.isReady) {
        return <div style={{ padding: 16 }}>Loading theme system...</div>;
    }

    const categories = state.integration?.getPresetManager().getCategories() || [];

    return (
        <div className={`theme-switcher-panel ${className}`} style={{ padding: 16, ...style }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 8 }}>
                <FaPalette style={{ color: token.colorTextSecondary }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: token.colorText }}>画布主题</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {categories.map(category => {
                    const categoryPresets = presets.filter(preset => preset.category === category.id);
                    if (categoryPresets.length === 0) return null;

                    return (
                        <div key={category.id}>
                            <div style={{ 
                                fontSize: 12, 
                                color: token.colorTextSecondary,
                                marginBottom: 8,
                                fontWeight: 500 
                            }}>
                                {category.name}
                            </div>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, 1fr)',
                                gap: 8
                            }}>
                                {categoryPresets.map(preset => {
                                    const isActive = currentTheme?.id === preset.id;
                                    const bgPrimary = preset.theme?.palette?.primary?.main || token.colorPrimary;
                                    const bgSecondary = preset.theme?.palette?.secondary?.main || token.colorFillSecondary;
                                    const isDarkMode = preset.theme?.mode === 'dark';
                                    
                                    return (
                                        <div
                                            key={preset.id}
                                            onClick={() => handleApplyPreset(preset)}
                                            style={{
                                                padding: '8px',
                                                borderRadius: token.borderRadiusSM,
                                                border: `1px solid ${isActive ? token.colorPrimary : token.colorBorder}`,
                                                backgroundColor: isActive ? token.colorPrimaryBg : token.colorBgContainer,
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease',
                                                position: 'relative',
                                                overflow: 'hidden'
                                            }}
                                            onMouseEnter={e => {
                                                if (!isActive) {
                                                    e.currentTarget.style.borderColor = token.colorPrimaryBorderHover;
                                                    e.currentTarget.style.backgroundColor = token.colorBgLayout;
                                                }
                                            }}
                                            onMouseLeave={e => {
                                                if (!isActive) {
                                                    e.currentTarget.style.borderColor = token.colorBorder;
                                                    e.currentTarget.style.backgroundColor = token.colorBgContainer;
                                                }
                                            }}
                                        >
                                            <div style={{
                                                height: 48,
                                                borderRadius: 4,
                                                background: isDarkMode ? '#1e293b' : '#f8fafc',
                                                border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
                                                marginBottom: 8,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                position: 'relative'
                                            }}>
                                                <div style={{
                                                    width: 24,
                                                    height: 24,
                                                    borderRadius: '50%',
                                                    background: `linear-gradient(45deg, ${bgPrimary}, ${bgSecondary})`,
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                                }} />
                                                {isActive && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: -4,
                                                        right: -4,
                                                        background: token.colorPrimary,
                                                        color: '#fff',
                                                        borderRadius: '50%',
                                                        width: 16,
                                                        height: 16,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: 10
                                                    }}>
                                                        <FaCheck />
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ fontSize: 12, fontWeight: 500, color: token.colorText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {preset.name}
                                            </div>
                                            <div style={{ fontSize: 10, color: token.colorTextDescription, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {preset.description}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
