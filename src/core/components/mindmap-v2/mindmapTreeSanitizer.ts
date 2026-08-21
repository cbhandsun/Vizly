import type { MindElixirData, MindElixirInstance, NodeObj } from 'mind-elixir';
import i18n from 'i18next';
import { toSafeExternalUrl, toSafeImageUrl } from '../../utils/sanitizeHtml';
import {
    coerceMindMapGeneratedTopicKey,
    markMindMapTopicAsGenerated,
    MINDMAP_GENERATED_TOPIC_FIELD,
    MINDMAP_GENERATED_TOPIC_KEYS,
    resolveMindMapGeneratedTopic,
    type MindMapGeneratedTopicKey,
} from './mindMapGeneratedTopicLocalization';

export const MINDMAP_MAX_NODES = 500;
export const MINDMAP_MAX_DEPTH = 12;
export const MINDMAP_MAX_CHILDREN_PER_NODE = 80;
export const MINDMAP_MAX_TOPIC_LENGTH = 200;
export const MINDMAP_MAX_NOTE_LENGTH = 4000;
export const MINDMAP_MAX_TAGS = 20;
export const MINDMAP_MAX_TAG_LENGTH = 80;
export const MINDMAP_MAX_ICON_LENGTH = 80;
const SAFE_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const SHAPE_CLASSES = new Set(['oval', 'rect', 'underline', 'diamond']);
const DEFAULT_BOUNDARY_COLOR = '#818cf8';
const DEFAULT_BOUNDARY_TITLE = '分组';
const MIN_IMAGE_DIMENSION = 1;
const MAX_IMAGE_DIMENSION = 2048;
const FALLBACK_UNTITLED_TOPIC = 'Untitled node';
const LEGACY_UNTITLED_TOPIC = '(无标题)';
const UNTITLED_TOPIC_KEY = 'plugins.mindmap.untitledNode';

interface CleanContext {
    count: number;
}

type VizlyNodeObj = NodeObj & {
    branchColor?: string;
    branchWidth?: number;
    boundary?: { color: string; title: string };
    shapeClass?: string;
    [MINDMAP_GENERATED_TOPIC_FIELD]?: MindMapGeneratedTopicKey;
};

export type SanitizedMindMapData = Omit<MindElixirData, 'direction'> & {
    direction?: 0 | 1 | 2 | 3;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const boundedText = (value: unknown, fallback: string, maxLength: number): string => {
    const text = typeof value === 'string' || typeof value === 'number'
        ? String(value).trim()
        : '';
    return (text || fallback).slice(0, maxLength);
};

const boundedStringArray = (value: unknown, maxItems: number, maxLength: number): string[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const cleaned = value
        .slice(0, maxItems)
        .map(item => boundedText(item, '', maxLength))
        .filter(Boolean);
    return cleaned.length > 0 ? cleaned : undefined;
};

export const resolveMindMapUntitledTopic = (): string => {
    const localized = i18n.isInitialized ? i18n.t(UNTITLED_TOPIC_KEY) : '';
    const safeLocalized = localized === UNTITLED_TOPIC_KEY ? '' : localized;
    return boundedText(safeLocalized, FALLBACK_UNTITLED_TOPIC, MINDMAP_MAX_TOPIC_LENGTH);
};

export const cleanMindMapTopic = (value: unknown, fallback?: string): string => (
    boundedText(value, fallback ?? resolveMindMapUntitledTopic(), MINDMAP_MAX_TOPIC_LENGTH)
);

export const cleanMindMapNote = (value: unknown): string | undefined => {
    if (value === undefined || value === null) return undefined;
    const text = boundedText(value, '', MINDMAP_MAX_NOTE_LENGTH);
    return text || undefined;
};

export const cleanMindMapTags = (value: unknown): string[] | undefined => (
    boundedStringArray(value, MINDMAP_MAX_TAGS, MINDMAP_MAX_TAG_LENGTH)
);

export const cleanMindMapIcons = (value: unknown): string[] | undefined => (
    boundedStringArray(value, MINDMAP_MAX_TAGS, MINDMAP_MAX_ICON_LENGTH)
);

export function cleanMindMapColor(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const text = value.trim();
    return SAFE_COLOR_RE.test(text) ? text : undefined;
}

export function cleanMindMapShapeClass(value: unknown): string | undefined {
    return typeof value === 'string' && SHAPE_CLASSES.has(value) ? value : undefined;
}

export function cleanMindMapBranchWidth(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return undefined;
    const clamped = Math.max(0, Math.min(12, Math.trunc(numeric)));
    return clamped === 0 ? undefined : clamped;
}

export function cleanMindMapFontSize(value: unknown): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const numeric = typeof value === 'number'
        ? value
        : Number(String(value).replace(/px|pt/gi, '').trim());
    if (!Number.isFinite(numeric)) return undefined;
    return `${Math.max(10, Math.min(48, Math.trunc(numeric)))}px`;
}

function cleanMindMapStyle(value: unknown): Record<string, string> | undefined {
    if (!isRecord(value)) return undefined;
    const style: Record<string, string> = {};
    const color = cleanMindMapColor(value.color);
    const background = cleanMindMapColor(value.background);
    const fontSize = cleanMindMapFontSize(value.fontSize);
    if (color) style.color = color;
    if (background) style.background = background;
    if (fontSize) style.fontSize = fontSize;
    return Object.keys(style).length ? style : undefined;
}

