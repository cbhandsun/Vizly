import { create } from 'zustand';

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
          const s = t.startDate ? new Date(t.startDate).getTime() : Infinity;
          const e = t.endDate ? new Date(t.endDate).getTime() : -Infinity;
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
          t.startDate = new Date(minS).toISOString().split('T')[0];
          t.endDate = new Date(maxE).toISOString().split('T')[0];
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
  const visibleTasks = hierarchicalTasks.filter(t => t._computed!.isVisible);
  
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
  zoomLevel: number; // 1 = daily, 0.5 = weekly, 0.1 = monthly, etc.
  panX: number;
  panY: number;
  setPan: (x: number, y: number) => void;
  setPanByDelta: (dx: number, dy: number) => void;
  setZoom: (zoom: number) => void;
  dateToX: (isoDate: string) => number;
  xToDate: (x: number) => string;
}

const BASE_PIXELS_PER_DAY = 24;

export const useProTimelineEngine = create<ProTimelineState>((set, get) => ({
  pixelsPerDay: BASE_PIXELS_PER_DAY,
  zoomLevel: 1,
  panX: 0,
  panY: 0,
  setPan: (x, y) => set({ panX: x, panY: y }),
  setPanByDelta: (dx, dy) => set(s => ({ panX: s.panX + dx, panY: s.panY + dy })),
  setZoom: (zoom) => set({ zoomLevel: zoom, pixelsPerDay: BASE_PIXELS_PER_DAY * zoom }),
  
  dateToX: (isoDate: string) => {
      const { pixelsPerDay } = get();
      const date = new Date(isoDate);
      if (isNaN(date.getTime())) return 0;
      // Define epoch as 2026-01-01 for relative math positioning
      const epoch = new Date('2026-01-01T00:00:00Z').getTime();
      const diffDays = (date.getTime() - epoch) / (1000 * 60 * 60 * 24);
      return diffDays * pixelsPerDay;
  },
  
  xToDate: (x: number) => {
      const { pixelsPerDay } = get();
      const epoch = new Date('2026-01-01T00:00:00Z').getTime();
      const diffDays = x / pixelsPerDay;
      const targetTime = epoch + diffDays * 24 * 60 * 60 * 1000;
      const d = new Date(targetTime);
      return d.toISOString().split('T')[0];
  }
}));
