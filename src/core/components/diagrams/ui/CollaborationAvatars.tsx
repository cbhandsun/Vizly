import React, { useState, useEffect, useRef } from 'react';
import { Avatar, Tooltip } from 'antd';
import { collaborationService } from '../../../services/CollaborationService';

interface PresenceUser {
    id: string;
    name: string;
    color: string;
    avatar?: string;
}

const readPresenceUser = (state: unknown): PresenceUser | null => {
    if (!state || typeof state !== 'object' || !('user' in state)) return null;
    const user = state.user;
    if (!user || typeof user !== 'object') return null;
    const candidate = user as Record<string, unknown>;
    if (
        typeof candidate.id !== 'string'
        || typeof candidate.name !== 'string'
        || typeof candidate.color !== 'string'
    ) return null;
    return {
        id: candidate.id,
        name: candidate.name,
        color: candidate.color,
        ...(typeof candidate.avatar === 'string' ? { avatar: candidate.avatar } : {}),
    };
};

/**
 * 实时协作用户头像列表 (Phase 9)
 */
export const CollaborationAvatars: React.FC = () => {
    const [users, setUsers] = useState<PresenceUser[]>([]);
    // [Perf] Keep a ref of the current user IDs for shallow-comparison.
    // awareness.on('change') fires on every cursor move — user list itself
    // changes only when someone joins or leaves. Skip setState if list is identical.
    const usersSignatureRef = useRef<string>('');

    useEffect(() => {
        if (!collaborationService.isConnected()) return;

        const awareness = collaborationService.getAwarenessSafe();
        if (!awareness) return;
        
        const updateUsers = () => {
            const states = Array.from(awareness.getStates().values());
            const activeUsers: PresenceUser[] = [];
            const seenIds = new Set<string>();

            states.forEach((state) => {
                const user = readPresenceUser(state);
                if (user && !seenIds.has(user.id)) {
                    activeUsers.push(user);
                    seenIds.add(user.id);
                }
            });

            // Shallow signature: join of sorted IDs. Avoids re-render when only
            // cursor positions changed but the user list composition is identical.
            const signature = activeUsers.map(u => u.id).sort().join(',');
            if (signature === usersSignatureRef.current) return;
            usersSignatureRef.current = signature;

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
