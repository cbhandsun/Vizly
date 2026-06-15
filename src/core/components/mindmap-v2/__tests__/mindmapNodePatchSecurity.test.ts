import { describe, expect, it } from 'vitest';
import {
    cleanMindMapBranchWidth,
    cleanMindMapColor,
    cleanMindMapNodePatch,
    cleanMindMapShapeClass,
    cleanMindMapTagObjects,
} from '../mindmapNodePatchSecurity';
import {
    MINDMAP_MAX_ICON_LENGTH,
    MINDMAP_MAX_NOTE_LENGTH,
    MINDMAP_MAX_TAGS,
    MINDMAP_MAX_TAG_LENGTH,
    MINDMAP_MAX_TOPIC_LENGTH,
} from '../mindmapTreeSanitizer';

describe('mindmapNodePatchSecurity', () => {
    it('sanitizes text, tags, icons, links, and images in node patches', () => {
        const patch = cleanMindMapNodePatch({
            topic: 't'.repeat(MINDMAP_MAX_TOPIC_LENGTH + 10),
            note: 'n'.repeat(MINDMAP_MAX_NOTE_LENGTH + 10),
            tags: Array.from({ length: MINDMAP_MAX_TAGS + 5 }, (_, index) => ({
                text: `tag-${index}-` + 'x'.repeat(MINDMAP_MAX_TAG_LENGTH),
                style: {
                    background: '#ffffff',
                    color: 'javascript:alert(1)',
                    borderColor: '#000',
                },
            })),
            icons: Array.from({ length: MINDMAP_MAX_TAGS + 5 }, (_, index) => (
                `icon-${index}-` + 'x'.repeat(MINDMAP_MAX_ICON_LENGTH)
            )),
            hyperLink: 'javascript:alert(1)',
            image: { url: 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+', width: 9999, height: 9999 },
        });

        expect(patch.topic).toHaveLength(MINDMAP_MAX_TOPIC_LENGTH);
        expect(patch.note).toHaveLength(MINDMAP_MAX_NOTE_LENGTH);
        expect(patch.tags).toHaveLength(MINDMAP_MAX_TAGS);
        expect(patch.tags?.[0]?.text).toHaveLength(MINDMAP_MAX_TAG_LENGTH);
        expect(patch.tags?.[0]?.style).toEqual({ background: '#ffffff', borderColor: '#000' });
        expect(patch.icons).toHaveLength(MINDMAP_MAX_TAGS);
        expect(patch.icons?.[0]).toHaveLength(MINDMAP_MAX_ICON_LENGTH);
        expect(patch.hyperLink).toBeUndefined();
        expect(patch.image).toBeUndefined();
    });

    it('sanitizes style, shape, and branch width patches', () => {
        const patch = cleanMindMapNodePatch({
            style: {
                color: '#123456',
                background: 'url(javascript:alert(1))',
                fontSize: '999px',
            },
            branchColor: 'rgb(1,2,3)',
            shapeClass: 'script',
            branchWidth: 999,
        });

        expect(patch.style).toEqual({ color: '#123456', fontSize: '48px' });
        expect(patch.branchColor).toBeUndefined();
        expect(patch.shapeClass).toBeUndefined();
        expect(patch.branchWidth).toBe(12);
        expect(cleanMindMapShapeClass('diamond')).toBe('diamond');
        expect(cleanMindMapBranchWidth(-1)).toBeUndefined();
        expect(cleanMindMapColor('#abc')).toBe('#abc');
    });

    it('sanitizes boundary patches and preserves clear operations', () => {
        const patch = cleanMindMapNodePatch({
            branchColor: undefined,
            shapeClass: undefined,
            note: undefined,
            boundary: {
                color: 'url(javascript:alert(1))',
                title: 'g'.repeat(MINDMAP_MAX_TOPIC_LENGTH + 5),
            },
        });

        expect(Object.prototype.hasOwnProperty.call(patch, 'branchColor')).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(patch, 'shapeClass')).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(patch, 'note')).toBe(true);
        expect(patch.branchColor).toBeUndefined();
        expect(patch.shapeClass).toBeUndefined();
        expect(patch.note).toBeUndefined();
        expect(patch.boundary).toEqual({
            color: '#818cf8',
            title: 'g'.repeat(MINDMAP_MAX_TOPIC_LENGTH),
        });

        expect(cleanMindMapNodePatch({ boundary: undefined }).boundary).toBeUndefined();
    });

    it('sanitizes task metadata patches for kanban writes', () => {
        const patch = cleanMindMapNodePatch({
            task: {
                status: 'blocked',
                priority: 'urgent',
                assignee: 'a'.repeat(MINDMAP_MAX_TOPIC_LENGTH),
                dueDate: 'not-a-date',
                progress: 999,
            },
            tags: Array.from({ length: MINDMAP_MAX_TAGS + 5 }, (_, index) => `tag-${index}`),
        });

        expect(patch.task).toMatchObject({
            status: 'todo',
            priority: '无',
            dueDate: '',
            progress: 100,
        });
        expect((patch.task as any).assignee).toHaveLength(120);
        expect(patch.tags).toHaveLength(MINDMAP_MAX_TAGS);
    });

    it('returns bounded tag objects for property-panel state', () => {
        const tags = cleanMindMapTagObjects([
            { text: '风险', style: { background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5', position: 'fixed' } },
            { text: '风险' },
            { text: '' },
        ]);

        expect(tags).toEqual([
            { text: '风险', style: { background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' } },
            { text: '风险' },
        ]);
    });
});
