import React from 'react';
import { Avatar, Tooltip, Badge } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import './PresenceHeader.css';

export interface PresenceHeaderProps {
  activeUsers: any[];
  maxDisplay?: number;
}

export const PresenceHeader: React.FC<PresenceHeaderProps> = ({ activeUsers, maxDisplay = 5 }) => {
  // 过滤掉没有用户信息的条目，并按 clientId 去重
  const uniqueUsers = Array.from(
    new Map(activeUsers.filter(u => u.user).map(u => [u.clientId, u])).values()
  );

  if (uniqueUsers.length === 0) return null;

  return (
    <div className="presence-header-container">
      <div className="presence-glass-capsule">
        <Avatar.Group
          max={{
            count: maxDisplay,
            style: { color: '#f56a00', backgroundColor: '#fde3cf' },
          }}
        >
          {uniqueUsers.map((u: any) => (
            <Tooltip key={u.clientId} title={`${u.user.name} ${u.isLocal ? '(你)' : ''}`} placement="bottom">
              <Badge 
                dot 
                status={u.isIdle ? 'default' : 'processing'} 
                offset={[-2, 28]}
                className="presence-avatar-badge"
              >
                <Avatar 
                  size={32}
                  style={{ backgroundColor: u.user.color || '#1890ff', border: '2px solid rgba(255,255,255,0.8)' }}
                  icon={<UserOutlined />}
                >
                  {u.user.name?.charAt(0).toUpperCase()}
                </Avatar>
              </Badge>
            </Tooltip>
          ))}
        </Avatar.Group>
        
        {uniqueUsers.length > 0 && (
          <div className="presence-labels">
            <span className="presence-count">{uniqueUsers.length} 位在协作</span>
          </div>
        )}
      </div>
    </div>
  );
};
