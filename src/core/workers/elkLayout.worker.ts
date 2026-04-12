import ELK from 'elkjs/lib/elk-api';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';

const elk = new ELK({
  workerUrl: elkWorkerUrl
});

self.onmessage = async (event) => {
  const { id, graph, options } = event.data;

  try {
    // Ensure layout options are merged
    const layoutGraph = {
      ...graph,
      layoutOptions: {
        ...graph.layoutOptions,
        ...options
      }
    };

    const result = await elk.layout(layoutGraph);

    self.postMessage({
      id,
      result,
      error: null
    });
  } catch (error) {
    console.error(`[Worker] Layout failed for ${id}:`, error);
    self.postMessage({
      id,
      result: null,
      error: (error as Error).message || String(error)
    });
  }
};
