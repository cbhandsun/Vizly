import type { Page } from '@playwright/test';

export const persistedDiagramCount = (page: Page) => page.evaluate(async () => {
  if (!(await indexedDB.databases()).some(database => database.name === 'VizlyLocalDB')) return 0;
  return new Promise<number>((resolve, reject) => {
    const open = indexedDB.open('VizlyLocalDB');
    open.onerror = () => reject(new Error('Could not inspect local database'));
    open.onblocked = () => reject(new Error('Local database inspection was blocked'));
    open.onsuccess = () => {
      const database = open.result;
      database.onversionchange = () => database.close();
      if (!database.objectStoreNames.contains('local_diagrams')) {
        database.close();
        reject(new Error('Local diagram store is missing'));
        return;
      }
      const transaction = database.transaction('local_diagrams', 'readonly');
      const request = transaction.objectStore('local_diagrams').count();
      transaction.oncomplete = () => { database.close(); resolve(request.result); };
      transaction.onabort = () => { database.close(); reject(new Error('Inspection transaction aborted')); };
    };
  });
});

// Canvas edits are durably saved in the document-scoped autosave. IndexedDB
// contains the original registry document and does not track each canvas edit.
export const persistedAutoSaveNodeCount = (page: Page, id: string) => page.evaluate(id => {
  const serialized = localStorage.getItem(`flowchart-autosave-v2-${id}`);
  if (serialized === null) return 0;
  const saved: unknown = JSON.parse(serialized);
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)
    || !('diagramId' in saved) || saved.diagramId !== id
    || !('version' in saved) || saved.version !== '1.0'
    || !('nodes' in saved) || !Array.isArray(saved.nodes)
    || !('edges' in saved) || !Array.isArray(saved.edges)) {
    throw new Error('Saved canvas identity or snapshot is invalid');
  }
  return saved.nodes.length;
}, id);
