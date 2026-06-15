import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StorageConfig } from '../StorageService';

const sendMock = vi.fn();
const commandPayloads: unknown[] = [];

vi.mock('@aws-sdk/client-s3', () => ({
    S3Client: class {
        send = sendMock;
    },
    DeleteObjectCommand: class {
        constructor(payload: unknown) {
            commandPayloads.push(payload);
        }
    },
    GetObjectCommand: class {
        constructor(payload: unknown) {
            commandPayloads.push(payload);
        }
    },
    ListObjectsV2Command: class {
        constructor(payload: unknown) {
            commandPayloads.push(payload);
        }
    },
    PutObjectCommand: class {
        constructor(payload: unknown) {
            commandPayloads.push(payload);
        }
    },
}));

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
    afterEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        sendMock.mockReset();
        commandPayloads.length = 0;
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

    it('loads remote S3 diagram JSON through bounded normalization', async () => {
        sendMock.mockResolvedValueOnce({
            Body: {
                transformToString: async () => JSON.stringify({
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
                }),
            },
            LastModified: new Date('2026-01-01T00:00:00.000Z'),
        });

        const { s3Storage } = await loadStorageService();
        s3Storage.saveConfig(config);

        const saved = await s3Storage.loadDiagram('remote.json');

        expect(saved.title).toBe('Remote Title');
        expect(saved.content).toEqual(expect.objectContaining({
            id: 'remote.json',
            name: 'Remote Diagram',
            type: 'custom',
            version: '1.0.0',
        }));
        expect(saved.content.nodes).toEqual([
            expect.objectContaining({ id: 'n1', description: 'Node 1', domain: 'ops' }),
        ]);
        expect(Object.hasOwn(saved.content.nodes[0], 'constructor')).toBe(false);
    });

    it('rejects oversized remote S3 diagram JSON before parsing', async () => {
        sendMock.mockResolvedValueOnce({
            Body: {
                transformToString: async () => `{ "nodes": [], "padding": "${'x'.repeat(5 * 1024 * 1024)}" }`,
            },
        });

        const { s3Storage } = await loadStorageService();
        s3Storage.saveConfig(config);

        await expect(s3Storage.loadDiagram('oversized.json')).rejects.toThrow('Remote diagram JSON is too large');
    });

    it('rejects invalid remote S3 diagram structures', async () => {
        sendMock.mockResolvedValueOnce({
            Body: {
                transformToString: async () => JSON.stringify({ nodes: 'bad', edges: [] }),
            },
        });

        const { s3Storage } = await loadStorageService();
        s3Storage.saveConfig(config);

        await expect(s3Storage.loadDiagram('bad.json')).rejects.toThrow('Remote diagram is invalid');
    });

    it('propagates S3 delete failures instead of reporting false success', async () => {
        const failure = new Error('delete failed');
        sendMock.mockRejectedValueOnce(failure);
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const { s3Storage } = await loadStorageService();
        s3Storage.saveConfig(config);

        await expect(s3Storage.deleteDiagram('remote.json')).rejects.toThrow('delete failed');
        expect(consoleErrorSpy).toHaveBeenCalledWith('Delete diagram failed:', expect.anything());

        consoleErrorSpy.mockRestore();
    });

    it('redacts S3 connection errors before logging diagnostics', async () => {
        const failure = {
            message: 'Authorization AWS4-HMAC-SHA256 Credential=AKIA_TEST/20260612 Signature=abcdef1234',
            secretAccessKey: 'super-secret',
        };
        sendMock.mockRejectedValueOnce(failure);
        const consoleGroupSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const consoleGroupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

        const { s3Storage } = await loadStorageService();
        s3Storage.saveConfig(config);

        await expect(s3Storage.testConnection()).rejects.toBe(failure);
        const loggedPayload = consoleErrorSpy.mock.calls[0]?.[1];
        expect(JSON.stringify(loggedPayload)).not.toContain('super-secret');
        expect(JSON.stringify(loggedPayload)).not.toContain('abcdef1234');
        expect(JSON.stringify(loggedPayload)).toContain('[redacted]');

        consoleGroupSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        consoleGroupEndSpy.mockRestore();
    });

    it('tests ad-hoc S3 config without persisting failed connection settings', async () => {
        const failure = new Error('connection failed');
        sendMock.mockRejectedValueOnce(failure);
        const consoleGroupSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const consoleGroupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

        const { s3Storage } = await loadStorageService();

        await expect(s3Storage.testConnection(config)).rejects.toThrow('connection failed');

        expect(localStorage.getItem('diagram_storage_config')).toBeNull();
        expect(sessionStorage.getItem('diagram_storage_config_secret')).toBeNull();
        expect(s3Storage.getConfig()).toBeNull();

        consoleGroupSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        consoleGroupEndSpy.mockRestore();
    });
});
