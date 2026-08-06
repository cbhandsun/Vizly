import React from 'react';
import Dropdown from 'antd/es/dropdown';
import type { MenuProps } from 'antd/es/menu';
import { BrainCircuit, ChevronDown, Clock3, Network, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { TemplateKey } from './diagramManagementPage.helpers';
import { focusWorkspaceTarget } from './workspaceMenuInteraction';

interface WorkspaceCompactHeaderProps {
  documentCount: number;
  onCreateTemplate: (templateKey: TemplateKey) => void;
}

export const PRIMARY_WORKSPACE_TEMPLATE: TemplateKey = 'flowchart';
const WORKSPACE_CREATE_MENU_ID = 'workspace-create-diagram-type-menu';

const isSecondaryWorkspaceTemplate = (key: React.Key): key is TemplateKey =>
  key === 'mindmap' || key === 'timeline' || key === 'architecture';

export const WorkspaceCompactHeader = ({
  documentCount,
  onCreateTemplate,
}: WorkspaceCompactHeaderProps) => {
  const { t } = useTranslation();
  const [createMenuOpen, setCreateMenuOpen] = React.useState(false);
  const createMenuTriggerRef = React.useRef<HTMLButtonElement>(null);
  const restoreCreateMenuFocusRef = React.useRef(false);

  const handleCreateMenuOpenChange = (open: boolean) => {
    setCreateMenuOpen(open);
    if (open) {
      requestAnimationFrame(() => {
        const firstItem = document.querySelector<HTMLElement>(
          `#${WORKSPACE_CREATE_MENU_ID} [role="menuitem"]`,
        );
        focusWorkspaceTarget(firstItem);
      });
      return;
    }
    if (restoreCreateMenuFocusRef.current) {
      restoreCreateMenuFocusRef.current = false;
      queueMicrotask(() => focusWorkspaceTarget(createMenuTriggerRef.current));
    }
  };

  const handleCreateMenuTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['Enter', ' ', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    handleCreateMenuOpenChange(true);
  };

  const handleCreateMenuKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'Escape') restoreCreateMenuFocusRef.current = true;
  };

  const handleCreateMenuClick: NonNullable<MenuProps['onClick']> = event => {
    if (!isSecondaryWorkspaceTemplate(event.key)) return;
    restoreCreateMenuFocusRef.current = true;
    onCreateTemplate(event.key);
  };

  const templateItems: MenuProps['items'] = [
    {
      key: 'mindmap',
      icon: <BrainCircuit size={18} aria-hidden="true" />,
      label: (
        <span className="workspace-create-menu-copy">
          <strong>{t('workspace.diagramTypes.mindmap')}</strong>
          <small>{t('workspace.diagramTypeDescriptions.mindmap')}</small>
        </span>
      ),
    },
    {
      key: 'timeline',
      icon: <Clock3 size={18} aria-hidden="true" />,
      label: (
        <span className="workspace-create-menu-copy">
          <strong>{t('workspace.diagramTypes.timeline')}</strong>
          <small>{t('workspace.diagramTypeDescriptions.timeline')}</small>
        </span>
      ),
    },
    {
      key: 'architecture',
      icon: <Network size={18} aria-hidden="true" />,
      label: (
        <span className="workspace-create-menu-copy">
          <strong>{t('workspace.diagramTypes.architecture')}</strong>
          <small>{t('workspace.diagramTypeDescriptions.architecture')}</small>
        </span>
      ),
    },
  ];

  return (
    <div className="workspace-header-compact">
      <h1 className="workspace-title">
        {t('workspace.title')}
        <span className="workspace-count">{t('workspace.documentCount', { count: documentCount })}</span>
      </h1>
      <div className="workspace-actions-compact">
        <div className="create-split-button">
          <button
            type="button"
            className="create-btn-primary create-btn-main"
            onClick={() => onCreateTemplate(PRIMARY_WORKSPACE_TEMPLATE)}
          >
            <Plus className="plus-icon" size={16} strokeWidth={2} />
            {t('workspace.newFlowchart')}
          </button>
          <Dropdown
            menu={{
              id: WORKSPACE_CREATE_MENU_ID,
              items: templateItems,
              'aria-label': t('workspace.chooseDiagramType'),
              onClick: handleCreateMenuClick,
              onKeyDown: handleCreateMenuKeyDown,
            }}
            trigger={['click']}
            open={createMenuOpen}
            onOpenChange={handleCreateMenuOpenChange}
            placement="bottomRight"
            classNames={{ root: 'workspace-create-dropdown' }}
          >
            <button
              ref={createMenuTriggerRef}
              type="button"
              className="create-btn-primary create-btn-menu"
              aria-label={t('workspace.chooseDiagramType')}
              aria-haspopup="menu"
              aria-expanded={createMenuOpen}
              aria-controls={WORKSPACE_CREATE_MENU_ID}
              title={t('workspace.chooseDiagramType')}
              onKeyDown={handleCreateMenuTriggerKeyDown}
            >
              <ChevronDown size={14} strokeWidth={2} />
            </button>
          </Dropdown>
        </div>
      </div>
    </div>
  );
};
