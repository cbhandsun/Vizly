import React, { useCallback, type RefObject } from 'react';
import { Button } from 'antd';
import type { NotificationInstance } from 'antd/es/notification/interface';

import type { FlowchartImportStatus } from '../flowchartImportHandler';

const IMPORT_NOTIFICATION_KEY = 'flowchart-file-import-status';
type ImportNotificationApi = Pick<NotificationInstance, 'destroy' | 'open'>;
type ImportNotificationTranslator = (key: string) => string;

export const useFlowchartImportNotifications = ({
    notificationApi,
    fileInputRef,
    t,
}: {
    notificationApi: ImportNotificationApi;
    fileInputRef: RefObject<HTMLInputElement | null>;
    t: ImportNotificationTranslator;
}) => {
    const handleImportStarted = useCallback(() => {
        notificationApi.open({
            key: IMPORT_NOTIFICATION_KEY,
            type: 'info',
            message: t('designer.flowchart.import.importingTitle'),
            description: t('designer.flowchart.import.importingDescription'),
            duration: 0,
        });
    }, [notificationApi, t]);

    const handleImportFinished = useCallback(({ status }: { status: FlowchartImportStatus }) => {
        if (status === 'success') {
            notificationApi.destroy(IMPORT_NOTIFICATION_KEY);
            return;
        }

        const scopeChanged = status === 'scope-changed';
        notificationApi.open({
            key: IMPORT_NOTIFICATION_KEY,
            type: scopeChanged ? 'warning' : 'error',
            message: t(scopeChanged
                ? 'designer.flowchart.import.cancelledTitle'
                : 'designer.flowchart.import.failedTitle'),
            description: t(scopeChanged
                ? 'designer.flowchart.import.scopeChanged'
                : 'designer.flowchart.import.failedDescription'),
            duration: scopeChanged ? 8 : 0,
            btn: React.createElement(Button, {
                onClick: () => {
                    notificationApi.destroy(IMPORT_NOTIFICATION_KEY);
                    fileInputRef.current?.click();
                },
            }, t('designer.flowchart.import.retry')),
        });
    }, [fileInputRef, notificationApi, t]);

    return { handleImportStarted, handleImportFinished };
};
