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
    content: any;
    updated_at: string;
    user_id: string;
}

export interface IStorageProvider {
    name: string;
    id: 's3' | 'supabase';

    // Core Operations
    listDiagrams(): Promise<DiagramMetadata[]>;
    loadDiagram(id: string): Promise<SavedDiagram>;
    saveDiagram(diagram: SavedDiagram): Promise<SavedDiagram>;
    deleteDiagram(id: string): Promise<void>;

    // Config / Auth
    isConfigured(): boolean;
    // Optional: test connection
    testConnection?(): Promise<boolean>;
}
