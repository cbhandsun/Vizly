import React from 'react';
import { Avatar, Badge, Tooltip } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { coerceCollaborationPresenceUsers } from '../collaborationPresence';
import type { DiagramCollaborationStatus } from '../../../types/diagram-components';
import './PresenceHeader.css';

export interface PresenceHeaderProps {
  activeUsers: unknown;
  maxDisplay?: number;
  status?: DiagramCollaborationStatus;
  onOpen?: () => void;
}

const STATUS_BADGE: Record<Exclude<DiagramCollaborationStatus, 'inactive'>, 'success' | 'processing' | 'error' | 'warning'> = {
  unavailable: 'warning',
  connecting: 'processing',
  connected: 'success',
  disconnected: 'error',
};

export const PresenceHeader: React.FC<PresenceHeaderProps> = ({
  activeUsers,
  maxDisplay = 5,
  status = 'inactive',
  onOpen,
}) => {
  const { t } = useTranslation();
  const safeActiveUsers = coerceCollaborationPresenceUsers(activeUsers);
  const safeMaxDisplay = Number.isInteger(maxDisplay) && maxDisplay >= 1 && maxDisplay <= 20
    ? maxDisplay
    : 5;

  if (safeActiveUsers.length === 0 && status === 'inactive') return null;

  const statusLabel = status === 'inactive'
    ? t('collaboration.activeCount', { count: safeActiveUsers.length })
    : t(`collaboration.${status}`);
  const content = (
    <>
      {safeActiveUsers.length > 0 && (
        <Avatar.Group
          max={{
            count: safeMaxDisplay,
            style: { color: '#f56a00', backgroundColor: '#fde3cf' },
          }}
        >
          {safeActiveUsers.map((presence) => (
            <Tooltip
              key={presence.clientId}
              title={`${presence.user.name} ${presence.isLocal ? `(${t('collaboration.localUser')})` : ''}`}
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
      )}

      <div className="presence-labels" aria-live="polite">
        <span className="presence-count">
          {status !== 'inactive' && <Badge status={STATUS_BADGE[status]} />}
          {statusLabel}
        </span>
        {safeActiveUsers.length > 0 && status !== 'inactive' && (
          <span className="presence-users-count">
            {t('collaboration.activeCount', { count: safeActiveUsers.length })}
          </span>
        )}
      </div>
    </>
  );

  return (
    <div className="presence-header-container">
      {onOpen ? (
        <button
          type="button"
          className="presence-glass-capsule presence-glass-button"
          onClick={onOpen}
          aria-label={t('collaboration.openDetails', { status: statusLabel })}
        >
          {content}
        </button>
      ) : (
        <div className="presence-glass-capsule">{content}</div>
      )}
    </div>
  );
};
