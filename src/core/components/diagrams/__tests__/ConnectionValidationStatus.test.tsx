// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConnectionValidationStatus } from '../ConnectionValidationStatus';
import type { ConnectionValidationResult } from '../../../types/connection';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, unknown>) => {
            if (key === 'designer.connectionValidation.source-port-relation') {
                return `translated ${String(options?.port)} ${String(options?.relation)}`;
            }
            return typeof options?.defaultValue === 'string' ? options.defaultValue : key;
        },
    }),
}));

const validationResult = (
    overrides: Partial<ConnectionValidationResult> = {},
): ConnectionValidationResult => ({
    valid: false,
    code: 'source-port-relation',
    severity: 'error',
    message: 'Source port does not allow relation.',
    details: { port: 'out-data', relation: 'feedback' },
    ...overrides,
});

describe('ConnectionValidationStatus', () => {
    it('renders localized validation feedback with sanitized detail interpolation', () => {
        render(<ConnectionValidationStatus validation={validationResult()} />);

        const status = screen.getByRole('status');
        expect(status.textContent).toBe('translated out-data feedback');
        expect(status.getAttribute('aria-live')).toBe('polite');
        expect(status.getAttribute('data-validation-code')).toBe('source-port-relation');
    });

    it('falls back to the structured validation message when a localized key is unavailable', () => {
        render(<ConnectionValidationStatus validation={validationResult({
            code: 'duplicate-connection',
            message: 'An identical connection already exists.',
            details: undefined,
        })} />);

        expect(screen.getByRole('status').textContent).toBe('An identical connection already exists.');
    });

    it('does not render for empty or valid validation states', () => {
        const { rerender } = render(<ConnectionValidationStatus validation={null} />);
        expect(screen.queryByRole('status')).toBeNull();

        rerender(<ConnectionValidationStatus validation={validationResult({
            valid: true,
            code: 'valid',
            severity: 'warning',
            message: 'Connection is valid.',
        })} />);

        expect(screen.queryByRole('status')).toBeNull();
    });
});
