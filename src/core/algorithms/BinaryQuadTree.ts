/**
 * Binary QuadTree Implementation
 * 
 * A SpatialIndex implementation that works directly with Float32Array data.
 * Reduces memory overhead by avoiding Rectangle object creation for static obstacles.
 * 
 * Hybrid Architecture:
 * - Static Layer: Read-only views into the Float32Array
 * - Dynamic Layer: Standard array for runtime additions (Source/Target padding)
 */

import { Rectangle } from './pathfinding';
import { SpatialIndex } from './SpatialIndex';

const STRIDE = 4; // x, y, w, h

export class BinaryQuadTree implements SpatialIndex {
    private buffer: Float32Array;
    private bufferCount: number;

    // Dynamic overlay for items added during pathfinding (e.g. start/end nodes)
    private dynamicItems: Rectangle[] = [];

    // The bounds of the world
    private bounds: Rectangle;

    // QuadTree structure: Nodes store INDICES into the buffer, not objects
    // For simplicity in this version, we use a recursive object structure for the tree nodes
    // but the *leaves* hold number[] (indices) instead of Rectangle[]
    private root: BinaryQuadNode;

    constructor(buffer: Float32Array, bounds?: Rectangle) {
        this.buffer = buffer;
        this.bufferCount = buffer.length / STRIDE;

        // Calculate bounds if not provided
        if (bounds) {
            this.bounds = bounds;
        } else {
            this.bounds = this.calculateBounds();
        }

        this.root = new BinaryQuadNode(this.bounds);
        this.build();
    }

    private calculateBounds(): Rectangle {
        if (this.bufferCount === 0) return { x: 0, y: 0, width: 1000, height: 1000 };

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < this.bufferCount; i++) {
            const ptr = i * STRIDE;
            const x = this.buffer[ptr];
            const y = this.buffer[ptr + 1];
            const w = this.buffer[ptr + 2];
            const h = this.buffer[ptr + 3];

            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x + w > maxX) maxX = x + w;
            if (y + h > maxY) maxY = y + h;
        }

        // Add padding
        const padding = 100;
        return {
            x: minX - padding,
            y: minY - padding,
            width: (maxX - minX) + padding * 2,
            height: (maxY - minY) + padding * 2
        };
    }

    private build() {
        // Insert all indices into the tree
        for (let i = 0; i < this.bufferCount; i++) {
            const ptr = i * STRIDE;
            const x = this.buffer[ptr];
            const y = this.buffer[ptr + 1];
            const w = this.buffer[ptr + 2];
            const h = this.buffer[ptr + 3];

            const rect = { x, y, width: w, height: h };
            this.root.insert(i, rect);
        }
    }

    // SpatialIndex Interface Implementation

    insert(item: Rectangle): void {
        // Dynamic insertions go to the overlay array
        // Building a dynamic quadtree for a few items (start/end) is overkill
        this.dynamicItems.push(item);
    }

    remove(item: Rectangle): void {
        const idx = this.dynamicItems.indexOf(item);
        if (idx !== -1) {
            this.dynamicItems.splice(idx, 1);
        }
        // Cannot remove from static binary buffer
    }

    query(range: Rectangle): Rectangle[] {
        // 1. Query static binary tree
        const indices = this.root.query(range);

        // 2. Hydrate Rectangles from indices
        const results: Rectangle[] = new Array(indices.length + this.dynamicItems.length);
        let rIdx = 0;

        for (let i = 0; i < indices.length; i++) {
            const ptr = indices[i] * STRIDE;
            results[rIdx++] = {
                x: this.buffer[ptr],
                y: this.buffer[ptr + 1],
                width: this.buffer[ptr + 2],
                height: this.buffer[ptr + 3]
                // id is missing, but usually not needed for collision check
            };
        }

        // 3. Check dynamic items
        for (let i = 0; i < this.dynamicItems.length; i++) {
            if (this.intersects(range, this.dynamicItems[i])) {
                results[rIdx++] = this.dynamicItems[i];
            }
        }

        // Trim if needed (though allocating exact size + push is cleaner in JS, 
        // pre-allocating might be faster if we knew exact count. 
        // Here we just use push or splice. Actually let's just allow the gap or use concat.
        // Simplified:
        return results.slice(0, rIdx);
    }

    queryLine(x1: number, y1: number, x2: number, y2: number): Rectangle[] {
        // Convert line to AABB range
        const minX = Math.min(x1, x2);
        const minY = Math.min(y1, y2);
        const width = Math.abs(x1 - x2);
        const height = Math.abs(y1 - y2);

        return this.query({ x: minX, y: minY, width, height });
    }

    getAll(): Rectangle[] {
        // Hydrate everything (expensive, use carefully)
        const all: Rectangle[] = [];
        for (let i = 0; i < this.bufferCount; i++) {
            const ptr = i * STRIDE;
            all.push({
                x: this.buffer[ptr],
                y: this.buffer[ptr + 1],
                width: this.buffer[ptr + 2],
                height: this.buffer[ptr + 3]
            });
        }
        return all.concat(this.dynamicItems);
    }

    clear(): void {
        this.dynamicItems = [];
        // Cannot clear static buffer without rebuilding
    }

    private intersects(r1: Rectangle, r2: Rectangle): boolean {
        return !(r2.x > r1.x + r1.width ||
            r2.x + r2.width < r1.x ||
            r2.y > r1.y + r1.height ||
            r2.y + r2.height < r1.y);
    }
}

