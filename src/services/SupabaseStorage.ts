import { supabase } from './supabase';
import { IStorageProvider, DiagramMetadata, SavedDiagram } from './storage/types';

// Backward compatibility export (type mostly)
export type { SavedDiagram };

export class SupabaseStorageProvider implements IStorageProvider {
    name = 'Supabase Cloud';
    id: 'supabase' = 'supabase';

    isConfigured(): boolean {
        // Assume configured if module loaded (env vars checking could happen here)
        return true;
    }

    async saveDiagram(diagram: SavedDiagram): Promise<SavedDiagram> {
        const { data, error } = await supabase!
            .from('diagrams')
            .upsert({
                id: diagram.id,
                title: diagram.title,
                content: diagram.content,
                user_id: diagram.user_id,
                updated_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (error) throw error;
        return data as SavedDiagram;
    }

    async listDiagrams(): Promise<DiagramMetadata[]> {
        const { data, error } = await supabase!
            .from('diagrams')
            .select('id, title, updated_at, user_id')
            .order('updated_at', { ascending: false });

        if (error) throw error;

        return (data || []).map(item => ({
            id: item.id,
            title: item.title,
            updatedAt: new Date(item.updated_at),
            userId: item.user_id
        }));
    }

    async loadDiagram(id: string): Promise<SavedDiagram> {
        const { data, error } = await supabase!
            .from('diagrams')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data as SavedDiagram;
    }

    async deleteDiagram(id: string): Promise<void> {
        const { error } = await supabase!
            .from('diagrams')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }

    // === Version History (GAP-05) ===
    async saveVersion(diagramId: string, data: any, message?: string) {
        const { data: dbData, error } = await supabase!
            .from('diagram_versions')
            .insert({
                diagram_id: diagramId,
                snapshot_data: data,
                message: message || '版本快照',
                author_id: 'anonymous' // Can be replaced with actual user later
            })
            .select()
            .single();
        if (error) throw error;
        return {
            id: dbData.id,
            diagramId: dbData.diagram_id,
            snapshotData: dbData.snapshot_data,
            authorId: dbData.author_id,
            createdAt: new Date(dbData.created_at).getTime(),
            message: dbData.message
        };
    }

    async listVersions(diagramId: string) {
        const { data, error } = await supabase!
            .from('diagram_versions')
            .select('id, diagram_id, author_id, created_at, message') // Omit heavy snapshotData for list
            .eq('diagram_id', diagramId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []).map(item => ({
            id: item.id,
            diagramId: item.diagram_id,
            snapshotData: null, // Don't load snapshot data in list for performance
            authorId: item.author_id,
            createdAt: new Date(item.created_at).getTime(),
            message: item.message
        }));
    }

    async loadVersion(diagramId: string, versionId: string) {
        const { data, error } = await supabase!
            .from('diagram_versions')
            .select('*')
            .eq('id', versionId)
            .eq('diagram_id', diagramId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null; // Not found
            throw error;
        }

        return {
            id: data.id,
            diagramId: data.diagram_id,
            snapshotData: data.snapshot_data,
            authorId: data.author_id,
            createdAt: new Date(data.created_at).getTime(),
            message: data.message
        };
    }

    // === Config specific to Supabase user configs ===
    async saveConfig(key: string, value: any, user_id: string) {
        const { data, error } = await supabase!
            .from('user_configs')
            .upsert({
                user_id: user_id,
                key: key,
                value: value,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id,key' })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async loadConfig(key: string) {
        const { data, error } = await supabase!
            .from('user_configs')
            .select('value')
            .eq('key', key)
            .limit(1);

        if (error) throw error;
        if (data && data.length > 0) return data[0].value;
        return null;
    }

    async loadAllConfigs() {
        const { data, error } = await supabase!
            .from('user_configs')
            .select('key, value');
        if (error) throw error;
        return data || [];
    }
}

// Singleton instance
export const supabaseStorage = new SupabaseStorageProvider();

// Legacy adapter to keep existing code working (temporarily)
export const storageService = supabaseStorage;

