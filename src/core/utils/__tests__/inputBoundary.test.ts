import { describe, expect, it } from 'vitest';
import {
    coerceDiagramId,
    coerceShareToken,
    coerceSafeStringParam,
    getQueryParamFromSearch,
    getQueryOrHashParamFromLocation,
} from '../inputBoundary';

describe('inputBoundary', () => {
    it('coerces string params and trims unsafe chars', () => {
        expect(coerceSafeStringParam(123, 'fallback')).toBe('fallback');
        expect(coerceSafeStringParam('  abc  ', 'fallback')).toBe('abc');
        expect(coerceSafeStringParam('a\nb', 'fallback')).toBe('ab');
        expect(coerceSafeStringParam('x'.repeat(20), 'fallback', 8)).toBe('x'.repeat(8));
    });

    it('parses query param from search first then hash', () => {
        const location = {
            search: '?diagram=hash-me&room=search-room',
            hash: '#/?diagram=hash-diagram&room=hash-room',
        };
        expect(getQueryOrHashParamFromLocation(location, 'diagram')).toBe('hash-me');
        expect(getQueryOrHashParamFromLocation(location, 'room')).toBe('search-room');
    });

    it('falls back to hash when search is absent', () => {
        const location = {
            search: '',
            hash: '#/?diagram=hash-diagram&room=hash-room',
        };
        expect(getQueryOrHashParamFromLocation(location, 'diagram')).toBe('hash-diagram');
        expect(getQueryOrHashParamFromLocation(location, 'room')).toBe('hash-room');
        expect(getQueryOrHashParamFromLocation(location, 'missing')).toBeNull();
    });

    it('reads params safely from a raw search string', () => {
        expect(getQueryParamFromSearch('?fitRatio=1.2&themeDebug=1', 'fitRatio')).toBe('1.2');
        expect(getQueryParamFromSearch('?themeDebug=1', 'themeDebug')).toBe('1');
        expect(getQueryParamFromSearch('%E0%A4%A', 'fitRatio')).toBeNull();
    });

    it('coerces diagram IDs to a safe boundary format', () => {
        expect(coerceDiagramId('  demo-diagram-1  ')).toBe('demo-diagram-1');
        expect(coerceDiagramId('bad/id with spaces')).toBe('bad/id-with-spaces');
        expect(coerceDiagramId('@@@', 'fallback')).toBe('fallback');
    });

    it('validates share token shape', () => {
        expect(coerceShareToken('A1_-aA1_-aA1_-aA1_-a')).toBe('A1_-aA1_-aA1_-aA1_-a');
        expect(coerceShareToken('bad token with space')).toBeUndefined();
        expect(coerceShareToken('short')).toBeUndefined();
    });
});
