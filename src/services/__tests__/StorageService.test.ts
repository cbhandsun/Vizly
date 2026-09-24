// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StandardDiagramData } from '@vizly/core/types';
import type { StorageConfig } from '../StorageService';

const fetchMock = vi.fn<typeof fetch>();
const safeLogState = vi.hoisted(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
}));

vi.mock('@vizly/core/logging', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@vizly/core/logging')>();
    return {
        ...actual,
        safeLog: safeLogState,
        logUiStorageReadFailure: (source: string, key: string, error: unknown) => {
            safeLogState.warn(`[${source}] Failed to read "${key}":`, actual.redactSensitiveLogValue(error));
        },
        logUiStorageWriteFailure: (source: string, key: string, error: unknown) => {
            safeLogState.warn(`[${source}] Failed to write "${key}":`, actual.redactSensitiveLogValue(error));
        },
    };
});


const xmlListResponse = (body = '<ListBucketResult />') => new Response(body, {
    headers: { 'content-type': 'application/xml' },
    status: 200,
});

const jsonObjectResponse = (body: string, lastModified = 'Thu, 01 Jan 2026 00:00:00 GMT') => new Response(body, {
    headers: { 'last-modified': lastModified },
    status: 200,
});

const config: StorageConfig = {
    endpoint: 'https://s3.amazonaws.com',
    accessKeyId: 'AKIA_TEST',
    secretAccessKey: 'super-secret',
    bucket: 'vizly-diagrams',
    region: 'us-east-1',
    s3ForcePathStyle: true,
};

const loadStorageService = async () => {
    vi.resetModules();
    return import('../StorageService');
};

