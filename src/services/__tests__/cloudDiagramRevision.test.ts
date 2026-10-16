import { describe, expect, it } from 'vitest';
import { parseCloudDiagramRevision } from '../cloudDiagramRevision';

describe('cloud diagram revision', () => {
    it.each([
        '2026-10-08T10:12:02.605123+00:00', '2026-10-08 10:12:02.605123+00',
        '2026-10-08T10:12:02.605Z', '2024-02-29T23:59:59.999999-07:00',
        '0001-01-01T00:00:00Z', '9999-12-31T23:59:59+14:00',
    ])('preserves the exact revision %s', revision => {
        expect(parseCloudDiagramRevision(revision)).toBe(revision);
    });
    it.each([
        null, undefined, 0, {}, [], '', ' ', 'not-a-date', 'infinity',
        '2026-02-29T00:00:00Z', '1900-02-29T00:00:00Z', '2026-04-31T00:00:00Z',
        '2026-00-01T00:00:00Z', '2026-13-01T00:00:00Z', '2026-01-00T00:00:00Z',
        '2026-01-01T24:00:00Z', '2026-01-01T00:60:00Z', '2026-01-01T00:00:60Z',
        '2026-01-01T00:00:00.1234567Z', '2026-01-01T00:00:00+14:01',
        '2026-01-01T00:00:00+00:60', '2026-01-01T00:00:00+15:00',
        '0000-01-01T00:00:00Z', '2026-01-01', '2026-01-01T00:00:00Z\n',
        '2026-01-01T00:00:00Z<script>', 'x'.repeat(10000),
    ])('rejects invalid input without coercion: %j', input => {
        expect(parseCloudDiagramRevision(input)).toBeNull();
    });
});
