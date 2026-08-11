// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StorageSecretInput } from '../StorageSecretInput';

afterEach(cleanup);

describe('StorageSecretInput', () => {
    it('exposes a stable localized toggle state without submitting or losing focus', () => {
        render(
            <form>
                <StorageSecretInput
                    placeholder="Session secret"
                    visibilityLabel="Toggle session secret visibility"
                    revealTitle="Show secret"
                    concealTitle="Hide secret"
                />
            </form>,
        );

        const input = screen.getByPlaceholderText('Session secret');
        const toggle = screen.getByRole('button', { name: 'Toggle session secret visibility' });

        expect(input).toHaveAttribute('type', 'password');
        expect(toggle).toHaveAttribute('aria-pressed', 'false');
        expect(toggle).toHaveAttribute('title', 'Show secret');

        toggle.focus();
        fireEvent.click(toggle);

        expect(document.activeElement).toBe(toggle);
        expect(input).toHaveAttribute('type', 'text');
        expect(toggle).toHaveAttribute('aria-pressed', 'true');
        expect(toggle).toHaveAttribute('title', 'Hide secret');

        fireEvent.click(toggle);
        expect(input).toHaveAttribute('type', 'password');
        expect(toggle).toHaveAttribute('aria-pressed', 'false');

        fireEvent.keyDown(toggle, { key: 'Enter' });
        expect(input).toHaveAttribute('type', 'text');
        expect(toggle).toHaveAttribute('aria-pressed', 'true');
        expect(document.activeElement).toBe(toggle);

        fireEvent.keyDown(toggle, { key: ' ' });
        expect(input).toHaveAttribute('type', 'password');
        expect(toggle).toHaveAttribute('aria-pressed', 'false');
    });
});
