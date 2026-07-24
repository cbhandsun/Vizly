import type { NodeObj } from 'mind-elixir';

export const setMindMapTreeExpanded = (node: NodeObj, expanded: boolean): NodeObj => ({
    ...node,
    expanded,
    children: (node.children ?? []).map((child) => setMindMapTreeExpanded(child, expanded)),
});
