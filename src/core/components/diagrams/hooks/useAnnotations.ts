import { useState, useCallback, useEffect } from 'react';
import { safeJsonParse } from '../../../utils/jsonUtils';

export interface Annotation {
    id: string;
    text: string;
    /** 画布坐标 X */
    x: number;
    /** 画布坐标 Y */
    y: number;
    /** 批注颜色 */
    color: string;
    /** 是否已解决 */
    resolved: boolean;
    /** 创建时间 */
    createdAt: number;
}

const STORAGE_KEY = 'diagram-annotations';
const MAX_ANNOTATIONS = 500;
const MAX_ANNOTATION_TEXT_LENGTH = 4000;
const MAX_ANNOTATION_ID_LENGTH = 120;
const MAX_COORDINATE_ABS = 1_000_000;

const ANNOTATION_COLORS = [
    '#facc15', // yellow (default)
    '#f87171', // red
    '#60a5fa', // blue
    '#34d399', // green
    '#c084fc', // purple
    '#fb923c', // orange
];

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const isFiniteCoordinate = (value: unknown): value is number => (
    typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE_ABS
);

const cleanText = (value: unknown, maxLength: number): string => (
    typeof value === 'string' || typeof value === 'number'
        ? String(value).slice(0, maxLength)
        : ''
);

const cleanColor = (value: unknown): string => (
    typeof value === 'string' && ANNOTATION_COLORS.includes(value)
        ? value
        : ANNOTATION_COLORS[0]
);

export function coerceAnnotations(value: unknown): Annotation[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const annotations: Annotation[] = [];

    for (const item of value.slice(0, MAX_ANNOTATIONS)) {
        if (!isRecord(item)) continue;
        const id = cleanText(item.id, MAX_ANNOTATION_ID_LENGTH).trim();
        if (!id || seen.has(id)) continue;
        if (!isFiniteCoordinate(item.x) || !isFiniteCoordinate(item.y)) continue;

        seen.add(id);
        annotations.push({
            id,
            text: cleanText(item.text, MAX_ANNOTATION_TEXT_LENGTH),
            x: item.x,
            y: item.y,
            color: cleanColor(item.color),
            resolved: item.resolved === true,
            createdAt: typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
                ? Math.max(0, Math.trunc(item.createdAt))
                : Date.now(),
        });
    }

    return annotations;
}

const loadAnnotations = (): Annotation[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return coerceAnnotations(safeJsonParse<unknown>(raw, []));
    } catch {
        return [];
    }
};

/**
 * 画布批注管理 Hook
 * - 添加 / 更新 / 删除 / 标记已解决
 * - localStorage 持久化
 */
export const useAnnotations = () => {
    const [annotations, setAnnotations] = useState<Annotation[]>(loadAnnotations);
    const [annotationMode, setAnnotationMode] = useState(false);

    // 持久化
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
    }, [annotations]);

    const addAnnotation = useCallback((x: number, y: number, text: string = '', color?: string) => {
        if (!isFiniteCoordinate(x) || !isFiniteCoordinate(y)) {
            throw new Error('Invalid annotation coordinates');
        }
        const annotation: Annotation = {
            id: `ann-${Date.now()}`,
            text: cleanText(text, MAX_ANNOTATION_TEXT_LENGTH),
            x,
            y,
            color: cleanColor(color),
            resolved: false,
            createdAt: Date.now(),
        };
        setAnnotations(prev => [...prev, annotation]);
        return annotation;
    }, []);

    const updateAnnotation = useCallback((id: string, updates: Partial<Pick<Annotation, 'text' | 'color' | 'x' | 'y'>>) => {
        setAnnotations(prev => prev.map(a => {
            if (a.id !== id) return a;
            const next = {
                ...a,
                ...(updates.text !== undefined ? { text: cleanText(updates.text, MAX_ANNOTATION_TEXT_LENGTH) } : {}),
                ...(updates.color !== undefined ? { color: cleanColor(updates.color) } : {}),
                ...(updates.x !== undefined && isFiniteCoordinate(updates.x) ? { x: updates.x } : {}),
                ...(updates.y !== undefined && isFiniteCoordinate(updates.y) ? { y: updates.y } : {}),
            };
            return next;
        }));
    }, []);

    const deleteAnnotation = useCallback((id: string) => {
        setAnnotations(prev => prev.filter(a => a.id !== id));
    }, []);

    const toggleResolved = useCallback((id: string) => {
        setAnnotations(prev => prev.map(a => a.id === id ? { ...a, resolved: !a.resolved } : a));
    }, []);

    return {
        annotations,
        annotationMode,
        setAnnotationMode,
        addAnnotation,
        updateAnnotation,
        deleteAnnotation,
        toggleResolved,
        ANNOTATION_COLORS,
    };
};
