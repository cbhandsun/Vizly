import React, { useEffect, useState } from 'react';
import { Tag, Tooltip } from 'antd';
import { SyncOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { AutoSaveState } from './hooks/useAutoSave';

interface SaveStatusIndicatorProps {
    saveState: AutoSaveState;
    target?: 'local' | 'cloud';
}

export const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = React.memo(({
    saveState,
    target = 'local',
}) => {
    const { t } = useTranslation();
    const { saving, lastSaved, error } = saveState;
    const [now, setNow] = useState<number | null>(null);

    useEffect(() => {
        if (!lastSaved) {
            return;
        }

        const initialTimer = window.setTimeout(() => setNow(Date.now()), 0);
        const timer = window.setInterval(() => setNow(Date.now()), 30_000);
        return () => {
            window.clearTimeout(initialTimer);
            window.clearInterval(timer);
        };
    }, [lastSaved]);

    // 保存中
    if (saving) {
        const label = t(`designer.saveStatus.${target}.saving`);
        return (
            <Tooltip title={label}>
                <Tag icon={<SyncOutlined spin />} color="processing">
                    {label}
                </Tag>
            </Tooltip>
        );
    }

    // 保存失败
    if (error) {
        const label = t(`designer.saveStatus.${target}.failed`);
        return (
            <Tooltip title={label}>
                <Tag icon={<CloseCircleOutlined />} color="error">
                    {label}
                </Tag>
            </Tooltip>
        );
    }

    // 已保存
    if (lastSaved) {
        const diffMs = now === null ? 0 : Math.max(0, now - lastSaved);
        const diffSec = Math.floor(diffMs / 1000);
        const timeAgo = diffSec < 60
            ? t('designer.saveStatus.secondsAgo', { count: diffSec })
            : diffSec < 3600
                ? t('designer.saveStatus.minutesAgo', { count: Math.floor(diffSec / 60) })
                : t('designer.saveStatus.hoursAgo', { count: Math.floor(diffSec / 3600) });
        const label = t(`designer.saveStatus.${target}.saved`);

        return (
            <Tooltip title={t('designer.saveStatus.lastSaved', { timeAgo })}>
                <Tag icon={<CheckCircleOutlined />} color="success">
                    {label}
                </Tag>
            </Tooltip>
        );
    }

    return null;
});
