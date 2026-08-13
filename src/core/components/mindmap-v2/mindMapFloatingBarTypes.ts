import type { NodeObj } from 'mind-elixir';

export type MindMapFloatingBarNode = NodeObj & {
    boundary?: { color: string; title: string };
    shapeClass?: string;
};
