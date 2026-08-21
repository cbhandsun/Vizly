// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import {
    VIEWPORT_SESSION_STORAGE_PREFIX,
    buildViewportSessionStorageKey,
    parsePersistedDiagramViewport,
    readPersistedDiagramViewport,
    writePersistedDiagramViewport,
} from '../viewportPersistence';

describe('viewportPersistence', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    it('round-trips a viewport within a diagram and page scope', () => {
        const viewport = { x: -120, y: 44, zoom: 1 };

        expect(writePersistedDiagramViewport(sessionStorage, 'diagram-a:page-1', viewport)).toBe(true);
        expect(readPersistedDiagramViewport(sessionStorage, 'diagram-a:page-1')).toEqual(viewport);
        expect(sessionStorage.key(0)).toBe(
            `${VIEWPORT_SESSION_STORAGE_PREFIX}diagram-a%3Apage-1`,
        );
    });

    it.each([null, undefined, '', '   ', 'x'.repeat(181)])(
        'rejects an invalid persistence scope (%j)',
        (scope) => {
            expect(buildViewportSessionStorageKey(scope)).toBeNull();
            expect(writePersistedDiagramViewport(
                sessionStorage,
                scope,
                { x: 0, y: 0, zoom: 1 },
            )).toBe(false);
        },
    );

    it.each([
        null,
        '{}',
        '[]',
        '{bad json',
        JSON.stringify({ x: 0, y: 0, zoom: 0 }),
        JSON.stringify({ x: Number.MAX_VALUE, y: 0, zoom: 1 }),
        JSON.stringify({ x: 0, y: 0, zoom: 9 }),
        'x'.repeat(257),
    ])('rejects empty, malformed, extreme, or oversized viewport data', (raw) => {
        expect(parsePersistedDiagramViewport(raw)).toBeNull();
    });

    it('encodes scope delimiters instead of allowing storage-key injection', () => {
        expect(buildViewportSessionStorageKey('diagram\nother:key')).toBe(
            `${VIEWPORT_SESSION_STORAGE_PREFIX}diagram%0Aother%3Akey`,
        );
    });

    it('surfaces storage failures to the caller boundary', () => {
        expect(() => readPersistedDiagramViewport({
            getItem: () => { throw new Error('blocked'); },
        }, 'diagram-a:page-1')).toThrow('blocked');
        expect(() => writePersistedDiagramViewport({
            setItem: () => { throw new Error('quota'); },
        }, 'diagram-a:page-1', { x: 0, y: 0, zoom: 1 })).toThrow('quota');
    });
});
