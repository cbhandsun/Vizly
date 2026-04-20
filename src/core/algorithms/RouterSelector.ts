
import { Point, Rectangle } from './geometryUtils';
import { Position } from '../types/routing';
import { SpatialIndex } from './SpatialIndex';

export enum RoutingStrategy {
    DIRECT = 'direct',           // 直线 (0段弯折)
    L_SHAPE = 'l_shape',         // L型 (1段弯折)
    Z_SHAPE = 'z_shape',         // Z型 (2段弯折)
    C_SHAPE = 'c_shape',         // C型/U型 (同侧)
    BUS_ROUTING = 'bus_routing', // 总线路由
    GRID_ASTAR = 'grid_astar',   // 完整A*网格搜索
    VISIBILITY_GRAPH = 'vg'      // 可见性图 (密集障碍物)
}

export interface RoutingContext {
    start: Point;
    end: Point;
    startPos: Position;
    endPos: Position;
    obstacles: Rectangle[] | SpatialIndex;
    isBusRoute: boolean;
    hasLineObstacles?: boolean;
    routingType?: string; // 'orthogonal' | 'direct'
}


function isSpatialIndex(obs: Rectangle[] | SpatialIndex): obs is SpatialIndex {
    return 'query' in obs && typeof (obs as any).query === 'function';
}

export class RouterSelector {
    /**
     * 根据场景上下文选择最佳路由策略
     */
    selectStrategy(ctx: RoutingContext): RoutingStrategy {
        const { start, end, startPos, endPos, obstacles, isBusRoute, hasLineObstacles, routingType } = ctx;

        // 1. 总线路由优先级最高
        if (isBusRoute) {
            return RoutingStrategy.BUS_ROUTING;
        }

        const dx = Math.abs(start.x - end.x);
        const dy = Math.abs(start.y - end.y);
        const distance = Math.sqrt(dx * dx + dy * dy);

        // [FIX T-6] 改为 &&：仅当两轴都严格对齐（几乎重叠）才走 DIRECT
        // 原来 || 导致 X 轴相距 500px 但 Y 差 < 1px 的节点对走 DIRECT，
        // 忽略中间可能存在的障碍物，路径直接穿越节点
        if (dx < 1 && dy < 1) {
            return RoutingStrategy.DIRECT;
        }


        // 3. 同侧连接 => C-Shape
        if (startPos === endPos) {
            return RoutingStrategy.C_SHAPE;
        }

        // 获取障碍物数量估计
        let obsCount = 0;
        if (isSpatialIndex(obstacles)) {
            const margin = 100;
            const bounds = {
                x: Math.min(start.x, end.x) - margin,
                y: Math.min(start.y, end.y) - margin,
                width: dx + margin * 2,
                height: dy + margin * 2
            };
            obsCount = obstacles.query(bounds).length;
        } else {
            obsCount = obstacles.length;
        }

        // 4. 简单场景 => L-Shape
        if (obsCount < 3 && !hasLineObstacles) {
            // 如果是 direct 模式，L-Shape 也适用吗？Direct 模式下 L-Shape 即为 Direct (如果无碍)
            // 但如果 routingType 是 direct, 我们通常希望直线。
            // 这里的 DIRECT 策略指的是 "Try Simple Path - Straight Line".
            // 如果 Direct 模式被阻挡，才需要 L/Z/VG.
            return RoutingStrategy.L_SHAPE;
        }

        // 5. 中等场景 => Z-Shape
        if (obsCount < 8 && distance < 1000 && !hasLineObstacles) {
            return RoutingStrategy.Z_SHAPE;
        }

        // 6. 密集障碍物 => Visibility Graph
        // 仅当非正交路由时启用 VG，或者当我们需要高性能的 Polyline 避障时
        if (obsCount > 20 && routingType !== 'orthogonal') {
            return RoutingStrategy.VISIBILITY_GRAPH;
        }

        // 7. 默认 => Grid A*
        return RoutingStrategy.GRID_ASTAR;
    }
}
