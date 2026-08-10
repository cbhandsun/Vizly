import { FilterX, LoaderCircle, Plus, SearchX } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type WorkspaceEmptyStateProps =
  | { mode?: 'empty'; isCreating?: boolean; onCreate: () => void }
  | { mode: 'search'; query: string; onClearSearch: () => void }
  | { mode: 'filter'; viewLabel: string; onClearFilter: () => void };

export const WorkspaceEmptyState = (props: WorkspaceEmptyStateProps) => {
  const { t } = useTranslation();
  const isSearch = props.mode === 'search';
  const isFilter = props.mode === 'filter';
  const isRecoverable = isSearch || isFilter;

  return (
  <div className={`workspace-empty-state${isRecoverable ? ' is-recoverable-result' : ''}`}>
    <div className="workspace-empty-art" aria-hidden="true">
      {isSearch
        ? <SearchX size={28} strokeWidth={1.8} />
        : isFilter
          ? <FilterX size={28} strokeWidth={1.8} />
          : <Plus size={28} strokeWidth={1.8} />}
    </div>
    <h2 className="workspace-empty-title">
      {isSearch
        ? t('workspace.empty.searchTitle')
        : isFilter
          ? t('workspace.empty.filterTitle', { view: props.viewLabel })
          : t('workspace.empty.title')}
    </h2>
    <p className="workspace-empty-desc">
      {isSearch
        ? t('workspace.empty.searchDescription', { query: props.query })
        : isFilter
          ? t('workspace.empty.filterDescription', { view: props.viewLabel })
          : t('workspace.empty.description')}
    </p>
    {isSearch ? (
      <button type="button" className="workspace-search-reset-cta" onClick={props.onClearSearch}>
        {t('workspace.clearSearch')}
      </button>
    ) : isFilter ? (
      <button type="button" className="workspace-search-reset-cta" onClick={props.onClearFilter}>
        {t('workspace.viewRecent')}
      </button>
    ) : (
      <button
        type="button"
        className="create-btn-primary"
        onClick={props.onCreate}
        aria-busy={props.isCreating || undefined}
        disabled={props.isCreating}
      >
        {props.isCreating
          ? <LoaderCircle className="workspace-create-spinner" size={16} strokeWidth={2} aria-hidden="true" />
          : <Plus className="plus-icon" size={16} strokeWidth={2} aria-hidden="true" />}
        {props.isCreating ? t('workspace.creatingDiagram') : t('workspace.newDiagram')}
      </button>
    )}
  </div>
  );
};
