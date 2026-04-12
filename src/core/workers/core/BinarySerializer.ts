/**
 * Binary Serializer for Zero-Copy Data Transfer
 * 
 * Optimizes performance by converting array of objects into typed arrays.
 * This allows "Transferable Object" semantics in Worker postMessage, 
 * avoiding the overhead of Structured Clone Algorithm for large datasets.
 */

import { Rectangle } from '../../types/routing';

// Layout: [x, y, w, h, id_index, x, y, w, h, id_index, ...]
// Note: We skip ID serialization for now to keep it pure F32, 
// or we can use a separate look-aside table for IDs if strictly needed.
// For pure collision detection (SpatialIndex), IDs are often not needed until the very end.
// Limitation: Explicit IDs are lost in this format unless we pass a separate string array.
// For obstacles, we often just need the geometry.

const STRIDE = 4; // x, y, w, h

/**
 * Serialize an array of Rectangles into a Float32Array
 */
export const serializeObstacles = (obstacles: Rectangle[]): Float32Array => {
    if (!obstacles || obstacles.length === 0) return new Float32Array(0);

    const buffer = new Float32Array(obstacles.length * STRIDE);

    for (let i = 0; i < obstacles.length; i++) {
        const obs = obstacles[i];
        const offset = i * STRIDE;
        buffer[offset] = obs.x;
        buffer[offset + 1] = obs.y;
        buffer[offset + 2] = obs.width;
        buffer[offset + 3] = obs.height;
    }

    return buffer;
};

/**
 * Lightweight wrapper to read from Float32Array (Partial deserialization)
 * Avoids creating thousands of objects.
 */
export class BinaryObstacleView {
    constructor(private buffer: Float32Array) { }

    get length(): number {
        return this.buffer.length / STRIDE;
    }

    // Read single item (creates object, use sparingly)
    get(index: number): Rectangle {
        const offset = index * STRIDE;
        return {
            x: this.buffer[offset],
            y: this.buffer[offset + 1],
            width: this.buffer[offset + 2],
            height: this.buffer[offset + 3]
        } as Rectangle;
    }

    // Iterator for "for..of" loops
    *[Symbol.iterator]() {
        const len = this.length;
        for (let i = 0; i < len; i++) {
            yield this.get(i);
        }
    }

    // Fast bounds calculation without object creation
    getBounds(): Rectangle | null {
        if (this.length === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (let i = 0; i < this.buffer.length; i += STRIDE) {
            const x = this.buffer[i];
            const y = this.buffer[i + 1];
            const w = this.buffer[i + 2];
            const h = this.buffer[i + 3];

            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x + w > maxX) maxX = x + w;
            if (y + h > maxY) maxY = y + h;
        }

        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY } as Rectangle;
    }

    // Bulk copy to standard array (if strictly needed)
    toArray(): Rectangle[] {
        const result = new Array(this.length);
        for (let i = 0; i < this.length; i++) {
            result[i] = this.get(i);
        }
        return result;
    }
}
