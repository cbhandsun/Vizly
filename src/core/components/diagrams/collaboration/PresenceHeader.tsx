import React from 'react';
import { Avatar, Badge, Tooltip } from 'antd';
import { UserOutlined } from '@ant-design/icons';

import { coerceCollaborationPresenceUsers } from '../collaborationPresence';
import './PresenceHeader.css';

export interface PresenceHeaderProps {
  activeUsers: unknown;
  maxDisplay?: number;
}

export const PresenceHeader: React.FC<PresenceHeaderProps> = ({ activeUsers, maxDisplay = 5 }) => {
  const safeActiveUsers = coerceCollaborationPresenceUsers(activeUsers);
  const safeMaxDisplay = Number.isInteger(maxDisplay) && maxDisplay >= 1 && maxDisplay <= 20
    ? maxDisplay
    : 5;

  if (safeActiveUsers.length === 0) return null;

  return (
    <div className="presence-header-container">
      <div className="presence-glass-capsule">
        <Avatar.Group
          max={{
            count: safeMaxDisplay,
            style: { color: '#f56a00', backgroundColor: '#fde3cf' },
          }}
        >
          {safeActiveUsers.map((presence) => (
            <Tooltip
              key={presence.clientId}
              title={`${presence.user.name} ${presence.isLocal ? '(你)' : ''}`}
              placement="bottom"
            >
              <Badge
                dot
                status={presence.isIdle ? 'default' : 'processing'}
                offset={[-2, 28]}
                className="presence-avatar-badge"
              >
                <Avatar
                  size={32}
                  style={{
                    backgroundColor: presence.user.color,
                    border: '2px solid rgba(255,255,255,0.8)',
                  }}
                  icon={<UserOutlined />}
                >
                  {presence.user.name.charAt(0).toUpperCase()}
                </Avatar>
              </Badge>
            </Tooltip>
          ))}
        </Avatar.Group>

        <div className="presence-labels">
          <span className="presence-count">{safeActiveUsers.length} 位在协作</span>
        </div>
      </div>
    </div>
  );
};
