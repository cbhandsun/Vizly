import type { Edge } from '@xyflow/react';

import type { ProGanttTask } from '../../../hooks/useProTimelineEngine';
import {
  buildProTimelineDeletionImpact,
  type ProTimelineDeletionImpact,
} from './proTimelineTaskTransactions';

export interface PendingProTaskDeletion {
  id: string;
  impact: ProTimelineDeletionImpact;
  name: string;
}

export const PRO_TASK_DELETE_IMPACT_LABELS_ZH = {
  affectedSubtasks: '受影响的子任务',
  dependencyCount: '将删除的依赖关系',
  heading: '本次删除影响',
  hiddenSubtasks: (count: number): string => `另有 ${count} 个子任务`,
  taskCount: '将删除的任务',
};

export const createPendingProTaskDeletion = (
  tasks: readonly ProGanttTask[],
  edges: readonly Edge[],
  id: string,
  name: string,
): PendingProTaskDeletion => ({
  id,
  impact: buildProTimelineDeletionImpact(tasks, edges, id),
  name,
});
