import React from 'react';
import { useTranslation } from 'react-i18next';

interface PageTabsDeleteConfirmationTitleProps {
    id: string;
    pageName: string;
}

export const PageTabsDeleteConfirmationTitle: React.FC<PageTabsDeleteConfirmationTitleProps> = ({
    id,
    pageName,
}) => {
    const { t } = useTranslation();

    return (
        <span id={id}>
            {t('designer.pages.deleteConfirm', {
                name: pageName,
                defaultValue: '删除「{{name}}」？',
            })}
        </span>
    );
};

interface PageTabsDeleteConfirmationDescriptionProps {
    connectionCount: number;
    id: string;
    nodeCount: number;
}

export const PageTabsDeleteConfirmationDescription: React.FC<PageTabsDeleteConfirmationDescriptionProps> = ({
    connectionCount,
    id,
    nodeCount,
}) => {
    const { t } = useTranslation();
    const nodeCountLabel = t('designer.pages.deleteNodeCount', {
        count: nodeCount,
        defaultValue: '{{count}} nodes',
    });
    const connectionCountLabel = t('designer.pages.deleteConnectionCount', {
        count: connectionCount,
        defaultValue: '{{count}} connections',
    });

    return (
        <span id={id}>
            {t('designer.pages.deleteDescription', {
                nodeCountLabel,
                connectionCountLabel,
                defaultValue: 'This deletes {{nodeCountLabel}} and {{connectionCountLabel}} from this page. You can restore the latest deleted page before closing or reloading this diagram.',
            })}
        </span>
    );
};
