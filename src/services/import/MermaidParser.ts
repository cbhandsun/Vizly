import { Node, Edge } from '@xyflow/react';

/**
 * Mermaid 语法解析引擎 (Phase 6: Lightweight Parser)
 * 专门用于将 Mermaid Flowchart 语法转换为 Vizly 兼容的 JSON 数据
 */
export class MermaidParser {
  private static instance: MermaidParser;

  private constructor() {}

  public static getInstance(): MermaidParser {
    if (!this.instance) {
      this.instance = new MermaidParser();
    }
    return this.instance;
  }

  public parse(input: string): { nodes: Node[]; edges: Edge[] } {
    const lines = input.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
    const nodes: Map<string, Node> = new Map();
    const edges: Edge[] = [];
    let currentParentId: string | undefined = undefined;

    const ARCH_KEYWORDS: Record<string, string> = {
      db: 'database',
      database: 'database',
      store: 'database',
      gw: 'gateway',
      gateway: 'gateway',
      nginx: 'gateway',
      api: 'microservice',
      service: 'microservice',
      web: 'frontend',
      ui: 'frontend',
      mq: 'messageQueue',
      kafka: 'messageQueue',
    };

    lines.forEach(line => {
      // 1. 结构化定义
      const trimmed = line.trim();
      if (trimmed.match(/^(graph|flowchart)\s+(TD|LR|TB|BT|RL)/i)) return;
      
      const subgraphMatch = trimmed.match(/subgraph\s+([^\s\[\(\{]+)(?:\s+\[(.+?)\])?/i);
      if (subgraphMatch) {
          const id = subgraphMatch[1];
          const label = subgraphMatch[2] || id;
          this.ensureNodeExists(nodes, id, undefined, {}, label, 'group');
          currentParentId = id;
          return;
      }
      if (trimmed === 'end') {
          currentParentId = undefined;
          return;
      }

      // 2. 提取节点 ID 和 Label
      // 我们先提取显式定义的节点，如 A[Label]
      const nodeDefRegex = /([^\s\-\>\(\[\{\|\}]+)\s*(?:(\[|\[\(|\(\[|\(\(|\(|\{\{|\[\/|\[\\|\{)(.+?)(?:\]|\)\]|\]\)|\)\)|\)|\}\}|\\\]|\/\]|\}))/g;
      let m;
      while ((m = nodeDefRegex.exec(trimmed)) !== null) {
          this.ensureNodeExists(nodes, m[1], currentParentId, ARCH_KEYWORDS, m[3], 'architectureNode', m[2]);
      }

      // 3. 处理连线 (支持 A -> B -> C)
      // 预处理
      let normalizedLine = trimmed.replace(/--\s*(.+?)\s*-->/g, '-->|$1|')
                                  .replace(/==\s*(.+?)\s*==>/g, '==>|$1|')
                                  .replace(/--\s*(.+?)\s*---/g, '---|$1|')
                                  .replace(/-\.\s*(.+?)\s*\.->/g, '-.->|$1|');

      const transitionRegex = /([^\s\-\>\(\[\{\|\}]+)\s*(?:(-->|---|-.->|==>))\s*(?:\|(.+?)\|)?\s*([^\s\-\>\(\[\{\|\}]+)/g;
      let startIdx = 0;
      while (true) {
          transitionRegex.lastIndex = startIdx;
          const match = transitionRegex.exec(normalizedLine);
          if (!match) break;

          const sourceId = this.extractId(match[1]);
          const arrow = match[2];
          const label = match[3] || '';
          const targetId = this.extractId(match[4]);

          if (sourceId && targetId) {
              this.ensureNodeExists(nodes, sourceId, currentParentId, ARCH_KEYWORDS);
              this.ensureNodeExists(nodes, targetId, currentParentId, ARCH_KEYWORDS);
              
              edges.push({
                  id: `e_${sourceId}_${targetId}_${Math.random().toString(36).substr(2, 4)}`,
                  source: sourceId,
                  target: targetId,
                  label,
                  type: 'smart',
                  animated: arrow.includes('-.->'),
              });
              // 为下一次链式搜索准备起点
              startIdx = normalizedLine.indexOf(match[4], match.index);
          } else {
              break;
          }
      }

      // 4. 兜底注册
      if (!trimmed.includes('-') && !trimmed.includes('=') && !trimmed.includes('[')) {
          const id = this.extractId(trimmed.split(/\s+/)[0]);
          if (id && !nodes.has(id)) {
              if (!['graph', 'flowchart', 'subgraph', 'end', 'TD', 'LR', 'TB', 'BT', 'RL'].includes(id)) {
                  this.ensureNodeExists(nodes, id, currentParentId, ARCH_KEYWORDS);
              }
          }
      }
    });

    const resultNodes = Array.from(nodes.values()).map((n, idx) => ({
      ...n,
      position: n.position.x === 0 ? { x: (idx % 3) * 200, y: Math.floor(idx / 3) * 150 } : n.position
    }));

    return { nodes: resultNodes, edges };
  }

  private extractId(text: string): string {
    const match = text.match(/^([^\s\-\>\(\[\{\|\}]+)/);
    return match ? match[1] : text.trim();
  }

  private ensureNodeExists(
    nodes: Map<string, Node>, 
    id: string, 
    parentId?: string, 
    keywords?: Record<string, string>,
    label?: string,
    type: string = 'architectureNode',
    rawShape?: string
  ) {
    if (nodes.has(id)) {
        const existing = nodes.get(id)!;
        if (label && (!existing.data.label || existing.data.label === id)) {
            existing.data.label = label;
        }
        if (parentId && !existing.parentId) existing.parentId = parentId;
        if (rawShape && existing.data.shape === 'rectangle') {
            existing.data.shape = this.mapShape(rawShape);
        }
        return;
    }

    const finalLabel = label || id;
    let archType: string | undefined = undefined;

    if (type === 'architectureNode') {
      const lowerLabel = finalLabel.toLowerCase();
      const lowerId = id.toLowerCase();
      for (const [key, val] of Object.entries(keywords || {})) {
        if (lowerLabel.includes(key) || lowerId.includes(key)) {
          archType = val;
          break;
        }
      }
    }

    nodes.set(id, {
      id,
      type: type === 'group' ? 'group' : 'architectureNode',
      parentId,
      data: {
        label: finalLabel,
        type: archType || 'component',
        shape: this.mapShape(rawShape || '['),
        domain: '业务域',
        domainClass: 'core'
      },
      position: { x: 0, y: 0 },
      width: type === 'group' ? 300 : 120,
      height: type === 'group' ? 200 : 50,
    });
  }

  private mapShape(raw: string): string {
    if (raw.includes('{')) return 'diamond';
    if (raw.includes('(')) return 'rounded-rectangle';
    return 'rectangle';
  }
}
