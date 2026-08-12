import React from 'react';
import { Button } from 'antd';

import { appNotification } from '@/core/utils/antdStaticBridge';

const CLOUD_SAVE_CONFIGURATION_NOTICE_KEY = 'cloud-save-configuration-required';

interface CloudSaveConfigurationRecoveryOptions {
    title: string;
    description: string;
    actionLabel: string;
}

export const showCloudSaveConfigurationRecovery = ({
    title,
    description,
    actionLabel,
}: CloudSaveConfigurationRecoveryOptions): void => {
    appNotification.warning({
        key: CLOUD_SAVE_CONFIGURATION_NOTICE_KEY,
        message: title,
        description,
        duration: 0,
        placement: 'topRight',
        btn: (
            <Button
                type="primary"
                href="#/storage-config"
                onClick={() => appNotification.destroy(CLOUD_SAVE_CONFIGURATION_NOTICE_KEY)}
            >
                {actionLabel}
            </Button>
        ),
    });
};
