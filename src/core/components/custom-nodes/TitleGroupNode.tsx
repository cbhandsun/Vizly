import React, { type CSSProperties } from 'react';
import { Handle, Position, NodeResizer, type Node, type NodeProps } from '@xyflow/react';
import { useTheme } from '../../themes/useCoreTheme';
import { resolveThemeDomainKey, getDomainTheme } from '../../utils/domainKey';
import type { Theme } from '../../themes/types/ThemeTypes';
import { ensureReadableText } from '../../utils/colorUtils';
import { useDiagramStylePreset_v2 } from '../../hooks/useDiagramStylePreset_v2';
import { useContainerNode } from './useContainerNode';
import { sanitizeInlineHtml, sanitizeSvgMarkup } from '../../utils/sanitizeHtml';
import { useTranslation } from 'react-i18next';
import {
  createContainerNodeAccessibilityProps,
  toContainerAccessibleText,
} from './containerNodeAccessibility';
import './TitleGroupNode.css';

type TitleGroupStyle = CSSProperties & {
  strokeDasharray?: string | number;
};

interface TitleGroupNodeData extends Record<string, unknown> {
  label?: string;
  description?: string;
  themeColor?: string;
  titleBarHeight?: number;
  baseZIndex?: number;
  iconSvg?: string;
  subtitle?: string;
  collapsed?: boolean;  // 🆕 节点树折叠状态
  childIds?: string[];  // 🆕 子节点ID列表
  isLane?: boolean;     // 🆕 是否作为泳道分栏
  hidden?: boolean;
  isDropTarget?: boolean;
  domainClass?: string;
  domain?: string;
  style?: TitleGroupStyle;
}

type TitleGroupCssProperties = CSSProperties & Record<`--${string}`, string>;

