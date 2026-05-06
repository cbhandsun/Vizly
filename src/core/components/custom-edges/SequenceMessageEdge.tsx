import React from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getSimpleBezierPath } from '@xyflow/react';

export const SequenceMessageEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  label,
  data,
  style = {},
  markerEnd,
}: EdgeProps) => {
  const { type = 'sync', y: dataY } = data || {};
  const y = dataY !== undefined ? (dataY as number) : sourceY;
  
  const isSelf = Math.abs(sourceX - targetX) < 5;
  
  let edgePath = '';
  let labelX = 0;
  let labelY = 0;

  if (isSelf) {
      // UML 自调用 (Self-call) 循环路径: 向右延伸 40px 再绕回
      const loopWidth = 40;
      const loopHeight = 25;
      edgePath = `M ${sourceX} ${y} L ${sourceX + loopWidth} ${y} L ${sourceX + loopWidth} ${y + loopHeight} L ${sourceX + 6} ${y + loopHeight}`;
      labelX = sourceX + loopWidth + 5;
      labelY = y + loopHeight / 2;
  } else {
      [edgePath, labelX, labelY] = getSimpleBezierPath({
        sourceX,
        sourceY: y,
        targetX,
        targetY: y,
      });
  }

  const isReturn = type === 'return';
  const isAsync = type === 'async';

  // 根据类型自定义样式
  const finalStyle = {
    ...style,
    strokeDasharray: isReturn ? '5,5' : 'none',
    strokeWidth: 2,
    stroke: '#595959',
  };

  return (
    <>
      <BaseEdge 
        path={edgePath} 
        markerEnd={markerEnd} 
        style={finalStyle} 
      />
      
      {/* 自定义箭头效果（SVG 路径增强） */}
      {isAsync && (
          <path
            d={`M ${targetX - 10} ${targetY - 5} L ${targetX} ${targetY} L ${targetX - 10} ${targetY + 5}`}
            fill="none"
            stroke="#595959"
            strokeWidth={2}
          />
      )}

      {label && (
        <EdgeLabelRenderer>
          <div
            key={`${id}-label`}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -100%) translate(${labelX}px,${labelY}px)`,
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              background: 'white',
              border: '1px solid #f0f0f0',
              pointerEvents: 'all',
              whiteSpace: 'nowrap'
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
