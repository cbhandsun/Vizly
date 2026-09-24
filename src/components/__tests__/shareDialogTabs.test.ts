import { describe, expect, it } from 'vitest';

import { resolveShareDialogTabKeyboardTarget } from '../diagrams/shareDialogTabs';

describe('resolveShareDialogTabKeyboardTarget', () => {
    it('wraps horizontal navigation and supports Home and End', () => {
        expect(resolveShareDialogTabKeyboardTarget('ArrowRight', 'invite')).toBe('link');
        expect(resolveShareDialogTabKeyboardTarget('ArrowRight', 'link')).toBe('invite');
        expect(resolveShareDialogTabKeyboardTarget('ArrowLeft', 'invite')).toBe('link');
        expect(resolveShareDialogTabKeyboardTarget('Home', 'link')).toBe('invite');
        expect(resolveShareDialogTabKeyboardTarget('End', 'invite')).toBe('link');
    });

    it('rejects unrelated keys and invalid external state', () => {
        expect(resolveShareDialogTabKeyboardTarget('Enter', 'invite')).toBeNull();
        expect(resolveShareDialogTabKeyboardTarget('ArrowRight', 'unknown')).toBeNull();
        expect(resolveShareDialogTabKeyboardTarget(null, 'invite')).toBeNull();
    });
});
