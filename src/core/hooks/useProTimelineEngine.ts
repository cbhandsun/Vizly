import { create } from 'zustand';
import { formatDateOnly, parseDateOnlyTime, todayDateOnly } from '../utils/dateOnly';

const DAY_MS = 24 * 60 * 60 * 1000;

export type ProTimelineViewMode = 'day' | 'week' | 'month' | 'quarter';

export interface ProGanttTask {
  id: string;
  name: string;
  startDate: string; // ISO 8601
  endDate: string;
  progress?: number;
  dependencies?: string[]; // Array of task IDs this task depends on
  color?: string;
  type?: string; // 'phase', 'event', 'milestone', 'summary'
  
  // WBS / Hierarchy fields
  parentId?: string;
  isExpanded?: boolean;
  
  // Custom metadata fields
  assignee?: string;
  priority?: 'high' | 'medium' | 'low';

  // Baseline metadata fields
  baselineStartDate?: string;
  baselineEndDate?: string;

  // Computed output
  _computed?: {
    laneIndex: number;
    x: number;
    w: number;
    depth: number;
    isVisible: boolean;
    hasChildren: boolean;
  };
}

export function buildHierarchicalTasks(tasks: ProGanttTask[]): ProGanttTask[] {
  // 1. Map to hold all tasks with fresh computed defaults
  const taskMap = new Map<string, ProGanttTask & { children: string[] }>();
  tasks.forEach(t => {
      taskMap.set(t.id, { 
          ...t, 
          children: [],
          _computed: { laneIndex: -1, x: 0, w: 0, depth: 0, isVisible: true, hasChildren: false }
      });
  });

  // 2. Build tree references
  const roots: string[] = [];
  taskMap.forEach(t => {
      if (t.parentId && taskMap.has(t.parentId)) {
          taskMap.get(t.parentId)!.children.push(t.id);
          taskMap.get(t.parentId)!._computed!.hasChildren = true;
          // Force parent type to summary if it has children
          if (taskMap.get(t.parentId)!.type !== 'summary') {
              taskMap.get(t.parentId)!.type = 'summary';
          }
      } else {
          roots.push(t.id);
      }
  });

  // 3. Bottom-up Rollup for Dates & Progress
  // Helper to process recursively and return { minStart, maxEnd, sumProgress, count }
  function rollupTask(taskId: string): { start: number; end: number; prog: number; count: number } {
      const t = taskMap.get(taskId)!;
      if (t.children.length === 0) {
          const s = t.startDate ? parseDateOnlyTime(t.startDate) ?? Infinity : Infinity;
          const e = t.endDate ? parseDateOnlyTime(t.endDate) ?? -Infinity : -Infinity;
          return { start: isNaN(s) ? Infinity : s, end: isNaN(e) ? -Infinity : e, prog: t.progress ?? 0, count: 1 };
      }

      let minS = Infinity;
      let maxE = -Infinity;
      let sumP = 0;
      let childCount = 0;

      t.children.forEach(cid => {
          const res = rollupTask(cid);
          minS = Math.min(minS, res.start);
          maxE = Math.max(maxE, res.end);
          sumP += res.prog;
          childCount += res.count;
      });

      // Update parent dates and progress based on children
      if (minS !== Infinity && maxE !== -Infinity) {
          t.startDate = formatDateOnly(new Date(minS));
          t.endDate = formatDateOnly(new Date(maxE));
      }
      if (childCount > 0) {
          t.progress = Math.round(sumP / childCount);
      }
      return { start: minS, end: maxE, prog: sumP, count: childCount };
  }

  // Execute rollup
  roots.forEach(rid => rollupTask(rid));

  // 4. Top-down flatten and compute depth & visibility
  const flattened: ProGanttTask[] = [];
  
  function flattenTask(taskId: string, depth: number, parentVisible: boolean) {
      const t = taskMap.get(taskId)!;
      t._computed!.depth = depth;
      t._computed!.isVisible = parentVisible;
      
      const isSelfExpanded = t.isExpanded !== false; // default true
      flattened.push({ ...t }); // save snapshot without internal children array

      t.children.forEach(cid => flattenTask(cid, depth + 1, parentVisible && isSelfExpanded));
  }

  roots.forEach(rid => flattenTask(rid, 0, true));
  return flattened;
}

