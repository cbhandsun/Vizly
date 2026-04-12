import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useNodes, useEdges, useReactFlow } from '@xyflow/react';
import { useProTimelineEngine, calculateSwimlanes, ProGanttTask } from '../../../hooks/useProTimelineEngine';
import ProTimelineAxis from './ProTimelineAxis';
import ProTaskLayer from './ProTaskLayer';
import ProDependencyLayer from './ProDependencyLayer';
import ProTaskListPanel from './ProTaskListPanel';
import dayjs from 'dayjs';
import { useTheme } from '../../../themes/useCoreTheme';

import { ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';

const ROW_HEIGHT = 42;
const HEADER_HEIGHT = 52;

export default function ProTimelineCanvas() {
  const { panX, panY, setPanByDelta, setPan, setZoom, zoomLevel, dateToX, xToDate, pixelsPerDay } = useProTimelineEngine();
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragPan, setIsDragPan] = useState(false);
  const [panelWidth, setPanelWidth] = useState(280);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
    const [theme] = useTheme({ autoInitialize: true });
    
    // Theme Token Mappings
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
  const { updateNodeData, setNodes, setEdges } = useReactFlow();

    // Convert nodes → ProGanttTasks
    const tasks = useMemo<ProGanttTask[]>(() => {
        return nodes.filter(n => ['phase', 'event', 'milestone', 'summary'].includes(n.data.type as string) || n.type === 'timelineNode').map(n => {
            const deps = edges.filter(e => e.target === n.id).map(e => e.source);
            return {
                id: n.id,
                name: (n.data.label as string) || '未命名',
                startDate: (n.data.date as string),
                endDate: (n.data.endDate as string) || (n.data.date as string),
                progress: n.data.progress as number | undefined,
                dependencies: deps,
                type: n.data.type as string,
                color: (n.data.color as string) || undefined,
                _rawSelected: n.selected,
                status: n.data.status as string,
                parentId: n.data.parentId as string | undefined,
                isExpanded: n.data.isExpanded as boolean | undefined,
            };
        }).filter(t => t.startDate || t.type === 'summary' || t.type === 'phase');
    }, [nodes, edges]);
  
  // 1D-Packing & Hierarchical Rollup
  const packedTasks = useMemo(() => {
     let computed = calculateSwimlanes(tasks);
     return computed.map(t => ({
         ...t,
         _computed: {
             ...t._computed!,
             x: dateToX(t.startDate),
             w: Math.max(12, dateToX(t.endDate) - dateToX(t.startDate))
         }
     }));
  }, [tasks, dateToX]);

  // Selected task
  const selectedTaskId = useMemo(() => nodes.find(n => n.selected)?.id || null, [nodes]);

  // --- 事件处理 ---
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const newZoom = Math.min(Math.max(0.15, zoomLevel - e.deltaY * 0.005), 5);
          setZoom(newZoom);
      } else {
          setPanByDelta(-e.deltaX, -e.deltaY);
      }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
     if (e.target === timelineRef.current || (e.target as HTMLElement).classList.contains('pro-timeline-bg')) {
         setIsDragPan(true);
         e.currentTarget.setPointerCapture(e.pointerId);
         setNodes(ns => ns.map(n => ({...n, selected: false})));
     }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
     if (isDragPan) setPanByDelta(e.movementX, e.movementY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
     setIsDragPan(false);
     e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
     if (e.target === timelineRef.current || (e.target as HTMLElement).classList.contains('pro-timeline-bg')) {
         const rect = timelineRef.current?.getBoundingClientRect();
         if (!rect) return;
         
         const offsetX = e.clientX - rect.left;
         const realX = (offsetX - panX) / zoomLevel;
         const startD = xToDate(realX);
         
         const d = new Date(startD);
         d.setDate(d.getDate() + 1);
         const endD = d.toISOString().split('T')[0];

         const newId = `tl-event-${Date.now()}`;
         const newNode = {
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

         setNodes(ns => [...ns, newNode as any]);
         
         // 自动选中新创建的节点以呼出属性面板
         setTimeout(() => {
             setNodes(ns => ns.map(n => ({ ...n, selected: n.id === newId })));
         }, 50);
     }
  }, [panX, zoomLevel, xToDate, setNodes]);

  const onTaskClick = useCallback((taskId: string) => {
      setNodes(ns => ns.map(n => ({ ...n, selected: n.id === taskId })));
  }, [setNodes]);

  const onTaskDragEnd = useCallback((taskId: string, newStartDate: string, newEndDate: string) => {
      const node = nodes.find(n => n.id === taskId);
      if (!node) return;

      const oldEndDateStr = (node.data.endDate as string) || (node.data.date as string);
      const oldEndTs = new Date(oldEndDateStr).getTime();
      const newEndTs = new Date(newEndDate).getTime();
      const deltaMs = newEndTs - oldEndTs;

      // 更新拖拽源节点
      updateNodeData(taskId, { date: newStartDate, endDate: newEndDate });

      if (deltaMs === 0 || isNaN(deltaMs)) return;

      // 构建依赖图 (源 -> 目标集合)
      const adj = new Map<string, string[]>();
      edges.forEach(e => {
          if (!adj.has(e.source)) adj.set(e.source, []);
          adj.get(e.source)!.push(e.target);
      });

      // 级联推演 (BFS)
      const queue = [taskId];
      const visited = new Set<string>();
      visited.add(taskId);

      while (queue.length > 0) {
          const curr = queue.shift()!;
          const targets = adj.get(curr) || [];
          
          for (const tgtId of targets) {
              if (visited.has(tgtId)) continue;
              visited.add(tgtId);
              queue.push(tgtId);
              
              const tgtNode = nodes.find(n => n.id === tgtId);
              if (!tgtNode || !tgtNode.data.date) continue;

              const tStartTs = new Date(tgtNode.data.date as string).getTime();
              const tEndTs = new Date((tgtNode.data.endDate as string) || (tgtNode.data.date as string)).getTime();
              
              if (isNaN(tStartTs) || isNaN(tEndTs)) continue;

              const newTgtStart = new Date(tStartTs + deltaMs).toISOString().split('T')[0];
              const newTgtEnd = new Date(tEndTs + deltaMs).toISOString().split('T')[0];
              
              // 触发下游更新
              updateNodeData(tgtId, { date: newTgtStart, endDate: newTgtEnd });
          }
      }
  }, [nodes, edges, updateNodeData]);

    const onTaskUpdate = useCallback((taskId: string, updates: Partial<ProGanttTask>) => {
        const rfUpdates: any = {};
        if ('name' in updates) rfUpdates.label = updates.name;
        if ('progress' in updates) rfUpdates.progress = updates.progress;
        if ('startDate' in updates) rfUpdates.date = updates.startDate;
        if ('date' in updates) rfUpdates.date = updates.date; // fallback
        if ('endDate' in updates) rfUpdates.endDate = updates.endDate;
        if ('isExpanded' in updates) rfUpdates.isExpanded = updates.isExpanded;
        if ('parentId' in updates) rfUpdates.parentId = updates.parentId;
        updateNodeData(taskId, rfUpdates);
    }, [updateNodeData]);

    const onTaskConnect = useCallback((sourceId: string, targetId: string) => {
        setEdges(eds => {
            if (eds.some(e => e.source === sourceId && e.target === targetId)) return eds;
            return [...eds, {
                id: `e-${sourceId}-${targetId}`,
                source: sourceId,
                target: targetId,
                type: 'smoothstep'
            }];
        });
    }, [setEdges]);

    const onTaskExpandToggle = useCallback((taskId: string) => {
        const node = nodes.find(n => n.id === taskId);
        if (!node) return;
        const isExpanded = node.data.isExpanded !== false; // default true
        updateNodeData(taskId, { isExpanded: !isExpanded });
    }, [nodes, updateNodeData]);

    const handleTaskAdd = useCallback((parentId: string | null, type: 'phase' | 'milestone') => {
        const newId = `tl-new-${Date.now()}`;
        const parentTask = parentId ? nodes.find(n => n.id === parentId) : null;
        let startD = new Date().toISOString().split('T')[0];
        
        if (parentTask && parentTask.data.date) {
            startD = parentTask.data.date as string;
        }
        
        const isMilestone = type === 'milestone';
        let endD = startD;
        if (!isMilestone) {
            const d = new Date(startD);
            d.setDate(d.getDate() + 1);
            endD = d.toISOString().split('T')[0];
        }

        const newNode = {
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

        setNodes(ns => [...ns, newNode as any]);
        
        // Auto-expand parent
        if (parentId) {
            updateNodeData(parentId, { isExpanded: true });
        }
    }, [nodes, setNodes, updateNodeData]);

  // Initial pan
  const initPanRef = useRef(false);
  useEffect(() => {
     if (packedTasks.length > 0 && !initPanRef.current) {
         setPan(-packedTasks[0]._computed!.x + 80, 0);
         initPanRef.current = true;
     }
  }, [packedTasks.length, setPan]);

  // (weekendColumns CSS O(1) fallback handled in canvas render)

  const totalVisibleRows = packedTasks.filter(t => t._computed?.isVisible !== false).length;
  const totalRows = Math.max(totalVisibleRows, 8);

  return (
    <div style={{
        position: 'absolute', left: 0, top: 0, width: '100%', height: '100%',
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
            scrollTop={scrollTop}
            onScrollTopChange={setScrollTop}
            onTaskUpdate={onTaskUpdate}
            onTaskExpandToggle={onTaskExpandToggle}
            onTaskAdd={handleTaskAdd}
        />

        {/* ===== 右侧时间轴区 ===== */}
        <div
            ref={timelineRef}
            className="pro-timeline-bg"
            style={{
                flex: 1, position: 'relative', overflow: 'hidden',
                background: canvasBg,
                cursor: isDragPan ? 'grabbing' : 'default',
            }}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onDoubleClick={handleDoubleClick}
        >
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
                    const isSelected = selectedTaskId === taskAtRow.id;
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
            <div style={{ 
                position: 'absolute', left: 0, top: HEADER_HEIGHT, right: 0, bottom: 0, 
                pointerEvents: 'none', zIndex: 1,
                background: `repeating-linear-gradient(to right, transparent 0, transparent ${2 * pixelsPerDay}px, ${weekendBg} ${2 * pixelsPerDay}px, ${weekendBg} ${4 * pixelsPerDay}px, transparent ${4 * pixelsPerDay}px, transparent ${7 * pixelsPerDay}px)`,
                backgroundPosition: `${panX}px 0`,
            }} />

            {/* 垂直日期网格线 */}
            <div style={{
                position: 'absolute', left: 0, top: 0, right: 0, bottom: 0,
                backgroundSize: `${pixelsPerDay}px ${ROW_HEIGHT}px`,
                backgroundImage: `linear-gradient(to right, ${gridLine} 1px, transparent 1px)`,
                backgroundPosition: `${panX}px ${HEADER_HEIGHT}px`,
                pointerEvents: 'none', zIndex: 1,
            }} />

            {/* 内容层：随 pan 移动 */}
            <div style={{ position: 'absolute', left: panX, top: panY, width: 0, height: 0 }}>
               {/* Animated Today Marker */}
               {(() => {
                   const todayX = dateToX(new Date().toISOString().split('T')[0]);
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
                           }}>{dayjs().format('MM/DD')} 今天</div>
                       </>
                   );
               })()}

               <ProTimelineAxis />
               <ProDependencyLayer tasks={packedTasks} hoveredTaskId={hoveredTaskId} />
               <ProTaskLayer 
                  tasks={packedTasks} 
                  onTaskClick={onTaskClick}
                  onTaskDragEnd={onTaskDragEnd}
                  hoveredTaskId={hoveredTaskId}
                  onHoverTask={setHoveredTaskId}
                  onTaskUpdate={onTaskUpdate}
                  onTaskConnect={onTaskConnect}
               />
            </div>

            {/* ===== Timeline Zoom Bar (Gantt 专用缩放控制器) ===== */}
            <div style={{
                position: 'absolute',
                bottom: 24,
                right: 24,
                background: glassBg,
                backdropFilter: 'blur(12px) saturate(180%)',
                border: `1px solid ${borderColor}`,
                borderRadius: 99,
                boxShadow: `0 6px 16px ${shadowColor}`,
                padding: '4px 8px',
                zIndex: 100,
                display: 'flex',
                alignItems: 'center',
                gap: 4
            }}>
                <Tooltip title="缩小时间轴区域">
                    <Button 
                        type="text" 
                        size="small" 
                        shape="circle"
                        icon={<ZoomOutOutlined />} 
                        onClick={() => setZoom(Math.max(0.15, zoomLevel - 0.2))} 
                    />
                </Tooltip>
                
                <Tooltip title="点击恢复默认 100% 比例">
                    <span 
                        onClick={() => setZoom(1)}
                        style={{ 
                            fontSize: 12, 
                            minWidth: 42, 
                            textAlign: 'center', 
                            fontFamily: 'monospace', 
                            cursor: 'pointer', 
                            fontWeight: 600,
                            color: secondaryTextColor,
                            userSelect: 'none'
                        }}
                    >
                        {Math.round(zoomLevel * 100)}%
                    </span>
                </Tooltip>
                
                <Tooltip title="放大时间轴区域">
                    <Button 
                        type="text" 
                        size="small" 
                        shape="circle"
                        icon={<ZoomInOutlined />} 
                        onClick={() => setZoom(Math.min(5, zoomLevel + 0.2))} 
                    />
                </Tooltip>
            </div>
        </div>
    </div>
  );
}

// Stable CSS injection - only runs once, no dangerouslySetInnerHTML
const KEYFRAMES_ID = 'pro-timeline-keyframes';
function ProTimelineKeyframes() {
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
        `;
        document.head.appendChild(style);
        return () => { style.remove(); };
    }, []);
    return null;
}
