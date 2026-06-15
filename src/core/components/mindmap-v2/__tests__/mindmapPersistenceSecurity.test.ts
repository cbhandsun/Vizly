import { describe, expect, it } from 'vitest';
import { createSafeMindMapV2Payload } from '../mindmapPersistenceSecurity';

describe('mindmapPersistenceSecurity', () => {
    it('sanitizes mindmap v2 payloads before persistence', () => {
        const payload = createSafeMindMapV2Payload({
            direction: 99,
            nodeData: {
                id: 'root',
                topic: 'Root',
                constructor: { polluted: true },
                children: [{
                    id: '<bad>',
                    topic: 'Child',
                    hyperLink: 'javascript:alert(1)',
                    image: { url: 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+', width: 9999, height: -1 },
                }],
            },
        }, 'indigo');

        expect(payload._version).toBe('mindmap-v2');
        expect(payload.direction).toBe(3);
        expect(payload.themeKey).toBe('indigo');
        expect(payload.nodeData.id).toBe('root');
        expect(payload.nodeData.children?.[0].id).toMatch(/^ai_/);
        expect(payload.nodeData.children?.[0].hyperLink).toBeUndefined();
        expect(payload.nodeData.children?.[0].image).toBeUndefined();
        expect(Object.hasOwn(payload.nodeData, 'constructor')).toBe(false);
        expect(Object.prototype).not.toHaveProperty('polluted');
    });

    it('uses fallback direction when missing', () => {
        const payload = createSafeMindMapV2Payload({
            nodeData: { id: 'root', topic: 'Root', children: [] },
        }, 'dark', 1);

        expect(payload.direction).toBe(1);
    });
});
