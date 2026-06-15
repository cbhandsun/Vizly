import type { NodeObj } from 'mind-elixir';
import { cleanAndValidateTree, cleanMindMapTopic } from './mindmapTreeSanitizer';

export interface MindMapBridgeNodeArgs {
    label?: unknown;
    side?: unknown;
}

export function cleanMindMapBridgeSide(value: unknown): 'left' | 'right' | undefined {
    return value === 'left' || value === 'right' ? value : undefined;
}

export function createSafeMindMapNodeId(prefix = 'node'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
}

export function cleanMindMapChildNode(args: MindMapBridgeNodeArgs = {}, id = createSafeMindMapNodeId()): NodeObj {
    const node: NodeObj = {
        id,
        topic: cleanMindMapTopic(args.label, '新节点'),
        children: [],
    };
    const clean = cleanAndValidateTree(node, false) as NodeObj & { side?: 'left' | 'right' };
    const side = cleanMindMapBridgeSide(args.side);
    if (side) clean.side = side;
    return clean;
}

export const cleanMindMapBridgeNode = cleanMindMapChildNode;
