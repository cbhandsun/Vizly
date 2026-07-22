import type { ClipboardData } from '@/core/utils/flowchartClipboard';

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
}

export interface DiagramVersion {
    id: string;
    diagramId: string;
    snapshotData: ClipboardData | null;
    authorId?: string;
    createdAt: number;
    message?: string;
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

    // Config / Auth
    isConfigured(): boolean;
    // Optional: test connection
    testConnection?(): Promise<boolean>;
}
