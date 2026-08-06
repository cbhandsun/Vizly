import React from 'react';
import Dropdown from 'antd/es/dropdown';
import type { MenuProps } from 'antd/es/menu';

import { useKeyboardAccessibleDropdown } from '@/core/components/diagrams/hooks/useKeyboardAccessibleDropdown';

interface WorkspaceCardActionsMenuProps {
  activeMenuKey: string | null;
  label: string;
  menuItems: MenuProps['items'];
  menuKey: string;
  onActiveMenuChange: (menuKey: string | null) => void;
  onMenuClick: NonNullable<MenuProps['onClick']>;
  onTriggerRefChange: (menuKey: string, trigger: HTMLButtonElement | null) => void;
  triggerIcon: React.ReactNode;
}

export const WorkspaceCardActionsMenu = ({
  activeMenuKey,
  label,
  menuItems,
  menuKey,
  onActiveMenuChange,
  onMenuClick,
  onTriggerRefChange,
  triggerIcon,
}: WorkspaceCardActionsMenuProps) => {
  const instanceId = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const menuId = `workspace-card-actions-menu-${instanceId}`;
  const overlayClassName = `workspace-card-actions-overlay-${instanceId}`;
  const {
    open,
    triggerRef,
    handleMenuKeyDown,
    handleOpenChange,
    handleTriggerKeyDown,
  } = useKeyboardAccessibleDropdown({
    overlayClassName,
    onBeforeOpen: () => onActiveMenuChange(menuKey),
  });

  React.useEffect(() => {
    if (open && activeMenuKey !== menuKey) {
      handleOpenChange(false, { source: 'trigger' });
    }
  }, [activeMenuKey, handleOpenChange, menuKey, open]);

  const assignTriggerRef = React.useCallback((trigger: HTMLButtonElement | null) => {
    triggerRef.current = trigger;
    onTriggerRefChange(menuKey, trigger);
  }, [menuKey, onTriggerRefChange, triggerRef]);

  const handleDropdownOpenChange: NonNullable<React.ComponentProps<typeof Dropdown>['onOpenChange']> = (
    nextOpen,
    info,
  ) => {
    handleOpenChange(nextOpen, info);
    if (!nextOpen && activeMenuKey === menuKey) onActiveMenuChange(null);
  };

  return (
    <Dropdown
      menu={{
        id: menuId,
        'aria-label': label,
        items: menuItems,
        onClick: onMenuClick,
        onKeyDown: handleMenuKeyDown,
      }}
      trigger={['click']}
      placement="bottomRight"
      open={open}
      onOpenChange={handleDropdownOpenChange}
      classNames={{ root: overlayClassName }}
    >
      <button
        ref={assignTriggerRef}
        type="button"
        className="action-btn-glass"
        onClick={event => event.stopPropagation()}
        onKeyDown={handleTriggerKeyDown}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
      >
        {triggerIcon}
      </button>
    </Dropdown>
  );
};
