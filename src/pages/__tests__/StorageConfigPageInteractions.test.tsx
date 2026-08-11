// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
    getConfig: vi.fn(() => null),
    saveConfig: vi.fn(),
    testConnection: vi.fn(),
}));

const bridgeMocks = vi.hoisted(() => ({
    messageError: vi.fn(),
    messageSuccess: vi.fn(),
    modalConfirm: vi.fn(),
    modalError: vi.fn(),
}));

const routerMocks = vi.hoisted(() => ({
    navigate: vi.fn(),
}));

vi.mock('react-router', () => ({
    useNavigate: () => routerMocks.navigate,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
    appMessage: { error: bridgeMocks.messageError, success: bridgeMocks.messageSuccess },
    appModal: { confirm: bridgeMocks.modalConfirm, error: bridgeMocks.modalError },
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
    bridgeMocks.messageError.mockReset();
    bridgeMocks.messageSuccess.mockReset();
    bridgeMocks.modalConfirm.mockReset();
    bridgeMocks.modalError.mockReset();
    routerMocks.navigate.mockReset();
});

interface LeaveConfirmOptions {
    title: string;
    content: string;
    okText: string;
    cancelText: string;
    autoFocusButton: 'cancel' | 'ok' | null;
    okButtonProps?: { danger?: boolean };
    onOk?: () => void;
    afterClose?: () => void;
}

describe('StorageConfigPage validation recovery', () => {
    it('keeps essential field guidance visible and programmatically associated', () => {
        render(<StorageConfigPage />);

        const endpoint = screen.getByPlaceholderText('https://...');
        const endpointGuidance = screen.getByText('storageConfig.form.endpointTooltip');
        expect(endpoint).toHaveAttribute('aria-describedby', 'endpoint_extra');
        expect(endpointGuidance).toHaveAttribute('id', 'endpoint_extra');

        const pathStyle = screen.getByRole('switch', {
            name: 'storageConfig.form.forcePathStyleLabel',
        });
        const pathStyleGuidance = screen.getByText('storageConfig.form.forcePathStyleTooltip');
        expect(pathStyle).toHaveAttribute('aria-describedby', 's3ForcePathStyle_extra');
        expect(pathStyleGuidance).toHaveAttribute('id', 's3ForcePathStyle_extra');
        expect(document.querySelector('.ant-form-item-tooltip')).not.toBeInTheDocument();
    });

    it('announces route entry through the page heading without stealing later focus', async () => {
        const { unmount } = render(<StorageConfigPage />);

        const pageTitle = screen.getByRole('heading', {
            level: 1,
            name: 'cloud-server storageConfig.pageTitle',
        });
        await waitFor(() => expect(document.activeElement).toBe(pageTitle));
        expect(pageTitle).toHaveAttribute('tabindex', '-1');

        unmount();
        render(<StorageConfigPage />);
        const returnButton = screen.getAllByRole('button', {
            name: 'storageConfig.returnToWorkspace',
        })[0];
        returnButton.focus();

        await waitFor(() => expect(document.activeElement).toBe(returnButton));
    });

    it.each([
        { action: 'save', accessibleName: 'storageConfig.form.saveBtn' },
        { action: 'test', accessibleName: 'storageConfig.form.testBtn' },
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

    it('keeps decorative action icons out of localized accessible names', () => {
        render(<StorageConfigPage />);

        const saveButton = screen.getByRole('button', {
            name: 'storageConfig.form.saveBtn',
        });
        const testButton = screen.getByRole('button', {
            name: 'storageConfig.form.testBtn',
        });

        expect(saveButton.querySelector('.anticon')).toHaveAttribute('aria-hidden', 'true');
        expect(testButton.querySelector('.anticon')).toHaveAttribute('aria-hidden', 'true');
        expect(screen.queryByRole('button', { name: 'save storageConfig.form.saveBtn' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'api storageConfig.form.testBtn' })).not.toBeInTheDocument();
    });

    it('localizes the connection-failure recovery action and keeps entered values available for retry', async () => {
        storageMocks.testConnection.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        render(<StorageConfigPage />);

        const endpoint = screen.getByPlaceholderText('https://...');
        const bucket = screen.getByPlaceholderText('my-diagrams-bucket');
        const accessKey = screen.getByPlaceholderText('storageConfig.form.accessKeyPlaceholder');
        const secretKey = screen.getByPlaceholderText('storageConfig.form.secretKeyPlaceholder');
        fireEvent.change(endpoint, { target: { value: 'http://127.0.0.1:9' } });
        fireEvent.change(bucket, { target: { value: 'vizly-audit-bucket' } });
        fireEvent.change(accessKey, { target: { value: 'AUDIT_ACCESS_KEY' } });
        fireEvent.change(secretKey, { target: { value: 'AUDIT_SECRET_KEY' } });

        fireEvent.click(screen.getByRole('button', { name: 'storageConfig.form.testBtn' }));

        await waitFor(() => expect(bridgeMocks.modalError).toHaveBeenCalledTimes(1));
        expect(bridgeMocks.modalError).toHaveBeenCalledWith(expect.objectContaining({
            title: 'storageConfig.testFail.title',
            okText: 'common.ok',
        }));
        expect(endpoint).toHaveValue('http://127.0.0.1:9');
        expect(bucket).toHaveValue('vizly-audit-bucket');
        expect(accessKey).toHaveValue('AUDIT_ACCESS_KEY');
        expect(secretKey).toHaveValue('AUDIT_SECRET_KEY');
        expect(storageMocks.saveConfig).not.toHaveBeenCalled();
    });

    it('leaves immediately from either return control when the form is unchanged', () => {
        render(<StorageConfigPage />);

        const returnButtons = screen.getAllByRole('button', {
            name: 'storageConfig.returnToWorkspace',
        });
        expect(returnButtons).toHaveLength(2);
        const [brandButton, returnButton] = returnButtons;
        if (!brandButton || !returnButton) throw new Error('Expected both storage configuration return controls');

        fireEvent.click(brandButton);
        fireEvent.click(returnButton);

        expect(routerMocks.navigate).toHaveBeenNthCalledWith(1, '/manage');
        expect(routerMocks.navigate).toHaveBeenNthCalledWith(2, '/manage');
        expect(bridgeMocks.modalConfirm).not.toHaveBeenCalled();
    });

    it('guards both return controls, preserves input on cancel, and navigates only once on confirmation', () => {
        render(<StorageConfigPage />);

        const endpoint = screen.getByPlaceholderText('https://...');
        fireEvent.change(endpoint, { target: { value: 'https://unsaved.example.invalid' } });
        const returnButtons = screen.getAllByRole('button', {
            name: 'storageConfig.returnToWorkspace',
        });
        const [brandButton, returnButton] = returnButtons;
        if (!brandButton || !returnButton) throw new Error('Expected both storage configuration return controls');

        brandButton.focus();
        fireEvent.click(brandButton);
        expect(routerMocks.navigate).not.toHaveBeenCalled();
        expect(bridgeMocks.modalConfirm).toHaveBeenCalledTimes(1);
        const cancelOptions = bridgeMocks.modalConfirm.mock.calls[0]?.[0] as LeaveConfirmOptions;
        expect(cancelOptions).toEqual(expect.objectContaining({
            title: 'storageConfig.leaveConfirm.title',
            content: 'storageConfig.leaveConfirm.content',
            okText: 'storageConfig.leaveConfirm.confirm',
            cancelText: 'storageConfig.leaveConfirm.keepEditing',
            autoFocusButton: 'cancel',
            okButtonProps: { danger: true },
        }));
        expect(cancelOptions.afterClose).toBeTypeOf('function');
        cancelOptions.afterClose?.();
        expect(endpoint).toHaveValue('https://unsaved.example.invalid');
        expect(document.activeElement).toBe(brandButton);

        const confirmTriggerFocus = vi.spyOn(returnButton, 'focus');
        returnButton.focus();
        confirmTriggerFocus.mockClear();
        fireEvent.click(returnButton);
        expect(bridgeMocks.modalConfirm).toHaveBeenCalledTimes(2);
        const confirmOptions = bridgeMocks.modalConfirm.mock.calls[1]?.[0] as LeaveConfirmOptions;
        expect(confirmOptions.onOk).toBeTypeOf('function');
        confirmOptions.onOk?.();
        confirmOptions.onOk?.();
        confirmOptions.afterClose?.();

        expect(routerMocks.navigate).toHaveBeenCalledTimes(1);
        expect(routerMocks.navigate).toHaveBeenCalledWith('/manage');
        expect(confirmTriggerFocus).not.toHaveBeenCalled();
    });

    it('protects browser unload only while changes remain unsaved', async () => {
        render(<StorageConfigPage />);

        const cleanEvent = new Event('beforeunload', { cancelable: true });
        expect(window.dispatchEvent(cleanEvent)).toBe(true);
        expect(cleanEvent.defaultPrevented).toBe(false);

        fireEvent.change(screen.getByPlaceholderText('https://...'), {
            target: { value: 'https://unsaved.example.invalid' },
        });
        const dirtyEvent = new Event('beforeunload', { cancelable: true });
        expect(window.dispatchEvent(dirtyEvent)).toBe(false);
        expect(dirtyEvent.defaultPrevented).toBe(true);

        fireEvent.change(screen.getByPlaceholderText('my-diagrams-bucket'), {
            target: { value: 'vizly-audit-bucket' },
        });
        fireEvent.change(screen.getByPlaceholderText('storageConfig.form.accessKeyPlaceholder'), {
            target: { value: 'AUDIT_ACCESS_KEY' },
        });
        fireEvent.change(screen.getByPlaceholderText('storageConfig.form.secretKeyPlaceholder'), {
            target: { value: 'AUDIT_SECRET_KEY' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'storageConfig.form.saveBtn' }));
        await waitFor(() => expect(storageMocks.saveConfig).toHaveBeenCalledTimes(1));

        const savedEvent = new Event('beforeunload', { cancelable: true });
        expect(window.dispatchEvent(savedEvent)).toBe(true);
        expect(savedEvent.defaultPrevented).toBe(false);
    });
});