describe('S3StorageProvider', () => {
    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        fetchMock.mockReset();
        Object.values(safeLogState).forEach(mock => mock.mockReset());
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        vi.resetModules();
    });

    it('keeps S3 secret access keys out of localStorage', async () => {
        const { s3Storage } = await loadStorageService();

        s3Storage.saveConfig(config);

        const persisted = JSON.parse(localStorage.getItem('diagram_storage_config') || '{}');
        expect(persisted).toMatchObject({
            endpoint: 'https://s3.amazonaws.com',
            accessKeyId: 'AKIA_TEST',
            secretAccessKey: '',
            bucket: 'vizly-diagrams',
        });
        expect(sessionStorage.getItem('diagram_storage_config_secret')).toBe('super-secret');
        expect(s3Storage.getConfig()?.secretAccessKey).toBe('super-secret');
    });

    it('migrates legacy plaintext S3 secrets out of localStorage on load', async () => {
        localStorage.setItem('diagram_storage_config', JSON.stringify(config));

        const { s3Storage } = await loadStorageService();

        const persisted = JSON.parse(localStorage.getItem('diagram_storage_config') || '{}');
        expect(persisted.secretAccessKey).toBe('');
        expect(sessionStorage.getItem('diagram_storage_config_secret')).toBe('super-secret');
        expect(s3Storage.getConfig()?.secretAccessKey).toBe('super-secret');
    });

    it('retains non-secret configuration when a new browser session needs the secret again', async () => {
        localStorage.setItem('diagram_storage_config', JSON.stringify({
            ...config,
            secretAccessKey: '',
        }));

        const { s3Storage } = await loadStorageService();

        expect(s3Storage.isConfigured()).toBe(false);
        expect(s3Storage.getConfig()).toBeNull();
        expect(s3Storage.getPersistedConfigDraft()).toEqual({
            ...config,
            secretAccessKey: '',
        });
        expect(JSON.parse(localStorage.getItem('diagram_storage_config') || '{}')).toMatchObject({
            endpoint: config.endpoint,
            accessKeyId: config.accessKeyId,
            bucket: config.bucket,
            region: config.region,
            secretAccessKey: '',
        });
    });

    it('drops oversized persisted S3 config on load', async () => {
        localStorage.setItem('diagram_storage_config', JSON.stringify({
            endpoint: 'https://s3.amazonaws.com',
            accessKeyId: 'AKIA_TEST',
            secretAccessKey: 'super-secret',
            bucket: 'vizly-diagrams',
            region: 'us-east-1',
            padding: 'x'.repeat(3 * 1024 * 1024),
        }));
        sessionStorage.setItem('diagram_storage_config_secret', 'stale-secret');

        const { s3Storage } = await loadStorageService();

        expect(s3Storage.isConfigured()).toBe(false);
        expect(s3Storage.getConfig()).toBeNull();
        expect(localStorage.getItem('diagram_storage_config')).toBeNull();
        expect(sessionStorage.getItem('diagram_storage_config_secret')).toBeNull();
        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[S3StorageProvider.loadConfig] Failed to read "diagram_storage_config":',
            expect.anything()
        );
    });

    it('reuses the session S3 secret when saving non-secret config changes', async () => {
        const { s3Storage } = await loadStorageService();

        s3Storage.saveConfig(config);
        s3Storage.saveConfig({
            ...config,
            secretAccessKey: '',
            bucket: 'updated-bucket',
        });

        const persisted = JSON.parse(localStorage.getItem('diagram_storage_config') || '{}');
        expect(persisted.bucket).toBe('updated-bucket');
        expect(persisted.secretAccessKey).toBe('');
        expect(sessionStorage.getItem('diagram_storage_config_secret')).toBe('super-secret');
        expect(s3Storage.getConfig()).toMatchObject({
            bucket: 'updated-bucket',
            secretAccessKey: 'super-secret',
        });
    });

    it('rejects non-local HTTP S3 endpoints', async () => {
        const { s3Storage } = await loadStorageService();

        expect(() => s3Storage.saveConfig({
            ...config,
            endpoint: 'http://169.254.169.254/latest/meta-data',
        })).toThrow('S3 configuration is invalid');
        expect(localStorage.getItem('diagram_storage_config')).toBeNull();
    });

    it('drops malformed persisted S3 config on load', async () => {
        localStorage.setItem('diagram_storage_config', JSON.stringify({
            endpoint: 'https://s3.amazonaws.com',
            accessKeyId: 'AKIA_TEST',
            bucket: '',
            region: 'us-east-1',
        }));
        sessionStorage.setItem('diagram_storage_config_secret', 'stale-secret');

        const { s3Storage } = await loadStorageService();

        expect(s3Storage.isConfigured()).toBe(false);
        expect(s3Storage.getConfig()).toBeNull();
        expect(localStorage.getItem('diagram_storage_config')).toBeNull();
        expect(sessionStorage.getItem('diagram_storage_config_secret')).toBeNull();
    });

    it('clears persisted config when stored JSON is malformed', async () => {
        localStorage.setItem('diagram_storage_config', '{bad-json');
        sessionStorage.setItem('diagram_storage_config_secret', 'stale-secret');

        const { s3Storage } = await loadStorageService();

        expect(s3Storage.isConfigured()).toBe(false);
        expect(s3Storage.getConfig()).toBeNull();
        expect(localStorage.getItem('diagram_storage_config')).toBeNull();
        expect(sessionStorage.getItem('diagram_storage_config_secret')).toBeNull();
        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[S3StorageProvider.loadConfig] Failed to read "diagram_storage_config":',
            expect.anything()
        );
        expect(safeLogState.error).toHaveBeenCalledWith('Failed to load storage config', expect.anything());
        expect(safeLogState.warn.mock.calls[0][0]).toBe('[S3StorageProvider.loadConfig] Failed to read "diagram_storage_config":');
    });

    it('loads remote S3 diagram JSON through bounded normalization', async () => {
        fetchMock.mockResolvedValueOnce(jsonObjectResponse(JSON.stringify({
            name: 'Remote Diagram',
            nodes: [
                {
                    id: 'n1',
                    label: 'Node 1',
                    domain: 'ops',
                    constructor: { polluted: true },
                },
            ],
            edges: [],
            metadata: { title: 'Remote Title' },
        })));

        const { s3Storage } = await loadStorageService();
        s3Storage.saveConfig(config);

        const saved = await s3Storage.loadDiagram('remote.json');
        const savedContent = saved.content as StandardDiagramData;

        expect(saved.title).toBe('Remote Title');
        expect(saved.content).toEqual(expect.objectContaining({
            id: 'remote.json',
            name: 'Remote Diagram',
            type: 'custom',
            version: '1.0.0',
        }));
        expect(savedContent.nodes).toEqual([
            expect.objectContaining({ id: 'n1', description: 'Node 1', domain: 'ops' }),
        ]);
        expect(Object.hasOwn(savedContent.nodes[0], 'constructor')).toBe(false);
    });

    it('rejects oversized remote S3 diagram JSON before parsing', async () => {
        fetchMock.mockResolvedValueOnce(jsonObjectResponse(`{ "nodes": [], "padding": "${'x'.repeat(5 * 1024 * 1024)}" }`));

        const { s3Storage } = await loadStorageService();
        s3Storage.saveConfig(config);

        await expect(s3Storage.loadDiagram('oversized.json')).rejects.toThrow('Remote diagram JSON is too large');
    });

    it('rejects invalid remote S3 diagram structures', async () => {
        fetchMock.mockResolvedValueOnce(jsonObjectResponse(JSON.stringify({ nodes: 'bad', edges: [] })));

        const { s3Storage } = await loadStorageService();
        s3Storage.saveConfig(config);

        await expect(s3Storage.loadDiagram('bad.json')).rejects.toThrow('Remote diagram is invalid');
    });

    it('propagates S3 delete failures instead of reporting false success', async () => {
        const failure = new Error('delete failed');
        fetchMock.mockRejectedValueOnce(failure);

        const { s3Storage } = await loadStorageService();
        s3Storage.saveConfig(config);

        await expect(s3Storage.deleteDiagram('remote.json')).rejects.toThrow('delete failed');
        expect(safeLogState.error).toHaveBeenCalledWith('Delete diagram failed:', expect.anything());
    });

    it('redacts S3 connection errors before logging diagnostics', async () => {
        const failure = {
            message: 'Authorization AWS4-HMAC-SHA256 Credential=AKIA_TEST/20260612 Signature=abcdef1234',
            secretAccessKey: 'super-secret',
        };
        fetchMock.mockRejectedValueOnce(failure);

        const { s3Storage } = await loadStorageService();
        s3Storage.saveConfig(config);

        await expect(s3Storage.testConnection()).rejects.toBe(failure);
        expect(safeLogState.error).toHaveBeenCalledWith('S3 Connection Test Failed', expect.anything());
        const loggedPayload = safeLogState.error.mock.calls[0]?.[1];
        expect(JSON.stringify(loggedPayload)).not.toContain('super-secret');
        expect(JSON.stringify(loggedPayload)).not.toContain('abcdef1234');
        expect(JSON.stringify(loggedPayload)).toContain('[redacted]');
    });

    it('tests ad-hoc S3 config without persisting failed connection settings', async () => {
        const failure = new Error('connection failed');
        fetchMock.mockRejectedValueOnce(failure);

        const { s3Storage } = await loadStorageService();

        await expect(s3Storage.testConnection(config)).rejects.toThrow('connection failed');

        expect(localStorage.getItem('diagram_storage_config')).toBeNull();
        expect(sessionStorage.getItem('diagram_storage_config_secret')).toBeNull();
        expect(s3Storage.getConfig()).toBeNull();
    });

    it('forwards the abort signal to the S3 connection request', async () => {
        fetchMock.mockResolvedValueOnce(xmlListResponse());
        const controller = new AbortController();
        const { s3Storage } = await loadStorageService();

        await s3Storage.testConnection(config, controller.signal);

        expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ signal: controller.signal }));
    });

    it('redacts storage bootstrap errors before logging them', async () => {
        const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
            if (key === 'diagram_storage_config') {
                throw new Error('Authorization: Bearer sk-live-secret');
            }
            return null;
        });

        await loadStorageService();

        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[S3StorageProvider.loadConfig] Failed to read "diagram_storage_config":',
            expect.anything()
        );
        expect(safeLogState.error).toHaveBeenCalledWith('Failed to load storage config', expect.anything());
        expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
        expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain('sk-live-secret');

        getItemSpy.mockRestore();
    });

    it('rejects the save without changing runtime state when session secret persistence fails', async () => {
        const originalSetItem = Storage.prototype.setItem;
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
            if (key === 'diagram_storage_config_secret') {
                throw new Error('secret=session-write-secret');
            }

            return originalSetItem.call(this, key, value);
        });

        const { s3Storage } = await loadStorageService();
        expect(() => s3Storage.saveConfig(config)).toThrow(
            'Unable to save S3 configuration in browser session storage.',
        );

        expect(s3Storage.getConfig()).toBeNull();
        expect(localStorage.getItem('diagram_storage_config')).toBeNull();
        expect(sessionStorage.getItem('diagram_storage_config_secret')).toBeNull();
        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[S3StorageProvider.saveConfig] Failed to write "diagram_storage_config_secret":',
            expect.anything()
        );
        expect(JSON.stringify(safeLogState.warn.mock.calls)).toContain('[redacted]');
        expect(JSON.stringify(safeLogState.warn.mock.calls)).not.toContain('session-write-secret');

        setItemSpy.mockRestore();
    });

    it('rolls back the session secret and runtime state when local config persistence fails', async () => {
        const originalSetItem = Storage.prototype.setItem;
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
            if (key === 'diagram_storage_config') {
                throw new Error('token=local-write-secret');
            }

            return originalSetItem.call(this, key, value);
        });

        const { s3Storage } = await loadStorageService();
        expect(() => s3Storage.saveConfig(config)).toThrow(
            'Unable to save S3 configuration in browser local storage.',
        );

        expect(s3Storage.getConfig()).toBeNull();
        expect(sessionStorage.getItem('diagram_storage_config_secret')).toBeNull();
        expect(localStorage.getItem('diagram_storage_config')).toBeNull();
        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[S3StorageProvider.saveConfig] Failed to write "diagram_storage_config":',
            expect.anything()
        );
        expect(JSON.stringify(safeLogState.warn.mock.calls)).toContain('[redacted]');
        expect(JSON.stringify(safeLogState.warn.mock.calls)).not.toContain('local-write-secret');

        setItemSpy.mockRestore();
    });

    it('preserves the previous persisted and runtime config when an update cannot be committed', async () => {
        const { s3Storage } = await loadStorageService();
        s3Storage.saveConfig(config);
        const previousLocalConfig = localStorage.getItem('diagram_storage_config');

        const originalSetItem = Storage.prototype.setItem;
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
            if (key === 'diagram_storage_config') {
                throw new Error('quota exceeded');
            }
            return originalSetItem.call(this, key, value);
        });

        expect(() => s3Storage.saveConfig({
            ...config,
            bucket: 'replacement-bucket',
            secretAccessKey: 'replacement-secret',
        })).toThrow('Unable to save S3 configuration in browser local storage.');

        expect(s3Storage.getConfig()).toMatchObject({
            bucket: config.bucket,
            secretAccessKey: config.secretAccessKey,
        });
        expect(localStorage.getItem('diagram_storage_config')).toBe(previousLocalConfig);
        expect(sessionStorage.getItem('diagram_storage_config_secret')).toBe(config.secretAccessKey);

        setItemSpy.mockRestore();
    });

    it('clears persisted, session, and runtime S3 configuration together', async () => {
        const { s3Storage } = await loadStorageService();
        s3Storage.saveConfig(config);

        s3Storage.clearConfig();

        expect(localStorage.getItem('diagram_storage_config')).toBeNull();
        expect(sessionStorage.getItem('diagram_storage_config_secret')).toBeNull();
        expect(s3Storage.getConfig()).toBeNull();
        expect(s3Storage.getPersistedConfigDraft()).toBeNull();
        expect(s3Storage.isConfigured()).toBe(false);
    });

    it('rolls back persisted configuration and preserves runtime state when clearing the session secret fails', async () => {
        const { s3Storage } = await loadStorageService();
        s3Storage.saveConfig(config);
        const previousLocalConfig = localStorage.getItem('diagram_storage_config');
        const originalRemoveItem = Storage.prototype.removeItem;
        const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key: string) {
            if (this === sessionStorage && key === 'diagram_storage_config_secret') {
                throw new Error('token=clear-failure-secret');
            }
            return originalRemoveItem.call(this, key);
        });

        expect(() => s3Storage.clearConfig()).toThrow(
            'Unable to clear the S3 configuration from browser storage.',
        );

        expect(localStorage.getItem('diagram_storage_config')).toBe(previousLocalConfig);
        expect(sessionStorage.getItem('diagram_storage_config_secret')).toBe(config.secretAccessKey);
        expect(s3Storage.getConfig()).toMatchObject(config);
        expect(s3Storage.isConfigured()).toBe(true);
        expect(JSON.stringify(safeLogState.warn.mock.calls)).toContain('[redacted]');
        expect(JSON.stringify(safeLogState.warn.mock.calls)).not.toContain('clear-failure-secret');

        removeItemSpy.mockRestore();
    });

    it('preserves configuration when the clear preflight cannot read browser storage', async () => {
        const { s3Storage } = await loadStorageService();
        s3Storage.saveConfig(config);
        const originalGetItem = Storage.prototype.getItem;
        const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
            if (this === sessionStorage && key === 'diagram_storage_config_secret') {
                throw new Error('Bearer clear-read-secret');
            }
            return originalGetItem.call(this, key);
        });

        expect(() => s3Storage.clearConfig()).toThrow(
            'Unable to read the current S3 configuration before clearing it.',
        );
        expect(s3Storage.getConfig()).toMatchObject(config);
        expect(s3Storage.isConfigured()).toBe(true);
        expect(JSON.stringify(safeLogState.warn.mock.calls)).toContain('[redacted]');
        expect(JSON.stringify(safeLogState.warn.mock.calls)).not.toContain('clear-read-secret');

        getItemSpy.mockRestore();
    });
});
