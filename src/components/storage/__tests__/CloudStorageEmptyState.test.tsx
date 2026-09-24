// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { query?: string }) => options?.query
            ? `${key}:${options.query}`
            : key,
    }),
}));

import { CloudStorageEmptyState } from '../CloudStorageEmptyState';

afterEach(cleanup);

describe('CloudStorageEmptyState', () => {
    it('distinguishes a filtered empty result and offers search recovery', () => {
        const onClearSearch = vi.fn();
        render(
            <CloudStorageEmptyState
                hasUnfilteredItems
                searchTerm="  missing diagram  "
                defaultDescription="No cloud diagrams"
                onClearSearch={onClearSearch}
            />,
        );

        expect(screen.getByText('storage.manager.noSearchResults:missing diagram')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'storage.manager.clearSearch' }));
        expect(onClearSearch).toHaveBeenCalledTimes(1);
    });

    it.each([
        { hasUnfilteredItems: false, searchTerm: 'missing diagram' },
        { hasUnfilteredItems: true, searchTerm: '   ' },
    ])('shows the true empty account state when filtering is not responsible', ({ hasUnfilteredItems, searchTerm }) => {
        render(
            <CloudStorageEmptyState
                hasUnfilteredItems={hasUnfilteredItems}
                searchTerm={searchTerm}
                defaultDescription="No cloud diagrams"
                onClearSearch={vi.fn()}
            />,
        );

        expect(screen.getByText('No cloud diagrams')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'storage.manager.clearSearch' })).not.toBeInTheDocument();
    });
});
