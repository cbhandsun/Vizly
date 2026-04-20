/**
 * HelloWorldPlugin — SDK 示例插件存根
 * 展示 DiagramTypePlugin 插件系统最小注册方式。
 */

import type { Node, Edge } from '@xyflow/react';
import { DiagramTypePlugin } from '@/core';

export class HelloWorldPlugin implements DiagramTypePlugin {
  id = 'hello-world';
  name = 'Hello World (SDK Demo)';
  version = '1.0.0';
  description = '插件 SDK 示例：展示最小插件实现。';
  author = 'SDK Demo';
  category = 'Beta' as const;
  tags = ['sdk', 'demo'];

  parseData(_source: unknown) {
    return { nodes: [], edges: [] };
  }

  serializeData(nodes: Node[], edges: Edge[]) {
    return { nodes, edges };
  }

  getEmptyState() {
    return { nodes: [], edges: [] };
  }

  getNodeTypes() { return {}; }
  getEdgeTypes() { return {}; }
  getSupportedLayouts() { return ['DomainVerticalLayout']; }
  getDefaultLayout() { return 'DomainVerticalLayout'; }
}
