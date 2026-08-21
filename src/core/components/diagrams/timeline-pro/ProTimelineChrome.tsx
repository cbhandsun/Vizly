import React, { useEffect } from 'react';
import { CameraOutlined, DeleteOutlined, TeamOutlined, ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons';
import { Button, Segmented, Switch, Tooltip } from 'antd';

import type { ProTimelineViewMode } from '../../../hooks/useProTimelineEngine';
import { coerceProTimelineViewMode, stepProTimelineZoom } from './proTimelineChromeBoundary';

const KEYFRAMES_ID = 'pro-timeline-keyframes';

type ProTimelineChromeProps = {
  borderColor: string;
  glassBackground: string;
  shadowColor: string;
  secondaryTextColor: string;
  showResourceDrawer: boolean;
  onOpenResourceDrawer: () => void;
  showCriticalPath: boolean;
  onToggleCriticalPath: () => void;
  showBaseline: boolean;
  hasBaseline: boolean;
  onToggleBaseline: () => void;
  onSaveBaseline: () => void;
  onClearBaseline: () => void;
  viewMode: ProTimelineViewMode;
  onViewModeChange: (mode: ProTimelineViewMode) => void;
  zoomLevel: number;
  onZoomChange: (zoom: number) => void;
};

export const ProTimelineChrome: React.FC<ProTimelineChromeProps> = ({
  borderColor,
  glassBackground,
  shadowColor,
  secondaryTextColor,
  showResourceDrawer,
  onOpenResourceDrawer,
  showCriticalPath,
  onToggleCriticalPath,
  showBaseline,
  hasBaseline,
  onToggleBaseline,
  onSaveBaseline,
  onClearBaseline,
  viewMode,
  onViewModeChange,
  zoomLevel,
  onZoomChange,
}) => (
  <>
    <div className="pro-timeline-chrome pro-timeline-chrome--analysis" style={{
      position: 'absolute', bottom: 24, right: 335,
      background: glassBackground, backdropFilter: 'blur(12px) saturate(180%)',
      border: `1px solid ${borderColor}`, borderRadius: 99,
      boxShadow: `0 6px 16px ${shadowColor}`, padding: '4px 14px', zIndex: 100,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <Tooltip title="分析团队工时与资源负载">
        <Button
          type="text"
          size="small"
          shape="circle"
          icon={<TeamOutlined />}
          aria-label="查看团队工时与资源负载"
          onClick={onOpenResourceDrawer}
          style={{ color: showResourceDrawer ? '#1890ff' : secondaryTextColor }}
        />
      </Tooltip>
      <div style={{ width: 1, height: 16, backgroundColor: borderColor }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <span style={{ color: secondaryTextColor, fontWeight: 500 }}>关键路径</span>
        <Switch aria-label="显示关键路径" size="small" checked={showCriticalPath} onChange={onToggleCriticalPath} />
      </div>
      <div style={{ width: 1, height: 16, backgroundColor: borderColor }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <span style={{ color: secondaryTextColor, fontWeight: 500 }}>对比基线</span>
        <Tooltip title={hasBaseline ? '显示或隐藏基线对比' : '请先保存当前排期为基线'}>
          <span>
            <Switch
              aria-label="显示基线对比"
              size="small"
              checked={hasBaseline && showBaseline}
              disabled={!hasBaseline}
              onChange={onToggleBaseline}
            />
          </span>
        </Tooltip>
      </div>
      <div style={{ width: 1, height: 16, backgroundColor: borderColor }} />
      <Tooltip title="锁定当前排期为基线快照">
        <Button aria-label="保存当前排期为基线" type="text" size="small" shape="circle" icon={<CameraOutlined />} onClick={onSaveBaseline} style={{ color: secondaryTextColor }} />
      </Tooltip>
      <Tooltip title={hasBaseline ? '清空基线排期' : '当前没有可清空的基线'}>
        <Button aria-label="清空排期基线" type="text" size="small" shape="circle" icon={<DeleteOutlined />} onClick={onClearBaseline} disabled={!hasBaseline} danger />
      </Tooltip>
    </div>

    <div className="pro-timeline-chrome pro-timeline-chrome--scale" style={{
      position: 'absolute', bottom: 24, right: 24,
      background: glassBackground, backdropFilter: 'blur(12px) saturate(180%)',
      border: `1px solid ${borderColor}`, borderRadius: 99,
      boxShadow: `0 6px 16px ${shadowColor}`, padding: '4px 12px 4px 8px', zIndex: 100,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <Segmented
        aria-label="时间轴视图粒度"
        size="small"
        value={viewMode}
        onChange={value => onViewModeChange(coerceProTimelineViewMode(value, viewMode))}
        options={[
          { label: '天', value: 'day' },
          { label: '周', value: 'week' },
          { label: '月', value: 'month' },
          { label: '季', value: 'quarter' },
        ]}
        style={{ background: 'transparent', fontSize: 12 }}
      />
      <div style={{ width: 1, height: 16, backgroundColor: borderColor }} />
      <Tooltip title="缩小时间轴区域">
        <Button aria-label="缩小时间轴" type="text" size="small" shape="circle" icon={<ZoomOutOutlined />} onClick={() => onZoomChange(stepProTimelineZoom(zoomLevel, -0.2))} />
      </Tooltip>
      <Tooltip title="点击恢复默认 100% 比例">
        <button
          type="button"
          aria-label="恢复时间轴到 100%"
          onClick={() => onZoomChange(1)}
          style={{
            fontSize: 12, minWidth: 42, textAlign: 'center', fontFamily: 'monospace',
            cursor: 'pointer', fontWeight: 600, color: secondaryTextColor, userSelect: 'none',
            border: 0, padding: 0, background: 'transparent',
          }}
        >
          {Math.round(zoomLevel * 100)}%
        </button>
      </Tooltip>
      <Tooltip title="放大时间轴区域">
        <Button aria-label="放大时间轴" type="text" size="small" shape="circle" icon={<ZoomInOutlined />} onClick={() => onZoomChange(stepProTimelineZoom(zoomLevel, 0.2))} />
      </Tooltip>
    </div>
  </>
);

export const ProTimelineKeyframes: React.FC = () => {
  useEffect(() => {
    if (document.getElementById(KEYFRAMES_ID)) return;
    const style = document.createElement('style');
    style.id = KEYFRAMES_ID;
    style.textContent = `
      @keyframes pulse-ring {
        0% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(255, 77, 79, 0.7); }
        70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(255, 77, 79, 0); }
        100% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(255, 77, 79, 0); }
      }
      @keyframes pro-timeline-critical-glow {
        0%, 100% { box-shadow: 0 0 4px rgba(255, 77, 79, 0.5), inset 0 0 2px rgba(255, 77, 79, 0.3); }
        50% { box-shadow: 0 0 12px rgba(255, 77, 79, 0.85), inset 0 0 4px rgba(255, 77, 79, 0.5); }
      }
      @keyframes pro-timeline-cyclic-glow {
        0%, 100% { box-shadow: 0 0 4px rgba(250, 173, 20, 0.5), inset 0 0 2px rgba(250, 173, 20, 0.3); }
        50% { box-shadow: 0 0 12px rgba(250, 173, 20, 0.9), inset 0 0 4px rgba(250, 173, 20, 0.5); }
      }
      @keyframes pro-timeline-dash-flow { to { stroke-dashoffset: -20; } }
    `;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);
  return null;
};
