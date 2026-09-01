import { memo, type CSSProperties } from 'react';
import { Handle, Position, NodeResizer, type Node, type NodeProps } from '@xyflow/react';
import type { GroupNodeData } from '../../models/DiagramModels';
import { useTheme } from '../../themes/useCoreTheme';
import { resolveThemeDomainKey, getDomainTheme } from '../../utils/domainKey';
import { hexToRgba } from '../shared/layoutUtils';
import type { Theme, ThemeColor } from '../../themes/types/ThemeTypes';
import { useDiagramStylePreset_v2 } from '../../hooks/useDiagramStylePreset_v2';
import { useContainerNode } from './useContainerNode';
import { sanitizeInlineHtml } from '../../utils/sanitizeHtml';
import { useTranslation } from 'react-i18next';
import {
  createContainerNodeAccessibilityProps,
  toContainerAccessibleText,
} from './containerNodeAccessibility';
import './SubGroupNode.css';

// 形状渲染回撤：不再使用 ShapeRenderer，仅保留矩形容器

/**
 * SubGroupNode - 子域分组节点（函数级注释）
 * 目标：
 * - 子域块（容器）使用主题联动的浅色背景与主题边框；
 * - 支持多形状渲染（通过 ShapeRenderer）；
 * - 标题区域不使用背景色，仅加粗并放大字体；
 * - 颜色联动当前主题，通过域键解析对应的域主题；
 * - 关键：主题解析优先使用 `domainClass`，确保样式随主题切换正确联动。
 */

/**
 * 函数级注释：SubGroupNode（主题联动订阅修复）
 * 问题背景：原实现使用 getConfigIntegration 获取 ThemeManager 引用，但未订阅主题变化，导致切换主题时子域容器样式不更新。
 * 解决方案：改为使用 useConfigIntegration Hook，以订阅集成状态（含主题）变化，保证主题切换触发组件重渲染。
 */
type SubGroupStyle = CSSProperties & {
  bgAlpha?: number;
};

type SubGroupNodeData = GroupNodeData & {
  hidden?: boolean;
  collapsed?: boolean;
  isDropTarget?: boolean;
  theme?: Theme;
  themeColor?: string;
  border?: string;
  borderWidth?: number;
  domainClass?: string;
  style?: SubGroupStyle;
};

