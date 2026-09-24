import React from 'react';
import { useTranslation } from 'react-i18next';
import Alert from 'antd/es/alert';

import type { AIProviderConnectionReadiness } from './aiProviderConnectionReadiness';
import {
    getAIProviderConnectionFeedback,
    getAIProviderConnectionStatus,
    type AIProviderConnectionStatusMap,
} from './aiProviderConnectionStatus';

interface AIConfigConnectionStatusAlertProps {
    providerId: string;
    readiness: AIProviderConnectionReadiness;
    statuses: AIProviderConnectionStatusMap;
}

export const AIConfigConnectionStatusAlert: React.FC<AIConfigConnectionStatusAlertProps> = ({
    providerId,
    readiness,
    statuses,
}) => {
    const { t } = useTranslation();
    const status = getAIProviderConnectionStatus(statuses, providerId);
    const feedback = getAIProviderConnectionFeedback(status);
    const noticeKey = readiness.authMode === 'optional-local'
        ? 'aiConfig.connection.localNotice'
        : 'aiConfig.connection.remoteNotice';

    const description = readiness.ready
        ? status.kind === 'failure'
            ? (status.message || t('aiConfig.connection.failureNotice'))
            : t(status.kind === 'success' ? 'aiConfig.connection.verifiedNotice' : noticeKey)
        : t(noticeKey);

    return (
        <Alert
            className="ai-config-readiness-alert"
            type={readiness.ready ? feedback.tone : 'warning'}
            showIcon
            role={readiness.ready ? feedback.role : 'status'}
            aria-live={feedback.role === 'alert' ? 'assertive' : 'polite'}
            message={t(readiness.ready
                ? `aiConfig.connection.${feedback.messageKey}`
                : `aiConfig.connection.${readiness.issue}`)}
            description={description}
        />
    );
};
