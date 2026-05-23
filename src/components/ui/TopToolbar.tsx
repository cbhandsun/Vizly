// @ts-nocheck
import { useTranslation } from 'react-i18next';
import { Space, Divider, Select, theme, Tooltip } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { EnhancedThemeSelector } from './EnhancedThemeSelector';
import EnhancedStyleSwitcher from '../shared/EnhancedStyleSwitcher';
import { LanguageSwitcher } from '../shared/LanguageSwitcher';
import ExportTools from '../ExportTools';

export interface TopToolbarProps {
  /**
   * 顶栏对应的图实例唯一 ID（用于视图控制与导出工具）
   */
  diagramId: string;
  /**
   * 图的显示名称（用于导出文件命名与界面显示）
   */
  diagramName?: string;
  /**
   * 当前连线模式（smart/advanced-smart/native），用于下拉选择器显示与联动
   */
  edgeMode: 'advanced-smart' | 'native';
  /**
   * 切换连线模式的回调（由外部图组件维护状态）
   */
  onEdgeModeChange: (mode: 'advanced-smart' | 'native') => void;
  /**
   * 是否处于全屏；若外层维护全屏状态，可传入以同步图标展示
   */
  isFullscreen?: boolean;
  /**
   * 切换全屏的回调；若未传入则仅由 ExportTools 内部处理
   */
  onToggleFullscreen?: () => void;
  setIsCommandOpen?: (open: boolean) => void;
  /**
   * 是否显示主题选择器
   */
  showThemeSelector?: boolean;
  /**
   * 是否显示线条风格切换器
   */
  showStyleSwitcher?: boolean;
  /**
   * 是否显示导出与视图控制入口
   */
  showExport?: boolean;
  /**
   * 左侧插槽：用于放置图特有的控制（布局策略、主流程高亮等）
   */
  leftChildren?: React.ReactNode;
  /**
   * 中间插槽：用于放置主要设计工具
   */
  centerChildren?: React.ReactNode;
  /**
   * 右侧插槽：用于放置额外状态文本或统计信息
   */
  rightChildren?: React.ReactNode;
  /**
   * 顶部标题文案（可选）
   */
  title?: string;
  /**
   * 是否彻底隐藏统一设计器的中间主工具栏（如缩放、网格等）
   */
  hideCenterIsland?: boolean;
}

/**
 * TopToolbar 顶部工具条组件
 *
 * 设计目标：
 * - 统一标题、主题、风格、连线模式、视图控制、导出入口的样式与布局
 * - 对接已有 EnhancedThemeSelector、DiagramStyleSwitcher、ExportTools
 * - 通过 leftChildren/rightChildren 提供可扩展插槽，便于各图定制控件
 */
export const TopToolbar: React.FC<TopToolbarProps> = ({
  diagramId,
  diagramName,
  edgeMode,
  onEdgeModeChange,
  isFullscreen,
  onToggleFullscreen,
  _setIsCommandOpen,
  showThemeSelector = true,
  showStyleSwitcher = true,
  showExport = true,
  leftChildren,
  rightChildren,
  title,
}) => {
  const { t } = useTranslation();
  const { token } = theme.useToken();

  const renderEdgeModeSelect = () => (
    <div key="edge-mode">
      <Space size={8}>
        <span className="top-action-label" style={{ color: token.colorTextSecondary }}>
          {t('header.edgeMode')}
        </span>
        <Select
          size="small"
          value={edgeMode}
          onChange={(value) => onEdgeModeChange(value as 'advanced-smart' | 'native')}
          style={{ width: 120 }}
          getPopupContainer={(trigger) => (document.fullscreenElement as HTMLElement) || trigger.parentElement || document.body}
          options={[
            { value: 'advanced-smart', label: t('header.smart') },
            { value: 'native', label: t('header.native') },
          ]}
        />
      </Space>
    </div>
  );

  return (
    <div
      className="diagram-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        height: 52,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        zIndex: 10,
      }}
    >
      <Space split={<Divider orientation="vertical" style={{ height: 16 }} />} size={12} style={{ width: '100%', justifyContent: 'space-between' }}>
        {/* 左侧区域 */}
        <Space size={12}>
          {title && (
            <span style={{
              fontWeight: 600,
              fontSize: 15,
              color: token.colorText,
              marginRight: 4
            }}>
              {title}
            </span>
          )}

          {showThemeSelector && (
            <EnhancedThemeSelector />
          )}

          {showStyleSwitcher && (
            <EnhancedStyleSwitcher size="sm" />
          )}

          {leftChildren}
        </Space>

        {/* 右侧功能区 */}
        <Space size={16} split={<Divider orientation="vertical" style={{ height: 16 }} />}>
          <Space size={12}>
            {renderEdgeModeSelect()}
          </Space>

          <Space size={12}>
            {showExport && (
              <ExportTools
                diagramId={diagramId}
                diagramName={diagramName || title || 'diagram'}
                onToggleFullscreen={onToggleFullscreen}
                isFullscreen={isFullscreen}
                variant="inline"
              />
            )}
            <LanguageSwitcher />
            {rightChildren && (
              <>
                <Divider orientation="vertical" style={{ height: 16 }} />
                {rightChildren}
              </>
            )}
          </Space>
        </Space>
      </Space>
    </div>
  );
};

export default TopToolbar;