const SubGroupNode = ({ id, data, zIndex, selected, isConnectable }: NodeProps<Node<SubGroupNodeData>>) => {
  const { t } = useTranslation();
  // 订阅配置与主题变化 - 使用全新的引擎内置 useTheme 钩子
  const [currentTheme] = useTheme();

  const {
    isEditingTitle, editValue, setEditValue, inputRef,
    startEditing, commitEdit, cancelEdit,
    toggleCollapse, childCount, debugEnabled,
  } = useContainerNode({
    id, data,
    titleBarHeight: 40,
    defaultExpandedHeight: 150,
    syncLabel: false,
  });

  const { domain, style, description, domainClass, border, borderWidth } = data;

  // 使用当前主题（优先使用订阅的主题，其次使用 data.theme）
  const theme = currentTheme || data?.theme;
  /**
   * 主题域键解析：
   * - 优先使用 `domainClass`（如 be-scm/be-logistics），与主题域定义直接匹配；
   * - 其次回退到 `domain`（如 wms/tms），再结合 `description` 做别名映射；
   * - 这样可保证"正常域或子域容器的样式跟随 domainClass 基于主题切换变化"。
   */
  const domainKey = resolveThemeDomainKey(theme, { domainClass, domain, description });
  /**
   * 函数级注释：域主题类型收敛
   * 将 getDomainTheme 的返回值显式标注为 Partial<ThemeColor>，避免回退到空对象时的属性访问类型错误。
   */
  const domainTheme: Partial<ThemeColor> = getDomainTheme(theme, { domainClass, domain: domainKey }) || {};
  const mainColor = data?.themeColor || domainTheme.main || '#4A90E2';
  const borderColor = domainTheme.border || mainColor;
  // 计算透明背景色：统一以主题主色 main 生成更高透明度的 RGBA（联动主题）
  // 进一步提升透明度（更轻）：alpha 从 0.08 调整为 0.06
  const styleRecord = data?.style as Record<string, unknown> | undefined;
  const rawBgAlpha = styleRecord?.bgAlpha;
  const bgAlphaValue = typeof rawBgAlpha === 'number' ? rawBgAlpha : 0.06;
  const bgAlpha = Math.max(0, Math.min(1, bgAlphaValue));

  const isDarkTheme = theme?.name === 'dark' || (theme as { mode?: string })?.mode === 'dark';
  const fallbackTextColor = isDarkTheme ? '#FFFFFF' : '#333';
  // Use domain theme text only for solid backgrounds. For highly transparent ones, rely on fallback.
  const textColor = bgAlpha < 0.4 ? fallbackTextColor : (domainTheme.text || fallbackTextColor);

  const preset = useDiagramStylePreset_v2();
  const isSvgShape = false;

  // Destructure style safely
  const { backgroundColor: _bgIgnored, background: _bgIgnored2, ...styleRest } = style || {};

  const borderStyleValue = border || preset?.subdomain?.borderStyle || 'dashed';
  const borderWidthValue = borderWidth || preset?.subdomain?.borderWidth || 1;
  // 业内优良实践：组节点四个角保留最大 6px
  const radiusValue = Math.min(preset?.subdomain?.radius ?? 10, 6);

  // Calculate dynamic background color for inline usage
  const dynamicBackgroundColor = isSvgShape
    ? 'transparent'
    : (preset?.name === 'mono' ? '#FFFFFF' : hexToRgba(mainColor, bgAlpha));

  const borderValue = isSvgShape
    ? 'none'
    : `${borderWidthValue}px ${borderStyleValue} ${preset?.name === 'mono' ? '#111111' : borderColor}`;

  const safeTitleHtml = typeof description === 'string' && description.trim().length > 0
    ? sanitizeInlineHtml(description)
    : '';
  const accessibleTitle = toContainerAccessibleText(safeTitleHtml, id);
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

  /**
   * 获取子组标题文本（函数级注释）
   * 仅使用 data.description；若包含简单 HTML 标签（如 <b>/<br/>），使用 innerHTML 渲染。
   */
  const getTitleContent = () => {
    const hasHtml = /<[^>]+>/.test(safeTitleHtml);
    return hasHtml
      ? <span dangerouslySetInnerHTML={{ __html: safeTitleHtml }} />
      : <span>{safeTitleHtml}</span>;
  };

  return (
    <div
      {...containerAccessibility}
      data-vizly-export-node-id={id}
      className={`sub-group-node ${selected ? 'selected' : ''} ${data.hidden ? 'hidden' : ''} ${preset?.name === 'glass' ? 'glass' : ''} ${preset?.name === 'blueprint' ? 'blueprint' : ''} ${data.isDropTarget ? 'drop-target' : ''}`}
      style={{
        zIndex,
        width: '100%',
        height: '100%',
        // Dynamic styles that depend on theme/props
        border: borderValue,
        borderRadius: `${radiusValue}px`,
        backgroundColor: dynamicBackgroundColor,
        ...styleRest,
      }}
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

      {/* 已回撤形状渲染 */}
      {import.meta.env.DEV && debugEnabled && (
        /**
         * 函数级注释：调试角标
         * 用途：显示 domainClass | 域键 与主题主色小方块，便于肉眼确认联动。
         */
        <div className="sub-group-debug" style={{ border: `1px solid ${borderColor}`, zIndex: (zIndex || 1) + 200 }}>
          <span>{`${String(domainClass || '—')} | ${String(domainKey || '')}`}</span>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: mainColor,
              border: `1px solid ${borderColor}`,
              boxShadow: `0 0 0 1px ${hexToRgba(mainColor, 0.15)}`,
              display: 'inline-block',
            }}
          />
        </div>
      )}

      <div
        className="sub-group-title"
        data-vizly-export-node-header="true"
        data-vizly-export-node-content="true"
        style={{
          fontWeight: preset?.subdomain?.titleFontWeight ?? 600,
          fontSize: `${(preset?.subdomain?.titleFontSize ?? theme?.typography?.fontSize?.lg ?? theme?.typography?.fontSize?.md ?? 16)}px`,
          color: textColor,
          // Keep radius logic consistent
          borderTopLeftRadius: `${radiusValue}px`,
          borderTopRightRadius: `${radiusValue}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
      >
        <span onDoubleClick={(e) => { e.stopPropagation(); startEditing(); }}>
          {isEditingTitle ? (
            <input
              ref={inputRef}
              className="sub-group-inline-input"
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
            getTitleContent()
          )}
        </span>

        {/* 🆕 折叠控件 */}
        {childCount > 0 && (
          <div className="sub-group-collapse-controls">
            <span className="sub-group-child-count">{childCount}</span>
            <button
              type="button"
              className="sub-group-collapse-btn"
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

      {isConnectable && (
        <>
          {/* [FIX] Handle id 统一长格式，与 FlowchartNode 和路由策略对齐 */}
          <Handle type="target" position={Position.Top} id="top" isConnectable={isConnectable} className="sub-group-handle" />
          <Handle type="source" position={Position.Bottom} id="bottom" isConnectable={isConnectable} className="sub-group-handle" />
          <Handle type="source" position={Position.Left} id="left" isConnectable={isConnectable} className="sub-group-handle" />
          <Handle type="source" position={Position.Right} id="right" isConnectable={isConnectable} className="sub-group-handle" />
        </>
      )}
    </div>
  );
};

export default memo(SubGroupNode);
