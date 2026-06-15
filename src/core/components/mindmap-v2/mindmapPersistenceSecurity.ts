import type { VizlyMindMapV2Data } from './types';
import { cleanMindMapData } from './mindmapTreeSanitizer';

function cleanDirection(value: unknown, fallback: 0 | 1 | 2 | 3): 0 | 1 | 2 | 3 {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(0, Math.min(3, Math.trunc(numeric))) as 0 | 1 | 2 | 3;
}

export function createSafeMindMapV2Payload(
    data: unknown,
    themeKey: string,
    fallbackDirection: 0 | 1 | 2 | 3 = 2
): VizlyMindMapV2Data {
    const cleaned = cleanMindMapData(data);
    return {
        _version: 'mindmap-v2',
        nodeData: cleaned.nodeData,
        direction: cleanDirection(cleaned.direction, fallbackDirection),
        themeKey,
    };
}
