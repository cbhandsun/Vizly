import { Plus, SearchX } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type WorkspaceEmptyStateProps =
  | { mode?: 'empty'; onCreate: () => void }
  | { mode: 'search'; query: string; onClearSearch: () => void };

export const WorkspaceEmptyState = (props: WorkspaceEmptyStateProps) => {
  const { t } = useTranslation();
  const isSearch = props.mode === 'search';

  return (
  <div className={`workspace-empty-state${isSearch ? ' is-search-result' : ''}`}>
    <div className="workspace-empty-art" aria-hidden="true">
      {isSearch
        ? <SearchX size={28} strokeWidth={1.8} />
        : <Plus size={28} strokeWidth={1.8} />}
    </div>
    <h2 className="workspace-empty-title">
      {t(isSearch ? 'workspace.empty.searchTitle' : 'workspace.empty.title')}
    </h2>
    <p className="workspace-empty-desc">
      {isSearch
        ? t('workspace.empty.searchDescription', { query: props.query })
        : t('workspace.empty.description')}
    </p>
    {isSearch ? (
      <button type="button" className="workspace-search-reset-cta" onClick={props.onClearSearch}>
        {t('workspace.clearSearch')}
      </button>
    ) : (
      <button type="button" className="create-btn-primary" onClick={props.onCreate}>
        <Plus className="plus-icon" size={16} strokeWidth={2} /> {t('workspace.newDiagram')}
      </button>
    )}
  </div>
  );
};
