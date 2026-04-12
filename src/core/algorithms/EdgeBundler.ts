/**
 * Global Edge Bundler
 * 
 * Implements global edge bundling to reduce visual clutter in complex graphs.
 * Uses DBSCAN clustering and Hausdorff distance for path similarity detection.
 * 
 * Target: 50%+ readability improvement, 60-80% crossing reduction
 * 
 * Algorithm:
 * 1. Generate rough paths for all edges
 * 2. Calculate similarity matrix using Hausdorff distance
 * 3. Cluster similar paths using DBSCAN
 * 4. Extract shared segments for each cluster
 * 5. Route edges through shared trunk → branch points
 */

import type { Edge, Node } from '@xyflow/react';
import type { Point } from '../algorithms/pathfinding';

export interface EdgeCluster {
    edges: string[];                    // Edge IDs in this cluster
    sharedSegments: Point[][];          // Common path segments
    branchPoints: Point[];              // Where edges split from trunk
    trunkStrength: number;              // Bundling strength (0-1)
}

export interface BundlingConfig {
    similarityThreshold: number;        // Min similarity for clustering (0-1)
    minClusterSize: number;             // Min edges to form bundle
    bundlingStrength: number;           // How tightly to bundle (0-1)
    sampling: number;                   // Path sampling density
    enabled: boolean;
}

const DEFAULT_CONFIG: BundlingConfig = {
    similarityThreshold: 0.7,
    minClusterSize: 2,
    bundlingStrength: 0.8,
    sampling: 10,
    enabled: true
};

/**
 * Main edge bundler class
 */
export class GlobalEdgeBundler {
    private config: BundlingConfig;
    private clusters: EdgeCluster[] = [];

