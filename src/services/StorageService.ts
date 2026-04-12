import { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { IStorageProvider, DiagramMetadata, SavedDiagram } from './storage/types';

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

export class S3StorageProvider implements IStorageProvider {
    name = 'S3 Compatible Storage';
    id: 's3' = 's3';

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

    private loadConfig() {
        try {
            const stored = localStorage.getItem(STORAGE_CONFIG_KEY);
            if (stored) {
                this.config = JSON.parse(stored);
                this.initializeClient();
            }
        } catch (e) {
            console.error("Failed to load storage config", e);
        }
    }

    saveConfig(config: StorageConfig) {
        this.config = config;
        localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
        this.initializeClient();
    }

    getConfig(): StorageConfig | null {
        return this.config;
    }

    private initializeClient() {
        if (!this.config) return;

        this.client = new S3Client({
            region: this.config.region,
            endpoint: this.config.endpoint,
            credentials: {
                accessKeyId: this.config.accessKeyId,
                secretAccessKey: this.config.secretAccessKey,
            },
            forcePathStyle: this.config.s3ForcePathStyle ?? true, // Default to true for many S3 compatible services
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
            console.error("List diagrams failed:", error);
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
            const content = JSON.parse(str);

            // Adapt to SavedDiagram
            // Use metadata from content if available, else standard fallback
            return {
                id: id,
                title: content.title || id.replace('.json', ''),
                content: content,
                updated_at: (response.LastModified || new Date()).toISOString(),
                user_id: 's3-user' // S3 doesn't have inherent user concept here
            };
        } catch (error) {
            console.error("Load diagram failed:", error);
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
            console.error("Save diagram failed:", error);
            throw error;
        }
    }

    async deleteDiagram(id: string): Promise<void> {
        if (!this.client || !this.config) {
            throw new Error("Storage not configured");
        }

        try {
            const command = new DeleteObjectCommand({ // Need to import this
                Bucket: this.config.bucket,
                Key: id
            });
            // Auto imports will fail if I don't add it to the top
            // I'll assume I need to add DeleteObjectCommand to imports
            await this.client.send(command);
        } catch (error) {
            // throw error; 
        }
    }

    // === Operations (Legacy / specific) ===

    async testConnection(): Promise<boolean> {
        if (!this.client || !this.config) {
            throw new Error("Storage not configured");
        }
        try {
            const command = new ListObjectsV2Command({
                Bucket: this.config.bucket,
                MaxKeys: 1
            });
            await this.client.send(command);
            return true;
        } catch (error: any) {
            console.group("S3 Connection Test Failed");
            console.error("Original Error:", error);
            // ...
            console.groupEnd();
            throw error;
        }
    }
}

// Additional import needed for DeleteObjectCommand
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

export const s3Storage = S3StorageProvider.getInstance();

