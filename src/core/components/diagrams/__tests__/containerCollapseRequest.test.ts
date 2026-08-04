// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
    CONTAINER_COLLAPSE_REQUEST_EVENT,
    dispatchContainerCollapseRequest,
    readContainerCollapseRequest,
} from '../containerCollapseRequest';

describe('containerCollapseRequest', () => {
    it('dispatches a scoped, validated container identifier', () => {
        const root = document.createElement('div');
        const button = document.createElement('button');
        root.appendChild(button);
        let received: string | null = null;
        root.addEventListener(CONTAINER_COLLAPSE_REQUEST_EVENT, event => {
            received = readContainerCollapseRequest(event);
        });

        dispatchContainerCollapseRequest(button, 'group-1');

        expect(received).toBe('group-1');
    });

    it('rejects empty, malformed, and unrelated events', () => {
        expect(readContainerCollapseRequest(new Event('other'))).toBeNull();
        expect(readContainerCollapseRequest(new CustomEvent('other', { detail: null }))).toBeNull();
        expect(readContainerCollapseRequest(new CustomEvent('other', { detail: { nodeId: 42 } }))).toBeNull();
        expect(readContainerCollapseRequest(new CustomEvent('other', { detail: { nodeId: '   ' } }))).toBeNull();
    });
});
