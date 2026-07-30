import Dropdown from 'antd/es/dropdown';
import { BrainCircuit, ChevronDown, Clock3, Network, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { TemplateKey } from './diagramManagementPage.helpers';
interface WorkspaceCompactHeaderProps {
  documentCount: number;
  onCreateTemplate: (templateKey: TemplateKey) => void;
}

export const PRIMARY_WORKSPACE_TEMPLATE: TemplateKey = 'flowchart';

export const WorkspaceCompactHeader = ({
  documentCount,
  onCreateTemplate,
}: WorkspaceCompactHeaderProps) => {
  const { t } = useTranslation();

  const templateItems = [
    {
      key: 'mindmap',
      icon: <BrainCircuit size={18} aria-hidden="true" />,
      label: (
        <span className="workspace-create-menu-copy">
          <strong>{t('workspace.diagramTypes.mindmap')}</strong>
          <small>{t('workspace.diagramTypeDescriptions.mindmap')}</small>
        </span>
      ),
      onClick: () => onCreateTemplate('mindmap'),
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
      onClick: () => onCreateTemplate('timeline'),
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
      onClick: () => onCreateTemplate('architecture'),
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
            menu={{ items: templateItems }}
            trigger={['click']}
            placement="bottomRight"
            classNames={{ root: 'workspace-create-dropdown' }}
          >
            <button
              type="button"
              className="create-btn-primary create-btn-menu"
              aria-label={t('workspace.chooseDiagramType')}
              title={t('workspace.chooseDiagramType')}
            >
              <ChevronDown size={14} strokeWidth={2} />
            </button>
          </Dropdown>
        </div>
      </div>
    </div>
  );
};
