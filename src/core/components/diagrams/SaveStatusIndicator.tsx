import React, { useEffect, useState } from 'react';
import { Button, Tag, Tooltip } from 'antd';
import { SyncOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { AutoSaveState } from './hooks/useAutoSave';
import './SaveStatusIndicator.css';

interface SaveStatusIndicatorProps {
    saveState: AutoSaveState;
    target?: 'local' | 'cloud';
    onRetry?: () => void | Promise<void>;
}

export const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = React.memo(({
    saveState,
    target = 'local',
    onRetry,
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
            <span className="designer-save-status" role="status" aria-live="polite">
                <Tooltip title={label}>
                    <Tag icon={<SyncOutlined spin />} color="processing">
                        {label}
                    </Tag>
                </Tooltip>
            </span>
        );
    }

    // 保存失败
    if (error) {
        const label = t(`designer.saveStatus.${target}.failed`);
        const retryLabel = t('common.retry');
        return (
            <span className="designer-save-status" role="status" aria-live="assertive">
                <Tooltip title={label}>
                    <Tag icon={<CloseCircleOutlined />} color="error">
                        {label}
                        {onRetry && (
                            <Button
                                type="link"
                                danger
                                size="small"
                                className="designer-save-status__retry"
                                aria-label={`${label}. ${retryLabel}`}
                                onClick={() => void onRetry()}
                            >
                                {retryLabel}
                            </Button>
                        )}
                    </Tag>
                </Tooltip>
            </span>
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
            <span className="designer-save-status" role="status" aria-live="polite">
                <Tooltip title={t('designer.saveStatus.lastSaved', { timeAgo })}>
                    <Tag icon={<CheckCircleOutlined />} color="success">
                        {label}
                    </Tag>
                </Tooltip>
            </span>
        );
    }

    return null;
});
