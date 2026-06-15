import { EdgeProps, BaseEdge, getBezierPath, getSmoothStepPath, getStraightPath, EdgeLabelRenderer } from '@xyflow/react';
import React, { useState, useEffect } from 'react';

interface CustomEdgeData extends Record<string, unknown> {
  label?: string;
  pathType?: 'bezier' | 'straight' | 'step' | 'smooth-step' | 'smoothstep';
  pathOptions?: {
    borderRadius?: number;
    offset?: number;
    curvature?: number;
  };
  labelOffset?: {
    x?: number;
    y?: number;
  };
  /** 绝对锚定标签的 X 坐标（函数级注释：用于强制固定横坐标） */
  absoluteLabelX?: number;
  /** 绝对锚定标签的 Y 坐标（函数级注释：用于强制固定纵坐标） */
  absoluteLabelY?: number;
}

interface CustomEdgeProps extends EdgeProps {
  data?: CustomEdgeData;
}

/**
 * 原生边渲染组件（函数级注释）
 * 目的：统一原生 bezier/straight/step/smooth-step 路径的标签坐标计算与偏移控制。
 * 关键点：
 * - 直线（straight）默认中点作为标签位置，避免出现 (0,0) 叠堆问题；
 * - step / smooth-step / bezier 使用 React Flow 提供的路径与中点计算；
 * - 支持 data.labelOffset 进行额外微调；
 * - 支持 data.absoluteLabelX / data.absoluteLabelY 强制锚定坐标；
 * - 当计算结果无效时，回退到源/目标中点，保证标签稳定可见。
 */
const CustomEdge: React.FC<CustomEdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  markerStart,
  data,
  // React Flow's EdgeProps includes `animated` and other flags that should not be forwarded to DOM
  animated,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(String(data?.label ?? ''));

  useEffect(() => {
    const timer = setTimeout(() => setEditText(String(data?.label ?? '')), 0);
    return () => clearTimeout(timer);
  }, [data?.label]);

  const handleLabelDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleLabelBlur = () => {
    setIsEditing(false);
    if (editText !== String(data?.label ?? '')) {
      if (typeof (data as any)?.onLabelChange === 'function') {
        (data as any).onLabelChange(id, editText);
      }
    }
  };

  const pathType = (data?.pathType || 'bezier') as CustomEdgeData['pathType'];

  let edgePath: string;
  let labelX: number;
  let labelY: number;

  // 根据路径类型生成不同的路径
  switch (pathType) {
    case 'straight':
      [edgePath] = getStraightPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
      });
      // 直线路径默认使用源/目标中点作为标签坐标（修复零坐标堆叠）
      labelX = (Number(sourceX) + Number(targetX)) / 2;
      labelY = (Number(sourceY) + Number(targetY)) / 2;
      break;
    case 'step':
    case 'smooth-step':
    case 'smoothstep':
      [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        borderRadius: data?.pathOptions?.borderRadius || 5,
      });
      break;
    case 'bezier':
    default:
      [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        curvature: data?.pathOptions?.curvature || 0.25,
      });
      break;
  }

  // 若标签坐标无效，回退到源/目标中点（健壮性处理）
  const isValid = (v: unknown) => typeof v === 'number' && isFinite(v);
  if (!isValid(labelX) || !isValid(labelY)) {
    labelX = (Number(sourceX) + Number(targetX)) / 2;
    labelY = (Number(sourceY) + Number(targetY)) / 2;
  }

  // 应用标签偏移
  if (data?.labelOffset) {
    labelX += data.labelOffset.x || 0;
    labelY += data.labelOffset.y || 0;
  }

  // 绝对坐标强制锚定（若提供）
  if (typeof data?.absoluteLabelX === 'number' && isFinite(data.absoluteLabelX)) {
    labelX = data.absoluteLabelX as number;
  }
  if (typeof data?.absoluteLabelY === 'number' && isFinite(data.absoluteLabelY)) {
    labelY = data.absoluteLabelY as number;
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={style}
        // Avoid forwarding unknown props to DOM; use className to indicate animation if needed
        className={animated ? 'edge-animated' : undefined}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'auto',
              fontSize: '12px',
              fontFamily: 'sans-serif',
              backgroundColor: isEditing ? 'transparent' : (animated ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.7)'),
              padding: '2px 4px',
              borderRadius: '4px',
              border: isEditing ? 'none' : '1px solid transparent', // Placeholder for alignment
            }}
            className="nodrag nopan"
          >
            {isEditing ? (
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={handleLabelBlur}
                autoFocus
                aria-label="Edit Edge Label"
                title="Edit Edge Label"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleLabelBlur();
                  }
                }}
                style={{
                  width: 'auto',
                  minWidth: '60px',
                  resize: 'none',
                  border: 'none',
                  background: 'rgba(255,255,255,0.9)',
                  outline: '2px solid #1677ff',
                  borderRadius: 2,
                  padding: 2,
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  color: '#333',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden'
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div
                onDoubleClick={handleLabelDoubleClick}
                style={{ cursor: 'text', color: '#666' }}
              >
                {data.label}
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default React.memo(CustomEdge);
