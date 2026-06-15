import type { NodeObj, TagObj } from 'mind-elixir';
import {
    cleanMindMapBranchWidth,
    cleanMindMapColor,
    cleanMindMapFontSize,
    cleanMindMapIcons,
    cleanMindMapNote,
    cleanMindMapShapeClass,
    cleanMindMapTags,
    cleanMindMapTopic,
    MINDMAP_MAX_TAGS,
} from './mindmapTreeSanitizer';
import { toSafeExternalUrl, toSafeImageUrl } from '../../utils/sanitizeHtml';
import { getTaskMeta, type MindMapTaskMeta, type TaskNode } from './mindmapTaskModel';

const DEFAULT_BOUNDARY_COLOR = '#818cf8';
const DEFAULT_BOUNDARY_TITLE = '分组';

export {
    cleanMindMapBranchWidth,
    cleanMindMapColor,
    cleanMindMapFontSize,
    cleanMindMapShapeClass,
} from './mindmapTreeSanitizer';

export function cleanMindMapTagObjects(value: unknown): TagObj[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const tags = value.slice(0, MINDMAP_MAX_TAGS).flatMap((tag): TagObj[] => {
        const text = cleanMindMapTags([(
            typeof tag === 'string'
                ? tag
                : tag && typeof tag === 'object' && 'text' in tag
                    ? (tag as { text?: unknown }).text
                    : ''
        )])?.[0];
        if (!text) return [];

        const style = tag && typeof tag === 'object' ? (tag as { style?: Record<string, unknown> }).style : undefined;
        const cleanStyle: Record<string, string> = {};
        const background = cleanMindMapColor(style?.background);
        const color = cleanMindMapColor(style?.color);
        const borderColor = cleanMindMapColor(style?.borderColor);
        if (background) cleanStyle.background = background;
        if (color) cleanStyle.color = color;
        if (borderColor) cleanStyle.borderColor = borderColor;
        return [Object.keys(cleanStyle).length ? { text, style: cleanStyle } : { text }];
    });

    return tags.length ? tags : undefined;
}

function cleanMindMapBoundary(value: unknown): { color: string; title: string } | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const input = value as Record<string, unknown>;
    return {
        color: cleanMindMapColor(input.color) ?? DEFAULT_BOUNDARY_COLOR,
        title: cleanMindMapTopic(input.title, DEFAULT_BOUNDARY_TITLE),
    };
}

function cleanMindMapTask(value: unknown): MindMapTaskMeta | undefined {
    if (!value || typeof value !== 'object') return undefined;
    return getTaskMeta({ id: 'task', topic: 'task', task: value } as TaskNode);
}

export function cleanMindMapNodePatch(patch: Partial<NodeObj> & Record<string, unknown>): Partial<NodeObj> & Record<string, unknown> {
    const clean: Partial<NodeObj> & Record<string, unknown> = {};

    if ('topic' in patch) clean.topic = cleanMindMapTopic(patch.topic);
    if ('note' in patch) clean.note = cleanMindMapNote(patch.note);
    if ('hyperLink' in patch) clean.hyperLink = typeof patch.hyperLink === 'string'
        ? toSafeExternalUrl(patch.hyperLink) ?? undefined
        : undefined;
    if ('icons' in patch) clean.icons = cleanMindMapIcons(patch.icons);
    if ('tags' in patch) clean.tags = cleanMindMapTagObjects(patch.tags);

    if ('style' in patch && patch.style && typeof patch.style === 'object') {
        const input = patch.style as Record<string, unknown>;
        const style: Record<string, string> = {};
        const color = cleanMindMapColor(input.color);
        const background = cleanMindMapColor(input.background);
        const fontSize = cleanMindMapFontSize(input.fontSize);
        if (color) style.color = color;
        if (background) style.background = background;
        if (fontSize) style.fontSize = fontSize;
        clean.style = Object.keys(style).length ? style : undefined;
    }

    if ('branchColor' in patch) clean.branchColor = cleanMindMapColor(patch.branchColor);
    if ('shapeClass' in patch) clean.shapeClass = cleanMindMapShapeClass(patch.shapeClass);
    if ('branchWidth' in patch) clean.branchWidth = cleanMindMapBranchWidth(patch.branchWidth);
    if ('boundary' in patch) clean.boundary = cleanMindMapBoundary(patch.boundary);
    if ('task' in patch) clean.task = cleanMindMapTask(patch.task);
    if ('image' in patch) {
        const image = patch.image as { url?: unknown; width?: unknown; height?: unknown; fit?: unknown } | undefined;
        const safeUrl = typeof image?.url === 'string' ? toSafeImageUrl(image.url) : null;
        clean.image = safeUrl ? {
            url: safeUrl,
            width: 160,
            height: 100,
            fit: image?.fit === 'cover' ? 'cover' : 'contain',
        } : undefined;
    }

    return clean;
}
