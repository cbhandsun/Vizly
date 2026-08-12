import React from 'react';

import type { TransientStatusAction } from './useTransientStatusMessage';

interface PageTabsStatusProps {
    action: TransientStatusAction | null;
    message: string;
    version: number;
}

export const PageTabsStatus: React.FC<PageTabsStatusProps> = ({ action, message, version }) => {
    if (!message) return null;

    return (
        <span key={version} className="page-tabs__status" role="status" aria-live="polite">
            {message}
            {action && (
                <button type="button" className="page-tabs__status-action" onClick={action.onActivate}>
                    {action.label}
                </button>
            )}
        </span>
    );
};
