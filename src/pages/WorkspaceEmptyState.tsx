import { CircleAlert, FilterX, LoaderCircle, LogIn, Plus, SearchX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { WorkspaceInventoryLoadFailureReason } from './workspaceInventoryLoad';

type WorkspaceEmptyStateProps =
  | { mode?: 'empty'; isCreating?: boolean; onCreate: () => void }
  | { mode: 'search'; query: string; onClearSearch: () => void }
  | { mode: 'filter'; viewLabel: string; onClearFilter: () => void }
  | { mode: 'auth'; onSignIn: () => void }
  | { mode: 'error'; reason: WorkspaceInventoryLoadFailureReason; onRetry: () => void };

export const WorkspaceEmptyState = (props: WorkspaceEmptyStateProps) => {
  const { t } = useTranslation();
  const isSearch = props.mode === 'search';
  const isFilter = props.mode === 'filter';
  const isAuth = props.mode === 'auth';
  const isError = props.mode === 'error';
  const isRecoverable = isSearch || isFilter || isAuth || isError;

  return (
  <div
    className={`workspace-empty-state${isRecoverable ? ' is-recoverable-result' : ''}`}
    role={isError ? 'alert' : undefined}
  >
    <div className="workspace-empty-art" aria-hidden="true">
      {isSearch
        ? <SearchX size={28} strokeWidth={1.8} />
        : isAuth
          ? <LogIn size={28} strokeWidth={1.8} />
        : isError
          ? <CircleAlert size={28} strokeWidth={1.8} />
        : isFilter
          ? <FilterX size={28} strokeWidth={1.8} />
          : <Plus size={28} strokeWidth={1.8} />}
    </div>
    <h2 className="workspace-empty-title">
      {isSearch
        ? t('workspace.empty.searchTitle')
        : isAuth
          ? t('workspace.empty.authTitle')
        : isError
          ? t('workspace.empty.loadErrorTitle')
        : isFilter
          ? t('workspace.empty.filterTitle', { view: props.viewLabel })
          : t('workspace.empty.title')}
    </h2>
    <p className="workspace-empty-desc">
      {isSearch
        ? t('workspace.empty.searchDescription', { query: props.query })
        : isAuth
          ? t('workspace.empty.authDescription')
        : isError
          ? t(props.reason === 'timeout'
            ? 'workspace.empty.loadTimeoutDescription'
            : 'workspace.empty.loadErrorDescription')
        : isFilter
          ? t('workspace.empty.filterDescription', { view: props.viewLabel })
          : t('workspace.empty.description')}
    </p>
    {isSearch ? (
      <button type="button" className="workspace-search-reset-cta" onClick={props.onClearSearch}>
        {t('workspace.clearSearch')}
      </button>
    ) : isAuth ? (
      <button type="button" className="create-btn-primary" onClick={props.onSignIn}>
        <LogIn size={16} strokeWidth={2} aria-hidden="true" />
        {t('workspace.signIn')}
      </button>
    ) : isError ? (
      <button type="button" className="workspace-search-reset-cta" onClick={props.onRetry}>
        {t('workspace.retryLoad')}
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
