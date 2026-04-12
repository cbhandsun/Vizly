/**
 * 高性能静态四叉树 (QuadTree) 实现
 * 用于优化 A* 寻路中的碰撞检测性能 (从 O(N) 降低到 O(log N))
 * 
 * 特性:
 * - 针对矩形对象优化
 * - 支持线段查询 (Ray casting)
 * - 静态构建 (适合一次构建多次查询的场景)
 */

import { Rectangle } from './pathfinding';

export interface SpatialIndex {
    insert(item: Rectangle): void;
    remove(item: Rectangle): void; // [NEW] Remove item
    query(range: Rectangle): Rectangle[];
    queryLine(x1: number, y1: number, x2: number, y2: number): Rectangle[];
    getAll(): Rectangle[]; // [NEW] Get all items for iteration
    clear(): void;
}

const MAX_OBJECTS = 10;
const MAX_LEVELS = 5;

export class QuadTree implements SpatialIndex {
    private bounds: Rectangle;
    private objects: Rectangle[];
    private nodes: QuadTree[];
    private level: number;

    constructor(bounds: Rectangle, level: number = 0) {
        this.bounds = bounds;
        this.objects = [];
        this.nodes = [];
        this.level = level;
    }

    /**
     * 清空四叉树
     */
    public clear(): void {
        this.objects = [];
        for (let i = 0; i < this.nodes.length; i++) {
            if (this.nodes[i]) {
                this.nodes[i].clear();
            }
        }
        this.nodes = [];
    }

    /**
     * 将四叉树分裂为四个子节点
     */
    private split(): void {
        const subWidth = this.bounds.width / 2;
        const subHeight = this.bounds.height / 2;
        const x = this.bounds.x;
        const y = this.bounds.y;

        this.nodes[0] = new QuadTree({ x: x + subWidth, y: y, width: subWidth, height: subHeight }, this.level + 1);
        this.nodes[1] = new QuadTree({ x: x, y: y, width: subWidth, height: subHeight }, this.level + 1);
        this.nodes[2] = new QuadTree({ x: x, y: y + subHeight, width: subWidth, height: subHeight }, this.level + 1);
        this.nodes[3] = new QuadTree({ x: x + subWidth, y: y + subHeight, width: subWidth, height: subHeight }, this.level + 1);
    }

    /**
     * 获取矩形所属的象限索引
     * -1 表示无法完全容纳在任何一个象限中（父节点持有）
     */
    private getIndex(rect: Rectangle): number {
        let index = -1;
        const verticalMidpoint = this.bounds.x + (this.bounds.width / 2);
        const horizontalMidpoint = this.bounds.y + (this.bounds.height / 2);

        const topQuadrant = (rect.y < horizontalMidpoint && rect.y + rect.height < horizontalMidpoint);
        const bottomQuadrant = (rect.y > horizontalMidpoint);

        if (rect.x < verticalMidpoint && rect.x + rect.width < verticalMidpoint) {
            if (topQuadrant) {
                index = 1;
            } else if (bottomQuadrant) {
                index = 2;
            }
        } else if (rect.x > verticalMidpoint) {
            if (topQuadrant) {
                index = 0;
            } else if (bottomQuadrant) {
                index = 3;
            }
        }

        return index;
    }

    /**
     * 插入对象
     */
    public insert(rect: Rectangle): void {
        if (this.nodes.length > 0) {
            const index = this.getIndex(rect);

            if (index !== -1) {
                this.nodes[index].insert(rect);
                return;
            }
        }

        this.objects.push(rect);

        if (this.objects.length > MAX_OBJECTS && this.level < MAX_LEVELS) {
            if (this.nodes.length === 0) {
                this.split();
            }

            let i = 0;
            while (i < this.objects.length) {
                const index = this.getIndex(this.objects[i]);
                if (index !== -1) {
                    const removed = this.objects.splice(i, 1)[0];
                    this.nodes[index].insert(removed);
                } else {
                    i++;
                }
            }
        }
    }

    /**
     * 删除对象
     */
    public remove(rect: Rectangle): void {
        const index = this.getIndex(rect);
        if (index !== -1 && this.nodes.length > 0) {
            this.nodes[index].remove(rect);
            return;
        }

        const idx = this.objects.findIndex(obj =>
            obj.x === rect.x && obj.y === rect.y &&
            obj.width === rect.width && obj.height === rect.height
        );

        if (idx !== -1) {
            this.objects.splice(idx, 1);
        }
    }

    /**
     * 获取树中所有对象
     */
    public getAll(): Rectangle[] {
        let allObjects: Rectangle[] = [...this.objects];

        for (let i = 0; i < this.nodes.length; i++) {
            if (this.nodes[i]) {
                allObjects = allObjects.concat(this.nodes[i].getAll());
            }
        }

        return allObjects;
    }

    /**
     * 查询范围内的对象
     */
    public query(range: Rectangle): Rectangle[] {
        let returnObjects: Rectangle[] = this.objects; // 父节点的对象可能与range相交

        const index = this.getIndex(range);

        // 如果range完全包含在某个子节点中，只需要递归查询该子节点
        if (this.nodes.length > 0) {
            if (index !== -1) {
                returnObjects = returnObjects.concat(this.nodes[index].query(range));
            } else {
                // 如果range跨越了多个子节点，需要查询所有可能相交的子节点
                // 简单起见，这里我们查询所有子节点
                // 优化：可以分别检查range与四个子节点的包围盒是否相交
                for (let i = 0; i < this.nodes.length; i++) {
                    // 简单的AABB检查
                    if (this.rectIntersect(range, this.nodes[i].bounds)) {
                        returnObjects = returnObjects.concat(this.nodes[i].query(range));
                    }
                }
            }
        }

        return returnObjects;
    }

    /**
     * 简单的矩形相交检查
     */
    private rectIntersect(r1: Rectangle, r2: Rectangle): boolean {
        return !(r2.x > r1.x + r1.width ||
            r2.x + r2.width < r1.x ||
            r2.y > r1.y + r1.height ||
            r2.y + r2.height < r1.y);
    }

    /**
     * 查询与线段相交的矩形 (用于 Ray Casting / Path Blocking Check)
     */
    public queryLine(x1: number, y1: number, x2: number, y2: number): Rectangle[] {
        // 构建线段的包围盒 (AABB)
        const minX = Math.min(x1, x2);
        const minY = Math.min(y1, y2);
        const width = Math.abs(x1 - x2);
        const height = Math.abs(y1 - y2);

        const range = { x: minX, y: minY, width, height };

        // 1. 获取所有候选矩形 (Broad Phase)
        const candidates = this.query(range);

        // 2. 精确过滤 (Narrow Phase) - 实际上调用者通常会自己做精确检查，
        // 这里我们只需要返回可能相交的矩形集合即可。
        // 为了性能，我们只返回候选集，不进行精确的线段相交测试（留给 pathfinding.ts 中的 isPathBlocked 做）

        return candidates;
    }
    public getDebugBounds(): Rectangle[] {
        let bounds: Rectangle[] = [this.bounds];
        for (let i = 0; i < this.nodes.length; i++) {
            if (this.nodes[i]) {
                bounds = bounds.concat(this.nodes[i].getDebugBounds());
            }
        }
        return bounds;
    }
}
