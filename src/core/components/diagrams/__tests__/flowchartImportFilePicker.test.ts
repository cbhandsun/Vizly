// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { openFlowchartImportFilePicker } from '../flowchartImportFilePicker';

afterEach(() => {
    document.body.innerHTML = '';
});

describe('openFlowchartImportFilePicker', () => {
    it('opens a connected file input and restores focus after the picker returns', () => {
        const input = document.createElement('input');
        input.type = 'file';
        document.body.appendChild(input);
        const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);
        const focusReturn = vi.fn(() => true);
        let scheduled: (() => void) | undefined;

        expect(openFlowchartImportFilePicker(input, {
            focusReturn,
            scheduleFocusReturn: (callback) => {
                scheduled = callback;
            },
        })).toBe(true);

        expect(click).toHaveBeenCalledTimes(1);
        expect(focusReturn).not.toHaveBeenCalled();
        scheduled?.();
        expect(focusReturn).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['missing', null],
        ['detached', document.createElement('input')],
    ])('rejects a %s file input', (_label, input) => {
        expect(openFlowchartImportFilePicker(input, {
            scheduleFocusReturn: vi.fn(),
        })).toBe(false);
    });

    it('rejects a disabled file input', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.disabled = true;
        document.body.appendChild(input);

        expect(openFlowchartImportFilePicker(input, {
            scheduleFocusReturn: vi.fn(),
        })).toBe(false);
    });
});
