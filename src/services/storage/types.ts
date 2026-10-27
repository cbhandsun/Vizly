import type { ClipboardData } from '@vizly/core/diagram-import';

export interface DiagramMetadata {
    id: string; // ID or Key
    title: string;
    updatedAt: Date;
    userId?: string;
    size?: number;
    role?: string;
}

export interface SavedDiagram {
    id: string;
    title: string;
    content: unknown;
    updated_at: string;
    user_id: string;
    /** Exact revision of the loaded view. Omit only when creating a new document. */
    expectedRevision?: string;
}

export type VersionSaveFailure = 'authentication' | 'permission' | 'configuration' | 'data' | 'network' | 'unknown';

export interface VersionStorageState {
    location: 'local' | 'cloud';
    syncStatus: 'pending' | 'synced' | 'legacy';
    ownerId: string | null;
    provider: 'supabase' | 's3';
    localCreated: boolean;
    failure?: VersionSaveFailure;
    remoteVersionId?: string;
    automaticSync?: 'queued' | 'retrying' | 'blocked' | 'capacity';
    syncAttempts?: number;
    nextSyncAttemptAt?: number;
}

export interface DiagramVersion {
    storage?: VersionStorageState;
    id: string;
    diagramId: string;
    snapshotData: ClipboardData | null;
    authorId?: string;
    createdAt: number;
    message?: string;
}

export interface IdempotentVersionWrite {
    ownerId: string;
    operationId: string;
    payloadHash: string;
    signal?: AbortSignal;
}

export interface IStorageProvider {
    name: string;
    id: 's3' | 'supabase';

    // Core Operations
    listDiagrams(): Promise<DiagramMetadata[]>;
    loadDiagram(id: string): Promise<SavedDiagram>;
    saveDiagram(diagram: SavedDiagram): Promise<SavedDiagram>;
    deleteDiagram(id: string): Promise<void>;

    // Versioning Operations
    listVersions?(diagramId: string): Promise<DiagramVersion[]>;
    loadVersion?(diagramId: string, versionId: string): Promise<DiagramVersion | null>;
    saveVersion?(diagramId: string, data: unknown, message?: string): Promise<DiagramVersion>;
    saveVersionIdempotent?(diagramId: string, data: unknown, message: string | undefined, operation: IdempotentVersionWrite): Promise<DiagramVersion>;

    // Config / Auth
    isConfigured(): boolean;
    // Optional: test connection
    testConnection?(): Promise<boolean>;
}
