import { useCallback, useEffect, useState } from 'react';
import MindElixir from 'mind-elixir';
import type { MindElixirInstance } from 'mind-elixir';

export type MindMapBackgroundPattern = 'none' | 'grid' | 'dots';
export type MindMapDirectionKey = 'LR' | 'R' | 'L';

type MindMapDirectionSelection = {
    mind: MindElixirInstance;
    value: MindMapDirectionKey;
};

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

export const applyMindMapDirection = (
    mind: MindElixirInstance,
    value: string,
): MindMapDirectionKey => {
    const direction = coerceMindMapDirectionKey(value);

    if (direction === 'LR') {
        mind.initSide();
    } else if (direction === 'R') {
        mind.initRight();
    } else {
        mind.initLeft();
    }

    return direction;
};

export const useMindElixirCanvasPreferences = (mind: MindElixirInstance | null) => {
    const [backgroundPattern, setBackgroundPattern] = useState<MindMapBackgroundPattern>(() =>
        coerceMindMapBackgroundPattern(readStorage(BACKGROUND_STORAGE_KEY))
    );
    const [directionSelection, setDirectionSelection] = useState<MindMapDirectionSelection | null>(null);

    const applyBackgroundPattern = useCallback((value: MindMapBackgroundPattern) => {
        const pattern = coerceMindMapBackgroundPattern(value);
        setBackgroundPattern(pattern);
        writeStorage(BACKGROUND_STORAGE_KEY, pattern);
        document.getElementById('vizly-mind-elixir-root')?.setAttribute('data-bg', pattern);
    }, []);

    useEffect(() => {
        document.getElementById('vizly-mind-elixir-root')?.setAttribute('data-bg', backgroundPattern);
    }, [mind, backgroundPattern]);

    const currentDirection = directionSelection?.mind === mind
        ? directionSelection.value
        : getLiveDirection(mind) ?? coerceMindMapDirectionKey(readStorage(DIRECTION_STORAGE_KEY));

    const changeDirection = useCallback((value: string) => {
        if (!mind) return;
        const direction = applyMindMapDirection(mind, value);
        setDirectionSelection({ mind, value: direction });
        writeStorage(DIRECTION_STORAGE_KEY, direction);
    }, [mind]);

    return {
        backgroundPattern,
        applyBackgroundPattern,
        currentDirection,
        changeDirection,
    };
};
