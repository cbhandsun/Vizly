import { describe, expect, it } from 'vitest';
import {
    buildDiagramHashRoute,
    getDiagramViewerRouteParam,
    getParamFromSearchOrHash,
    setDiagramSearchParam,
} from '../diagramViewerLocation';

const makeLocation = (overrides: Partial<Location> = {}) => ({
    search: '',
    hash: '',
    ...overrides,
} as Location);

describe('diagramViewerLocation', () => {
    it('reads params from search before falling back to hash', () => {
        const location = makeLocation({
            search: '?diagram=flowchart&room=team-a',
            hash: '#/?diagram=hash-diagram&room=hash-room',
        });

        expect(getParamFromSearchOrHash(location, 'diagram')).toBe('flowchart');
        expect(getParamFromSearchOrHash(location, 'room')).toBe('team-a');
    });

    it('reads params from hash when search params are absent', () => {
        const location = makeLocation({
            hash: '#/?diagram=hash-diagram&room=hash-room&view=full',
        });

        expect(getParamFromSearchOrHash(location, 'diagram')).toBe('hash-diagram');
        expect(getParamFromSearchOrHash(location, 'room')).toBe('hash-room');
        expect(getParamFromSearchOrHash(location, 'missing')).toBeNull();
    });

    it('prefers router search params when resolving diagram viewer route params', () => {
        const searchParams = new URLSearchParams('diagram=router-diagram');
        const location = makeLocation({
            hash: '#/?diagram=hash-diagram',
        });

        expect(getDiagramViewerRouteParam(searchParams, location, 'diagram')).toBe('router-diagram');
        expect(getDiagramViewerRouteParam(new URLSearchParams(), location, 'diagram')).toBe('hash-diagram');
    });

    it('clones and updates diagram search params without mutating the original', () => {
        const original = new URLSearchParams('room=team-a&view=full');
        const next = setDiagramSearchParam(original, 'diagram-b');

        expect(next.toString()).toBe('room=team-a&view=full&diagram=diagram-b');
        expect(original.toString()).toBe('room=team-a&view=full');
    });

    it('builds encoded hash routes for reload navigation', () => {
        expect(buildDiagramHashRoute('diagram/a b')).toBe('#/?diagram=diagram%2Fa%20b');
    });
});
