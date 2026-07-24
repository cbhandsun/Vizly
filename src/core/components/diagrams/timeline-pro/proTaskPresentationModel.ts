import type { ProjectedProTimelineTask } from './proTimelineTaskProjection';
import { parseDateOnlyTime } from '../../../utils/dateOnly';

const DAY_MS = 24 * 60 * 60 * 1000;
const STATUS_LABELS: Readonly<Record<string, string>> = {
  done: '✅ 已完成',
  active: '🔵 进行中',
  pending: '⏳ 待开始',
};

export interface ProTaskTooltipModel {
  name: string;
  startDate: string;
  endDate?: string;
  durationDays?: number;
  progress?: number;
  status?: string;
  color?: string;
}

export const clampProTaskProgress = (progress: unknown): number | undefined => {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return undefined;
  return Math.min(100, Math.max(0, progress));
};

export const isProTaskSelected = (task: ProjectedProTimelineTask): boolean => (
  task._rawSelected === true
);

export const buildProTaskTooltipModel = (
  task: ProjectedProTimelineTask,
): ProTaskTooltipModel => {
  const startTime = parseDateOnlyTime(task.startDate);
  const endTime = parseDateOnlyTime(task.endDate);
  const hasDistinctValidEnd = startTime !== null
    && endTime !== null
    && endTime > startTime;
  const status = typeof task.status === 'string' ? task.status.trim() : '';

  return {
    name: task.name,
    startDate: task.startDate,
    endDate: hasDistinctValidEnd ? task.endDate : undefined,
    durationDays: hasDistinctValidEnd
      ? Math.round((endTime - startTime) / DAY_MS)
      : undefined,
    progress: clampProTaskProgress(task.progress),
    status: status ? (STATUS_LABELS[status] ?? status) : undefined,
    color: task.color,
  };
};
