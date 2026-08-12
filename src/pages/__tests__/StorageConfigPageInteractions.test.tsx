// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
    getConfig: vi.fn<() => MockStorageConfig | null>(() => null),
    saveConfig: vi.fn(),
    testConnection: vi.fn(),
}));

const bridgeMocks = vi.hoisted(() => ({
    messageError: vi.fn(),
    messageSuccess: vi.fn(),
    modalConfirm: vi.fn(),
    modalError: vi.fn(),
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

type MockStorageConfig = {
    endpoint: string;
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    s3ForcePathStyle: boolean;
};

const renderStorageConfig = (initialEntries = ['/storage-config']) => {
    const router = createMemoryRouter([
        { path: '/storage-config', element: <StorageConfigPage /> },
        { path: '/manage', element: <div>workspace destination</div> },
    ], {
        initialEntries,
        initialIndex: initialEntries.length - 1,
    });

    return { router, ...render(<RouterProvider router={router} />) };
};

beforeEach(() => {
    bridgeMocks.modalConfirm.mockReturnValue({
        destroy: vi.fn(),
        update: vi.fn(),
    });
});

afterEach(() => {
    cleanup();
    storageMocks.getConfig.mockReturnValue(null);
    storageMocks.saveConfig.mockReset();
    storageMocks.testConnection.mockReset();
    bridgeMocks.messageError.mockReset();
    bridgeMocks.messageSuccess.mockReset();
    bridgeMocks.modalConfirm.mockReset();
    bridgeMocks.modalError.mockReset();
});

interface LeaveConfirmOptions {
    title: string;
    content: string;
    okText: string;
    cancelText: string;
    autoFocusButton: 'cancel' | 'ok' | null;
    okButtonProps?: { danger?: boolean };
    onOk?: () => void;
    onCancel?: () => void;
    afterClose?: () => void;
}

describe('StorageConfigPage validation recovery', () => {
    it('keeps essential field guidance visible and programmatically associated', () => {
        renderStorageConfig();

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
        const { unmount } = renderStorageConfig();

        const pageTitle = screen.getByRole('heading', {
            level: 1,
            name: 'cloud-server storageConfig.pageTitle',
        });
        await waitFor(() => expect(document.activeElement).toBe(pageTitle));
        expect(pageTitle).toHaveAttribute('tabindex', '-1');

        unmount();
        renderStorageConfig();
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
        renderStorageConfig();

        fireEvent.click(screen.getByRole('button', { name: accessibleName }));

        const endpoint = screen.getByPlaceholderText('https://...');
        await waitFor(() => expect(document.activeElement).toBe(endpoint));
        expect(endpoint).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByText('storageConfig.status.invalid')).toBeInTheDocument();
        expect(storageMocks.saveConfig).not.toHaveBeenCalled();
        expect(storageMocks.testConnection).not.toHaveBeenCalled();
    });

    it.each([
        {
            action: 'save',
            accessibleName: 'storageConfig.form.saveBtn',
            fieldPlaceholder: 'my-diagrams-bucket',
            invalidValue: '../vizly',
            errorKey: 'storageConfig.form.bucketInvalid',
        },
        {
            action: 'test',
            accessibleName: 'storageConfig.form.testBtn',
            fieldPlaceholder: 'us-east-1',
            invalidValue: 'us east 1',
            errorKey: 'storageConfig.form.regionInvalid',
        },
    ])('rejects an unsafe named field at the boundary for $action', async ({
        accessibleName,
        errorKey,
        fieldPlaceholder,
        invalidValue,
    }) => {
        renderStorageConfig();

        const endpoint = screen.getByPlaceholderText('https://...');
        const bucket = screen.getByPlaceholderText('my-diagrams-bucket');
        const region = screen.getByPlaceholderText('us-east-1');
        fireEvent.change(endpoint, { target: { value: 'https://storage.example.com' } });
        fireEvent.change(bucket, { target: { value: 'vizly-audit-bucket' } });
        fireEvent.change(region, { target: { value: 'us-east-1' } });
        fireEvent.change(screen.getByPlaceholderText('storageConfig.form.accessKeyPlaceholder'), {
            target: { value: 'AUDIT_ACCESS_KEY' },
        });
        fireEvent.change(screen.getByPlaceholderText('storageConfig.form.secretKeyPlaceholder'), {
            target: { value: 'AUDIT_SECRET_KEY' },
        });

        const field = screen.getByPlaceholderText(fieldPlaceholder);
        fireEvent.change(field, { target: { value: invalidValue } });
        fireEvent.click(screen.getByRole('button', { name: accessibleName }));

        await waitFor(() => {
            expect(document.activeElement).toBe(field);
            expect(field).toHaveAttribute('aria-invalid', 'true');
            expect(screen.getByText(errorKey)).toBeInTheDocument();
        });
        expect(screen.getByText('storageConfig.status.invalid')).toBeInTheDocument();
        expect(storageMocks.saveConfig).not.toHaveBeenCalled();
        expect(storageMocks.testConnection).not.toHaveBeenCalled();
    });

    it.each([
        {
            action: 'save',
            accessibleName: 'storageConfig.form.saveBtn',
            fieldPlaceholder: 'storageConfig.form.accessKeyPlaceholder',
            invalidValue: 'AUDIT ACCESS KEY',
            errorKey: 'storageConfig.form.accessKeyInvalid',
        },
        {
            action: 'test',
            accessibleName: 'storageConfig.form.testBtn',
            fieldPlaceholder: 'storageConfig.form.secretKeyPlaceholder',
            invalidValue: '   ',
            errorKey: 'storageConfig.form.secretKeyRequired',
        },
    ])('rejects an invalid credential at the field boundary for $action', async ({
        accessibleName,
        errorKey,
        fieldPlaceholder,
        invalidValue,
    }) => {
        renderStorageConfig();

        fireEvent.change(screen.getByPlaceholderText('https://...'), {
            target: { value: 'https://storage.example.com' },
        });
        fireEvent.change(screen.getByPlaceholderText('my-diagrams-bucket'), {
            target: { value: 'vizly-audit-bucket' },
        });
        fireEvent.change(screen.getByPlaceholderText('storageConfig.form.accessKeyPlaceholder'), {
            target: { value: 'AUDIT_ACCESS_KEY' },
        });
        fireEvent.change(screen.getByPlaceholderText('storageConfig.form.secretKeyPlaceholder'), {
            target: { value: 'AUDIT_SECRET_KEY' },
        });

        const field = screen.getByPlaceholderText(fieldPlaceholder);
        fireEvent.change(field, { target: { value: invalidValue } });
        fireEvent.click(screen.getByRole('button', { name: accessibleName }));

        await waitFor(() => {
            expect(document.activeElement).toBe(field);
            expect(field).toHaveAttribute('aria-invalid', 'true');
            expect(screen.getByText(errorKey)).toBeInTheDocument();
        });
        expect(screen.getByText('storageConfig.status.invalid')).toBeInTheDocument();
        expect(storageMocks.saveConfig).not.toHaveBeenCalled();
        expect(storageMocks.testConnection).not.toHaveBeenCalled();
    });

    it('allows an empty secret field when the current session already holds one', async () => {
        storageMocks.getConfig.mockReturnValue({
            endpoint: 'https://storage.example.com',
            bucket: 'vizly-audit-bucket',
            region: 'us-east-1',
            accessKeyId: 'AUDIT_ACCESS_KEY',
            secretAccessKey: 'SESSION_SECRET',
            s3ForcePathStyle: false,
        });
        renderStorageConfig();

        const secret = screen.getByPlaceholderText('storageConfig.form.secretKeyPlaceholder');
        expect(secret).toHaveValue('');
        expect(screen.getByRole('switch', {
            name: 'storageConfig.form.forcePathStyleLabel',
        })).not.toBeChecked();

        fireEvent.click(screen.getByRole('button', { name: 'storageConfig.form.testBtn' }));
        await waitFor(() => expect(storageMocks.testConnection).toHaveBeenCalledTimes(1));
        expect(secret).not.toHaveAttribute('aria-invalid', 'true');
    });

    it.each([
        { action: 'save', accessibleName: 'storageConfig.form.saveBtn' },
        { action: 'test', accessibleName: 'storageConfig.form.testBtn' },
    ])('rejects an unsafe endpoint at the field boundary for $action', async ({ accessibleName }) => {
        renderStorageConfig();

        const endpoint = screen.getByPlaceholderText('https://...');
        fireEvent.change(endpoint, { target: { value: 'ftp://storage.example.com' } });
        fireEvent.change(screen.getByPlaceholderText('my-diagrams-bucket'), {
            target: { value: 'vizly-audit-bucket' },
        });
        fireEvent.change(screen.getByPlaceholderText('storageConfig.form.accessKeyPlaceholder'), {
            target: { value: 'AUDIT_ACCESS_KEY' },
        });
        fireEvent.change(screen.getByPlaceholderText('storageConfig.form.secretKeyPlaceholder'), {
            target: { value: 'AUDIT_SECRET_KEY' },
        });

        fireEvent.click(screen.getByRole('button', { name: accessibleName }));

        await waitFor(() => {
            expect(document.activeElement).toBe(endpoint);
            expect(endpoint).toHaveAttribute('aria-invalid', 'true');
            expect(screen.getByText('storageConfig.form.endpointInvalid')).toBeInTheDocument();
        });
        expect(screen.getByText('storageConfig.status.invalid')).toBeInTheDocument();
        expect(storageMocks.saveConfig).not.toHaveBeenCalled();
        expect(storageMocks.testConnection).not.toHaveBeenCalled();
    });

    it('keeps decorative action icons out of localized accessible names', () => {
        renderStorageConfig();

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
        renderStorageConfig();

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

    it('aborts an in-flight connection test when configuration changes and keeps the form dirty', async () => {
        let resolveTest: (() => void) | undefined;
        storageMocks.testConnection.mockImplementationOnce(() => new Promise<void>(resolve => {
            resolveTest = resolve;
        }));
        renderStorageConfig();

        fireEvent.change(screen.getByPlaceholderText('https://...'), {
            target: { value: 'https://storage.example.com' },
        });
        const bucket = screen.getByPlaceholderText('my-diagrams-bucket');
        fireEvent.change(bucket, { target: { value: 'vizly-audit-bucket' } });
        fireEvent.change(screen.getByPlaceholderText('storageConfig.form.accessKeyPlaceholder'), {
            target: { value: 'AUDIT_ACCESS_KEY' },
        });
        fireEvent.change(screen.getByPlaceholderText('storageConfig.form.secretKeyPlaceholder'), {
            target: { value: 'AUDIT_SECRET_KEY' },
        });

        fireEvent.click(screen.getByRole('button', { name: 'storageConfig.form.testBtn' }));
        await waitFor(() => expect(storageMocks.testConnection).toHaveBeenCalledTimes(1));
        const signal = storageMocks.testConnection.mock.calls[0]?.[1] as AbortSignal | undefined;
        expect(signal?.aborted).toBe(false);
        expect(screen.getByText('storageConfig.status.testing')).toBeInTheDocument();

        fireEvent.change(bucket, { target: { value: 'vizly-updated-bucket' } });
        await waitFor(() => expect(signal?.aborted).toBe(true));
        expect(screen.getByText('storageConfig.status.dirty')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'storageConfig.form.saveBtn' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'storageConfig.form.testBtn' })).toBeEnabled();

        await act(async () => resolveTest?.());
        expect(screen.getByText('storageConfig.status.dirty')).toBeInTheDocument();
        expect(bridgeMocks.messageSuccess).not.toHaveBeenCalledWith('storageConfig.testSuccess');
    });

    it('ignores an aborted stale test even after a replacement test has started', async () => {
        let resolveFirst: (() => void) | undefined;
        let resolveSecond: (() => void) | undefined;
        storageMocks.testConnection
            .mockImplementationOnce(() => new Promise<void>(resolve => { resolveFirst = resolve; }))
            .mockImplementationOnce(() => new Promise<void>(resolve => { resolveSecond = resolve; }));
        renderStorageConfig();

        fireEvent.change(screen.getByPlaceholderText('https://...'), {
            target: { value: 'https://storage.example.com' },
        });
        const bucket = screen.getByPlaceholderText('my-diagrams-bucket');
        fireEvent.change(bucket, { target: { value: 'vizly-audit-bucket' } });
        fireEvent.change(screen.getByPlaceholderText('storageConfig.form.accessKeyPlaceholder'), {
            target: { value: 'AUDIT_ACCESS_KEY' },
        });
        fireEvent.change(screen.getByPlaceholderText('storageConfig.form.secretKeyPlaceholder'), {
            target: { value: 'AUDIT_SECRET_KEY' },
        });

        const testButton = screen.getByRole('button', { name: 'storageConfig.form.testBtn' });
        fireEvent.click(testButton);
        await waitFor(() => expect(storageMocks.testConnection).toHaveBeenCalledTimes(1));
        const firstSignal = storageMocks.testConnection.mock.calls[0]?.[1] as AbortSignal | undefined;
        fireEvent.change(bucket, { target: { value: 'vizly-updated-bucket' } });
        expect(firstSignal?.aborted).toBe(true);

        fireEvent.click(testButton);
        await waitFor(() => expect(storageMocks.testConnection).toHaveBeenCalledTimes(2));
        expect(screen.getByText('storageConfig.status.testing')).toBeInTheDocument();
        await act(async () => resolveFirst?.());
        expect(screen.getByText('storageConfig.status.testing')).toBeInTheDocument();
        expect(testButton).toHaveClass('ant-btn-loading');

        await act(async () => resolveSecond?.());
        await waitFor(() => expect(screen.getByText('storageConfig.status.verified')).toBeInTheDocument());
    });

    it('offers an explicit cancel action during a connection test and restores editing', async () => {
        storageMocks.testConnection.mockImplementationOnce(() => new Promise<void>(() => {}));
        renderStorageConfig();
        fireEvent.change(screen.getByPlaceholderText('https://...'), {
            target: { value: 'https://storage.example.com' },
        });
        fireEvent.change(screen.getByPlaceholderText('my-diagrams-bucket'), {
            target: { value: 'vizly-audit-bucket' },
        });
        fireEvent.change(screen.getByPlaceholderText('storageConfig.form.accessKeyPlaceholder'), {
            target: { value: 'AUDIT_ACCESS_KEY' },
        });
        fireEvent.change(screen.getByPlaceholderText('storageConfig.form.secretKeyPlaceholder'), {
            target: { value: 'AUDIT_SECRET_KEY' },
        });

        fireEvent.click(screen.getByRole('button', { name: 'storageConfig.form.testBtn' }));
        await waitFor(() => expect(storageMocks.testConnection).toHaveBeenCalledTimes(1));
        const signal = storageMocks.testConnection.mock.calls[0]?.[1] as AbortSignal | undefined;
        const cancelButton = screen.getByRole('button', { name: 'storageConfig.form.cancelTestBtn' });
        expect(cancelButton).toBeEnabled();

        fireEvent.click(cancelButton);
        expect(signal?.aborted).toBe(true);
        expect(screen.queryByRole('button', { name: 'storageConfig.form.cancelTestBtn' })).not.toBeInTheDocument();
        expect(screen.getByText('storageConfig.status.dirty')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'storageConfig.form.saveBtn' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'storageConfig.form.testBtn' })).toBeEnabled();
    });

    it('restores a clean saved status when cancelling a test without configuration changes', async () => {
        storageMocks.getConfig.mockReturnValue({
            endpoint: 'https://storage.example.com',
            bucket: 'vizly-audit-bucket',
            region: 'us-east-1',
            accessKeyId: 'AUDIT_ACCESS_KEY',
            secretAccessKey: 'SESSION_SECRET',
            s3ForcePathStyle: true,
        });
        storageMocks.testConnection.mockImplementationOnce(() => new Promise<void>(() => {}));
        renderStorageConfig();

        fireEvent.click(screen.getByRole('button', { name: 'storageConfig.form.testBtn' }));
        await waitFor(() => expect(storageMocks.testConnection).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'storageConfig.form.cancelTestBtn' }));

        expect(screen.getByText('storageConfig.status.saved')).toBeInTheDocument();
        expect(screen.queryByText('storageConfig.status.dirty')).not.toBeInTheDocument();
        const unloadEvent = new Event('beforeunload', { cancelable: true });
        expect(window.dispatchEvent(unloadEvent)).toBe(true);
        expect(unloadEvent.defaultPrevented).toBe(false);

        const returnButton = screen.getAllByRole('button', {
            name: 'storageConfig.returnToWorkspace',
        })[1];
        if (!returnButton) throw new Error('Expected the storage configuration return button');
        fireEvent.click(returnButton);
        expect(await screen.findByText('workspace destination')).toBeInTheDocument();
        expect(bridgeMocks.modalConfirm).not.toHaveBeenCalled();
    });

    it('keeps the form unsaved and reports failure when browser persistence rejects a save', async () => {
        storageMocks.saveConfig.mockImplementationOnce(() => {
            throw new Error('Unable to save S3 configuration in browser local storage.');
        });
        renderStorageConfig();

        fireEvent.change(screen.getByPlaceholderText('https://...'), {
            target: { value: 'https://storage.example.com' },
        });
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
        expect(bridgeMocks.messageSuccess).not.toHaveBeenCalledWith('storageConfig.saveSuccess');
        expect(bridgeMocks.messageError).toHaveBeenCalledWith('storageConfig.saveFail');
        expect(screen.getByText('storageConfig.status.failed')).toBeInTheDocument();

        const unloadEvent = new Event('beforeunload', { cancelable: true });
        expect(window.dispatchEvent(unloadEvent)).toBe(false);
        expect(unloadEvent.defaultPrevented).toBe(true);
    });

    it('leaves immediately from either return control when the form is unchanged', async () => {
        renderStorageConfig();

        let returnButtons = screen.getAllByRole('button', {
            name: 'storageConfig.returnToWorkspace',
        });
        expect(returnButtons).toHaveLength(2);
        const brandButton = returnButtons[0];
        if (!brandButton) throw new Error('Expected the storage configuration brand control');

        fireEvent.click(brandButton);
        expect(await screen.findByText('workspace destination')).toBeInTheDocument();
        expect(bridgeMocks.modalConfirm).not.toHaveBeenCalled();

        cleanup();
        renderStorageConfig();
        returnButtons = screen.getAllByRole('button', {
            name: 'storageConfig.returnToWorkspace',
        });
        const returnButton = returnButtons[1];
        if (!returnButton) throw new Error('Expected the storage configuration return button');

        fireEvent.click(returnButton);
        expect(await screen.findByText('workspace destination')).toBeInTheDocument();
        expect(bridgeMocks.modalConfirm).not.toHaveBeenCalled();
    });

    it('guards both return controls, preserves input on cancel, and navigates only once on confirmation', async () => {
        renderStorageConfig();

        const endpoint = screen.getByPlaceholderText('https://...');
        fireEvent.change(endpoint, { target: { value: 'https://unsaved.example.invalid' } });
        const returnButtons = screen.getAllByRole('button', {
            name: 'storageConfig.returnToWorkspace',
        });
        const [brandButton, returnButton] = returnButtons;
        if (!brandButton || !returnButton) throw new Error('Expected both storage configuration return controls');

        brandButton.focus();
        fireEvent.click(brandButton);
        await waitFor(() => expect(bridgeMocks.modalConfirm).toHaveBeenCalledTimes(1));
        const cancelOptions = bridgeMocks.modalConfirm.mock.calls[0]?.[0] as LeaveConfirmOptions;
        expect(cancelOptions).toEqual(expect.objectContaining({
            title: 'storageConfig.leaveConfirm.title',
            content: 'storageConfig.leaveConfirm.content',
            okText: 'storageConfig.leaveConfirm.confirm',
            cancelText: 'storageConfig.leaveConfirm.keepEditing',
            autoFocusButton: 'cancel',
            okButtonProps: { danger: true },
        }));
        expect(cancelOptions.onCancel).toBeTypeOf('function');
        expect(cancelOptions.afterClose).toBeTypeOf('function');
        act(() => cancelOptions.onCancel?.());
        act(() => cancelOptions.afterClose?.());
        expect(endpoint).toHaveValue('https://unsaved.example.invalid');
        expect(document.activeElement).toBe(brandButton);

        const confirmTriggerFocus = vi.spyOn(returnButton, 'focus');
        returnButton.focus();
        confirmTriggerFocus.mockClear();
        fireEvent.click(returnButton);
        await waitFor(() => expect(bridgeMocks.modalConfirm).toHaveBeenCalledTimes(2));
        const confirmOptions = bridgeMocks.modalConfirm.mock.calls[1]?.[0] as LeaveConfirmOptions;
        expect(confirmOptions.onOk).toBeTypeOf('function');
        act(() => {
            confirmOptions.onOk?.();
            confirmOptions.onOk?.();
        });
        act(() => confirmOptions.afterClose?.());

        expect(await screen.findByText('workspace destination')).toBeInTheDocument();
        expect(confirmTriggerFocus).not.toHaveBeenCalled();
    });

    it('guards browser history navigation, preserves dirty input on cancel, and proceeds once', async () => {
        const { router } = renderStorageConfig(['/manage', '/storage-config']);

        const endpoint = screen.getByPlaceholderText('https://...');
        fireEvent.change(endpoint, { target: { value: 'https://history-loss.example.invalid' } });
        endpoint.focus();

        await act(async () => {
            await router.navigate(-1);
        });
        await waitFor(() => expect(bridgeMocks.modalConfirm).toHaveBeenCalledTimes(1));
        expect(router.state.location.pathname).toBe('/storage-config');

        const cancelOptions = bridgeMocks.modalConfirm.mock.calls[0]?.[0] as LeaveConfirmOptions;
        act(() => cancelOptions.onCancel?.());
        act(() => cancelOptions.afterClose?.());
        expect(router.state.location.pathname).toBe('/storage-config');
        expect(endpoint).toHaveValue('https://history-loss.example.invalid');
        expect(document.activeElement).toBe(endpoint);

        await act(async () => {
            await router.navigate(-1);
        });
        await waitFor(() => expect(bridgeMocks.modalConfirm).toHaveBeenCalledTimes(2));
        const confirmOptions = bridgeMocks.modalConfirm.mock.calls[1]?.[0] as LeaveConfirmOptions;
        act(() => {
            confirmOptions.onOk?.();
            confirmOptions.onOk?.();
        });

        expect(await screen.findByText('workspace destination')).toBeInTheDocument();
        expect(router.state.location.pathname).toBe('/manage');
    });

    it('protects browser unload only while changes remain unsaved', async () => {
        renderStorageConfig();

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

        const returnButton = screen.getAllByRole('button', {
            name: 'storageConfig.returnToWorkspace',
        })[1];
        if (!returnButton) throw new Error('Expected the storage configuration return button');
        fireEvent.click(returnButton);
        expect(await screen.findByText('workspace destination')).toBeInTheDocument();
        expect(bridgeMocks.modalConfirm).not.toHaveBeenCalled();
    });
});
