import React from 'react';
import { DeleteOutlined, FlagFilled, FolderOpenOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { Dropdown } from 'antd';

interface ProTaskRowActionsProps {
    taskName: string;
    primaryColor: string;
    deleteColor: string;
    onAdd: (type: 'phase' | 'milestone') => void;
    onDelete: () => void;
}

export function ProTaskRowActions({
    taskName,
    primaryColor,
    deleteColor,
    onAdd,
    onDelete,
}: ProTaskRowActionsProps) {
    const menu = {
        items: [
            { key: 'phase', icon: <FolderOpenOutlined />, label: '添加子阶段' },
            { key: 'milestone', icon: <FlagFilled />, label: '添加里程碑' },
            { type: 'divider' as const },
            { key: 'delete', danger: true, icon: <DeleteOutlined />, label: '删除任务' },
        ],
        onClick: ({ key }: { key: string }) => {
            if (key === 'phase' || key === 'milestone') onAdd(key);
            else if (key === 'delete') onDelete();
        },
    };

    return (
        <div className="pro-timeline-row-actions" onClick={(event) => event.stopPropagation()}>
            <div className="pro-timeline-row-actions--desktop">
                <Dropdown menu={menu} trigger={['click']} placement="bottomRight">
                    <button
                        type="button"
                        aria-haspopup="menu"
                        aria-label={`为 ${taskName} 添加子项`}
                        className="pro-timeline-row-action-button"
                        style={{ color: primaryColor }}
                        title="添加子项"
                    >
                        <PlusOutlined aria-hidden="true" />
                    </button>
                </Dropdown>
                <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-label={`删除 ${taskName} 及其所有子任务`}
                    className="pro-timeline-row-action-button"
                    style={{ color: deleteColor }}
                    onClick={onDelete}
                    title="删除该任务及其所有子任务"
                >
                    <DeleteOutlined aria-hidden="true" />
                </button>
            </div>
            <Dropdown
                menu={menu}
                trigger={['click']}
                placement="bottomRight"
                classNames={{ root: 'pro-timeline-row-actions-menu' }}
            >
                <button
                    type="button"
                    aria-haspopup="menu"
                    aria-label={`${taskName} 任务操作`}
                    className="pro-timeline-row-actions--mobile"
                    style={{ color: primaryColor }}
                >
                    <MoreOutlined aria-hidden="true" />
                </button>
            </Dropdown>
        </div>
    );
}
