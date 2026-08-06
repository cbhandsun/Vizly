import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { UnifiedDiagramItem } from './diagramManagementPage.helpers';
import {
  clampWorkspaceMenuPosition,
  focusWorkspaceTarget,
  getNextWorkspaceMenuIndex,
  type WorkspaceMenuNavigationKey,
} from './workspaceMenuInteraction';

interface WorkspaceContextMenuProps {
  x: number;
  y: number;
  item: UnifiedDiagramItem;
  returnFocusTarget: HTMLElement | null;
  onOpen: (item: UnifiedDiagramItem) => void | Promise<void>;
  onOpenInNewTab: (item: UnifiedDiagramItem) => void;
  onDelete: (
    event: { stopPropagation: () => void },
    item: UnifiedDiagramItem,
    returnFocusTarget: HTMLElement | null,
  ) => void;
  onDismiss: () => void;
}

const MENU_NAVIGATION_KEYS: readonly WorkspaceMenuNavigationKey[] = [
  'ArrowDown',
  'ArrowUp',
  'Home',
  'End',
];

export const WorkspaceContextMenu = ({
  x,
  y,
  item,
  returnFocusTarget,
  onOpen,
  onOpenInNewTab,
  onDelete,
  onDismiss,
}: WorkspaceContextMenuProps) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y, positioned: false });

  const dismissAndRestore = useCallback(() => {
    onDismiss();
    queueMicrotask(() => focusWorkspaceTarget(returnFocusTarget));
  }, [onDismiss, returnFocusTarget]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const bounds = menu.getBoundingClientRect();
    const clamped = clampWorkspaceMenuPosition(
      { x, y },
      { width: bounds.width, height: bounds.height },
      { width: window.innerWidth, height: window.innerHeight },
    );
    setPosition({ ...clamped, positioned: true });
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [item.id, x, y]);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const menu = menuRef.current;
      if (event.target instanceof Node && menu?.contains(event.target)) return;
      dismissAndRestore();
    };
    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, [dismissAndRestore]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dismissAndRestore();
      return;
    }
    if (event.key === 'Tab') {
      onDismiss();
      return;
    }
    if (!MENU_NAVIGATION_KEYS.includes(event.key as WorkspaceMenuNavigationKey)) return;

    event.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    const currentIndex = items.findIndex(menuItem => menuItem === document.activeElement);
    const nextIndex = getNextWorkspaceMenuIndex(
      currentIndex,
      items.length,
      event.key as WorkspaceMenuNavigationKey,
    );
    items[nextIndex]?.focus({ preventScroll: true });
  };

  return (
    <div
      ref={menuRef}
      className="diagram-context-menu"
      style={{
        left: position.x,
        top: position.y,
        visibility: position.positioned ? 'visible' : 'hidden',
      }}
      role="menu"
      aria-label={t('workspace.moreActions', { title: item.title })}
      aria-orientation="vertical"
      onClick={event => event.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        className="ctx-menu-item"
        onClick={() => {
          void onOpen(item);
          onDismiss();
        }}
      >
        <Pencil size={14} strokeWidth={2} /> {t('common.open')}
      </button>
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        className="ctx-menu-item"
        onClick={() => {
          onOpenInNewTab(item);
          dismissAndRestore();
        }}
      >
        <ExternalLink size={14} strokeWidth={2} /> {t('workspace.openInNewTab')}
      </button>
      {item.role === 'owner' && (
        <>
          <div className="ctx-menu-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="ctx-menu-item danger"
            onClick={event => {
              onDelete(event, item, returnFocusTarget);
              onDismiss();
            }}
          >
            <Trash2 size={14} strokeWidth={2} /> {t('common.delete')}
          </button>
        </>
      )}
    </div>
  );
};
