import React from 'react';

const AVATAR_COLORS = [
    '#1890ff', '#2f54eb', '#722ed1', '#eb2f96', '#fa8c16',
    '#faad14', '#a0d911', '#52c41a', '#13c2c2',
];

const getAvatarColor = (name: string): string => {
    let hash = 0;
    for (let index = 0; index < name.length; index += 1) {
        hash = name.charCodeAt(index) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

interface ProTaskAssigneeAvatarProps {
    assignee: string;
    withMargin?: boolean;
}

export function ProTaskAssigneeAvatar({ assignee, withMargin = false }: ProTaskAssigneeAvatarProps) {
    const normalizedAssignee = assignee.trim();
    if (!normalizedAssignee) return null;

    return (
        <div
            aria-label={`负责人：${normalizedAssignee}`}
            title={`负责人: ${normalizedAssignee}`}
            style={{
                width: 16, height: 16, borderRadius: '50%', backgroundColor: '#ffffff', padding: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)', flexShrink: 0,
                marginLeft: withMargin ? 2 : undefined,
            }}
        >
            <div style={{
                width: '100%', height: '100%', borderRadius: '50%',
                backgroundColor: getAvatarColor(normalizedAssignee), color: '#fff',
                fontSize: 8, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {normalizedAssignee.charAt(0).toUpperCase()}
            </div>
        </div>
    );
}
