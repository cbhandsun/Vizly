import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import { unifiedStorage } from '@/services/UnifiedStorageService';
import { DiagramMetadata } from '@/services/storage/types';
import { StandardDiagramData } from '@/core';
import { dataService } from '@/services/DataService';
import { appMessage } from '@/core/utils/antdStaticBridge';


export function useDiagramStorage() {
  const [s3Diagrams, setS3Diagrams] = useState<DiagramMetadata[]>([]);
  const [supabaseDiagrams, setSupabaseDiagrams] = useState<DiagramMetadata[]>([]);

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
  }, []);

  useEffect(() => {
    fetchCloudList();
  }, [fetchCloudList]);

  const loadFromCloud = async (key: string, sourceGroup: string): Promise<StandardDiagramData | null> => {
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

  return { s3Diagrams, supabaseDiagrams, fetchCloudList, loadFromCloud };
}
