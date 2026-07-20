import Dropdown from 'antd/es/dropdown';
import { ChevronDown, Plus } from 'lucide-react';

import type { TemplateKey } from './diagramManagementPage.helpers';
interface WorkspaceCompactHeaderProps {
  documentCount: number;
  onCreateTemplate: (templateKey: TemplateKey) => void;
}

export const WorkspaceCompactHeader = ({
  documentCount,
  onCreateTemplate,
}: WorkspaceCompactHeaderProps) => (
  <div className="workspace-header-compact">
    <div className="workspace-title">
      Workspace
      <span className="workspace-count">{documentCount} documents</span>
    </div>
    <div className="workspace-actions-compact" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Dropdown
        menu={{
          items: [
            { key: 'flowchart', label: 'Flowchart', onClick: () => onCreateTemplate('flowchart') },
            { key: 'mindmap', label: 'Mind Map', onClick: () => onCreateTemplate('mindmap') },
            { key: 'timeline', label: 'Timeline', onClick: () => onCreateTemplate('timeline') },
            { key: 'architecture', label: 'Architecture', onClick: () => onCreateTemplate('architecture') },
          ],
        }}
        trigger={['hover']}
        placement="bottomRight"
      >
        <button className="create-btn-primary" onClick={() => onCreateTemplate('blank')}>
          <Plus className="plus-icon" size={16} strokeWidth={2} />
          New Diagram <ChevronDown size={12} strokeWidth={2} style={{ marginLeft: 4 }} />
        </button>
      </Dropdown>
    </div>
  </div>
);