// Global 1D bin-packing algorithm for swimlane collision detection
export function calculateSwimlanes(tasks: ProGanttTask[]): ProGanttTask[] {
  const hierarchicalTasks = buildHierarchicalTasks(tasks);
  
  // Only allocate lanes for visible tasks
  const _visibleTasks = hierarchicalTasks.filter(t => t._computed!.isVisible);
  
  // Sort by start date to pack lanes efficiently, BUT actually for a Gantt chart,
  // the order in the list *dictates* the row index when we have a fixed task list panel!
  // We cannot dynamically reorder the lanes based on dates anymore because we have a task list.
  // The row index (laneIndex) must match the visual index in the flattened tree.
  
  let laneCounter = 0;
  hierarchicalTasks.forEach(task => {
      if (task._computed!.isVisible) {
          task._computed!.laneIndex = laneCounter++;
      } else {
          task._computed!.laneIndex = -1; // hide
      }
  });

  return hierarchicalTasks;
}

// Global engine store
interface ProTimelineState {
  pixelsPerDay: number;
  zoomLevel: number; // For micro-zooming inside the current viewMode
  viewMode: ProTimelineViewMode;
  panX: number;
  panY: number;
  showCriticalPath: boolean;
  showBaseline: boolean;
  setPan: (x: number, y: number) => void;
  setPanByDelta: (dx: number, dy: number) => void;
  setZoom: (zoom: number) => void;
  setViewMode: (mode: ProTimelineViewMode) => void;
  dateToX: (isoDate: string) => number;
  xToDate: (x: number) => string;
  toggleCriticalPath: () => void;
  toggleBaseline: () => void;
}

const BASE_PIXELS_PER_DAY = 24;

export const useProTimelineEngine = create<ProTimelineState>((set, get) => ({
  pixelsPerDay: BASE_PIXELS_PER_DAY,
  zoomLevel: 1,
  viewMode: 'day',
  panX: 0,
  panY: 0,
  showCriticalPath: false,
  showBaseline: false,
  setPan: (x, y) => set({ panX: x, panY: y }),
  setPanByDelta: (dx, dy) => set(s => ({ panX: s.panX + dx, panY: s.panY + dy })),
  toggleCriticalPath: () => set(s => ({ showCriticalPath: !s.showCriticalPath })),
  toggleBaseline: () => set(s => ({ showBaseline: !s.showBaseline })),
  
  setZoom: (zoom) => set(s => {
      const modePixels: Record<ProTimelineViewMode, number> = {
          day: 24,
          week: 6,
          month: 1.8,
          quarter: 0.6
      };
      const basePx = modePixels[s.viewMode] || 24;
      return { zoomLevel: zoom, pixelsPerDay: basePx * zoom };
  }),

  setViewMode: (mode) => set(() => {
      const modePixels: Record<ProTimelineViewMode, number> = {
          day: 24,
          week: 6,
          month: 1.8,
          quarter: 0.6
      };
      const basePx = modePixels[mode] || 24;
      return {
          viewMode: mode,
          zoomLevel: 1,
          pixelsPerDay: basePx
      };
  }),
  
  dateToX: (isoDate: string) => {
      const { pixelsPerDay } = get();
      const dateTime = parseDateOnlyTime(isoDate);
      if (dateTime === null) return 0;
      // Define epoch as 2026-01-01 for relative math positioning
      const epoch = parseDateOnlyTime('2026-01-01')!;
      const diffDays = (dateTime - epoch) / DAY_MS;
      return diffDays * pixelsPerDay;
  },
  
  xToDate: (x: number) => {
      const { pixelsPerDay } = get();
      const epoch = parseDateOnlyTime('2026-01-01')!;
      const diffDays = x / pixelsPerDay;
      const targetTime = epoch + diffDays * DAY_MS;
      const d = new Date(targetTime);
      return formatDateOnly(d);
  }
}));

