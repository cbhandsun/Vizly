import { describe, expect, it } from 'vitest';
import { templateToNodeObj } from '../mindmapTemplateModel';
import {
    MINDMAP_MAX_CHILDREN_PER_NODE,
    MINDMAP_MAX_TOPIC_LENGTH,
} from '../mindmapTreeSanitizer';

describe('MindMapTemplates', () => {
    it('sanitizes template subtrees before insertion or replacement', () => {
        const node = templateToNodeObj({
            topic: 't'.repeat(MINDMAP_MAX_TOPIC_LENGTH + 10),
            hyperLink: 'javascript:alert(1)',
            branchColor: 'url(javascript:alert(1))',
            children: Array.from({ length: MINDMAP_MAX_CHILDREN_PER_NODE + 5 }, (_, index) => ({
                topic: `child-${index}`,
            })),
        } as any);

        expect(node.id).not.toBe('root');
        expect(node.topic).toHaveLength(MINDMAP_MAX_TOPIC_LENGTH);
        expect(node.children).toHaveLength(MINDMAP_MAX_CHILDREN_PER_NODE);
        expect(node.children?.[0]?.id).not.toBe('root');
        expect(node.hyperLink).toBeUndefined();
        expect(node.branchColor).toBeUndefined();
    });
});
