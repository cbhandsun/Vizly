// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('@ant-design/icons', () => ({
    SyncOutlined: () => <span aria-hidden="true">sync</span>,
    CheckCircleOutlined: () => <span aria-hidden="true">saved</span>,
    CloseCircleOutlined: () => <span aria-hidden="true">failed</span>,
}));

vi.mock('antd', () => ({
    Button: ({
        children,
        danger: _danger,
        size: _size,
        type: _type,
        ...props
    }: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
        danger?: boolean;
        size?: string;
        type?: string;
    }) => (
        <button {...props}>{children}</button>
    ),
    Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { SaveStatusIndicator } from '../SaveStatusIndicator';

describe('SaveStatusIndicator accessibility', () => {
    it('announces saving and saved states politely', () => {
        const { rerender } = render(
            <SaveStatusIndicator
                saveState={{ saving: true, lastSaved: null, error: null }}
                target="local"
            />,
        );

        expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
        expect(screen.getByRole('status').textContent).toContain('designer.saveStatus.local.saving');

        rerender(
            <SaveStatusIndicator
                saveState={{ saving: false, lastSaved: Date.now(), error: null }}
                target="local"
            />,
        );
        expect(screen.getByRole('status').textContent).toContain('designer.saveStatus.local.saved');
    });

    it('announces failures assertively', () => {
        render(
            <SaveStatusIndicator
                saveState={{ saving: false, lastSaved: null, error: 'save failed' }}
                target="cloud"
            />,
        );

        expect(screen.getByRole('status').getAttribute('aria-live')).toBe('assertive');
        expect(screen.getByRole('status').textContent).toContain('designer.saveStatus.cloud.failed');
    });

    it('offers an accessible retry action for recoverable save failures', () => {
        const onRetry = vi.fn();
        render(
            <SaveStatusIndicator
                saveState={{ saving: false, lastSaved: null, error: 'save failed' }}
                target="cloud"
                onRetry={onRetry}
            />,
        );

        const retryButton = screen.getByRole('button', {
            name: 'designer.saveStatus.cloud.failed. common.retry',
        });
        fireEvent.click(retryButton);

        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('does not imply a retry path when the host cannot provide one', () => {
        render(
            <SaveStatusIndicator
                saveState={{ saving: false, lastSaved: null, error: 'save failed' }}
                target="cloud"
            />,
        );

        expect(screen.queryByRole('button')).toBeNull();
    });
});
