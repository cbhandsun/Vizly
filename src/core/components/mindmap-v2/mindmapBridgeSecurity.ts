import type { NodeObj } from 'mind-elixir';
import i18n from 'i18next';
import { cleanAndValidateTree, cleanMindMapTopic } from './mindmapTreeSanitizer';

export interface MindMapBridgeNodeArgs {
    label?: unknown;
    side?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export function cleanMindMapBridgeSide(value: unknown): 'left' | 'right' | undefined {
    return value === 'left' || value === 'right' ? value : undefined;
}

export function createSafeMindMapNodeId(prefix = 'node'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
}

export function cleanMindMapChildNode(args: unknown = {}, id = createSafeMindMapNodeId()): NodeObj {
    const input: MindMapBridgeNodeArgs = isRecord(args) ? args : {};
    const localizedDefaultTopic = cleanMindMapTopic(
        i18n.t('plugins.mindmap.newNode'),
        'New node',
    );
    const node: NodeObj = {
        id,
        topic: cleanMindMapTopic(input.label, localizedDefaultTopic),
        children: [],
    };
    const clean = cleanAndValidateTree(node, false) as NodeObj & { side?: 'left' | 'right' };
    const side = cleanMindMapBridgeSide(input.side);
    if (side) clean.side = side;
    return clean;
}

export const cleanMindMapBridgeNode = cleanMindMapChildNode;
