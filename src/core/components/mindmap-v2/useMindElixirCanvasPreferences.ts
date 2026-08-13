import { useCallback, useEffect, useState } from 'react';
import MindElixir from 'mind-elixir';
import type { MindElixirInstance } from 'mind-elixir';

import { emitVizlyMindMapOperation } from './mindmapOperationBridge';

export type MindMapBackgroundPattern = 'none' | 'grid' | 'dots';
export type MindMapDirectionKey = 'LR' | 'R' | 'L';

type MindMapDirectionSelection = {
    mind: MindElixirInstance;
    value: MindMapDirectionKey;
};

const BACKGROUND_STORAGE_KEY = 'vizly_mindmap_bg';
const DIRECTION_STORAGE_KEY = 'vizly_mindmap_dir';
const NUMBERING_STORAGE_KEY = 'vizly_mindmap_numbering';
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

export const coerceMindMapNumberingPreference = (value: unknown): boolean => value === 'enabled';

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

export const getLiveMindMapDirection = (mind: MindElixirInstance | null): MindMapDirectionKey | null => {
    if (!mind) return null;
    if (mind.direction === MindElixir.SIDE) return 'LR';
    if (mind.direction === MindElixir.RIGHT) return 'R';
    return 'L';
};

export const bindMindMapDirectionHistorySync = (
    mind: MindElixirInstance,
    onDirectionChange: (direction: MindMapDirectionKey) => void,
): (() => void) => {
    const syncDirection = () => {
        const direction = getLiveMindMapDirection(mind);
        if (direction) onDirectionChange(direction);
    };
    const syncCommittedDirection = () => {
        if (!mind.isFocusMode) syncDirection();
    };
    const originalRefresh = mind.refresh;
    const refreshWithDirection: MindElixirInstance['refresh'] = data => {
        const snapshotDirection = data?.direction;
        if (snapshotDirection === MindElixir.LEFT
            || snapshotDirection === MindElixir.RIGHT
            || snapshotDirection === MindElixir.SIDE) {
            // MindElixir history snapshots contain direction, but its native
            // refresh implementation does not restore that field.
            mind.direction = snapshotDirection;
            originalRefresh.call(mind, data);
            syncDirection();
            return;
        }
        originalRefresh.call(mind, data);
    };

    mind.bus.addListener('changeDirection', syncCommittedDirection);
    mind.refresh = refreshWithDirection;

    return () => {
        mind.bus.removeListener('changeDirection', syncCommittedDirection);
        if (mind.refresh === refreshWithDirection) mind.refresh = originalRefresh;
    };
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
    const [numberingEnabled, setNumberingEnabled] = useState(() =>
        coerceMindMapNumberingPreference(readStorage(NUMBERING_STORAGE_KEY))
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

    useEffect(() => {
        const root = document.getElementById('vizly-mind-elixir-root');
        if (!root) return;
        root.toggleAttribute('data-numbering', numberingEnabled);
    }, [mind, numberingEnabled]);

    useEffect(() => {
        if (!mind) return;
        return bindMindMapDirectionHistorySync(mind, direction => {
            setDirectionSelection({ mind, value: direction });
            writeStorage(DIRECTION_STORAGE_KEY, direction);
        });
    }, [mind]);

    const currentDirection = directionSelection?.mind === mind
        ? directionSelection.value
        : getLiveMindMapDirection(mind) ?? coerceMindMapDirectionKey(readStorage(DIRECTION_STORAGE_KEY));

    const changeDirection = useCallback((value: string) => {
        if (!mind) return;
        const previousDirection = getLiveMindMapDirection(mind);
        const direction = applyMindMapDirection(mind, value);
        setDirectionSelection({ mind, value: direction });
        writeStorage(DIRECTION_STORAGE_KEY, direction);
        if (previousDirection !== direction) {
            emitVizlyMindMapOperation(mind, {
                name: 'changeDirection',
                obj: mind.getData().nodeData,
            });
        }
    }, [mind]);

    const toggleNumbering = useCallback(() => {
        const next = !numberingEnabled;
        setNumberingEnabled(next);
        writeStorage(NUMBERING_STORAGE_KEY, next ? 'enabled' : 'disabled');
    }, [numberingEnabled]);

    return {
        backgroundPattern,
        applyBackgroundPattern,
        currentDirection,
        changeDirection,
        numberingEnabled,
        toggleNumbering,
    };
};
