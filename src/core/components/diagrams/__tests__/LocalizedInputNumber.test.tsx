// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react';
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
});
