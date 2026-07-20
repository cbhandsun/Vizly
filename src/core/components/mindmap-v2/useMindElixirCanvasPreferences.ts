import { useCallback, useEffect, useState } from 'react';
import MindElixir from 'mind-elixir';
import type { MindElixirInstance } from 'mind-elixir';

import { directionStringToInt } from './migrate';
import { coerceMindElixirDirection } from './mindElixirDirection';
import { cleanAndValidateTree } from './mindmapTreeSanitizer';

export type MindMapBackgroundPattern = 'none' | 'grid' | 'dots';
export type MindMapDirectionKey = 'LR' | 'R' | 'L';

const BACKGROUND_STORAGE_KEY = 'vizly_mindmap_bg';
const DIRECTION_STORAGE_KEY = 'vizly_mindmap_dir';
const BACKGROUND_PATTERNS = new Set<MindMapBackgroundPattern>(['none', 'grid', 'dots']);
const DIRECTION_KEYS = new Set<MindMapDirectionKey>(['LR', 'R', 'L']);

export const coerceMindMapBackgroundPattern = (value: unknown): MindMapBackgroundPattern =>
    typeof value === 'string' && BACKGROUND_PATTERNS.has(value as MindMapBackgroundPattern)
        ? value as MindMapBackgroundPattern
        : 'none';

export const coerceMindMapDirectionKey = (value: unknown): MindMapDirectionKey =>
    value === 'TB' || value === 'BT'
        ? 'L'
        : typeof value === 'string' && DIRECTION_KEYS.has(value as MindMapDirectionKey)
        ? value as MindMapDirectionKey
        : 'LR';

const readStorage = (key: string): string | null => {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    } catch {
        return null;
    }
};

const writeStorage = (key: string, value: string): void => {
    try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch {
        // Canvas preferences are optional and must not block editing.
    }
};

const getLiveDirection = (mind: MindElixirInstance | null): MindMapDirectionKey | null => {
    if (!mind) return null;
    if (mind.direction === MindElixir.SIDE) return 'LR';
    if (mind.direction === MindElixir.RIGHT) return 'R';
    return 'L';
};

export const useMindElixirCanvasPreferences = (mind: MindElixirInstance | null) => {
    const [backgroundPattern, setBackgroundPattern] = useState<MindMapBackgroundPattern>(() =>
        coerceMindMapBackgroundPattern(readStorage(BACKGROUND_STORAGE_KEY))
    );

    const applyBackgroundPattern = useCallback((value: MindMapBackgroundPattern) => {
        const pattern = coerceMindMapBackgroundPattern(value);
        setBackgroundPattern(pattern);
        writeStorage(BACKGROUND_STORAGE_KEY, pattern);
        document.getElementById('vizly-mind-elixir-root')?.setAttribute('data-bg', pattern);
    }, []);

    useEffect(() => {
        document.getElementById('vizly-mind-elixir-root')?.setAttribute('data-bg', backgroundPattern);
    }, [mind, backgroundPattern]);

    const currentDirection = getLiveDirection(mind)
        ?? coerceMindMapDirectionKey(readStorage(DIRECTION_STORAGE_KEY));

    const changeDirection = useCallback((value: string) => {
        if (!mind) return;
        const direction = coerceMindMapDirectionKey(value);
        const data = mind.getData();
        mind.refresh({
            ...data,
            nodeData: cleanAndValidateTree(data.nodeData, true),
            direction: coerceMindElixirDirection(directionStringToInt(direction)),
        });
        writeStorage(DIRECTION_STORAGE_KEY, direction);
    }, [mind]);

    return {
        backgroundPattern,
        applyBackgroundPattern,
        currentDirection,
        changeDirection,
    };
};
