import React, { useState, useEffect } from 'react';
import { Avatar, Tooltip } from 'antd';
import { collaborationService } from '../../services/CollaborationService';

interface PresenceUser {
    id: string;
    name: string;
    color: string;
}

/**
 * 协同用户头像列表 (Phase 9)
 */
export const CollaborationAvatars: React.FC = () => {
    const [users, setUsers] = useState<PresenceUser[]>([]);

    useEffect(() => {
        if (!collaborationService.isInitialized()) return;
        const awareness = collaborationService.getAwareness();
        
        const updateUsers = () => {
            const states = Array.from(awareness.getStates().values());
            const activeUsers = states
                .filter(s => s.user)
                .map(s => ({
                    id: s.user.id,
                    name: s.user.name,
                    color: s.user.color
                }));
            
            // 去重 (防止同一用户多端登录导致显示多个，虽然 id 不同也可以显示，但这里按 id 聚合一下)
            const uniqueUsers = Array.from(new Map(activeUsers.map(u => [u.id, u])).values());
            setUsers(uniqueUsers);
        };

        awareness.on('change', updateUsers);
        updateUsers();

        return () => awareness.off('change', updateUsers);
    }, []);

    if (users.length <= 1) return null; // 只有自己时不显示

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>{users.length} 人在线</span>
            <Avatar.Group maxCount={4} size="small" shape="circle">
                {users.map(u => (
                    <Tooltip key={u.id} title={u.name} placement="bottom">
                        <Avatar 
                            style={{ 
                                backgroundColor: u.color,
                                border: `2px solid #fff`,
                                cursor: 'default'
                            }}
                        >
                            {u.name.charAt(0).toUpperCase()}
                        </Avatar>
                    </Tooltip>
                ))}
            </Avatar.Group>
        </div>
    );
};
