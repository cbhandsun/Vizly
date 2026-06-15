/**
 * DiffOverlay — 在画布上叠加 Diff 标注
 *
 * 使用 React Flow 的 Panel 组件在画布上显示 diff 摘要信息栏。
 * Diff 高亮通过修改节点/边的 className 实现（需配合 CSS）。
 */
import React, { useMemo } from 'react';
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

  if (!diff.hasDiff) {
    return (
      <div className="diff-overlay-bar">
        <span className="diff-no-changes">✅ 两个版本完全相同</span>
        <button className="diff-close-btn" onClick={onClose}>关闭</button>
      </div>
    );
  }

  return (
    <div className="diff-overlay-bar">
      <div className="diff-legend">
        {versionLabel && <span className="diff-version-label">📋 {versionLabel}</span>}
        <span className="diff-summary">{summary}</span>
        <div className="diff-legend-items">
          {diff.addedNodes.length > 0 && (
            <span className="diff-legend-item added">🟢 新增</span>
          )}
          {diff.removedNodes.length > 0 && (
            <span className="diff-legend-item removed">🔴 删除</span>
          )}
          {diff.modifiedNodes.length > 0 && (
            <span className="diff-legend-item modified">🟡 修改</span>
          )}
        </div>
      </div>

      {/* 详细变更列表 */}
      <div className="diff-details">
        {diff.addedNodes.length > 0 && (
          <div className="diff-section">
            <span className="diff-section-title added">+ 新增节点：</span>
            {diff.addedNodes.map(id => (
              <span key={id} className="diff-item-tag added">{id}</span>
            ))}
          </div>
        )}
        {diff.removedNodes.length > 0 && (
          <div className="diff-section">
            <span className="diff-section-title removed">- 删除节点：</span>
            {diff.removedNodes.map(n => (
              <span key={n.id} className="diff-item-tag removed">{n.label || n.id}</span>
            ))}
          </div>
        )}
        {diff.modifiedNodes.length > 0 && (
          <div className="diff-section">
            <span className="diff-section-title modified">~ 修改节点：</span>
            {diff.modifiedNodes.map(n => (
              <span key={n.id} className="diff-item-tag modified" title={n.changes.map(c => `${c.key}: ${JSON.stringify(c.oldValue)} → ${JSON.stringify(c.newValue)}`).join('\n')}>
                {n.label || n.id} ({n.changes.length}项)
              </span>
            ))}
          </div>
        )}
      </div>

      <button className="diff-close-btn" onClick={onClose}>关闭</button>
    </div>
  );
};

export default DiffOverlay;
