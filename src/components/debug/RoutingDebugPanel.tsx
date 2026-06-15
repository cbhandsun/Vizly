import React, { useState } from 'react';
import { FaChartLine, FaDatabase, FaEye, FaTimes } from 'react-icons/fa';
import Button from 'antd/es/button';
import Tooltip from 'antd/es/tooltip';
import { theme } from 'antd';
import { useTranslation } from 'react-i18next';
import { PerformanceTab } from './tabs/PerformanceTab';
import { CacheTab } from './tabs/CacheTab';
import { VisualizerTab } from './tabs/VisualizerTab';

export const RoutingDebugPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const [activeTab, setActiveTab] = useState<'perf' | 'cache' | 'visual' | 'worker'>('perf');
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');
    const toggleLabel = isMac ? '⌘⇧D' : 'Ctrl+Shift+D';

    const TabButton: React.FC<TabButtonProps> = ({ active, onClick, icon, label, disabled = false }) => (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                flex: 1,
                padding: 8,
                background: active ? token.colorFillTertiary : 'transparent',
                border: 'none',
                borderBottom: active ? `2px solid ${token.colorPrimary}` : '2px solid transparent',
                color: active ? token.colorPrimary : (disabled ? token.colorTextDisabled : token.colorTextSecondary),
                cursor: disabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontSize: 12,
                transition: 'all 0.2s'
            }}
        >
            {icon}
            {label}
        </button>
    );

    return (
        <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            width: '450px',
            background: token.colorBgElevated,
            backdropFilter: 'blur(10px)',
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: '8px',
            boxShadow: token.boxShadowSecondary,
            color: token.colorText,
            display: 'flex',
            flexDirection: 'column',
            zIndex: 9999,
            maxHeight: '90vh',
            fontFamily: token.fontFamily
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px',
                borderBottom: `1px solid ${token.colorBorderSecondary}`
            }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: token.colorTextHeading }}>{t('designer.debug.panel.title')}</span>
                <Tooltip title={t('designer.debug.panel.close')}>
                    <Button type="text" size="small" onClick={onClose} aria-label={t('designer.debug.panel.close')} icon={<FaTimes />} />
                </Tooltip>
            </div>

            <div style={{ display: 'flex', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                <TabButton
                    active={activeTab === 'perf'}
                    onClick={() => setActiveTab('perf')}
                    icon={<FaChartLine />}
                    label={t('designer.debug.panel.tab.perf')}
                />
                <TabButton
                    active={activeTab === 'cache'}
                    onClick={() => setActiveTab('cache')}
                    icon={<FaDatabase />}
                    label={t('designer.debug.panel.tab.cache')}
                />
                <TabButton
                    active={activeTab === 'visual'}
                    onClick={() => setActiveTab('visual')}
                    icon={<FaEye />}
                    label={t('designer.debug.panel.tab.visual')}
                />
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {activeTab === 'perf' && <PerformanceTab />}
                {activeTab === 'cache' && <CacheTab />}
                {activeTab === 'visual' && <VisualizerTab />}
            </div>

            <div style={{ padding: 8, borderTop: `1px solid ${token.colorBorderSecondary}`, fontSize: 12, color: token.colorTextSecondary, textAlign: 'center' }}>
                {t('designer.debug.panel.toggleHint', { shortcut: toggleLabel })}
            </div>
        </div>
    );
};

interface TabButtonProps {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    disabled?: boolean;
}
