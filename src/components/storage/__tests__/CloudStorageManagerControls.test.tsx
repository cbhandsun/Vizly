// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

import { CloudStorageManagerSearch, CloudStorageManagerTitle } from '../CloudStorageManagerControls';

afterEach(cleanup);

describe('CloudStorageManagerControls', () => {
    it('exposes one named search field without an unnamed submit button', () => {
        const onChange = vi.fn();
        render(<CloudStorageManagerSearch value="" onChange={onChange} />);

        const search = screen.getByRole('searchbox', { name: 'storage.manager.searchLabel' });
        expect(search).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        fireEvent.change(search, { target: { value: 'quarterly' } });
        expect(onChange).toHaveBeenCalledWith('quarterly');
    });

    it('keeps provider recovery available while disabling an ineffective refresh', () => {
        render(
            <CloudStorageManagerTitle
                activeTab="mine"
                currentProvider="s3"
                loading={false}
                operationBusy={false}
                refreshDisabled
                onProviderChange={vi.fn()}
                onRefresh={vi.fn()}
            />,
        );

        expect(screen.getByRole('combobox', { name: 'storage.manager.providerLabel' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'storage.manager.refresh' })).toBeDisabled();
    });
});
