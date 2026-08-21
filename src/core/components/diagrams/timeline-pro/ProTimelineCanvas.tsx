import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useNodes, useEdges, useReactFlow, type Node } from '@xyflow/react';
import { 
  useProTimelineEngine, 
  calculateSwimlanes, 
  ProGanttTask,
  adjustToWorkDay,
  addWorkDays,
  getWorkDays,
  calculateCriticalPath
} from '../../../hooks/useProTimelineEngine';
import ProTimelineAxis from './ProTimelineAxis';
import ProTaskLayer from './ProTaskLayer';
import ProDependencyLayer from './ProDependencyLayer';
import ProTaskListPanel from './ProTaskListPanel';
import { ProResourceDrawer } from './ProResourceDrawer';
import { useTheme } from '../../../themes/useCoreTheme';
import { appMessage } from '../../../utils/antdStaticBridge';
import { addDaysToDateOnly, parseDateOnlyTime, todayDateOnly } from '../../../utils/dateOnly';
import { ProTimelineChrome, ProTimelineKeyframes } from './ProTimelineChrome';
import { projectProTimelineTasks } from './proTimelineTaskProjection';
import { useProTimelineDependencyActions } from './useProTimelineDependencyActions';
import { requestProTimelineSnapshot } from './proTimelineHistory';
import {
  getProTimelineDateX,
  updateProTimelineTaskSelection,
} from './proTimelineViewportInteraction';
import { useProTimelineViewportInteractions } from './useProTimelineViewportInteractions';
import { hasProTimelineBaseline } from './proTimelineBaselineAvailability';
import {
  clearProTimelineBaselineSnapshot,
  createProTimelineBaselineSnapshot,
} from './proTimelineBaselineTransaction';
import './ProTimelineCanvas.css';

const ROW_HEIGHT = 42;
const HEADER_HEIGHT = 52;