// ===== 工作日避让与工期联动辅助函数 =====

export function isWeekend(dateStr: string): boolean {
  const time = parseDateOnlyTime(dateStr);
  if (time === null) return false;
  const d = new Date(time);
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function adjustToWorkDay(dateStr: string, direction: 'forward' | 'backward' = 'forward'): string {
  const time = parseDateOnlyTime(dateStr);
  if (time === null) return todayDateOnly();
  const d = new Date(time);
  while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + (direction === 'forward' ? 1 : -1));
  }
  return formatDateOnly(d);
}

export function addWorkDays(startDateStr: string, workDays: number): string {
  if (workDays <= 1) {
      return adjustToWorkDay(startDateStr, 'forward');
  }
  const currentStr = adjustToWorkDay(startDateStr, 'forward');
  const currentTime = parseDateOnlyTime(currentStr);
  if (currentTime === null) return todayDateOnly();
  const d = new Date(currentTime);
  let added = 1;
  while (added < workDays) {
      d.setDate(d.getDate() + 1);
      const day = d.getDay();
      if (day !== 0 && day !== 6) {
          added++;
      }
  }
  return formatDateOnly(d);
}

export function getWorkDays(startDateStr: string, endDateStr: string): number {
  const startTime = parseDateOnlyTime(startDateStr);
  const endTime = parseDateOnlyTime(endDateStr);
  if (startTime === null || endTime === null || startTime > endTime) {
      return 0;
  }
  const start = new Date(startTime);
  const end = new Date(endTime);
  let workDays = 0;
  const current = new Date(start);
  while (current.getTime() <= end.getTime()) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) {
          workDays++;
      }
      current.setDate(current.getDate() + 1);
  }
  return workDays;
}

export function getWorkDaysSigned(startStr: string, endStr: string): number {
  const startTime = parseDateOnlyTime(startStr);
  const endTime = parseDateOnlyTime(endStr);
  if (startTime === null || endTime === null) return 0;
  const s = new Date(startTime);
  const e = new Date(endTime);
  if (formatDateOnly(s) === formatDateOnly(e)) return 0;
  
  if (s.getTime() < e.getTime()) {
      let count = 0;
      const curr = new Date(s);
      while (curr.getTime() < e.getTime()) {
          const day = curr.getDay();
          if (day !== 0 && day !== 6) {
              count++;
          }
          curr.setDate(curr.getDate() + 1);
      }
      return count;
  } else {
      let count = 0;
      const curr = new Date(e);
      while (curr.getTime() < s.getTime()) {
          const day = curr.getDay();
          if (day !== 0 && day !== 6) {
              count++;
          }
          curr.setDate(curr.getDate() + 1);
      }
      return -count;
  }
}

export function addWorkDaysSigned(startDateStr: string, workDays: number): string {
  if (workDays === 0) {
      return adjustToWorkDay(startDateStr, 'forward');
  }
  const currentStr = adjustToWorkDay(startDateStr, workDays > 0 ? 'forward' : 'backward');
  const currentTime = parseDateOnlyTime(currentStr);
  if (currentTime === null) return todayDateOnly();
  const d = new Date(currentTime);
  let count = 0;
  const absWorkDays = Math.abs(workDays);
  while (count < absWorkDays) {
      d.setDate(d.getDate() + (workDays > 0 ? 1 : -1));
      const day = d.getDay();
      if (day !== 0 && day !== 6) {
          count++;
      }
  }
  return formatDateOnly(d);
}

// ===== 关键路径 CPM 算法 =====

export interface CriticalPathResult {
  criticalPathTaskIds: Set<string>;
  cyclicTaskIds: Set<string>;
}

