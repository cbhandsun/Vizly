import type { MenuProps } from 'antd/es/menu';
import { Database, User } from 'lucide-react';

interface WorkspaceSettingsMenuOptions {
  accountLabel: string;
  isAuthenticated: boolean;
  storageSettingsLabel: string;
}

export const createWorkspaceSettingsMenu = ({
  accountLabel,
  isAuthenticated,
  storageSettingsLabel,
}: WorkspaceSettingsMenuOptions): MenuProps['items'] => [
  {
    key: 'storage-settings',
    label: storageSettingsLabel,
    icon: <Database size={16} strokeWidth={2} />,
  },
  { type: 'divider' },
  {
    key: 'account',
    label: accountLabel,
    icon: <User size={16} strokeWidth={2} />,
    disabled: isAuthenticated,
  },
];