export default function ProTimelineCanvas() {
  const { 
    panX, panY, setPanByDelta, setPan, setZoom, zoomLevel, dateToX, 
    xToDate, pixelsPerDay, viewMode, setViewMode,
    showCriticalPath, showBaseline, toggleCriticalPath, toggleBaseline
  } = useProTimelineEngine();
  const timelineRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(380);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [showResourceDrawer, setShowResourceDrawer] = useState(false);
  
  const gridWidth = useMemo(() => {
      switch (viewMode) {
          case 'week': return pixelsPerDay * 7;
          case 'month': return pixelsPerDay * 30;
          case 'quarter': return pixelsPerDay * 90;
          case 'day':
          default:
              return pixelsPerDay;
      }
  }, [viewMode, pixelsPerDay]);

  const [theme] = useTheme({ autoInitialize: true });
    
    const isDark = theme?.mode === 'dark';
    const canvasBg = theme?.diagram?.canvas?.background || (isDark ? '#141414' : '#fdfdfe');
    const borderColor = theme?.palette?.neutral?.border || (isDark ? '#303030' : 'rgba(0,0,0,0.06)');
    const textColor = theme?.palette?.neutral?.text || (isDark ? 'rgba(255,255,255,0.85)' : '#333');
    const secondaryTextColor = theme?.palette?.neutral?.text ? `${theme.palette.neutral.text}A0` : (isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)');
    const hoverBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0, 0.018)';
    const stripeBg = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0, 0.012)';
    const weekendBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0, 0, 0, 0.022)';
    const gridLine = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
    const glassBg = isDark ? 'rgba(30, 30, 30, 0.85)' : 'rgba(255, 255, 255, 0.85)';
    const shadowColor = isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.08)';
    const todayBaseColor = theme?.palette?.error?.main || '#ff4d4f';
  
  const nodes = useNodes();
  const edges = useEdges();
  const hasBaseline = useMemo(
    () => hasProTimelineBaseline(nodes.map(node => node.data)),
    [nodes],
  );
  const { updateNodeData, setNodes, setEdges } = useReactFlow();
  const {
      handleDeleteDependency,
      handleUpdateDependency,
      onTaskConnect,
  } = useProTimelineDependencyActions();

  const handleSaveBaseline = useCallback(() => {
      const transaction = createProTimelineBaselineSnapshot(nodes);
      if (transaction.eligibleCount === 0) {
          appMessage.info('当前没有可保存为基线的排期任务');
          return;
      }
      if (!transaction.changed) {
          appMessage.info('当前排期已与保存的基线一致');
          return;
      }

      requestProTimelineSnapshot();
      setNodes(transaction.nodes);
      appMessage.success('已保存当前排期为基线，可使用撤销恢复。');
  }, [nodes, setNodes]);

  const handleClearBaseline = useCallback(() => {
      if (!hasBaseline) return;
      const transaction = clearProTimelineBaselineSnapshot(nodes);
      if (!transaction.changed) return;

      requestProTimelineSnapshot();
      setNodes(transaction.nodes);
      if (showBaseline) toggleBaseline();
      appMessage.success('已清空当前项目的基线排期，可使用撤销恢复。');
  }, [hasBaseline, nodes, setNodes, showBaseline, toggleBaseline]);

    const tasks = useMemo(
        () => projectProTimelineTasks(nodes, edges),
        [nodes, edges],
    );

  // 始终运行 CPM 拓扑以提供底层的循环依赖安全检测
  const cpmResult = useMemo(() => {
      const simpleTasks = tasks.map(t => ({
          id: t.id,
          startDate: t.startDate,
          endDate: t.endDate,
          type: t.type,
      }));
      
      const simpleEdges = edges.map(e => ({
          source: e.source,
          target: e.target
      }));
      
      return calculateCriticalPath(simpleTasks, simpleEdges);
  }, [tasks, edges]);

  const criticalPathTaskIds = useMemo(() => {
      return showCriticalPath ? cpmResult.criticalPathTaskIds : new Set<string>();
  }, [cpmResult, showCriticalPath]);

  const cyclicTaskIds = useMemo(() => {
      return cpmResult.cyclicTaskIds;
  }, [cpmResult]);
  
  const packedTasks = useMemo(() => {
     const computed = calculateSwimlanes(tasks);
     return computed.map(t => ({
         ...t,
         _computed: {
             ...t._computed!,
             x: getProTimelineDateX(t.startDate, pixelsPerDay),
             w: Math.max(
               12,
               getProTimelineDateX(t.endDate, pixelsPerDay)
                 - getProTimelineDateX(t.startDate, pixelsPerDay),
             ),
         }
     }));
  }, [tasks, pixelsPerDay]);

  const selectedTaskIds = useMemo(
    () => new Set(nodes.filter(node => node.selected).map(node => node.id)),
    [nodes],
  );
  const selectedTaskId = selectedTaskIds.size === 1 ? [...selectedTaskIds][0] : null;

  const clearTaskSelection = useCallback(() => {
    setNodes(currentNodes => currentNodes.map(node => (
      node.selected ? { ...node, selected: false } : node
    )));
  }, [setNodes]);

  const onTaskClick = useCallback((taskId: string, additive = false) => {
      setNodes(currentNodes => updateProTimelineTaskSelection(currentNodes, taskId, additive));
  }, [setNodes]);

  const {
    handleKeyDown: handleViewportKeyDown,
    handleLostPointerCapture,
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel,
    isDragPan,
    zoomAroundViewportPoint,
  } = useProTimelineViewportInteractions({
    clearSelection: clearTaskSelection,
    panX,
    panY,
    setPan,
    setPanByDelta,
    setZoom,
    timelineRef,
    zoomLevel,
  });

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
     if (e.target === timelineRef.current || (e.target as HTMLElement).classList.contains('pro-timeline-bg')) {
         const rect = timelineRef.current?.getBoundingClientRect();
         if (!rect) return;
         
         const offsetX = e.clientX - rect.left;
         const realX = (offsetX - panX) / zoomLevel;
         const startD = xToDate(realX);
         
         const endD = addDaysToDateOnly(startD, 1);

         const newId = `tl-event-${Date.now()}`;
         const newNode: Node = {
             id: newId,
             type: 'timelineNode',
             position: { x: 0, y: 0 },
             data: {
                 label: '新建事件',
                 type: 'event',
                 date: startD,
                 endDate: endD,
                 status: 'pending',
                 progress: 0,
             }
         };

         setNodes(ns => [...ns, newNode]);
         
         // 自动选中新创建的节点以呼出属性面板
         setTimeout(() => {
             setNodes(ns => ns.map(n => ({ ...n, selected: n.id === newId })));
         }, 50);
     }
  }, [panX, zoomLevel, xToDate, setNodes]);

  // 前置驱动智能级联自动避让排期核心算法
  const applyAutoScheduling = useCallback((taskId: string, targetStartDate: string, targetEndDate: string) => {
      // 1. 初始化待更新日期 Map (ID -> { date, endDate })
      const updatesMap = new Map<string, { date: string, endDate: string }>();
      updatesMap.set(taskId, { date: targetStartDate, endDate: targetEndDate });

      // 2. 检测是否存在依赖环。如果有环，为了防止级联死循环，只更新源节点，并跳过后续级联调度。
      if (cpmResult.cyclicTaskIds.size > 0) {
          updateNodeData(taskId, { date: targetStartDate, endDate: targetEndDate });
          return;
      }

      // 3. 开始做级联避让队列推演 (以 modified 任务为起点)
      const adj = new Map<string, string[]>();
      edges.forEach(e => {
          if (!adj.has(e.source)) adj.set(e.source, []);
          adj.get(e.source)!.push(e.target);
      });

      const queue: string[] = [taskId];
      const visited = new Set<string>();
      visited.add(taskId);

      while (queue.length > 0) {
          const currId = queue.shift()!;
          
          let currEnd = '';
          if (updatesMap.has(currId)) {
              currEnd = updatesMap.get(currId)!.endDate;
          } else {
              const n = nodes.find(x => x.id === currId);
              if (n) {
                  currEnd = (n.data.endDate as string) || (n.data.date as string);
              }
          }
          if (!currEnd) continue;

          const targets = adj.get(currId) || [];
          for (const tgtId of targets) {
              if (visited.has(tgtId)) continue;
              
              const tgtNode = nodes.find(n => n.id === tgtId);
              if (!tgtNode || !tgtNode.data.date) continue;

              const tStartStr = tgtNode.data.date as string;
              const tEndStr = (tgtNode.data.endDate as string) || tStartStr;

              // milestone 等特殊类型判定
              const isMilestone = tgtNode.data.type === 'milestone';
              const currNode = nodes.find(n => n.id === currId);
              const isCurrMilestone = currNode?.data.type === 'milestone';

              // 计算后继任务的最早可能开始日期 minStart
              const minStart = (() => {
                  if (isMilestone || isCurrMilestone) {
                      return adjustToWorkDay(currEnd, 'forward');
                  } else {
                      return adjustToWorkDay(addDaysToDateOnly(currEnd, 1), 'forward');
                  }
              })();

              const currentTgtStartValue = parseDateOnlyTime(tStartStr);
              const minTgtStartValue = parseDateOnlyTime(minStart);

              // 如果后继任务的当前开始日期比 minStart 还要早，说明被“顶”到了，需要发生向后避让
              if (currentTgtStartValue !== null && minTgtStartValue !== null && currentTgtStartValue < minTgtStartValue) {
                  const duration = getWorkDays(tStartStr, tEndStr);
                  const newTgtStart = minStart;
                  const newTgtEnd = addWorkDays(newTgtStart, duration);

                  updatesMap.set(tgtId, { date: newTgtStart, endDate: newTgtEnd });

                  visited.add(tgtId);
                  queue.push(tgtId);
              }
          }
      }

      // 4. 批量更新 React Flow node 数据
      updatesMap.forEach((val, id) => {
          updateNodeData(id, val);
      });
  }, [nodes, edges, updateNodeData, cpmResult]);

  const onTaskDragEnd = useCallback((taskId: string, newStartDate: string, newEndDate: string) => {
      const node = nodes.find(n => n.id === taskId);
      if (!node) return;

      const oldStartDate = node.data.date as string;
      const oldEndDate = (node.data.endDate as string) || oldStartDate;

      const isMove = newStartDate !== oldStartDate;
      let finalStart: string;
      let finalEnd: string;

      if (isMove) {
          const duration = getWorkDays(oldStartDate, oldEndDate);
          finalStart = adjustToWorkDay(newStartDate, 'forward');
          finalEnd = addWorkDays(finalStart, duration);
      } else {
          finalStart = oldStartDate;
          const proposedDuration = getWorkDays(finalStart, newEndDate);
          const duration = Math.max(1, proposedDuration);
          finalEnd = addWorkDays(finalStart, duration);
      }

      if (finalStart === oldStartDate && finalEnd === oldEndDate) return;
      requestProTimelineSnapshot();
      applyAutoScheduling(taskId, finalStart, finalEnd);
      appMessage.success('排期已更新，可使用撤销恢复。');
  }, [nodes, applyAutoScheduling]);

  const onTaskUpdate = useCallback((taskId: string, updates: Partial<ProGanttTask>) => {
      const rfUpdates: Record<string, unknown> = {};
      const node = nodes.find(n => n.id === taskId);
      if (!node) return;

      const currentStart = node.data.date as string;
      const currentEnd = (node.data.endDate as string) || currentStart;
      const targetStart = updates.startDate || currentStart;
      const targetEnd = updates.endDate || currentEnd;

      if ('name' in updates) rfUpdates.label = updates.name;
      if ('progress' in updates) rfUpdates.progress = updates.progress;
      if ('isExpanded' in updates) rfUpdates.isExpanded = updates.isExpanded;
      if ('parentId' in updates) rfUpdates.parentId = updates.parentId;
      if ('assignee' in updates) rfUpdates.assignee = updates.assignee;
      if ('priority' in updates) rfUpdates.priority = updates.priority;

      const metadataChanged = Object.entries(rfUpdates).some(([key, value]) => node.data[key] !== value);
      const requestedDateChange = targetStart !== currentStart || targetEnd !== currentEnd;
      const finalStart = requestedDateChange ? adjustToWorkDay(targetStart, 'forward') : currentStart;
      const duration = requestedDateChange ? getWorkDays(targetStart, targetEnd) : 0;
      const finalEnd = requestedDateChange
        ? addWorkDays(finalStart, Math.max(1, duration))
        : currentEnd;
      const dateChanged = finalStart !== currentStart || finalEnd !== currentEnd;

      if (!metadataChanged && !dateChanged) return;
      requestProTimelineSnapshot();

      if (metadataChanged) {
          updateNodeData(taskId, rfUpdates);
      }

      if (dateChanged) {
          applyAutoScheduling(taskId, finalStart, finalEnd);
      }
      appMessage.success('任务已更新，可使用撤销恢复。');
  }, [nodes, updateNodeData, applyAutoScheduling]);

    const handleTaskDelete = useCallback((taskId: string) => {
        // 1. 递归收集要删除的节点ID及其后代ID
        const toDeleteIds = new Set<string>();
        toDeleteIds.add(taskId);

        const collectDescendants = (parentId: string) => {
            nodes.forEach(n => {
                if (n.data?.parentId === parentId) {
                    if (!toDeleteIds.has(n.id)) {
                        toDeleteIds.add(n.id);
                        collectDescendants(n.id);
                    }
                }
            });
        };
        collectDescendants(taskId);

        // 2. 更新 nodes 和 edges 状态
        setNodes(ns => ns.filter(n => !toDeleteIds.has(n.id)));
        setEdges(eds => eds.filter(e => !toDeleteIds.has(e.source) && !toDeleteIds.has(e.target)));
        
        appMessage.success('任务及子任务删除成功！');
    }, [nodes, setNodes, setEdges]);

    const onTaskExpandToggle = useCallback((taskId: string) => {
        const node = nodes.find(n => n.id === taskId);
        if (!node) return;
        const isExpanded = node.data.isExpanded !== false; // default true
        updateNodeData(taskId, { isExpanded: !isExpanded });
    }, [nodes, updateNodeData]);

    const handleTaskAdd = useCallback((parentId: string | null, type: 'phase' | 'milestone') => {
        const newId = `tl-new-${Date.now()}`;
        const parentTask = parentId ? nodes.find(n => n.id === parentId) : null;
        let startD = todayDateOnly();
        
        if (parentTask && parentTask.data.date) {
            startD = parentTask.data.date as string;
        }
        
        const isMilestone = type === 'milestone';
        let endD = startD;
        if (!isMilestone) {
            endD = addDaysToDateOnly(startD, 1);
        }

        const newNode: Node = {
            id: newId,
            type: 'timelineNode',
            position: { x: 0, y: 0 },
            data: {
                label: isMilestone ? '新建里程碑' : '新建子阶段',
                type: type,
                date: startD,
                endDate: endD,
                parentId: parentId || undefined,
                status: 'pending',
                progress: 0,
            }
        };

        setNodes(ns => [...ns, newNode]);
        
        // Auto-expand parent
        if (parentId) {
            updateNodeData(parentId, { isExpanded: true });
        }
    }, [nodes, setNodes, updateNodeData]);

  const initPanRef = useRef(false);
  useEffect(() => {
     if (packedTasks.length > 0 && !initPanRef.current) {
         setPan(-packedTasks[0]._computed!.x + 80, 0);
         initPanRef.current = true;
     }
  }, [packedTasks, packedTasks.length, setPan]);

  const totalVisibleRows = packedTasks.filter(t => t._computed?.isVisible !== false).length;
  const totalRows = Math.max(totalVisibleRows, 8);

  return (
    <div className="pro-timeline-workspace" style={{
        zIndex: 50, display: 'flex',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        userSelect: 'none',
    }}>
        {/* CSS Keyframes injected via ref to avoid dangerouslySetInnerHTML */}
        <ProTimelineKeyframes />

        {/* ===== 左侧任务列表 ===== */}
        <ProTaskListPanel
            tasks={packedTasks}
            width={panelWidth}
            onWidthChange={setPanelWidth}
            hoveredTaskId={hoveredTaskId}
            onHoverTask={setHoveredTaskId}
            onClickTask={onTaskClick}
            selectedTaskId={selectedTaskId}
            selectedTaskIds={selectedTaskIds}
            scrollTop={scrollTop}
            onScrollTopChange={setScrollTop}
            onTaskUpdate={onTaskUpdate}
            onTaskExpandToggle={onTaskExpandToggle}
            onTaskAdd={handleTaskAdd}
            onTaskDelete={handleTaskDelete}
            cyclicTaskIds={cyclicTaskIds}
        />

        {/* ===== 右侧时间轴区 ===== */}
        <div
            ref={timelineRef}
            className="pro-timeline-bg"
            data-testid="pro-timeline-viewport"
            role="region"
            tabIndex={0}
            aria-label="时间轴画布"
            aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + - 0"
            aria-description="使用方向键平移，加号和减号缩放，数字 0 恢复到 100%。按住 Ctrl 或 Command 点击任务可多选。"
            style={{
                flex: 1, position: 'relative', overflow: 'hidden',
                background: canvasBg,
                cursor: isDragPan ? 'grabbing' : 'grab',
                touchAction: 'none',
            }}
            onWheel={handleWheel}
            onKeyDown={handleViewportKeyDown}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onLostPointerCapture={handleLostPointerCapture}
            onDoubleClick={handleDoubleClick}
        >
            {/* 循环依赖警告 Alert 横幅 */}
            {cyclicTaskIds.size > 0 && (
                <div style={{
                    position: 'absolute',
                    left: 20,
                    right: 20,
                    top: 68,
                    background: isDark ? 'rgba(250, 173, 20, 0.18)' : 'rgba(250, 173, 20, 0.08)',
                    border: '1px solid rgba(250, 173, 20, 0.3)',
                    borderRadius: 8,
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backdropFilter: 'blur(8px)',
                    zIndex: 20,
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 16 }}>⚠️</span>
                        <div>
                            <strong style={{ color: '#faad14', fontSize: 13 }}>排期警告：检测到循环依赖！</strong>
                            <div style={{ color: textColor, fontSize: 11, marginTop: 2 }}>
                                共有 {cyclicTaskIds.size} 个任务相互循环引用，导致排期引擎挂起。请检查标黄的任务与连线。
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* 行背景 (斑马纹 + hover 高亮 - O(1) Canvas 优化) */}
            <div style={{ position: 'absolute', left: 0, right: 0, top: HEADER_HEIGHT + panY, bottom: 0, pointerEvents: 'none', zIndex: 0 }}>
                {/* 基础斑马纹 */}
                <div style={{
                    position: 'absolute', left: 0, right: 0, top: 0, height: Math.max(8, totalRows) * ROW_HEIGHT,
                    backgroundSize: `100% ${ROW_HEIGHT * 2}px`,
                    backgroundImage: `linear-gradient(to bottom, transparent ${ROW_HEIGHT}px, ${stripeBg} ${ROW_HEIGHT}px, ${stripeBg} ${ROW_HEIGHT * 2}px)`,
                }} />
                
                {/* 基础行底边框 */}
                <div style={{
                    position: 'absolute', left: 0, right: 0, top: 0, height: Math.max(8, totalRows) * ROW_HEIGHT,
                    backgroundSize: `100% ${ROW_HEIGHT}px`,
                    backgroundImage: `linear-gradient(to bottom, transparent ${ROW_HEIGHT - 1}px, ${borderColor} ${ROW_HEIGHT - 1}px, ${borderColor} ${ROW_HEIGHT}px)`,
                }} />

                {/* 动态高亮 (只渲染有状态的行) */}
                {packedTasks.map((taskAtRow) => {
                    const isHovered = hoveredTaskId === taskAtRow.id;
                    const isSelected = selectedTaskIds.has(taskAtRow.id);
                    if (!isHovered && !isSelected || taskAtRow._computed?.isVisible === false) return null;
                    
                    return (
                        <div key={`hl-${taskAtRow.id}`} style={{
                            position: 'absolute', left: 0, right: 0,
                            top: taskAtRow._computed!.laneIndex * ROW_HEIGHT,
                            height: ROW_HEIGHT,
                            background: isSelected ? 'rgba(24, 144, 255, 0.08)' : hoverBg,
                            transition: 'background 0.12s',
                        }} />
                    );
                })}
            </div>

            {/* 周末列着色 (CSS O(1) 优化) */}
            {viewMode === 'day' && (
                <div style={{ 
                    position: 'absolute', left: 0, top: HEADER_HEIGHT, right: 0, bottom: 0, 
                    pointerEvents: 'none', zIndex: 1,
                    background: `repeating-linear-gradient(to right, transparent 0, transparent ${2 * pixelsPerDay}px, ${weekendBg} ${2 * pixelsPerDay}px, ${weekendBg} ${4 * pixelsPerDay}px, transparent ${4 * pixelsPerDay}px, transparent ${7 * pixelsPerDay}px)`,
                    backgroundPosition: `${panX}px 0`,
                }} />
            )}

            {/* 垂直日期网格线 */}
            <div style={{
                position: 'absolute', left: 0, top: 0, right: 0, bottom: 0,
                backgroundSize: `${gridWidth}px ${ROW_HEIGHT}px`,
                backgroundImage: `linear-gradient(to right, ${gridLine} 1px, transparent 1px)`,
                backgroundPosition: `${panX}px ${HEADER_HEIGHT}px`,
                pointerEvents: 'none', zIndex: 1,
            }} />

            {/* 内容层：随 pan 移动 */}
            <div style={{ position: 'absolute', left: panX, top: panY, width: 0, height: 0 }}>
               {/* Animated Today Marker */}
               {(() => {
                   const today = todayDateOnly();
                   const todayX = dateToX(today);
                   return (
                       <>
                           <div style={{
                               position: 'absolute', left: todayX, top: HEADER_HEIGHT,
                               width: 2, height: totalRows * ROW_HEIGHT + 200,
                               background: `linear-gradient(180deg, ${todayBaseColor}B3 0%, ${todayBaseColor}1A 100%)`,
                               zIndex: 5, pointerEvents: 'none',
                           }} />
                           
                           {/* Pulsing Dot */}
                           <div style={{
                               position: 'absolute', left: todayX - 4, top: HEADER_HEIGHT - 6,
                               width: 10, height: 10, borderRadius: '50%',
                               background: todayBaseColor,
                               zIndex: 14, pointerEvents: 'none',
                               animation: 'pulse-ring 2s infinite cubic-bezier(0.21, 0.53, 0.56, 0.8)'
                           }} />

                           <div style={{
                               position: 'absolute', left: todayX - 14, top: HEADER_HEIGHT - 22,
                               background: todayBaseColor, color: '#fff', fontSize: 10, fontWeight: 600,
                               padding: '2px 8px', borderRadius: 6,
                               zIndex: 15, pointerEvents: 'none',
                               boxShadow: `0 2px 8px ${todayBaseColor}4D`,
                               letterSpacing: '1px',
                           }}>{today.slice(5).replace('-', '/')} 今天</div>
                       </>
                   );
               })()}

               <ProTimelineAxis />
                <ProDependencyLayer 
                   tasks={packedTasks} 
                   hoveredTaskId={hoveredTaskId} 
                   onDeleteDependency={handleDeleteDependency}
                   onUpdateDependency={handleUpdateDependency}
                   criticalPathTaskIds={criticalPathTaskIds}
                   cyclicTaskIds={cyclicTaskIds}
                />
                <ProTaskLayer 
                   tasks={packedTasks} 
                   onTaskClick={onTaskClick}
                   onTaskDragEnd={onTaskDragEnd}
                   hoveredTaskId={hoveredTaskId}
                   onHoverTask={setHoveredTaskId}
                   onTaskUpdate={onTaskUpdate}
                   onTaskConnect={onTaskConnect}
                   criticalPathTaskIds={criticalPathTaskIds}
                   cyclicTaskIds={cyclicTaskIds}
                />
            </div>

            {/* ===== Pro Resource Drawer ===== */}
            <ProResourceDrawer
                open={showResourceDrawer}
                onClose={() => setShowResourceDrawer(false)}
                tasks={packedTasks}
                onTaskClick={onTaskClick}
            />
        </div>

        <ProTimelineChrome
            borderColor={borderColor}
            glassBackground={glassBg}
            shadowColor={shadowColor}
            secondaryTextColor={secondaryTextColor}
            showResourceDrawer={showResourceDrawer}
            onOpenResourceDrawer={() => setShowResourceDrawer(true)}
            showCriticalPath={showCriticalPath}
            onToggleCriticalPath={toggleCriticalPath}
            showBaseline={showBaseline}
            hasBaseline={hasBaseline}
            onToggleBaseline={toggleBaseline}
            onSaveBaseline={handleSaveBaseline}
            onClearBaseline={handleClearBaseline}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            zoomLevel={zoomLevel}
            onZoomChange={zoomAroundViewportPoint}
        />
    </div>
  );
}
