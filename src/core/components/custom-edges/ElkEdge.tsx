import React from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getSmoothStepPath } from '@xyflow/react';
import { getSmartLabelPosition } from '../../algorithms/smartEdgeUtils';

// 定义 ELK section 和 edge data 的类型
interface ElkPoint {
  x: number;
  y: number;
}

interface ElkSection {
  startPoint: ElkPoint;
  endPoint: ElkPoint;
  bendPoints?: ElkPoint[];
}

interface ElkEdgeData {
  sections?: ElkSection[];
  label?: string;
}

// 正确定义 EdgeProps，其中 data 字段的类型为 ElkEdgeData
type ElkEdgeProps = EdgeProps & {
  data: ElkEdgeData;
};

/**
 * Generates an SVG path string from ELK's layout sections.
 * @param sections - The sections provided by ELK's layout engine.
 * @returns An SVG path string ('d' attribute).
 */
const getElkPath = (sections: ElkSection[]): string => {
  let path = '';
  for (const section of sections) {
    const startPoint = section.startPoint;
    path += `M ${startPoint.x} ${startPoint.y} `;
    if (section.bendPoints) {
      for (const bendPoint of section.bendPoints) {
        path += `L ${bendPoint.x} ${bendPoint.y} `;
      }
    }
    const endPoint = section.endPoint;
    path += `L ${endPoint.x} ${endPoint.y} `;
  }
  return path.trim();
};


/**
 * A custom edge component to render paths calculated by ELK.
 * This component extracts the path information from the edge's data property
 * and renders it as an SVG path.
 */
export const ElkEdge: React.FC<ElkEdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
  markerEnd,
}) => {
  const { sections, label } = data || {};

  // Generate the path from ELK sections if available, otherwise fall back to a smooth step path.
  const [edgePath, labelX, labelY] = sections
    ? (() => {
      const path = getElkPath(sections);
      // Construct points for label calculation
      const points: ElkPoint[] = [];
      sections.forEach(section => {
        points.push(section.startPoint);
        if (section.bendPoints) points.push(...section.bendPoints);
        points.push(section.endPoint);
      });
      const pos = getSmartLabelPosition(points);
      return [path, pos.x, pos.y];
    })()
    : getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });

  return (
    <>
      <BaseEdge path={edgePath as string} markerEnd={markerEnd} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 12,
              // backgroundColor: 'white',
              padding: '2px 4px',
              borderRadius: '3px',
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default React.memo(ElkEdge);
