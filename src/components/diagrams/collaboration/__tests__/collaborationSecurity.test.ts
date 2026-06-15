import { describe, expect, it } from 'vitest';
import {
    normalizeCollaborationDiagramId,
    normalizeCollaborationRoomName,
    normalizeCollaborationServerUrl,
    normalizeCollaborationToken,
} from '../collaborationSecurity';

describe('collaborationSecurity', () => {
    it('normalizes room and diagram identifiers to bounded URL-safe segments', () => {
        expect(normalizeCollaborationRoomName('team room&diagram=evil#fragment'))
            .toBe('team-room-diagram-evil-fragment');
        expect(normalizeCollaborationRoomName('../')).toBe('vizly-room-default');
        expect(normalizeCollaborationRoomName('a'.repeat(200))).toHaveLength(128);

        expect(normalizeCollaborationDiagramId('../bad diagram')).toBe('bad-diagram');
        expect(normalizeCollaborationDiagramId('')).toBe('domain-model');
    });

    it('allows secure remote websocket URLs and local development websocket URLs only', () => {
        expect(normalizeCollaborationServerUrl('wss://collab.example.test/ws'))
            .toBe('wss://collab.example.test/ws');
        expect(normalizeCollaborationServerUrl('ws://localhost:1234'))
            .toBe('ws://localhost:1234/');
        expect(normalizeCollaborationServerUrl('ws://127.0.0.1:1234/yjs'))
            .toBe('ws://127.0.0.1:1234/yjs');

        expect(normalizeCollaborationServerUrl('ws://collab.example.test/ws')).toBeNull();
        expect(normalizeCollaborationServerUrl('http://localhost:1234')).toBeNull();
        expect(normalizeCollaborationServerUrl('wss://user:pass@collab.example.test/ws')).toBeNull();
        expect(normalizeCollaborationServerUrl('wss://collab.example.test/ws?token=secret')).toBeNull();
        expect(normalizeCollaborationServerUrl('//collab.example.test/ws')).toBeNull();
    });

    it('keeps usable tokens but rejects blank, multiline, or oversized values', () => {
        expect(normalizeCollaborationToken('  jwt-token  ')).toBe('jwt-token');
        expect(normalizeCollaborationToken('')).toBeUndefined();
        expect(normalizeCollaborationToken('abc\nInjected: yes')).toBeUndefined();
        expect(normalizeCollaborationToken('x'.repeat(4097))).toBeUndefined();
    });
});