export function calculateCriticalPath(
  tasks: { id: string; startDate: string; endDate: string; type?: string }[],
  edges: { source: string; target: string }[]
): CriticalPathResult {
  const criticalSet = new Set<string>();
  const cyclicTaskIds = new Set<string>();
  
  const leafTasks = tasks.filter(t => t.type !== 'summary' && t.startDate && t.endDate);
  if (leafTasks.length === 0) {
      return { criticalPathTaskIds: criticalSet, cyclicTaskIds };
  }

  let projectStartStr = leafTasks[0].startDate;
  leafTasks.forEach(t => {
      if (t.startDate < projectStartStr) {
          projectStartStr = t.startDate;
      }
  });

  const nodeMap = new Map<string, {
      id: string;
      duration: number;
      es: number;
      ee: number;
      ls: number;
      le: number;
      preds: string[];
      succs: string[];
  }>();

  leafTasks.forEach(t => {
      const dur = getWorkDays(t.startDate, t.endDate);
      const initialES = getWorkDaysSigned(projectStartStr, t.startDate);
      nodeMap.set(t.id, {
          id: t.id,
          duration: t.type === 'milestone' ? 0 : Math.max(1, dur),
          es: initialES,
          ee: initialES + (t.type === 'milestone' ? 0 : Math.max(1, dur)),
          ls: 0,
          le: 0,
          preds: [],
          succs: []
      });
  });

  edges.forEach(e => {
      if (nodeMap.has(e.source) && nodeMap.has(e.target)) {
          nodeMap.get(e.source)!.succs.push(e.target);
          nodeMap.get(e.target)!.preds.push(e.source);
      }
  });

  const inDegree = new Map<string, number>();
  nodeMap.forEach((node, id) => {
      inDegree.set(id, node.preds.length);
  });

  const queue: string[] = [];
  inDegree.forEach((deg, id) => {
      if (deg === 0) queue.push(id);
  });

  const topoOrder: string[] = [];
  while (queue.length > 0) {
      const u = queue.shift()!;
      topoOrder.push(u);
      
      const node = nodeMap.get(u)!;
      node.succs.forEach(vId => {
          const currentDeg = inDegree.get(vId)! - 1;
          inDegree.set(vId, currentDeg);
          if (currentDeg === 0) {
              queue.push(vId);
          }
      });
  }

  if (topoOrder.length < nodeMap.size) {
      nodeMap.forEach((_, id) => {
          if (!topoOrder.includes(id)) {
              cyclicTaskIds.add(id);
          }
      });
      return {
          criticalPathTaskIds: new Set<string>(),
          cyclicTaskIds
      };
  }

  topoOrder.forEach(uId => {
      const u = nodeMap.get(uId)!;
      let maxEEOfPreds = u.es;
      u.preds.forEach(pId => {
          const p = nodeMap.get(pId)!;
          if (p.ee > maxEEOfPreds) {
              maxEEOfPreds = p.ee;
          }
      });
      u.es = maxEEOfPreds;
      u.ee = u.es + u.duration;
  });

  let projectEnd = 0;
  nodeMap.forEach(node => {
      if (node.ee > projectEnd) {
          projectEnd = node.ee;
      }
  });

  for (let i = topoOrder.length - 1; i >= 0; i--) {
      const uId = topoOrder[i];
      const u = nodeMap.get(uId)!;
      
      if (u.succs.length === 0) {
          u.le = projectEnd;
      } else {
          let minLSOfSuccs = Infinity;
          u.succs.forEach(sId => {
              const s = nodeMap.get(sId)!;
              if (s.ls < minLSOfSuccs) {
                  minLSOfSuccs = s.ls;
              }
          });
          u.le = minLSOfSuccs;
      }
      u.ls = u.le - u.duration;
  }

  nodeMap.forEach((node, id) => {
      const totalSlack = node.ls - node.es;
      if (totalSlack <= 0) {
          criticalSet.add(id);
      }
  });

  return {
      criticalPathTaskIds: criticalSet,
      cyclicTaskIds
  };
}
