import { describe, expect, it } from 'vitest';

import {
    parseDiagramExportEventDetail,
    parseDiagramExportProgressEventDetail,
} from '../diagramExportEvent';

describe('diagram export event parsing', () => {
    it('parses a valid lifecycle event', () => {
        expect(parseDiagramExportEventDetail({
            diagramId: ' diagram-1 ',
            type: 'svg',
        })).toEqual({ diagramId: 'diagram-1', type: 'svg' });
    });

    it('rejects empty, malformed, and unsupported lifecycle events', () => {
        expect(parseDiagramExportEventDetail(null)).toBeNull();
        expect(parseDiagramExportEventDetail({ type: 'zip' })).toBeNull();
        expect(parseDiagramExportEventDetail({ type: 42 })).toBeNull();
    });

    it('coerces progress into a safe range', () => {
        expect(parseDiagramExportProgressEventDetail({
            diagramId: 'diagram-1',
            type: 'gif',
            progress: 9,
        })?.progress).toBe(1);
        expect(parseDiagramExportProgressEventDetail({
            type: 'gif',
            progress: -1,
        })?.progress).toBe(0);
    });

    it('rejects non-finite, wrong-type, and object-shaped progress', () => {
        expect(parseDiagramExportProgressEventDetail({ type: 'gif', progress: Number.NaN })).toBeNull();
        expect(parseDiagramExportProgressEventDetail({ type: 'gif', progress: Number.POSITIVE_INFINITY })).toBeNull();
        expect(parseDiagramExportProgressEventDetail({ type: 'png', progress: 0.5 })).toBeNull();
        expect(parseDiagramExportProgressEventDetail({ type: 'gif', progress: { value: 0.5 } })).toBeNull();
    });

    it('bounds untrusted diagram ids', () => {
        const detail = parseDiagramExportEventDetail({
            diagramId: 'x'.repeat(1000),
            type: 'png',
        });
        expect(detail?.diagramId).toHaveLength(256);
    });
});
