// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LocalizedInputNumber } from '../LocalizedInputNumber';

describe('LocalizedInputNumber', () => {
    it('replaces the third-party English handler names with localized labels', async () => {
        const { container } = render(
            <LocalizedInputNumber
                aria-label="宽度"
                value={80}
                increaseLabel="增加宽度"
                decreaseLabel="减少宽度"
            />,
        );

        await waitFor(() => {
            expect(container.querySelector(
                '.ant-input-number-action-up[role="button"][aria-label="增加宽度"]',
            )).not.toBeNull();
            expect(container.querySelector(
                '.ant-input-number-action-down[role="button"][aria-label="减少宽度"]',
            )).not.toBeNull();
        });
        expect(container.querySelector('[aria-label="Increase Value"]')).toBeNull();
        expect(container.querySelector('[aria-label="Decrease Value"]')).toBeNull();
    });

    it.each([
        { draft: '-999', expected: '80', commit: 'blur' },
        { draft: '', expected: '80', commit: 'blur' },
        { draft: '100000', expected: '800', commit: 'enter' },
    ])('restores the committed controlled value after a $commit commit of "$draft"', async ({
        draft,
        expected,
        commit,
    }) => {
        const ControlledInput = () => {
            const [value, setValue] = React.useState(80);

            return (
                <LocalizedInputNumber
                    aria-label="宽度"
                    value={value}
                    min={80}
                    max={800}
                    increaseLabel="增加宽度"
                    decreaseLabel="减少宽度"
                    onChange={(nextValue) => {
                        if (typeof nextValue !== 'number' || !Number.isFinite(nextValue)) return;
                        setValue(Math.min(800, Math.max(80, nextValue)));
                    }}
                />
            );
        };

        render(<ControlledInput />);
        const input = screen.getByLabelText('宽度');
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: draft } });
        expect((input as HTMLInputElement).value).toBe(draft);

        if (commit === 'enter') {
            fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
        } else {
            fireEvent.blur(input);
        }

        await waitFor(() => {
            expect((screen.getByLabelText('宽度') as HTMLInputElement).value).toBe(expected);
        });
    });
});
