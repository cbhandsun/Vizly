import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    coerceMinimapOffset,
    MINIMAP_MINIMIZED_STORAGE_KEY,
    MINIMAP_OFFSET_STORAGE_KEY,
    MINIMAP_SIZE_STORAGE_KEY,
    readMinimapMinimized,
    readMinimapOffset,
    readMinimapSize,
    writeMinimapMinimized,
    writeMinimapOffset,
    writeMinimapSize,
} from '../minimapOverlayStorage';

describe('minimapOverlayStorage', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('coerces offsets to finite bounded integers', () => {
        expect(coerceMinimapOffset({ left: 10.4, bottom: 20.6 })).toEqual({ left: 10, bottom: 21 });
        expect(coerceMinimapOffset({ left: -1, bottom: 20 }, { left: 1, bottom: 2 })).toEqual({ left: 1, bottom: 2 });
        expect(coerceMinimapOffset({ left: Number.POSITIVE_INFINITY, bottom: 20 }, { left: 1, bottom: 2 })).toEqual({ left: 1, bottom: 2 });
        expect(coerceMinimapOffset({ left: 1_000_001, bottom: 20 }, { left: 1, bottom: 2 })).toEqual({ left: 1, bottom: 2 });
        expect(coerceMinimapOffset(null, { left: 1, bottom: 2 })).toEqual({ left: 1, bottom: 2 });
    });

    it('reads minimized and size values defensively', () => {
        expect(readMinimapMinimized()).toBe(false);
        localStorage.setItem(MINIMAP_MINIMIZED_STORAGE_KEY, 'true');
        expect(readMinimapMinimized()).toBe(true);

        expect(readMinimapSize('medium')).toBe('medium');
        localStorage.setItem(MINIMAP_SIZE_STORAGE_KEY, 'small');
        expect(readMinimapSize('medium')).toBe('small');
        localStorage.setItem(MINIMAP_SIZE_STORAGE_KEY, 'huge');
        expect(readMinimapSize('medium')).toBe('medium');
    });

    it('reads malformed offsets with fallback', () => {
        localStorage.setItem(MINIMAP_OFFSET_STORAGE_KEY, '{broken');
        expect(readMinimapOffset({ left: 3, bottom: 4 })).toEqual({ left: 3, bottom: 4 });

        localStorage.setItem(MINIMAP_OFFSET_STORAGE_KEY, JSON.stringify({ left: 10, bottom: '20' }));
        expect(readMinimapOffset({ left: 3, bottom: 4 })).toEqual({ left: 3, bottom: 4 });
    });

    it('writes normalized minimap state', () => {
        writeMinimapMinimized(true);
        writeMinimapSize('large');
        const offset = writeMinimapOffset({ left: 12.2, bottom: 34.8 });

        expect(localStorage.getItem(MINIMAP_MINIMIZED_STORAGE_KEY)).toBe('true');
        expect(localStorage.getItem(MINIMAP_SIZE_STORAGE_KEY)).toBe('large');
        expect(offset).toEqual({ left: 12, bottom: 35 });
        expect(JSON.parse(localStorage.getItem(MINIMAP_OFFSET_STORAGE_KEY) || '{}')).toEqual({ left: 12, bottom: 35 });
    });
});