    constructor(config: Partial<BundlingConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Analyze edges and create bundles
     */
    bundleEdges(
        edges: Edge[],
        nodes: Node[],
        existingPaths?: Map<string, Point[]>
    ): Map<string, EdgeCluster> {
        if (!this.config.enabled || edges.length < this.config.minClusterSize) {
            return new Map();
        }

        this.clusters = [];

        // console.log(`[EdgeBundler] Analyzing ${edges.length} edges for bundling...`);

        // 1. Generate or use existing rough paths
        const paths = this.generateRoughPaths(edges, nodes, existingPaths);

        // 2. Calculate similarity matrix
        const similarity = this.buildSimilarityMatrix(paths);

        // 3. Cluster using DBSCAN
        const clusters = this.dbscan(similarity, this.config.similarityThreshold, this.config.minClusterSize);

        // 4. Extract shared segments for each cluster
        const bundleMap = new Map<string, EdgeCluster>();
        clusters.forEach((cluster, idx) => {
            if (cluster.length >= this.config.minClusterSize) {
                const edgeCluster = this.extractSharedSegments(
                    cluster,
                    paths,
                    edges
                );

                // Map each edge to its cluster
                cluster.forEach(edgeId => {
                    bundleMap.set(edgeId, edgeCluster);
                });

                this.clusters.push(edgeCluster);
            }
        });

        // console.log(`[EdgeBundler] Created ${this.clusters.length} bundles`);
        return bundleMap;
    }

    /**
     * Generate rough paths for edges
     */
    private generateRoughPaths(
        edges: Edge[],
        nodes: Node[],
        existingPaths?: Map<string, Point[]>
    ): Map<string, Point[]> {
        const paths = new Map<string, Point[]>();

        for (const edge of edges) {
            // Use existing path if available
            if (existingPaths?.has(edge.id)) {
                paths.set(edge.id, existingPaths.get(edge.id)!);
                continue;
            }

            // Generate simple straight path as approximation
            const source = nodes.find(n => n.id === edge.source);
            const target = nodes.find(n => n.id === edge.target);

            if (source && target) {
                const sourceCenter = {
                    x: source.position.x + (source.measured?.width || 150) / 2,
                    y: source.position.y + (source.measured?.height || 80) / 2
                };
                const targetCenter = {
                    x: target.position.x + (target.measured?.width || 150) / 2,
                    y: target.position.y + (target.measured?.height || 80) / 2
                };

                // Simple 3-point path (source → midpoint → target)
                const midpoint = {
                    x: (sourceCenter.x + targetCenter.x) / 2,
                    y: (sourceCenter.y + targetCenter.y) / 2
                };

                paths.set(edge.id, [sourceCenter, midpoint, targetCenter]);
            }
        }

        return paths;
    }

    /**
     * Build similarity matrix using Hausdorff distance
     */
    private buildSimilarityMatrix(paths: Map<string, Point[]>): Map<string, Map<string, number>> {
        const matrix = new Map<string, Map<string, number>>();
        const edgeIds = Array.from(paths.keys());

        for (let i = 0; i < edgeIds.length; i++) {
            const id1 = edgeIds[i];
            const path1 = paths.get(id1)!;
            const row = new Map<string, number>();

            for (let j = 0; j < edgeIds.length; j++) {
                const id2 = edgeIds[j];
                const path2 = paths.get(id2)!;

                if (i === j) {
                    row.set(id2, 1.0); // Perfect similarity with self
                } else {
                    const similarity = this.calculatePathSimilarity(path1, path2);
                    row.set(id2, similarity);
                }
            }

            matrix.set(id1, row);
        }

        return matrix;
    }

    /**
     * Calculate path similarity using normalized Hausdorff distance
     */
    private calculatePathSimilarity(path1: Point[], path2: Point[]): number {
        // Sample paths uniformly
        const samples1 = this.samplePath(path1, this.config.sampling);
        const samples2 = this.samplePath(path2, this.config.sampling);

        // Calculate Hausdorff distance
        const h1 = this.directedHausdorff(samples1, samples2);
        const h2 = this.directedHausdorff(samples2, samples1);
        const hausdorff = Math.max(h1, h2);

        // Normalize by diagonal of bounding box
        const bounds = this.getBounds([...samples1, ...samples2]);
        const diagonal = Math.sqrt(bounds.width ** 2 + bounds.height ** 2);
        const normalizedDistance = hausdorff / (diagonal + 1);

        // Convert to similarity (0-1, where 1 is identical)
        return Math.exp(-normalizedDistance * 1.2);
    }

    /**
     * Sample path uniformly
     */
    private samplePath(path: Point[], numSamples: number): Point[] {
        if (path.length <= numSamples) return path;

        const samples: Point[] = [path[0]]; // Always include start
        const totalLength = this.calculatePathLength(path);
        const sampleDistance = totalLength / (numSamples - 1);

        let accumulatedLength = 0;
        let nextSampleDistance = sampleDistance;

        for (let i = 0; i < path.length - 1; i++) {
            const segmentLength = this.distance(path[i], path[i + 1]);

            while (accumulatedLength + segmentLength >= nextSampleDistance) {
                const t = (nextSampleDistance - accumulatedLength) / segmentLength;
                const sample = this.interpolate(path[i], path[i + 1], t);
                samples.push(sample);
                nextSampleDistance += sampleDistance;

                if (samples.length >= numSamples - 1) break;
            }

            accumulatedLength += segmentLength;
            if (samples.length >= numSamples - 1) break;
        }

        samples.push(path[path.length - 1]); // Always include end
        return samples;
    }

    /**
     * Directed Hausdorff distance
     */
    private directedHausdorff(pointsA: Point[], pointsB: Point[]): number {
        let maxMin = 0;

        for (const a of pointsA) {
            let minDist = Infinity;
            for (const b of pointsB) {
                const dist = this.distance(a, b);
                minDist = Math.min(minDist, dist);
            }
            maxMin = Math.max(maxMin, minDist);
        }

        return maxMin;
    }

    /**
     * DBSCAN clustering algorithm
     */
    private dbscan(
        similarity: Map<string, Map<string, number>>,
        eps: number,
        minPts: number
    ): string[][] {
        const edgeIds = Array.from(similarity.keys());
        const visited = new Set<string>();
        const clusters: string[][] = [];

        for (const id of edgeIds) {
            if (visited.has(id)) continue;

            visited.add(id);
            const neighbors = this.getNeighbors(id, similarity, eps);

            if (neighbors.length >= minPts - 1) {
                // Start new cluster
                const cluster = [id];
                this.expandCluster(id, neighbors, cluster, visited, similarity, eps, minPts);
                clusters.push(cluster);
            }
        }

        return clusters;
    }

    /**
     * Get neighbors above similarity threshold
     */
    private getNeighbors(
        id: string,
        similarity: Map<string, Map<string, number>>,
        eps: number
    ): string[] {
        const neighbors: string[] = [];
        const row = similarity.get(id);

        if (row) {
            for (const [otherId, sim] of row) {
                if (otherId !== id && sim >= eps) {
                    neighbors.push(otherId);
                }
            }
        }

        return neighbors;
    }

    /**
     * Expand cluster with density-reachable points
     */
    private expandCluster(
        id: string,
        neighbors: string[],
        cluster: string[],
        visited: Set<string>,
        similarity: Map<string, Map<string, number>>,
        eps: number,
        minPts: number
    ): void {
        const queue = [...neighbors];

        while (queue.length > 0) {
            const current = queue.shift()!;

            if (!visited.has(current)) {
                visited.add(current);
                const currentNeighbors = this.getNeighbors(current, similarity, eps);

                if (currentNeighbors.length >= minPts - 1) {
                    queue.push(...currentNeighbors);
                }
            }

            if (!cluster.includes(current)) {
                cluster.push(current);
            }
        }
    }

    /**
     * Extract shared segments from cluster
     */
    private extractSharedSegments(
        cluster: string[],
        paths: Map<string, Point[]>,
        edges: Edge[]
    ): EdgeCluster {
        // For now, use simple centroid-based approach
        // More sophisticated: compute medoid or use force-directed bundling

        const clusterPaths = cluster.map(id => paths.get(id)!).filter(Boolean);

        // Calculate average path (shared trunk)
        const sharedPath = this.calculateCentroidPath(clusterPaths);

        // Find branch points (where individual edges diverge)
        const branchPoints = this.findBranchPoints(clusterPaths, sharedPath);

        return {
            edges: cluster,
            sharedSegments: [sharedPath],
            branchPoints,
            trunkStrength: this.config.bundlingStrength
        };
    }

    /**
     * Calculate centroid path (average of all paths)
     */
    private calculateCentroidPath(paths: Point[][]): Point[] {
        if (paths.length === 0) return [];
        if (paths.length === 1) return paths[0];

        // Resample all paths to same length
        const maxLength = Math.max(...paths.map(p => p.length));
        const resampledPaths = paths.map(p => this.samplePath(p, maxLength));

        // Average each point
        const centroid: Point[] = [];
        for (let i = 0; i < maxLength; i++) {
            let sumX = 0;
            let sumY = 0;
            let count = 0;

            for (const path of resampledPaths) {
                if (path[i]) {
                    sumX += path[i].x;
                    sumY += path[i].y;
                    count++;
                }
            }

            if (count > 0) {
                centroid.push({ x: sumX / count, y: sumY / count });
            }
        }

        return centroid;
    }

    /**
     * Find branch points where edges diverge from trunk
     */
    private findBranchPoints(paths: Point[][], trunk: Point[]): Point[] {
        // Simple approach: use start and end of trunk
        return trunk.length >= 2 ? [trunk[0], trunk[trunk.length - 1]] : trunk;
    }

    /**
     * Helper: Calculate path length
     */
    private calculatePathLength(path: Point[]): number {
        let length = 0;
        for (let i = 0; i < path.length - 1; i++) {
            length += this.distance(path[i], path[i + 1]);
        }
        return length;
    }

    /**
     * Helper: Distance between points
     */
    private distance(p1: Point, p2: Point): number {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Helper: Interpolate between points
     */
    private interpolate(p1: Point, p2: Point, t: number): Point {
        return {
            x: p1.x + (p2.x - p1.x) * t,
            y: p1.y + (p2.y - p1.y) * t
        };
    }

    /**
     * Helper: Get bounding box
     */
    private getBounds(points: Point[]): { width: number; height: number } {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const p of points) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }

        return {
            width: maxX - minX,
            height: maxY - minY
        };
    }

    /**
     * Get current clusters
     */
    getClusters(): EdgeCluster[] {
        return this.clusters;
    }

    /**
     * Clear clusters
     */
    clear(): void {
        this.clusters = [];
    }
}
