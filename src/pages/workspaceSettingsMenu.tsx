import type { MenuProps } from 'antd/es/menu';
import { Database, User } from 'lucide-react';

interface WorkspaceSettingsMenuOptions {
  accountLabel: string;
  isAuthenticated: boolean;
  onOpenSignIn: () => void;
  onOpenStorageSettings: () => void;
  storageSettingsLabel: string;
}

export const createWorkspaceSettingsMenu = ({
  accountLabel,
  isAuthenticated,
  onOpenSignIn,
  onOpenStorageSettings,
  storageSettingsLabel,
}: WorkspaceSettingsMenuOptions): MenuProps['items'] => [
  {
    key: 'storage-settings',
    label: storageSettingsLabel,
    icon: <Database size={16} strokeWidth={2} />,
    onClick: onOpenStorageSettings,
  },
  { type: 'divider' },
  {
    key: 'account',
    label: accountLabel,
    icon: <User size={16} strokeWidth={2} />,
    onClick: isAuthenticated ? undefined : onOpenSignIn,
  },
];
