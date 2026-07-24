import type { Theme } from '../../../themes/types/ThemeTypes';
import type { ProjectedProTimelineTask } from './proTimelineTaskProjection';
import { buildProTaskTooltipModel } from './proTaskPresentationModel';
import './ProTaskLayer.css';

interface ProTaskTooltipProps {
  task: ProjectedProTimelineTask;
  x: number;
  y: number;
  theme: Theme | null;
}

export function ProTaskTooltip({ task, x, y, theme }: ProTaskTooltipProps) {
  const model = buildProTaskTooltipModel(task);
  const isDark = theme?.mode === 'dark';
  const bg = isDark ? 'rgba(30, 30, 46, 0.95)' : 'rgba(255, 255, 255, 0.95)';
  const textColor = isDark ? '#e8e8e8' : '#595959';
  const titleColor = isDark ? '#fff' : '#262626';
  const labelColor = '#8c8c8c';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const successColor = theme?.palette?.success?.main || '#52c41a';

  return (
    <div
      className="pro-task-tooltip"
      style={{
        position: 'fixed', left: x + 16, top: y - 10,
        background: bg, backdropFilter: 'blur(12px)',
        color: textColor, borderRadius: 10, padding: '12px 16px',
        fontSize: 12, lineHeight: 1.7, minWidth: 200, maxWidth: 280,
        boxShadow: `0 8px 32px rgba(0,0,0,${isDark ? 0.25 : 0.12}), 0 0 0 1px ${borderColor}`,
        zIndex: 1000, pointerEvents: 'none',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, color: titleColor, marginBottom: 6 }}>{model.name}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: '2px 8px' }}>
        <span style={{ color: labelColor }}>开始</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{model.startDate}</span>
        {model.endDate && <>
          <span style={{ color: labelColor }}>结束</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{model.endDate}</span>
        </>}
        {model.durationDays !== undefined && <>
          <span style={{ color: labelColor }}>工期</span>
          <span>{model.durationDays} 天</span>
        </>}
        {model.progress !== undefined && <>
          <span style={{ color: labelColor }}>进度</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              display: 'inline-flex', width: 60, height: 6, borderRadius: 3,
              background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)', overflow: 'hidden',
            }}>
              <span style={{ width: `${model.progress}%`, background: model.color || successColor, borderRadius: 3 }} />
            </span>
            <span>{model.progress}%</span>
          </span>
        </>}
        {model.status && <>
          <span style={{ color: labelColor }}>状态</span>
          <span>{model.status}</span>
        </>}
      </div>
    </div>
  );
}
