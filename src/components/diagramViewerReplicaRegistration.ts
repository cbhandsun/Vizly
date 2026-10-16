import type { DiagramViewerSavedReplica } from './diagramViewerSave';

/** Commit the saved snapshot locally before mounting the new document scope. */
export const registerDiagramViewerCloudReplica = async (replica: DiagramViewerSavedReplica): Promise<void> => {
  const { dataRegistry } = await import('@/data/DataRegistry');
  await dataRegistry.initialize();
  await dataRegistry.getDataService().registerRemoteDiagram(replica.content, {
    id: replica.id, title: replica.title,
  }, true, {
    id: replica.id,
    name: replica.title,
    metadata: {
      title: replica.title,
      cloud: {
        provider: replica.provider, id: replica.id, title: replica.title,
        ...(replica.revision ? { revision: replica.revision } : {}),
      },
    },
    isReadonly: false,
  });
};
