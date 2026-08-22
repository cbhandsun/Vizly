declare module 'elkjs/lib/elk-api' {
  import type { ElkNode } from 'elkjs';

  interface ElkConstructorOptions {
    workerUrl: string;
  }

  interface ElkLayoutCallOptions {
    layoutOptions?: Record<string, string>;
  }

  export default class ELK {
    constructor(options: ElkConstructorOptions);
    layout(graph: ElkNode, options?: ElkLayoutCallOptions): Promise<ElkNode>;
    terminateWorker(): void;
  }
}
