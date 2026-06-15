import React, { useEffect, useState } from 'react';
import { Tag, Tooltip } from 'antd';
import { SyncOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { AutoSaveState } from '../../hooks/useAutoSave';

interface SaveStatusIndicatorProps {
    saveState: AutoSaveState;
}

export const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = React.memo(({ saveState }) => {
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
        return (
            <Tooltip title="保存中...">
                <Tag icon={<SyncOutlined spin />} color="processing">
                    保存中
                </Tag>
            </Tooltip>
        );
    }

    // 保存失败
    if (error) {
        return (
            <Tooltip title={`保存失败: ${error}`}>
                <Tag icon={<CloseCircleOutlined />} color="error">
                    保存失败
                </Tag>
            </Tooltip>
        );
    }

    // 已保存
    if (lastSaved) {
        const diffMs = now === null ? 0 : Math.max(0, now - lastSaved);
        const diffSec = Math.floor(diffMs / 1000);
        const timeAgo = diffSec < 60
            ? `${diffSec}秒前`
            : diffSec < 3600
                ? `${Math.floor(diffSec / 60)}分钟前`
                : `${Math.floor(diffSec / 3600)}小时前`;

        return (
            <Tooltip title={`上次保存: ${timeAgo}`}>
                <Tag icon={<CheckCircleOutlined />} color="success">
                    已保存
                </Tag>
            </Tooltip>
        );
    }

    return null;
});
