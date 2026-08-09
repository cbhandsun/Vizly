/**
 * DiffOverlay — 在画布上叠加 Diff 标注
 *
 * 使用 React Flow 的 Panel 组件在画布上显示 diff 摘要信息栏。
 * Diff 高亮通过修改节点/边的 className 实现（需配合 CSS）。
 */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { DiffResult, diffSummary } from '../../utils/diagramDiff';
import './DiffOverlay.css';

interface DiffOverlayProps {
  /** Diff 结果 */
  diff: DiffResult;
  /** 关闭 Diff 视图 */
  onClose: () => void;
  /** 版本标签 */
  versionLabel?: string;
}

const DiffOverlay: React.FC<DiffOverlayProps> = ({ diff, onClose, versionLabel }) => {
  const { t } = useTranslation();
  const summary = useMemo(() => diffSummary(diff, {
    node: count => t('designer.diffOverlay.summaryNode', { count }),
    edge: count => t('designer.diffOverlay.summaryEdge', { count }),
    noChanges: t('designer.diffOverlay.noChanges'),
  }), [diff, t]);
  const resolvedVersionLabel = versionLabel ?? t('designer.diffOverlay.previousComparison');
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const handleClose = useCallback(() => {
    onClose();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLButtonElement>('[data-diff-focus-return]')?.focus();
      });
    });
  }, [onClose]);

  useEffect(() => {
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      handleClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  const addedCount = diff.addedNodes.length + diff.addedEdges.length;
  const removedCount = diff.removedNodes.length + diff.removedEdges.length;
  const modifiedCount = diff.modifiedNodes.length + diff.modifiedEdges.length;

  if (!diff.hasDiff) {
    return (
      <div className="diff-overlay-bar" role="region" aria-label={t('designer.diffOverlay.regionLabel')}>
        <div className="diff-overlay-content">
          <span className="diff-version-label">{resolvedVersionLabel}</span>
          <span className="diff-no-changes" role="status" aria-live="polite">
            {t('designer.diffOverlay.noChanges')}
          </span>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          className="diff-close-btn"
          onClick={handleClose}
          aria-label={t('designer.diffOverlay.closeLabel')}
        >
          {t('designer.diffOverlay.close')}
        </button>
      </div>
    );
  }

  return (
    <div className="diff-overlay-bar" role="region" aria-label={t('designer.diffOverlay.regionLabel')}>
      <div className="diff-overlay-content">
        <div className="diff-legend">
          <span className="diff-version-label">{resolvedVersionLabel}</span>
          <span className="diff-summary" role="status" aria-live="polite" aria-atomic="true">{summary}</span>
          <div className="diff-legend-items">
            {addedCount > 0 && (
              <span className="diff-legend-item added">
                {t('designer.diffOverlay.addedCount', { count: addedCount })}
              </span>
            )}
            {removedCount > 0 && (
              <span className="diff-legend-item removed">
                {t('designer.diffOverlay.removedCount', { count: removedCount })}
              </span>
            )}
            {modifiedCount > 0 && (
              <span className="diff-legend-item modified">
                {t('designer.diffOverlay.modifiedCount', { count: modifiedCount })}
              </span>
            )}
          </div>
        </div>

        {/* 详细变更列表 */}
        <div className="diff-details">
        {diff.addedNodes.length > 0 && (
          <div className="diff-section">
            <span className="diff-section-title added">+ {t('designer.diffOverlay.addedNodesTitle')}</span>
            {diff.addedNodes.map((id, index) => (
              <span key={id} className="diff-item-tag added">
                {t('designer.diffOverlay.addedNode', { index: index + 1 })}
              </span>
            ))}
          </div>
        )}
        {diff.removedNodes.length > 0 && (
          <div className="diff-section">
            <span className="diff-section-title removed">- {t('designer.diffOverlay.removedNodesTitle')}</span>
            {diff.removedNodes.map((node, index) => (
              <span key={node.id} className="diff-item-tag removed">
                {node.label || t('designer.diffOverlay.unnamedNode', { index: index + 1 })}
              </span>
            ))}
          </div>
        )}
        {diff.modifiedNodes.length > 0 && (
          <div className="diff-section">
            <span className="diff-section-title modified">~ {t('designer.diffOverlay.modifiedNodesTitle')}</span>
            {diff.modifiedNodes.map((node, index) => (
              <span key={node.id} className="diff-item-tag modified">
                {node.label || t('designer.diffOverlay.unnamedNode', { index: index + 1 })}
                {' '}({t('designer.diffOverlay.changeCount', { count: node.changes.length })})
              </span>
            ))}
          </div>
        )}
        {diff.addedEdges.length > 0 && (
          <div className="diff-section">
            <span className="diff-section-title added">+ {t('designer.diffOverlay.addedEdgesTitle')}</span>
            {diff.addedEdges.map((id, index) => (
              <span key={id} className="diff-item-tag added">
                {t('designer.diffOverlay.addedEdge', { index: index + 1 })}
              </span>
            ))}
          </div>
        )}
        {diff.removedEdges.length > 0 && (
          <div className="diff-section">
            <span className="diff-section-title removed">- {t('designer.diffOverlay.removedEdgesTitle')}</span>
            {diff.removedEdges.map((edge, index) => (
              <span key={edge.id} className="diff-item-tag removed">
                {edge.label || t('designer.diffOverlay.unnamedEdge', { index: index + 1 })}
              </span>
            ))}
          </div>
        )}
        {diff.modifiedEdges.length > 0 && (
          <div className="diff-section">
            <span className="diff-section-title modified">~ {t('designer.diffOverlay.modifiedEdgesTitle')}</span>
            {diff.modifiedEdges.map((edge, index) => (
              <span key={edge.id} className="diff-item-tag modified">
                {t('designer.diffOverlay.modifiedEdge', { index: index + 1 })}
                {' '}({t('designer.diffOverlay.changeCount', { count: edge.changes.length })})
              </span>
            ))}
          </div>
        )}
        </div>
      </div>
      <button
        ref={closeButtonRef}
        type="button"
        className="diff-close-btn"
        onClick={handleClose}
        aria-label={t('designer.diffOverlay.closeLabel')}
      >
        {t('designer.diffOverlay.close')}
      </button>
    </div>
  );
};

export default DiffOverlay;
