import React from 'react';

export interface SmartEdgeSettings {
  edgeMode: 'native' | 'advanced-smart';
  pathType: 'bezier' | 'straight' | 'step' | 'smoothstep';
  gridRatio: number;
  obstaclePadding: number;
  forceSmart: boolean;
  smoothFallback?: 'bezier' | 'straight' | 'step' | 'native';
  /** 是否启用同容器“车道钳制” */
  laneClamp?: boolean;
  /** 是否忽略容器影响 */
  ignoreContainers?: boolean;
  /** 走廊范围内边距 */
  obstacleScopePadding?: number;
  /** 方向约定策略 */
  directionalHandlePolicy?: 'prefer' | 'force' | 'off';
  /** 轴向容忍像素 */
  axisAlignTolerance?: number;
}

interface SmartEdgeConfigPanelProps {
  value: SmartEdgeSettings;
  onChange: (next: SmartEdgeSettings) => void;
  onApplyGlobal?: (
    edgeMode: 'native' | 'advanced-smart',
    pathType: SmartEdgeSettings['pathType'],
    smoothFallback?: SmartEdgeSettings['smoothFallback']
  ) => void;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 函数级注释：智能边配置面板（含高级参数）
 * 目标：集中管理边模式/路径与避障/容器/方向约定等参数；支持同步到全局配置。
 */
const SmartEdgeConfigPanel: React.FC<SmartEdgeConfigPanelProps> = ({
  value,
  onChange,
  onApplyGlobal,
  className,
  style
}) => {
  const update = (partial: Partial<SmartEdgeSettings>) => {
    onChange({ ...value, ...partial });
  };

  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        zIndex: 1000,
        background: '#fff',
        padding: 16,
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        border: '1px solid #e2e8f0',
        width: 320,
        ...style
      }}
    >
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Smart Edge 配置</h3>
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>模式</span>
          <select
            value={value.edgeMode}
            onChange={(e) => update({ edgeMode: e.target.value as SmartEdgeSettings['edgeMode'] })}
            style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6 }}
          >
            <option value="native">native</option>
            <option value="advanced-smart">advanced-smart</option>
          </select>
        </label>

        {/* 移除实现切换：统一使用库版智能边 */}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>路径</span>
          <select
            value={value.pathType}
            onChange={(e) => update({ pathType: e.target.value as SmartEdgeSettings['pathType'] })}
            style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6 }}
          >
            <option value="bezier">bezier</option>
            <option value="straight">straight</option>
            <option value="step">step</option>
            <option value="smoothstep">smoothstep</option>
          </select>
        </label>

        {value.edgeMode === 'advanced-smart' && value.pathType === 'smoothstep' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Smoothstep 回退策略</span>
            <select
              value={value.smoothFallback || 'bezier'}
              onChange={(e) => update({ smoothFallback: e.target.value as SmartEdgeSettings['smoothFallback'] })}
              style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6 }}
            >
              <option value="bezier">回退到 smart-bezier</option>
              <option value="step">回退到 smart-step</option>
              <option value="straight">回退到 smart-straight</option>
              <option value="native">回退到原生 smoothstep</option>
            </select>
          </label>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>网格比例 gridRatio</span>
          <input
            type="number"
            step={0.1}
            min={0.1}
            max={3}
            value={value.gridRatio}
            onChange={(e) => update({ gridRatio: Number(e.target.value) })}
            style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6 }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>障碍内边距 obstaclePadding</span>
          <input
            type="number"
            step={2}
            min={0}
            max={120}
            value={value.obstaclePadding}
            onChange={(e) => update({ obstaclePadding: Number(e.target.value) })}
            style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6 }}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, gridColumn: '1 / span 2', marginTop: 4 }}>
          <input
            type="checkbox"
            checked={value.forceSmart}
            onChange={(e) => update({ forceSmart: e.target.checked })}
          />
          <span style={{ fontSize: 12, color: '#374151' }}>强制智能避障（绕过原生兜底）</span>
        </label>

        {/* 高级参数 */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, gridColumn: '1 / span 2' }}>
          <input
            type="checkbox"
            checked={!!value.laneClamp}
            onChange={(e) => update({ laneClamp: e.target.checked })}
          />
          <span style={{ fontSize: 12, color: '#374151' }}>同容器“车道钳制” laneClamp</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, gridColumn: '1 / span 2' }}>
          <input
            type="checkbox"
            checked={!!value.ignoreContainers}
            onChange={(e) => update({ ignoreContainers: e.target.checked })}
          />
          <span style={{ fontSize: 12, color: '#374151' }}>忽略容器影响 ignoreContainers</span>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>走廊范围 obstacleScopePadding</span>
          <input
            type="number"
            step={10}
            min={40}
            max={300}
            value={value.obstacleScopePadding ?? 160}
            onChange={(e) => update({ obstacleScopePadding: Number(e.target.value) })}
            style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>方向约定 directionalHandlePolicy</span>
          <select
            value={value.directionalHandlePolicy || 'force'}
            onChange={(e) => update({ directionalHandlePolicy: e.target.value as SmartEdgeSettings['directionalHandlePolicy'] })}
            style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6 }}
          >
            <option value="off">off</option>
            <option value="prefer">prefer</option>
            <option value="force">force</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>轴向容忍 axisAlignTolerance</span>
          <input
            type="number"
            step={1}
            min={4}
            max={32}
            value={value.axisAlignTolerance ?? 8}
            onChange={(e) => update({ axisAlignTolerance: Number(e.target.value) })}
            style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6 }}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={() => onApplyGlobal?.(value.edgeMode, value.pathType, value.smoothFallback)}
          style={{
            padding: '6px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            background: '#3b82f6',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 13
          }}
        >同步到全局配置</button>
        <button
          onClick={() => {
            // 函数级注释：同步高级参数到全局 edge 配置
            // 行为：仅更新 edge 分支，不影响其他配置段
            try {
              const payload: any = {
                laneClamp: !!value.laneClamp,
                ignoreContainers: !!value.ignoreContainers,
                obstacleScopePadding: Number(value.obstacleScopePadding ?? 160),
                directionalHandlePolicy: value.directionalHandlePolicy || 'force',
                axisAlignTolerance: Number(value.axisAlignTolerance ?? 8),
                obstaclePadding: Number(value.obstaclePadding),
              };
              // 使用 window 事件传达更新意图或直接回调到父层由其写入，这里复用 onApplyGlobal 语义进行边分支更新
              // 实际更新在父层完成功能更明确；如未提供父层处理，则尝试直接全局更新
              (onApplyGlobal as any)?.(value.edgeMode, value.pathType, value.smoothFallback);
              // 附加：将高级参数写入全局 edge
              // 直接访问全局管理器，确保独立于父层也能生效
              try {
                const { diagramConfigManager } = require('../config/DiagramConfig');
                diagramConfigManager.updateConfig({ edge: payload });
              } catch { }
            } catch { }
          }}
          style={{
            padding: '6px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            background: '#10b981',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 13
          }}
        >同步高级参数</button>
      </div>
    </div>
  );
};

export default SmartEdgeConfigPanel;
