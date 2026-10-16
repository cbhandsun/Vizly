import type { Edge, Node } from '@xyflow/react';
import { sanitizeCanvasEdgesForNodes } from '@vizly/core/security';
import {
    COLLABORATION_MAX_EDGES, COLLABORATION_MAX_NODES,
    inspectCollaborationElementBudget, parseCollaborationSnapshot,
} from './collaborationSnapshot';

interface Entry<T> { fingerprint: string; parsed: T; bytes: number }

/**
 * Scope this cache to one document. Inspect bounded JSON before reusing owned
 * sanitized values, including callers that mutate a ReactFlow value in place.
 * Remote Y.Map values always use the full untrusted-input parser.
 */
export const createLocalCollaborationSnapshotCache = () => {
    let nodeCache = new Map<string, Entry<Node>>();
    let edgeCache = new Map<string, Entry<Edge>>();
    return {
        clear() { nodeCache = new Map(); edgeCache = new Map(); },
        parse(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } | null {
            try {
                if (nodes.length > COLLABORATION_MAX_NODES || edges.length > COLLABORATION_MAX_EDGES) return null;
                const nextNodes = new Map<string, Entry<Node>>();
                const nextEdges = new Map<string, Entry<Edge>>();
                let bytes = 0;
                for (const raw of nodes) {
                    if (nextNodes.has(raw.id)) return null;
                    const inspection = inspectCollaborationElementBudget(raw);
                    if (!inspection) return null;
                    let entry = nodeCache.get(raw.id);
                    if (entry?.fingerprint !== inspection.fingerprint) {
                        const parsed = parseCollaborationSnapshot([[raw.id, raw]], []);
                        if (!parsed || parsed.nodes.length !== 1) return null;
                        entry = { parsed: parsed.nodes[0], ...inspection };
                    }
                    bytes += entry.bytes;
                    if (bytes > 2 * 1024 * 1024) return null;
                    nextNodes.set(raw.id, entry);
                }
                const parsedNodes = [...nextNodes.values()].map(entry => entry.parsed);
                const nodeEntries: Array<[string, unknown]> = parsedNodes.map(node => [node.id, node]);
                for (const raw of edges) {
                    if (nextEdges.has(raw.id)) return null;
                    const inspection = inspectCollaborationElementBudget(raw);
                    if (!inspection) return null;
                    let entry = edgeCache.get(raw.id);
                    if (entry?.fingerprint !== inspection.fingerprint) {
                        // Keep the existing graph-aware sanitizer for changed
                        // edges; cached edges are checked against current IDs below.
                        const parsed = parseCollaborationSnapshot(nodeEntries, [[raw.id, raw]]);
                        if (!parsed || parsed.edges.length !== 1) return null;
                        entry = { parsed: parsed.edges[0], ...inspection };
                    }
                    if (!nextNodes.has(entry.parsed.source) || !nextNodes.has(entry.parsed.target)) return null;
                    bytes += entry.bytes;
                    if (bytes > 2 * 1024 * 1024) return null;
                    nextEdges.set(raw.id, entry);
                }
                const parsedEdges = [...nextEdges.values()].map(entry => entry.parsed);
                if (sanitizeCanvasEdgesForNodes(parsedNodes, parsedEdges).length !== parsedEdges.length) return null;
                nodeCache = nextNodes;
                edgeCache = nextEdges;
                return { nodes: parsedNodes, edges: parsedEdges };
            } catch { return null; }
        },
    };
};