const TitleGroupNode = React.memo(({ id, data, selected }: NodeProps<Node<TitleGroupNodeData>>) => {
  const { t } = useTranslation();
  const [theme] = useTheme({ autoInitialize: true });
  const preset = useDiagramStylePreset_v2();

  const barH = data.titleBarHeight || (preset?.domain?.titleBarHeight ?? 40);
  const {
    isEditingTitle, editValue, setEditValue, inputRef,
    startEditing, commitEdit, cancelEdit,
    toggleCollapse, childCount, debugEnabled,
  } = useContainerNode({
    id, data,
    titleBarHeight: barH,
    defaultExpandedHeight: 300,
    syncLabel: true,
  });

  const domainKey = resolveThemeDomainKey(theme as Theme | undefined, {
    domainClass: data?.domainClass,
    domain: data?.domain,
    description: data?.description
  });

  const chineseTitleMapping: Record<string, string> = {
    'ch': '渠道触点域',
    'fe': '数字化前台域',
    'mid': '业务中台域',
    'be': '后台域',
    'data': '数据智能域',
    'infra': '技术基础设施域',
    'be-scm': '供应链管理',
    'be-logistics': '物流管理',
    'be-corp': '企业管理'
  };

  const rawTitle = (typeof data?.description === 'string' && data.description.trim().length > 0)
    ? data.description
    : '';
  const displayTitle = (typeof rawTitle === 'string' && rawTitle.trim().length > 0)
    ? rawTitle
    : (chineseTitleMapping[domainKey] || String(domainKey || ''));
  const safeDisplayTitle = sanitizeInlineHtml(displayTitle);
  const accessibleTitle = toContainerAccessibleText(safeDisplayTitle, id);
  const isCollapsed = data.collapsed === true;
  const containerAccessibility = createContainerNodeAccessibilityProps({
    accessibleName: t('designer.flowchart.containerAriaLabel', {
      label: accessibleTitle,
      selectedState: selected ? t('designer.flowchart.nodeSelectedState') : '',
      expandState: t(isCollapsed
        ? 'designer.flowchart.containerCollapsedState'
        : 'designer.flowchart.containerExpandedState'),
      childCount,
    }),
    selected,
    collapsed: isCollapsed,
    childCount,
  });

  const domainTheme = theme ? getDomainTheme(theme, { domainClass: data?.domainClass, domain: domainKey }) : null;
  const themeColor = data.themeColor || domainTheme?.main || '#4A90E2';

  // Text contrast and color logic
  const textColor = ensureReadableText('#FFFFFF', themeColor, 4.5, '#FFFFFF', '#1F2937');
  const borderColor = domainTheme?.border || themeColor;

  // Background logic
  const backgroundColor = domainTheme?.background ||
    (theme?.name === 'dark' ? 'rgba(33, 38, 45, 0.9)' :
      theme?.name === 'high-contrast' ? '#FFFFFF' :
        'rgba(255, 255, 255, 0.9)');

  const contentTextCandidate = domainTheme?.text
    || theme?.diagram?.nodes?.default?.text
    || theme?.palette?.neutral?.text
    || (theme?.mode === 'dark' ? '#FFFFFF' : '#333333');
  const contentTextColor = ensureReadableText(String(contentTextCandidate || ''), String(backgroundColor || '#FFFFFF'));

  const titleBarHeight = data.titleBarHeight || (preset?.domain?.titleBarHeight ?? 40);
  const baseZIndex = data.baseZIndex || 1;

  const isDark = theme?.name === 'dark' || theme?.mode === 'dark';
  const glassBg = isDark
    ? 'linear-gradient(to bottom, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.2))'
    : 'linear-gradient(to bottom, rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0.25))';

  // CSS Variables
  const nodeStyle: TitleGroupCssProperties = {
    '--group-theme-color': themeColor,
    '--group-border-color': borderColor,
    '--group-text-color': textColor,
    '--group-content-text': contentTextColor,
    '--group-bg-color': backgroundColor,
    '--group-glass-bg': glassBg,
    '--group-title-height': `${titleBarHeight}px`,
    // ⭐ isLane: 移除圆角和阴影，实现紧凑布局
    '--group-radius': data.isLane ? '0px' : (`${Math.min(preset?.domain?.radius ?? 12, 6)}px`),
    '--group-padding': `${preset?.domain?.sideSafeGap ?? 16}px`,
    '--group-title-size': `${preset?.domain?.titleFontSize ?? 16}px`,
    '--group-border-style': data.style?.strokeDasharray ? 'dashed' : 'solid',
    // isLane: 移除阴影
    boxShadow: data.isLane ? 'none' : undefined,
    zIndex: baseZIndex,
  };

  const renderDebugOverlay = () => {
    if (!import.meta.env.DEV || !debugEnabled) return null;
    const labelText = `${String(data?.domainClass || '—')} | ${String(domainKey || '')}`;
    return (
      <div className="title-group-debug" style={{ border: `1px solid ${borderColor}` }}>
        <span>{labelText}</span>
        <span className="debug-color-swatch" style={{ background: themeColor, borderColor }} />
      </div>
    );
  };

  return (
    <div
      {...containerAccessibility}
      className={`title-group-node ${data?.hidden ? 'hidden' : ''} ${preset?.name === 'glass' ? 'glass' : ''} ${preset?.name === 'blueprint' ? 'blueprint' : ''} ${data.isDropTarget ? 'drop-target' : ''}`}
      style={nodeStyle}
    >
      {/* Node Resizer - 可视化尺寸调整 */}
      <NodeResizer
        minWidth={200}
        minHeight={120}
        maxWidth={1200}
        maxHeight={800}
        color="#3b82f6"
        isVisible={selected}
        handleClassName="flowchart-resize-handle"
        lineClassName="flowchart-resize-line"
      />

      {renderDebugOverlay()}

      <div className="title-group-bar">
        {data.iconSvg && (
          <div
            className="title-group-icon"
            dangerouslySetInnerHTML={{ __html: sanitizeSvgMarkup(data.iconSvg) }}
          />
        )}

        <div className="title-group-content-wrapper">
          <div className="title-text" onDoubleClick={(e) => { e.stopPropagation(); startEditing(); }}>
            {isEditingTitle ? (
              <input
                ref={inputRef}
                className="title-group-inline-input"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                  if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              /<[^>]+>/.test(safeDisplayTitle)
                ? <span dangerouslySetInnerHTML={{ __html: safeDisplayTitle }} />
                : <span>{safeDisplayTitle}</span>
            )}
          </div>
          {data.subtitle && (
            <div className="title-group-subtitle">
              {data.subtitle}
            </div>
          )}
        </div>

        {/* 🆕 折叠按钮和计数徽章 */}
        {childCount > 0 && (
          <div className="title-group-collapse-controls">
            <span className="title-group-child-count">{childCount}</span>
            <button
              type="button"
              className="title-group-collapse-btn"
              onClick={(e) => {
                e.stopPropagation();
                toggleCollapse(e.currentTarget);
              }}
              aria-label={t(isCollapsed
                ? 'designer.flowchart.expandContainerChildren'
                : 'designer.flowchart.collapseContainerChildren')}
              aria-expanded={!isCollapsed}
              title={t(isCollapsed
                ? 'designer.flowchart.expandContainerChildren'
                : 'designer.flowchart.collapseContainerChildren')}
            >
              {data.collapsed ? '⊕' : '⊖'}
            </button>
          </div>
        )}
      </div>

      <div className="title-group-content">
        {/* Children rendered by React Flow via nested nodes, this div just provides background/border */}
      </div>

      {/* [FIX] Handle id 统一使用长格式，与 FlowchartNode 和 DomainDagreLayoutStrategy 的 sourceHandle 对齐 */}
      <Handle type="target" position={Position.Top} id="top" className="title-group-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="title-group-handle" />
      <Handle type="source" position={Position.Left} id="left" className="title-group-handle" />
      <Handle type="source" position={Position.Right} id="right" className="title-group-handle" />
    </div>
  );
});

export default TitleGroupNode;
