import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import { unifiedStorage } from '@/services/UnifiedStorageService';
import { DiagramMetadata } from '@/services/storage/types';
import { StandardDiagramData } from '@/core';
import { dataService } from '@/services/DataService';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { supabase } from '@/services/supabase';

export interface SystemTemplateMetadata {
  id: string;
  title: string;
  category?: string;
  tags?: string[];
  sort_order?: number;
}

export function useDiagramStorage() {
  const [s3Diagrams, setS3Diagrams] = useState<DiagramMetadata[]>([]);
  const [supabaseDiagrams, setSupabaseDiagrams] = useState<DiagramMetadata[]>([]);
  const [systemTemplates, setSystemTemplates] = useState<SystemTemplateMetadata[]>([]);

  const fetchCloudList = useCallback(async () => {
    // Fetch from S3
    try {
      const s3Provider = unifiedStorage.getProvider('s3');
      if (s3Provider.isConfigured()) {
        const items = await s3Provider.listDiagrams();
        setS3Diagrams(items || []);
      }
    } catch { void 0; }

    // Fetch from Supabase
    try {
      const sbProvider = unifiedStorage.getProvider('supabase');
      if (sbProvider.isConfigured()) {
        const items = await sbProvider.listDiagrams();
        setSupabaseDiagrams(items || []);
      }
    } catch { void 0; }

    // Fetch generic system templates from Supabase
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('system_templates')
          .select('id, title, category, tags, sort_order')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false });
        
        if (error) {
          console.error('Error fetching system templates:', error);
        } else if (data) {
          console.log('Fetched system templates:', data);
          setSystemTemplates(data as SystemTemplateMetadata[]);
        }
      } catch (err) {
        console.error('Exception fetching system templates:', err);
      }
    }
  }, []);

  useEffect(() => {
    fetchCloudList();
  }, [fetchCloudList]);

  const loadFromCloud = async (key: string, sourceGroup: string): Promise<StandardDiagramData | null> => {
    // Special handling for generic system templates
    if (sourceGroup === 'system-templates') {
      const registered = dataService.getDiagram(key);
      if (registered) {
        return registered as StandardDiagramData;
      }
      
      // Fallback: If not found in memory, try fetching directly from db
      if (supabase) {
        const hide = appMessage.loading(`正在从云端模板库加载...`, 0);
        try {
          const { data, error } = await supabase
            .from('system_templates')
            .select('content')
            .eq('id', key)
            .single();
            
          if (!error && data && data.content) {
            return data.content as StandardDiagramData;
          }
        } finally {
          hide();
        }
      }
      return null;
    }

    if (sourceGroup !== 's3' && sourceGroup !== 'supabase') return null;
    const hide = appMessage.loading(`正在从 ${sourceGroup === 's3' ? 'S3' : 'Supabase'} 加载...`, 0);
    try {
      const provider = unifiedStorage.getProvider(sourceGroup as any);
      const saved = await provider.loadDiagram(key);
      if (saved && saved.content) {
        return saved.content as StandardDiagramData;
      }
    } catch (e) {
      // Fallback: if loadDiagram fails (e.g. shared diagrams), try locally registered data
      const registered = dataService.getDiagram(key);
      if (registered) {
        return registered as StandardDiagramData;
      }
      appMessage.error(`${sourceGroup.toUpperCase()} 加载失败`);
      throw e;
    } finally {
      hide();
    }
    return null;
  };

  return { s3Diagrams, supabaseDiagrams, systemTemplates, fetchCloudList, loadFromCloud };
}
