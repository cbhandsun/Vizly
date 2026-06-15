import type { NodeObj } from 'mind-elixir';
import { cleanAndValidateTree } from './mindmapTreeSanitizer';

export interface TemplateNode {
    topic: string;
    children?: TemplateNode[];
}

function buildTemplateNodeObj(t: TemplateNode, depth = 0): NodeObj {
    const id = `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${depth}`;
    return {
        id,
        topic: t.topic,
        children: (t.children ?? []).map((c, i) => ({
            ...buildTemplateNodeObj(c, depth + 1),
            id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${depth}_${i}`,
        })),
    } as NodeObj;
}

export function templateToNodeObj(t: TemplateNode): NodeObj {
    return cleanAndValidateTree(buildTemplateNodeObj(t), false);
}
