import React, { useState, useEffect } from 'react';
import { collaborationService } from '../../../services/CollaborationService';

interface RemoteCursor {
    id: string;
    name: string;
    color: string;
    x: number;
    y: number;
}

/**
 * 远程光标渲染层 (Phase 9)
 */
export const RemoteCursors: React.FC = () => {
    const [cursors, setCursors] = useState<RemoteCursor[]>([]);

    useEffect(() => {
        if (!collaborationService.isInitialized()) return;

        const awareness = collaborationService.getAwareness();
        const localUser = collaborationService.getLocalUser();

        const updateCursors = () => {
            const states = Array.from(awareness.getStates().entries());
            const remoteCursors: RemoteCursor[] = [];

            states.forEach(([clientId, s]) => {
                // 跳过本地用户
                if (s.user && s.user.id !== localUser.id && s.cursor) {
                    remoteCursors.push({
                        id: `${clientId}-${s.user.id}`,
                        name: s.user.name,
                        color: s.user.color,
                        x: s.cursor.x,
                        y: s.cursor.y
                    });
                }
            });

            setCursors(remoteCursors);
        };

        awareness.on('change', updateCursors);
        updateCursors();

        return () => awareness.off('change', updateCursors);
    }, []);

    return (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 99999 }}>
            {cursors.map(c => (
                <div 
                    key={c.id}
                    style={{
                        position: 'absolute',
                        left: c.x,
                        top: c.y,
                        transition: 'all 0.1s ease-out'
                    }}
                >
                    {/* SVG 鼠标箭头 */}
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill={c.color}
                        stroke="white"
                        strokeWidth="1"
                        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}
                    >
                        <path d="M5.65376 12.3673H5V4.67072L11 9.32431L8.51472 9.85191L8.51472 9.85191L5.65376 12.3673Z" />
                    </svg>
                    
                    {/* 用户名称标签 */}
                    <div
                        style={{
                            background: c.color,
                            color: 'white',
                            fontSize: 10,
                            padding: '2px 6px',
                            borderRadius: 4,
                            marginLeft: 12,
                            marginTop: 8,
                            whiteSpace: 'nowrap',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}
                    >
                        {c.name}
                    </div>
                </div>
            ))}
        </div>
    );
};
