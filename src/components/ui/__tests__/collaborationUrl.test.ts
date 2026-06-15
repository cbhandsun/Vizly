import { describe, expect, it } from 'vitest';
import { buildCollaborationShareUrl } from '../collaborationUrl';

const makeLocation = (overrides: Partial<Location> = {}) => ({
    origin: 'https://vizly.example',
    pathname: '/app',
    search: '',
    hash: '',
    ...overrides,
} as Location);

describe('buildCollaborationShareUrl', () => {
    it('normalizes room names so special characters cannot inject query params', () => {
        const url = buildCollaborationShareUrl(
            makeLocation({ search: '?diagram=flowchart' }),
            'team room&diagram=evil#fragment'
        );

        expect(url).toBe('https://vizly.example/app?diagram=flowchart&room=team-room-diagram-evil-fragment');
        expect(new URL(url).searchParams.get('room')).toBe('team-room-diagram-evil-fragment');
        expect(new URL(url).searchParams.get('diagram')).toBe('flowchart');
    });

    it('reads diagram from hash route params when search params are absent', () => {
        const url = buildCollaborationShareUrl(
            makeLocation({ hash: '#/?diagram=wms-process&view=full' }),
            'vizly-room-wms'
        );

        expect(url).toBe('https://vizly.example/app?diagram=wms-process&room=vizly-room-wms');
    });

    it('falls back to a stable default diagram when no route param exists', () => {
        const url = buildCollaborationShareUrl(makeLocation(), 'room-a');

        expect(url).toBe('https://vizly.example/app?diagram=domain-model&room=room-a');
    });

    it('normalizes malformed diagram ids from route params', () => {
        const url = buildCollaborationShareUrl(
            makeLocation({ hash: '#/?diagram=../bad diagram&view=full' }),
            'room-a'
        );

        expect(url).toBe('https://vizly.example/app?diagram=bad-diagram&room=room-a');
    });
});
