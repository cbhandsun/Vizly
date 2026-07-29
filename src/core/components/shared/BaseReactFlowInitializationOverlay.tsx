import React from 'react';
import { useTranslation } from 'react-i18next';

export const BaseReactFlowInitializationOverlay = React.memo(() => {
    const { t } = useTranslation();

    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                color: '#6b7280',
                fontSize: 14,
                background: 'rgba(250, 250, 252, 0.75)',
                backdropFilter: 'saturate(1.1) blur(0.5px)',
                pointerEvents: 'none',
            }}
        >
            {t('designer.canvas.initializing')}
        </div>
    );
});

BaseReactFlowInitializationOverlay.displayName = 'BaseReactFlowInitializationOverlay';
