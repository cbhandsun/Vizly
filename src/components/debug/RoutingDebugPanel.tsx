import React from 'react';
import Button from 'antd/es/button';
import Tooltip from 'antd/es/tooltip';
import { theme } from 'antd';
import { FaTimes } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

import { RoutingSessionTab } from './tabs/RoutingSessionTab';
import { registerRoutingDebugTranslations } from './routingDebugTranslations';

registerRoutingDebugTranslations();

export const RoutingDebugPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');
    const toggleLabel = isMac ? '⌘⇧D' : 'Ctrl+Shift+D';

    return (
        <div style={{
            position: 'absolute', top: 20, right: 20, width: 480,
            background: token.colorBgElevated, backdropFilter: 'blur(10px)',
            border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 8,
            boxShadow: token.boxShadowSecondary, color: token.colorText,
            display: 'flex', flexDirection: 'column', zIndex: 9999,
            maxHeight: '90vh', fontFamily: token.fontFamily,
        }}>
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: 12, borderBottom: `1px solid ${token.colorBorderSecondary}`,
            }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: token.colorTextHeading }}>
                    {t('designer.debug.panel.title')}
                </span>
                <Tooltip title={t('designer.debug.panel.close')}>
                    <Button type="text" size="small" onClick={onClose}
                        aria-label={t('designer.debug.panel.close')} icon={<FaTimes />} />
                </Tooltip>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
                <RoutingSessionTab />
            </div>
            <div style={{
                padding: 8, borderTop: `1px solid ${token.colorBorderSecondary}`,
                fontSize: 12, color: token.colorTextSecondary, textAlign: 'center',
            }}>
                {t('designer.debug.panel.toggleHint', { shortcut: toggleLabel })}
            </div>
        </div>
    );
};