function cleanImageDimension(value: unknown, fallback: number): number {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(MIN_IMAGE_DIMENSION, Math.min(MAX_IMAGE_DIMENSION, Math.trunc(numeric)));
}

function cleanMindMapImage(value: unknown): { url: string; width: number; height: number; fit: 'cover' | 'contain' } | undefined {
    if (!isRecord(value) || typeof value.url !== 'string') return undefined;
    const safeUrl = toSafeImageUrl(value.url);
    if (!safeUrl) return undefined;
    return {
        url: safeUrl,
        width: cleanImageDimension(value.width, 160),
        height: cleanImageDimension(value.height, 100),
        fit: value.fit === 'cover' ? 'cover' : 'contain',
    };
}

function cleanMindMapBoundary(value: unknown): { color: string; title: string } | undefined {
    if (!isRecord(value)) return undefined;
    return {
        color: cleanMindMapColor(value.color) ?? DEFAULT_BOUNDARY_COLOR,
        title: cleanMindMapTopic(value.title, DEFAULT_BOUNDARY_TITLE),
    };
}

const makeNodeId = (value: unknown, isRoot: boolean): string => {
    if (isRoot) return 'root';
    const text = boundedText(value, '', 120);
    if (/^[A-Za-z0-9_.:-]+$/.test(text)) return text;
    return `ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
};

export function cleanAndValidateTree(
    node: unknown,
    isRoot = false,
    depth = 0,
    ctx: CleanContext = { count: 0 }
): NodeObj {
    if (depth > MINDMAP_MAX_DEPTH) {
        throw new Error('Mind map tree is too deep.');
    }
    if (ctx.count >= MINDMAP_MAX_NODES) {
        throw new Error('Mind map tree has too many nodes.');
    }
    ctx.count += 1;

    const input = isRecord(node) ? node : {};
    const id = makeNodeId(input.id, isRoot);
    const children = Array.isArray(input.children) ? input.children : [];
    const generatedTopicKey = coerceMindMapGeneratedTopicKey(
        input[MINDMAP_GENERATED_TOPIC_FIELD],
    ) ?? (
        input.topic === LEGACY_UNTITLED_TOPIC
        || input.topic === undefined
        || input.topic === null
        || (typeof input.topic === 'string' && input.topic.trim() === '')
            ? MINDMAP_GENERATED_TOPIC_KEYS.untitled
            : undefined
    );
    const clean: VizlyNodeObj = {
        id,
        topic: generatedTopicKey
            ? cleanMindMapTopic(resolveMindMapGeneratedTopic(generatedTopicKey))
            : cleanMindMapTopic(input.topic),
        expanded: isRoot ? true : (input.expanded !== false),
        children: children
            .slice(0, MINDMAP_MAX_CHILDREN_PER_NODE)
            .map((child) => cleanAndValidateTree(child, false, depth + 1, ctx)),
    };
    if (generatedTopicKey) markMindMapTopicAsGenerated(clean, generatedTopicKey);
    if (input.direction === 0 || input.direction === 1) {
        clean.direction = input.direction;
    }
    if (input.note) clean.note = cleanMindMapNote(input.note);
    if (input.hyperLink) {
        const safeUrl = toSafeExternalUrl(String(input.hyperLink));
        if (safeUrl) clean.hyperLink = safeUrl;
    }
    const icons = cleanMindMapIcons(input.icons)
        || boundedStringArray(input.icon ? [input.icon] : undefined, 1, MINDMAP_MAX_ICON_LENGTH);
    if (icons) {
        clean.icons = icons;
    }
    const tags = cleanMindMapTags(input.tags);
    if (tags) {
        clean.tags = tags;
    }
    const style = cleanMindMapStyle(input.style);
    if (style) clean.style = style;
    const branchColor = cleanMindMapColor(input.branchColor);
    if (branchColor) clean.branchColor = branchColor;
    const shapeClass = cleanMindMapShapeClass(input.shapeClass);
    if (shapeClass) clean.shapeClass = shapeClass;
    const branchWidth = cleanMindMapBranchWidth(input.branchWidth);
    if (branchWidth) clean.branchWidth = branchWidth;
    const image = cleanMindMapImage(input.image);
    if (image) clean.image = image;
    const boundary = cleanMindMapBoundary(input.boundary);
    if (boundary) clean.boundary = boundary;
    return clean;
}

export const cleanMindMapData = (value: unknown): SanitizedMindMapData => {
    const record = isRecord(value) ? value : {};
    const rawNode = record.nodeData ?? value;
    const cleaned = cleanAndValidateTree(rawNode, true);
    const direction = typeof record.direction === 'number' && Number.isFinite(record.direction)
        ? Math.max(0, Math.min(3, Math.trunc(record.direction))) as 0 | 1 | 2 | 3
        : undefined;
    return direction === undefined ? { nodeData: cleaned } : { nodeData: cleaned, direction };
};

/**
 * Mind Elixir exposes LEFT=3 at runtime, while its current MindElixirData
 * declaration only lists 0..2. Keep the compatibility cast at this adapter.
 */
export const refreshMindElixirWithSanitizedData = (
    mind: MindElixirInstance,
    data: SanitizedMindMapData,
): void => {
    mind.refresh(data as MindElixirData);
};
