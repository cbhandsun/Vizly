import React, { useMemo, useEffect } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';

// Arrow cursor SVG
const CursorIcon = ({ color }: { color: string }) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ transform: 'scale(1.2)' }}
  >
    <path
      d="M5.65376 21.2619C5.22851 21.6587 4.5 21.3571 4.5 20.771V3.22896C4.5 2.6429 5.22851 2.34133 5.65376 2.73809L18.8475 15.0504C19.2618 15.437 18.9959 16.1432 18.4287 16.1557L12.5186 16.2858C12.1672 16.2936 11.8596 16.5187 11.7228 16.8524L9.0435 23.3934C8.83549 23.9011 8.08182 23.864 7.92723 23.3384L5.65376 21.2619Z"
      fill={color}
      stroke="white"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

export interface LiveCursorsProps {
  activeUsers: any[];
  yAwareness?: any;
}

export const LiveCursors: React.FC<LiveCursorsProps> = ({ activeUsers, yAwareness }) => {
  const transform = useStore((s) => s.transform);
  const reactFlow = useReactFlow();

  useEffect(() => {
    if (!yAwareness || !reactFlow) return;

    let localRafId: number;
    let targetPos = { x: 0, y: 0 };
    let hasPendingUpdate = false;

    const syncCursor = () => {
      if (hasPendingUpdate) {
        yAwareness.setLocalStateField('cursor', targetPos);
        hasPendingUpdate = false;
      }
      localRafId = requestAnimationFrame(syncCursor);
    };
    localRafId = requestAnimationFrame(syncCursor);

    const handlePointerMove = (e: PointerEvent) => {
      const flowPos = reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      targetPos = flowPos;
      hasPendingUpdate = true;
    };

    window.addEventListener('pointermove', handlePointerMove);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      cancelAnimationFrame(localRafId);
    };
  }, [reactFlow, yAwareness]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 9999, // Render above nodes
      }}
    >
      {activeUsers.map((user) => {
        // Skip current user (awareness local client usually has current state but let's filter correctly)
        if (!user.cursor || !user.user) return null;
        if (user.clientId === yAwareness?.clientID) return null; // Don't render self

        // Apply react flow transform (zoom & pan)
        const x = user.cursor.x * transform[2] + transform[0];
        const y = user.cursor.y * transform[2] + transform[1];

        return (
          <div
            key={user.clientId}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              transform: `translate(${x}px, ${y}px)`,
              transition: 'transform 0.1s linear', // smooth interpolation
              pointerEvents: 'none',
            }}
          >
            <CursorIcon color={user.user.color} />
            <div
              className="px-2 py-1 text-xs font-semibold rounded-md shadow-sm whitespace-nowrap"
              style={{
                backgroundColor: user.user.color,
                color: '#fff',
                position: 'absolute',
                top: '16px',
                left: '16px',
                pointerEvents: 'none',
              }}
            >
              {user.user.name}
            </div>
          </div>
        );
      })}
    </div>
  );
};
