import { describe, expect, it } from 'vitest';

import {
    CANVAS_SEARCH_RESULT_LABEL_MAX_LENGTH,
    formatCanvasSearchResultLabel,
} from '../canvasSearchAccessibility';

describe('canvasSearchAccessibility', () => {
    it('normalizes visible result text for concise assistive announcements', () => {
        expect(formatCanvasSearchResultLabel('  运输\n管理\u0000  ', 'node-1')).toBe('运输 管理');
    });

    it('falls back safely for empty and non-string labels', () => {
        expect(formatCanvasSearchResultLabel(null, 'edge-fee')).toBe('edge-fee');
        expect(formatCanvasSearchResultLabel('', '')).toBe('unknown');
    });

    it('bounds extreme imported labels', () => {
        expect(formatCanvasSearchResultLabel('x'.repeat(500), 'node-1'))
            .toHaveLength(CANVAS_SEARCH_RESULT_LABEL_MAX_LENGTH);
    });
});
