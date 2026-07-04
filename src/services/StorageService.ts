import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { IStorageProvider, DiagramMetadata, SavedDiagram } from './storage/types';
import { coerceS3StorageConfig, redactSensitiveValue } from './storageSecurity';
import { parseRemoteDiagramJson } from './remoteDiagramContent';
import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';
import { logUiStorageReadFailure, logUiStorageWriteFailure } from '@/core/utils/uiStorageLogging';
import { safeJsonParseWithLimit } from '@/core/utils/jsonUtils';

export interface StorageConfig {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    region: string;
    s3ForcePathStyle?: boolean; // For MinIO or compatible services
}

export interface StorageItem {
    key: string;
    lastModified?: Date;
    size?: number;
    data?: any;
}

const STORAGE_CONFIG_KEY = 'diagram_storage_config';
const STORAGE_SECRET_SESSION_KEY = `${STORAGE_CONFIG_KEY}_secret`;
const MAX_S3_STORAGE_CONFIG_JSON_CHARS = 2 * 1024 * 1024;

const stripSecret = (config: StorageConfig): StorageConfig => ({
    ...config,
    secretAccessKey: '',
});


export class S3StorageProvider implements IStorageProvider {
    name = 'S3 Compatible Storage';
    id = 's3' as const;

    private static instance: S3StorageProvider;
    private client: S3Client | null = null;
    private config: StorageConfig | null = null;

    private constructor() {
        this.loadConfig();
    }

    static getInstance(): S3StorageProvider {
        if (!S3StorageProvider.instance) {
            S3StorageProvider.instance = new S3StorageProvider();
        }
        return S3StorageProvider.instance;
    }

    // === Configuration ===

    isConfigured(): boolean {
        return !!this.client && !!this.config;
    }

    private readPersistedConfig(): string | null {
        try {
            return localStorage.getItem(STORAGE_CONFIG_KEY);
        } catch (error) {
            logUiStorageReadFailure('S3StorageProvider.loadConfig', STORAGE_CONFIG_KEY, error);
            throw error;
        }
    }

    private readPersistedSessionSecret(): string {
        try {
            return sessionStorage.getItem(STORAGE_SECRET_SESSION_KEY) || '';
        } catch (error) {
            logUiStorageReadFailure('S3StorageProvider.readSessionSecret', STORAGE_SECRET_SESSION_KEY, error);
            return '';
        }
    }

    private persistSessionSecret(secretAccessKey: string, source: string): void {
        try {
            sessionStorage.setItem(STORAGE_SECRET_SESSION_KEY, secretAccessKey);
        } catch (error) {
            logUiStorageWriteFailure(source, STORAGE_SECRET_SESSION_KEY, error);
        }
    }

