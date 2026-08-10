// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
    getConfig: vi.fn(() => null),
    saveConfig: vi.fn(),
    testConnection: vi.fn(),
}));

vi.mock('react-router', () => ({
    useNavigate: () => vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
    appMessage: { error: vi.fn(), success: vi.fn() },
    appModal: { error: vi.fn() },
}));

vi.mock('@/services/StorageService', () => ({
    s3Storage: storageMocks,
}));

vi.stubGlobal('ResizeObserver', class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
});

vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => (
    window.setTimeout(() => callback(0), 0)
));
vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
})));

import StorageConfigPage from '../StorageConfigPage';

afterEach(() => {
    cleanup();
    storageMocks.getConfig.mockReturnValue(null);
    storageMocks.saveConfig.mockReset();
    storageMocks.testConnection.mockReset();
});

describe('StorageConfigPage validation recovery', () => {
    it.each([
        { action: 'save', accessibleName: 'save storageConfig.form.saveBtn' },
        { action: 'test', accessibleName: 'api storageConfig.form.testBtn' },
    ])('focuses the first invalid field and exposes persistent recovery for $action', async ({ accessibleName }) => {
        render(<StorageConfigPage />);

        fireEvent.click(screen.getByRole('button', { name: accessibleName }));

        const endpoint = screen.getByPlaceholderText('https://...');
        await waitFor(() => expect(document.activeElement).toBe(endpoint));
        expect(endpoint).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByText('storageConfig.status.invalid')).toBeInTheDocument();
        expect(storageMocks.saveConfig).not.toHaveBeenCalled();
        expect(storageMocks.testConnection).not.toHaveBeenCalled();
    });
});
