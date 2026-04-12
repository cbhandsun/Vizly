import { Position } from '@xyflow/react';

export interface Waypoint {
    x: number;
    y: number;
}

export interface OrthogonalPathOptions {
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    waypoints: Waypoint[];
    sourcePosition: Position;
    targetPosition: Position;
}

/**
 * 线段信息
 */
export interface Segment {
    start: { x: number; y: number };
    end: { x: number; y: number };
    isHorizontal: boolean;
    midPoint: { x: number; y: number };
}

/**
 * Orthogonal路径生成结果
 */
export interface OrthogonalPathResult {
    pathData: string;
    bendPoints: Array<{ x: number; y: number; isWaypoint: boolean; waypointIndex?: number }>;
    segments: Segment[];  // ⭐ 新增：所有线段信息
}

/**
 * 生成Orthogonal路径（直角转折）
 * 返回路径数据和所有转折点坐标
 * 
 * 实现直角转折的连线路径，从source出发经过waypoints到达target
 * 
 * @param options - 路径参数
 * @returns OrthogonalPathResult对象，包含SVG path字符串和转折点数组
 */
export function generateOrthogonalPath(options: OrthogonalPathOptions): OrthogonalPathResult {
    const {
        sourceX,
        sourceY,
        targetX,
        targetY,
        waypoints,
        sourcePosition,
        targetPosition,
    } = options;

    const segments: { x: number; y: number }[] = [];

    // 起点
    segments.push({ x: sourceX, y: sourceY });

    // 如果没有waypoints，使用简单的step路径
    if (waypoints.length === 0) {
        // 根据source和target的位置决定转折点
        const midX = (sourceX + targetX) / 2;
        const midY = (sourceY + targetY) / 2;

        if (sourcePosition === 'right' || sourcePosition === 'left') {
            // 横向出发：先横后纵
            segments.push({ x: midX, y: sourceY });
            segments.push({ x: midX, y: targetY });
        } else {
            // 纵向出发：先纵后横
            segments.push({ x: sourceX, y: midY });
            segments.push({ x: targetX, y: midY });
        }
    } else {
        // 有waypoints时，在每个waypoint处进行转折
        // ⭐ 改进版：不强制交替方向，而是根据点对齐关系推断方向
        let currentDirection: 'horizontal' | 'vertical' =
            (sourcePosition === 'right' || sourcePosition === 'left') ? 'horizontal' : 'vertical';

        waypoints.forEach((wp) => {
            const lastPoint = segments[segments.length - 1];

            // 检查特殊情况：waypoint 与上一个点已经共享一个轴（来自路径点快照）
            const sameX = Math.abs(lastPoint.x - wp.x) < 0.5;
            const sameY = Math.abs(lastPoint.y - wp.y) < 0.5;

            if (sameX && sameY) {
                // 完全相同的点，跳过
                return;
            }

            if (sameX) {
                // X 相同 → 直接纵向连接
                segments.push({ x: wp.x, y: wp.y });
                currentDirection = 'horizontal'; // 下一步从这里出发应该横向
            } else if (sameY) {
                // Y 相同 → 直接横向连接
                segments.push({ x: wp.x, y: wp.y });
                currentDirection = 'vertical'; // 下一步应该纵向
            } else {
                // 需要一个转折点
                if (currentDirection === 'horizontal') {
                    // 先横后纵
                    segments.push({ x: wp.x, y: lastPoint.y });
                    segments.push({ x: wp.x, y: wp.y });
                    currentDirection = 'vertical';
                } else {
                    // 先纵后横
                    segments.push({ x: lastPoint.x, y: wp.y });
                    segments.push({ x: wp.x, y: wp.y });
                    currentDirection = 'horizontal';
                }
            }
        });

        // 从最后一个路径点到target（使用 segments 末尾点而非 lastWp，避免中间转折点差异导致斜线）
        const lastPt = segments[segments.length - 1];
        const sameXAsTarget = Math.abs(lastPt.x - targetX) < 0.5;
        const sameYAsTarget = Math.abs(lastPt.y - targetY) < 0.5;

        if (sameXAsTarget && sameYAsTarget) {
            // 已经在终点，不做任何事
        } else if (sameXAsTarget) {
            // X 对齐 → 直接纵向到 target
            segments.push({ x: targetX, y: targetY });
        } else if (sameYAsTarget) {
            // Y 对齐 → 直接横向到 target
            segments.push({ x: targetX, y: targetY });
        } else {
            // 需要正交中间点
            // 根据 targetPosition 决定最后一段的进入方向
            const enterVertically = targetPosition === 'top' || targetPosition === 'bottom';
            if (enterVertically) {
                // 先横后纵：水平到 targetX，再垂直到 targetY
                segments.push({ x: targetX, y: lastPt.y });
                segments.push({ x: targetX, y: targetY });
            } else {
                // 先纵后横：垂直到 targetY，再水平到 targetX
                segments.push({ x: lastPt.x, y: targetY });
                segments.push({ x: targetX, y: targetY });
            }
        }
    }

    // 终点（确保包含）— 保底也必须正交，不能直连
    const lastSegment = segments[segments.length - 1];
    if (Math.abs(lastSegment.x - targetX) > 0.5 || Math.abs(lastSegment.y - targetY) > 0.5) {
        // 插入正交中间点而非直连
        if (Math.abs(lastSegment.x - targetX) < 0.5) {
            // X 对齐 → 纵向到 target
            segments.push({ x: targetX, y: targetY });
        } else if (Math.abs(lastSegment.y - targetY) < 0.5) {
            // Y 对齐 → 横向到 target
            segments.push({ x: targetX, y: targetY });
        } else {
            // 两轴都不对齐 → 加中间点保持正交
            segments.push({ x: targetX, y: lastSegment.y });
            segments.push({ x: targetX, y: targetY });
        }
    }

    // 生成SVG path字符串
    const pathData = segments
        .map((point, index) => {
            const command = index === 0 ? 'M' : 'L';
            return `${command} ${point.x},${point.y}`;
        })
        .join(' ');

    // 标记bend points：哪些是用户waypoints，哪些是自动生成的转折点
    const bendPoints = segments.slice(1, -1).map((point) => {
        // 检查是否匹配某个waypoint坐标
        const waypointIndex = waypoints.findIndex(
            (wp) => Math.abs(wp.x - point.x) < 0.1 && Math.abs(wp.y - point.y) < 0.1
        );

        return {
            x: point.x,
            y: point.y,
            isWaypoint: waypointIndex >= 0,
            waypointIndex: waypointIndex >= 0 ? waypointIndex : undefined,
        };
    });


    // ⭐ 计算所有线段信息（用于显示中点handles）
    const segmentInfos: Segment[] = [];

    for (let i = 0; i < segments.length - 1; i++) {
        const start = segments[i];
        const end = segments[i + 1];

        const isHorizontal = Math.abs(start.y - end.y) < 0.1;  // y相同=横向
        const midPoint = {
            x: (start.x + end.x) / 2,
            y: (start.y + end.y) / 2,
        };

        segmentInfos.push({
            start,
            end,
            isHorizontal,
            midPoint,
        });
    }

    return {
        pathData,
        bendPoints,
        segments: segmentInfos,  // ⭐ 返回线段信息
    };
}