    private persistSanitizedConfig(config: StorageConfig, source: string): void {
        try {
            localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(stripSecret(config)));
        } catch (error) {
            logUiStorageWriteFailure(source, STORAGE_CONFIG_KEY, error);
        }
    }

    private clearPersistedConfig(): void {
        try {
            localStorage.removeItem(STORAGE_CONFIG_KEY);
        } catch (error) {
            logUiStorageWriteFailure('S3StorageProvider.clearPersistedConfig', STORAGE_CONFIG_KEY, error);
        }

        try {
            sessionStorage.removeItem(STORAGE_SECRET_SESSION_KEY);
        } catch (error) {
            logUiStorageWriteFailure('S3StorageProvider.clearPersistedConfig', STORAGE_SECRET_SESSION_KEY, error);
        }
    }

    private clearCachedSessionSecret(): void {
        try {
            sessionStorage.removeItem(STORAGE_SECRET_SESSION_KEY);
        } catch (error) {
            logUiStorageWriteFailure('S3StorageProvider.clearPersistedConfig', STORAGE_SECRET_SESSION_KEY, error);
        }
    }

    private loadConfig() {
        try {
            const stored = this.readPersistedConfig();
            if (stored) {
                let readFailure: unknown = null;
                const parsed = safeJsonParseWithLimit<unknown>(stored, null, {
                    maxLength: MAX_S3_STORAGE_CONFIG_JSON_CHARS,
                    onFailure: (error) => {
                        readFailure = error;
                        logUiStorageReadFailure('S3StorageProvider.loadConfig', STORAGE_CONFIG_KEY, error);
                    },
                    buildOversizeError: () => new Error('S3 storage config JSON is too large.'),
                });
                if (!parsed) {
                    this.clearPersistedConfig();
                    if (readFailure) {
                        safeLog.error('Failed to load storage config', redactSensitiveLogValue(readFailure));
                    }
                    return;
                }
                const sessionSecret = this.readPersistedSessionSecret();
                const safeConfig = coerceS3StorageConfig(parsed, sessionSecret);
                if (!safeConfig) {
                    this.clearPersistedConfig();
                    return;
                }

                if (safeConfig.secretAccessKey && !sessionSecret) {
                    this.persistSessionSecret(safeConfig.secretAccessKey, 'S3StorageProvider.loadConfig');
                }

                this.config = safeConfig;
                if (parsed.secretAccessKey) {
                    this.persistSanitizedConfig(this.config, 'S3StorageProvider.loadConfig');
                }
                this.initializeClient();
            }
        } catch (e) {
            logUiStorageReadFailure('S3StorageProvider.loadConfig', STORAGE_CONFIG_KEY, e);
            this.clearPersistedConfig();
            safeLog.error('Failed to load storage config', redactSensitiveLogValue(e));
        }
    }

    saveConfig(config: StorageConfig) {
        const existingSecret = this.readPersistedSessionSecret();
        const safeConfig = coerceS3StorageConfig(config, config.secretAccessKey || existingSecret);
        if (!safeConfig) {
            throw new Error('S3 configuration is invalid. Endpoint must use HTTPS or local HTTP, and bucket, region, access key, and secret are required.');
        }

        this.config = safeConfig;
        this.persistSessionSecret(this.config.secretAccessKey, 'S3StorageProvider.saveConfig');
        this.persistSanitizedConfig(this.config, 'S3StorageProvider.saveConfig');
        this.initializeClient();
    }

    getConfig(): StorageConfig | null {
        return this.config;
    }

    private initializeClient() {
        if (!this.config) return;
        if (!this.config.secretAccessKey) {
            this.client = null;
            return;
        }

        this.client = this.createClient(this.config);
    }

    private createClient(config: StorageConfig): S3Client {
        return new S3Client({
            region: config.region,
            endpoint: config.endpoint,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
            forcePathStyle: config.s3ForcePathStyle ?? true, // Default to true for many S3 compatible services
        });
    }

    // === IStorageProvider Implementation ===

    async listDiagrams(): Promise<DiagramMetadata[]> {
        if (!this.client || !this.config) {
            throw new Error("Storage not configured");
        }

        try {
            const command = new ListObjectsV2Command({
                Bucket: this.config.bucket,
                Prefix: ''
            });

            const response = await this.client.send(command);

            return (response.Contents || [])
                .filter(item => item.Key?.endsWith('.json'))
                .map(item => ({
                    id: item.Key!,
                    title: item.Key!.replace('.json', ''), // Simple title derivation
                    updatedAt: item.LastModified || new Date(),
                    size: item.Size
                }));
        } catch (error) {
            safeLog.error('List diagrams failed:', redactSensitiveLogValue(error));
            throw error;
        }
    }


    async loadDiagram(id: string): Promise<SavedDiagram> {
        if (!this.client || !this.config) {
            throw new Error("Storage not configured");
        }

        try {
            const command = new GetObjectCommand({
                Bucket: this.config.bucket,
                Key: id
            });

            const response = await this.client.send(command);

            if (!response.Body) {
                throw new Error("Empty response body");
            }

            const str = await response.Body.transformToString();
            const fallbackTitle = id.replace(/\.json$/i, '');
            const content = parseRemoteDiagramJson(str, { id, title: fallbackTitle });

            // Adapt to SavedDiagram
            // Use metadata from content if available, else standard fallback
            return {
                id: id,
                title: content.title || content.metadata?.title || content.name || fallbackTitle,
                content: content,
                updated_at: (response.LastModified || new Date()).toISOString(),
                user_id: 's3-user' // S3 doesn't have inherent user concept here
            };
        } catch (error) {
            safeLog.error('Load diagram failed:', redactSensitiveLogValue(error));
            throw error;
        }
    }

    async saveDiagram(diagram: SavedDiagram): Promise<SavedDiagram> {
        if (!this.client || !this.config) {
            throw new Error("Storage not configured");
        }

        // Ensure filename ends with .json
        // Use title as filename if ID is not a filename, or just use ID
        let key = diagram.id;
        if (!key.endsWith('.json')) {
            // If ID is a UUID (Supabase style), we might want to store it as such, or use title?
            // For S3, let's stick to using the ID as the key for consistency.
            key = `${key}.json`;
        }

        try {
            const command = new PutObjectCommand({
                Bucket: this.config.bucket,
                Key: key,
                Body: JSON.stringify(diagram.content, null, 2), // Storing just content to remain compatible with generic S3 viewers
                ContentType: 'application/json'
            });

            await this.client.send(command);

            return {
                ...diagram,
                id: key
            };
        } catch (error) {
            safeLog.error('Save diagram failed:', redactSensitiveLogValue(error));
            throw error;
        }
    }

    async deleteDiagram(id: string): Promise<void> {
        if (!this.client || !this.config) {
            throw new Error("Storage not configured");
        }

        try {
            const command = new DeleteObjectCommand({
                Bucket: this.config.bucket,
                Key: id
            });
            await this.client.send(command);
        } catch (error) {
            safeLog.error('Delete diagram failed:', redactSensitiveValue(error));
            throw error;
        }
    }

    // === Operations (Legacy / specific) ===

    async testConnection(config?: StorageConfig): Promise<boolean> {
        const existingSecret = this.readPersistedSessionSecret();
        const configToTest = config
            ? coerceS3StorageConfig(config, config.secretAccessKey || existingSecret)
            : this.config;

        if (!configToTest) {
            throw new Error('S3 configuration is invalid. Endpoint must use HTTPS or local HTTP, and bucket, region, access key, and secret are required.');
        }

        const client = config ? this.createClient(configToTest) : this.client;
        if (!client) {
            throw new Error("Storage not configured");
        }

        try {
            const command = new ListObjectsV2Command({
                Bucket: configToTest.bucket,
                MaxKeys: 1
            });
            await client.send(command);
            return true;
        } catch (error: any) {
            safeLog.error('S3 Connection Test Failed', redactSensitiveLogValue(error));
            throw error;
        }
    }
}

export const s3Storage = S3StorageProvider.getInstance();

