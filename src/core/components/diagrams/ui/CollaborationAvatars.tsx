import React, { useState, useEffect } from 'react';
import { Avatar, Tooltip } from 'antd';
import { collaborationService } from '../../../services/CollaborationService';

interface PresenceUser {
    id: string;
    name: string;
    color: string;
    avatar?: string;
}

/**
 * 实时协作用户头像列表 (Phase 9)
 */
export const CollaborationAvatars: React.FC = () => {
    const [users, setUsers] = useState<PresenceUser[]>([]);

    useEffect(() => {
        const awareness = collaborationService.getAwareness();
        
        const updateUsers = () => {
            const states = Array.from(awareness.getStates().values());
            const activeUsers: PresenceUser[] = [];
            const seenIds = new Set<string>();

            states.forEach((s: any) => {
                if (s.user && !seenIds.has(s.user.id)) {
                    activeUsers.push(s.user);
                    seenIds.add(s.user.id);
                }
            });

            setUsers(activeUsers);
        };

        awareness.on('change', updateUsers);
        updateUsers();

        return () => awareness.off('change', updateUsers);
    }, []);

    if (users.length === 0) return null;

    return (
        <div style={{ display: 'flex', alignItems: 'center', marginRight: 16 }}>
            <Avatar.Group
                maxCount={4}
                maxStyle={{ color: '#f56a00', backgroundColor: '#fde3cf' }}
                size="small"
            >
                {users.map(user => (
                    <Tooltip title={user.name} key={user.id}>
                        <Avatar 
                            style={{ backgroundColor: user.color, border: '2px solid white' }}
                            src={user.avatar}
                        >
                            {user.name[0].toUpperCase()}
                        </Avatar>
                    </Tooltip>
                ))}
            </Avatar.Group>
            
            {users.length > 0 && (
                <div style={{ 
                    width: 8, 
                    height: 8, 
                    borderRadius: '50%', 
                    backgroundColor: '#52c41a', 
                    marginLeft: 8,
                    boxShadow: '0 0 4px rgba(82, 196, 26, 0.5)'
                }} />
            )}
        </div>
    );
};
