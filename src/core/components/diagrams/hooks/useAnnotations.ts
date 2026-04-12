import { useState, useCallback, useEffect, useRef } from 'react';

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

const ANNOTATION_COLORS = [
    '#facc15', // yellow (default)
    '#f87171', // red
    '#60a5fa', // blue
    '#34d399', // green
    '#c084fc', // purple
    '#fb923c', // orange
];

const loadAnnotations = (): Annotation[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
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
    const annotationsRef = useRef(annotations);
    annotationsRef.current = annotations;

    // 持久化
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
    }, [annotations]);

    const addAnnotation = useCallback((x: number, y: number, text: string = '', color?: string) => {
        const annotation: Annotation = {
            id: `ann-${Date.now()}`,
            text,
            x,
            y,
            color: color || ANNOTATION_COLORS[0],
            resolved: false,
            createdAt: Date.now(),
        };
        setAnnotations(prev => [...prev, annotation]);
        return annotation;
    }, []);

    const updateAnnotation = useCallback((id: string, updates: Partial<Pick<Annotation, 'text' | 'color' | 'x' | 'y'>>) => {
        setAnnotations(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
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
