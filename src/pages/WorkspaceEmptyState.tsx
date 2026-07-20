import { Plus } from 'lucide-react';

export const WorkspaceEmptyState = ({ onCreate }: { onCreate: () => void }) => (
  <div className="workspace-empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', textAlign: 'center' }}>
    <div className="workspace-empty-art" style={{ width: 48, height: 48, border: '1px dashed var(--vz-border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
      <Plus size={16} strokeWidth={2} style={{ color: 'var(--vz-text-secondary)' }} />
    </div>
    <div className="workspace-empty-title" style={{ fontSize: 15, fontWeight: 600, color: 'var(--vz-text-primary)', marginBottom: 4 }}>
      No diagrams
    </div>
    <div className="workspace-empty-desc" style={{ fontSize: 13, color: 'var(--vz-text-tertiary)', marginBottom: 24, maxWidth: 300 }}>
      Get started by creating a new document or pressing Ctrl+K.
    </div>
    <button className="create-btn-primary" onClick={onCreate}>
      <Plus className="plus-icon" size={16} strokeWidth={2} /> New Diagram
    </button>
  </div>
);
