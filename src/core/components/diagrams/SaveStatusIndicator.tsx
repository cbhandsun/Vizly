import React from 'react';
import { Tag, Tooltip } from 'antd';
import { SyncOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { AutoSaveState } from '../../hooks/useAutoSave';

interface SaveStatusIndicatorProps {
    saveState: AutoSaveState;
}

export const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = React.memo(({ saveState }) => {
    const { saving, lastSaved, error } = saveState;

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
        const now = Date.now();
        const diffMs = now - lastSaved;
        const diffSec = Math.floor(diffMs / 1000);

        let timeAgo = '';
        if (diffSec < 60) {
            timeAgo = `${diffSec}秒前`;
        } else if (diffSec < 3600) {
            const minutes = Math.floor(diffSec / 60);
            timeAgo = `${minutes}分钟前`;
        } else {
            const hours = Math.floor(diffSec / 3600);
            timeAgo = `${hours}小时前`;
        }

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
