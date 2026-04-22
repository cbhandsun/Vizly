/**
 * migrate.ts — Convert legacy React Flow mindmap data (v1) to mind-elixir format (v2)
 */
import type { NodeObj } from 'mind-elixir';
import type { VizlyMindMapV1Data, VizlyMindMapV2Data } from './types';
import { VIZLY_HYPER_THEME } from './theme';

/** Strip HTML tags from a label string */
function stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, '').trim() || 'Untitled';
}

/**
 * Map Vizly's direction string to mind-elixir direction integer
 * MindElixir.LEFT=3, MindElixir.RIGHT=1, MindElixir.SIDE=2, MindElixir.ROOT=0
 */
export function directionStringToInt(dir: string): number {
    const map: Record<string, number> = {
        LR: 2,  // SIDE — root in center, branches left and right
        R: 1,   // RIGHT
        L: 3,   // LEFT
        TB: 0,  // ROOT (top-down, root at top center)
        BT: 0,  // mind-elixir doesn't have native BT, fallback to ROOT
        FISHBONE: 2, // FISHBONE not supported natively, fallback to SIDE
    };
    return map[dir] ?? 2;
}

/** Convert from React Flow nodes/edges mindmap-v1 → mind-elixir NodeObj tree */
export function migrateV1ToV2(v1: VizlyMindMapV1Data): VizlyMindMapV2Data {
    const { nodes, edges } = v1;

    // Build children map from edges
    const childrenMap = new Map<string, string[]>();
    edges.forEach((e: any) => {
        if (e.type === 'relationshipEdge') return; // skip relationship lines
        if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
        childrenMap.get(e.source)!.push(e.target);
    });

    // Find root node (not targeted by any edge, and type === 'mindmap')
    const targetIds = new Set(edges.map((e: any) => e.target));
    const rootNode = nodes.find(
        (n: any) => n.type === 'mindmap' && !targetIds.has(n.id)
    ) ?? nodes.find((n: any) => n.type === 'mindmap' && n.data?.depth === 0);

    if (!rootNode) {
        // Fallback: return a blank tree
        return {
            _version: 'mindmap-v2',
            nodeData: { id: 'root', topic: '中心主题', root: true, children: [] },
            direction: 2,
            theme: VIZLY_HYPER_THEME,
        };
    }

    const nodeMap = new Map<string, any>(nodes.map((n: any) => [n.id, n]));

    function convertNode(rfNode: any): NodeObj {
        const label = stripHtml((rfNode.data?.label as string) || '');
        const childIds = (childrenMap.get(rfNode.id) || []).sort((a: string, b: string) => {
            const na = nodeMap.get(a);
            const nb = nodeMap.get(b);
            return (na?.position?.y ?? 0) - (nb?.position?.y ?? 0);
        });

        const nodeObj: NodeObj = {
            id: rfNode.id,
            topic: label,
            expanded: !rfNode.data?.collapsed,
            children: childIds.map(id => convertNode(nodeMap.get(id)!)).filter(Boolean),
        };

        // Migrate style
        const branchColor = rfNode.data?.branchColor as string | undefined;
        if (branchColor) {
            nodeObj.style = { color: branchColor };
        }

        // Migrate tags
        const tags = rfNode.data?.tags as string[] | undefined;
        if (tags && tags.length > 0) {
            nodeObj.tags = tags;
        }

        return nodeObj;
    }

    const direction = directionStringToInt(
        (rootNode.data?.direction as string) || 'LR'
    );

    return {
        _version: 'mindmap-v2',
        nodeData: { ...convertNode(rootNode), root: true },
        direction,
        theme: VIZLY_HYPER_THEME,
    };
}

/** Convert mind-elixir NodeObj back to a simple markdown-like string for AI */
export function nodeObjToMarkdown(node: NodeObj, depth = 0): string {
    const indent = '  '.repeat(depth);
    const prefix = depth === 0 ? '# ' : indent + '- ';
    const lines = [prefix + node.topic];
    for (const child of node.children ?? []) {
        lines.push(nodeObjToMarkdown(child, depth + 1));
    }
    return lines.join('\n');
}
