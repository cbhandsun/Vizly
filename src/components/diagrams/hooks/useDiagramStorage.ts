import { useState, useCallback } from 'react';
import { DiagramMetadata } from '@/services/storage/types';
import type { StandardDiagramData } from '@/core/models/DiagramModels';
import { dataService } from '@/services/DataService';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { safeLog } from '@/core/utils/consoleCleanup';
import {
  logDiagramStorageCloudListFailure,
  logDiagramStorageTemplateFetchException,
  logDiagramStorageTemplateFetchFailure,
} from './diagramStorageLogging';
import { parseRemoteDiagramContent } from '@/services/remoteDiagramContent';

export interface SystemTemplateMetadata {
  id: string;
  title: string;
  category?: string;
  tags?: string[];
  sort_order?: number;
}

const loadUnifiedStorage = async () => (await import('@/services/UnifiedStorageService')).unifiedStorage;
const loadSupabase = async () => (await import('@/services/supabase')).supabase;

export function useDiagramStorage() {
  const [s3Diagrams, setS3Diagrams] = useState<DiagramMetadata[]>([]);
  const [supabaseDiagrams, setSupabaseDiagrams] = useState<DiagramMetadata[]>([]);
  const [systemTemplates, setSystemTemplates] = useState<SystemTemplateMetadata[]>([]);

  const fetchCloudList = useCallback(async () => {
    const [unifiedStorage, supabase] = await Promise.all([
      loadUnifiedStorage(),
      loadSupabase(),
    ]);

    // Fetch from S3
    try {
      const s3Provider = unifiedStorage.getProvider('s3');
      if (s3Provider.isConfigured()) {
        const items = await s3Provider.listDiagrams();
        setS3Diagrams(items || []);
      }
    } catch (error) {
      logDiagramStorageCloudListFailure('s3', error);
    }

    // Fetch from Supabase
    try {
      const sbProvider = unifiedStorage.getProvider('supabase');
      if (sbProvider.isConfigured()) {
        const items = await sbProvider.listDiagrams();
        setSupabaseDiagrams(items || []);
      }
    } catch (error) {
      logDiagramStorageCloudListFailure('supabase', error);
    }

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
          logDiagramStorageTemplateFetchFailure(error);
        } else if (data) {
          safeLog.debug('Fetched system templates:', data);
          setSystemTemplates(data as SystemTemplateMetadata[]);
        }
      } catch (err) {
        logDiagramStorageTemplateFetchException(err);
      }
    }
  }, []);

  const loadFromCloud = async (key: string, sourceGroup: string): Promise<StandardDiagramData | null> => {
    // Special handling for generic system templates
    if (sourceGroup === 'system-templates') {
      const registered = dataService.getDiagram(key);
      if (registered) {
        return registered as StandardDiagramData;
      }
      
      // Fallback: If not found in memory, try fetching directly from db
      const supabase = await loadSupabase();
      if (supabase) {
        const hide = appMessage.loading(`正在从云端模板库加载...`, 0);
        try {
          const { data, error } = await supabase
            .from('system_templates')
            .select('content')
            .eq('id', key)
            .single();
            
          if (!error && data && data.content) {
            return parseRemoteDiagramContent(data.content, { id: key, title: key }) as StandardDiagramData;
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
      const unifiedStorage = await loadUnifiedStorage();
      const provider = unifiedStorage.getProvider(sourceGroup);
      const saved = await provider.loadDiagram(key);
      if (saved && saved.content) {
        return parseRemoteDiagramContent(saved.content, {
          id: saved.id || key,
          title: saved.title || key,
        }) as StandardDiagramData;
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