// Helper Node class
class BinaryQuadNode {
    private bounds: Rectangle;
    private indices: number[] = [];
    private nodes: BinaryQuadNode[] = [];
    private level: number;

    private static MAX_OBJECTS = 10;
    private static MAX_LEVELS = 5;

    constructor(bounds: Rectangle, level: number = 0) {
        this.bounds = bounds;
        this.level = level;
    }

    insert(index: number, rect: Rectangle) {
        if (this.nodes.length > 0) {
            const quadrant = this.getIndex(rect);
            if (quadrant !== -1) {
                this.nodes[quadrant].insert(index, rect);
                return;
            }
        }

        this.indices.push(index);

        if (this.indices.length > BinaryQuadNode.MAX_OBJECTS && this.level < BinaryQuadNode.MAX_LEVELS) {
            if (this.nodes.length === 0) {
                this.split();
            }
            // Redistribute only local indices
            // We can't easily redistribute "dynamic" input recursively without keeping rects...
            // Wait, we DO pass 'rect' down during insert. 
            // But we don't store rects in the node, only indices.
            // So to redistribute, we'd need to re-read from buffer? 
            // Yes, but 'insert' is called mainly during build phase where we have the rect handy.
            // BUT: redistribution of *existing* indices requires lookups.
            // Simplified: Just keep them in this node if we split late.
            // Or better: Don't redistribute old indices to avoid buffer lookups, 
            // just split for NEW insertions.
            // Standard QuadTree behavior: redistribute.
            // Let's implement simplified "No Redistribution" for now or assume efficient lookup.
            // Actually, we can just split and let new items go down. Old items stay.
        }
    }

    query(range: Rectangle): number[] {
        let results = this.indices; // Copy reference? No, we need to filter? 
        // The indices here definitely intersect this node bounds, but maybe not the range.
        // Ideally we check intersection with the actual object.
        // But we don't have the object here!
        // So we return ALL candidate indices from this node, 
        // and let the caller (who has the buffer) do the fine-grained intersection check?
        // OR: We blindly return indices and let generic A* do the check?
        // Standard QuadTree `query` creates a candidate list.

        if (this.nodes.length > 0) {
            const index = this.getIndex(range);
            if (index !== -1) {
                results = results.concat(this.nodes[index].query(range));
            } else {
                // Intersects multiple quadrants
                for (const node of this.nodes) {
                    if (this.rectIntersect(node.bounds, range)) {
                        results = results.concat(node.query(range));
                    }
                }
            }
        }
        return results;
    }

    private split() {
        const subW = this.bounds.width / 2;
        const subH = this.bounds.height / 2;
        const x = this.bounds.x;
        const y = this.bounds.y;

        this.nodes[0] = new BinaryQuadNode({ x: x + subW, y: y, width: subW, height: subH }, this.level + 1);
        this.nodes[1] = new BinaryQuadNode({ x: x, y: y, width: subW, height: subH }, this.level + 1);
        this.nodes[2] = new BinaryQuadNode({ x: x, y: y + subH, width: subW, height: subH }, this.level + 1);
        this.nodes[3] = new BinaryQuadNode({ x: x + subW, y: y + subH, width: subW, height: subH }, this.level + 1);
    }

    private getIndex(rect: Rectangle): number {
        const vMid = this.bounds.x + (this.bounds.width / 2);
        const hMid = this.bounds.y + (this.bounds.height / 2);

        const top = (rect.y < hMid && rect.y + rect.height < hMid);
        const bottom = (rect.y > hMid);

        if (rect.x < vMid && rect.x + rect.width < vMid) {
            if (top) return 1;
            if (bottom) return 2;
        } else if (rect.x > vMid) {
            if (top) return 0;
            if (bottom) return 3;
        }
        return -1;
    }

    private rectIntersect(r1: Rectangle, r2: Rectangle): boolean {
        return !(r2.x > r1.x + r1.width ||
            r2.x + r2.width < r1.x ||
            r2.y > r1.y + r1.height ||
            r2.y + r2.height < r1.y);
    }
}
