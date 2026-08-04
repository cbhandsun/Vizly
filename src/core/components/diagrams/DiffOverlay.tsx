/**
 * DiffOverlay — 在画布上叠加 Diff 标注
 *
 * 使用 React Flow 的 Panel 组件在画布上显示 diff 摘要信息栏。
 * Diff 高亮通过修改节点/边的 className 实现（需配合 CSS）。
 */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
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
  const summary = useMemo(() => diffSummary(diff), [diff]);
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
      <div className="diff-overlay-bar" role="region" aria-label="差异对比结果">
        <div className="diff-overlay-content">
          {versionLabel ? <span className="diff-version-label">{versionLabel}</span> : null}
          <span className="diff-no-changes" role="status" aria-live="polite">两个版本完全相同</span>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          className="diff-close-btn"
          onClick={handleClose}
          aria-label="关闭差异对比"
        >
          关闭
        </button>
      </div>
    );
  }

  return (
    <div className="diff-overlay-bar" role="region" aria-label="差异对比结果">
      <div className="diff-overlay-content">
        <div className="diff-legend">
          {versionLabel && <span className="diff-version-label">{versionLabel}</span>}
          <span className="diff-summary" role="status" aria-live="polite" aria-atomic="true">{summary}</span>
          <div className="diff-legend-items">
            {addedCount > 0 && (
              <span className="diff-legend-item added">新增 {addedCount}</span>
            )}
            {removedCount > 0 && (
              <span className="diff-legend-item removed">删除 {removedCount}</span>
            )}
            {modifiedCount > 0 && (
              <span className="diff-legend-item modified">修改 {modifiedCount}</span>
            )}
          </div>
        </div>

        {/* 详细变更列表 */}
        <div className="diff-details">
        {diff.addedNodes.length > 0 && (
          <div className="diff-section">
            <span className="diff-section-title added">+ 新增节点：</span>
            {diff.addedNodes.map((id, index) => (
              <span key={id} className="diff-item-tag added">新增节点 {index + 1}</span>
            ))}
          </div>
        )}
        {diff.removedNodes.length > 0 && (
          <div className="diff-section">
            <span className="diff-section-title removed">- 删除节点：</span>
            {diff.removedNodes.map((node, index) => (
              <span key={node.id} className="diff-item-tag removed">{node.label || `未命名节点 ${index + 1}`}</span>
            ))}
          </div>
        )}
        {diff.modifiedNodes.length > 0 && (
          <div className="diff-section">
            <span className="diff-section-title modified">~ 修改节点：</span>
            {diff.modifiedNodes.map((node, index) => (
              <span key={node.id} className="diff-item-tag modified">
                {node.label || `未命名节点 ${index + 1}`} ({node.changes.length}项)
              </span>
            ))}
          </div>
        )}
        {diff.addedEdges.length > 0 && (
          <div className="diff-section">
            <span className="diff-section-title added">+ 新增连线：</span>
            {diff.addedEdges.map((id, index) => (
              <span key={id} className="diff-item-tag added">新增连线 {index + 1}</span>
            ))}
          </div>
        )}
        {diff.removedEdges.length > 0 && (
          <div className="diff-section">
            <span className="diff-section-title removed">- 删除连线：</span>
            {diff.removedEdges.map((edge, index) => (
              <span key={edge.id} className="diff-item-tag removed">{edge.label || `未命名连线 ${index + 1}`}</span>
            ))}
          </div>
        )}
        {diff.modifiedEdges.length > 0 && (
          <div className="diff-section">
            <span className="diff-section-title modified">~ 修改连线：</span>
            {diff.modifiedEdges.map((edge, index) => (
              <span key={edge.id} className="diff-item-tag modified">连线 {index + 1} ({edge.changes.length}项)</span>
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
        aria-label="关闭差异对比"
      >
        关闭
      </button>
    </div>
  );
};

export default DiffOverlay;
