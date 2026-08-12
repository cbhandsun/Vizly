import { describe, expect, it } from 'vitest';

import { resolvePendingPageRename } from '../pageTabsRenameRequest';

describe('resolvePendingPageRename', () => {
    const request = { sourcePageId: 'page-2', targetPageId: 'page-1' };

    it('waits for the controlled switch, opens on the target, and cancels on another page', () => {
        expect(resolvePendingPageRename(request, 'page-2')).toBe('wait');
        expect(resolvePendingPageRename(request, 'page-1')).toBe('open');
        expect(resolvePendingPageRename(request, 'page-3')).toBe('cancel');
    });
});
