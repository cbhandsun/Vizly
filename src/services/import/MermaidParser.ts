import { Node, Edge } from '@xyflow/react';

// Default branch color palette for auto-assigned mindmap branch colors
const MINDMAP_PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

/**
 * Mermaid 语法解析引擎 (Phase 6: Lightweight Parser)
 * 专门用于将 Mermaid Flowchart / MindMap 语法转换为 Vizly 兼容的 JSON 数据
 */
export class MermaidParser {
  private static instance: MermaidParser;
  /** [Fix] Monotonically increasing counter — eliminates Math.random() edge ID collisions */
  private edgeCounter = 0;

  private constructor() {}

  public static getInstance(): MermaidParser {
    if (!this.instance) {
      this.instance = new MermaidParser();
    }
    return this.instance;
  }

  public parse(input: string): { nodes: Node[]; edges: Edge[] } {
    const trimmed = input.trim();
    // Auto-detect Mermaid mindmap syntax
    if (/^mindmap\b/i.test(trimmed)) {
      return this.parseMindmap(trimmed);
    }
    return this.parseFlowchart(trimmed);
  }

  // ─── Flowchart / Architecture Diagram Parser ───────────────────────────────

  private parseFlowchart(input: string): { nodes: Node[]; edges: Edge[] } {
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
      const trimmedLine = line.trim();
      if (trimmedLine.match(/^(graph|flowchart)\s+(TD|LR|TB|BT|RL)/i)) return;

      const subgraphMatch = trimmedLine.match(/subgraph\s+([^\s[({]+)(?:\s+\[(.+?)\])?/i);
      if (subgraphMatch) {
        const id = subgraphMatch[1];
        const label = subgraphMatch[2] || id;
        this.ensureNodeExists(nodes, id, undefined, {}, label, 'group');
        currentParentId = id;
        return;
      }
      if (trimmedLine === 'end') {
        currentParentId = undefined;
        return;
      }

      // Extract explicit node definitions e.g. A[Label] or B((Circle))
      const nodeDefRegex = /([^\s\->([{|}]+)\s*(?:(\[\(|\[\/|\[\\|\[|\(\[|\(\(|\(|\{\{|\{)(.+?)(?:\)\]|\]\)|\)\)|\\\/]|\/\]|\]|\}\text|\}|\)))/g;
      let m;
      while ((m = nodeDefRegex.exec(trimmedLine)) !== null) {
        this.ensureNodeExists(nodes, m[1], currentParentId, ARCH_KEYWORDS, m[3], 'architectureNode', m[2]);
      }

      // Strip node definitions so transitionRegex can match IDs correctly
      const cleanedLine = trimmedLine.replace(nodeDefRegex, '$1');

      // Normalize labeled edges: --text--> becomes -->|text|
      const normalizedLine = cleanedLine
        .replace(/--\s*([^\->]+?)\s*-->/g, '-->|$1|')
        .replace(/==\s*([^=>]+?)\s*==>/g, '==>|$1|')
        .replace(/--\s*([^-]+?)\s*---/g, '---|$1|')
        .replace(/-\.->/g, '-.-')
        .replace(/-\.\s*([^\-.>]+?)\s*\.->/g, '-.-|$1|');

      const transitionRegex = /([^\s\->([{|}]+)\s*(?:(-->|---|-\.-|==>))\s*(?:\|(.+?)\|)?\s*([^\s\->([{|}]+)/g;
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
            id: `e_${sourceId}_${targetId}_${++this.edgeCounter}`,
            source: sourceId,
            target: targetId,
            label,
            type: 'smart',
            animated: arrow.includes('-.-'),
          });
          startIdx = normalizedLine.indexOf(match[4], match.index);
        } else {
          break;
        }
      }

      // Fallback: register bare node IDs
      if (!trimmedLine.includes('-') && !trimmedLine.includes('=') && !trimmedLine.includes('[')) {
        const id = this.extractId(trimmedLine.split(/\s+/)[0]);
        if (id && !nodes.has(id)) {
          if (!['graph', 'flowchart', 'subgraph', 'end', 'TD', 'LR', 'TB', 'BT', 'RL'].includes(id)) {
            this.ensureNodeExists(nodes, id, currentParentId, ARCH_KEYWORDS);
          }
        }
      }
    });

    const resultNodes = Array.from(nodes.values()).map((n, idx) => ({
      ...n,
      position: n.position.x === 0 ? { x: (idx % 3) * 200, y: Math.floor(idx / 3) * 150 } : n.position,
    }));

    return { nodes: resultNodes, edges };
  }

  // ─── MindMap Parser ────────────────────────────────────────────────────────

  /**
   * Parse Mermaid mindmap syntax into Vizly MindMap nodes + structural edges.
   *
   * Mermaid mindmap uses indentation to express parent-child relationships:
   *   mindmap
   *     root((Central Topic))
   *       Branch A
   *         Leaf 1
   *       Branch B
   *
   * Supports node shape notations:
   *   ((text)) — circle   [text] — rect   (text) — rounded
   *   {{text}} — hexagon  >text] — flag    plain text — no shape
   */
  private parseMindmap(input: string): { nodes: Node[]; edges: Edge[] } {
    const rawLines = input.split('\n');
    // Skip the "mindmap" header line itself
    const contentLines = rawLines.slice(1).filter(l => l.trimStart() !== '');

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Stack: { id, depth, indentLen, colorIndex }
    const stack: Array<{ id: string; depth: number; indentLen: number; colorIndex: number }> = [];
    let nodeCounter = 0;

    for (const line of contentLines) {
      const stripped = line.trimStart();
      if (!stripped || stripped.startsWith('%%')) continue;

      const indentLen = line.length - stripped.length;

      // Pop ancestors until we find the parent at a shallower indent level
      while (stack.length > 0 && indentLen <= stack[stack.length - 1].indentLen) {
        stack.pop();
      }

      const label = this.extractMindmapLabel(stripped);
      const id = `mm-import-${++nodeCounter}`;
      const depth = stack.length; // root = 0, first-level branches = 1, etc.

      // Root uses index 0; each depth-1 branch gets its own color from the palette
      let colorIndex = depth === 0 ? 0 : (stack[0]?.colorIndex ?? 0);
      if (depth === 1) {
        colorIndex = (nodeCounter - 1) % MINDMAP_PALETTE.length;
      }

      const branchColor = depth === 0 ? '#6366f1' : MINDMAP_PALETTE[colorIndex];

      // Simple initial layout: root center, branches spread left/right
      const side = nodeCounter % 2 === 0 ? 1 : -1;
      const x = depth === 0 ? 0 : depth === 1 ? side * 260 : side * (260 + (depth - 1) * 180);
      const y = depth === 0 ? 0 : nodeCounter * 80;

      nodes.push({
        id,
        type: 'mindmap',
        position: { x, y },
        data: {
          label,
          depth,
          direction: 'LR',
          branchColor,
          side: side > 0 ? 'right' : 'left',
        },
      });

      // Link to parent
      if (stack.length > 0) {
        const parentId = stack[stack.length - 1].id;
        edges.push({
          id: `mm-e-${parentId}-${id}`,
          source: parentId,
          target: id,
          type: 'mindmap',
        });
      }

      stack.push({ id, depth, indentLen, colorIndex });
    }

    return { nodes, edges };
  }

  /**
   * Strip Mermaid shape notation from a mindmap line.
   * e.g. "root((Central Idea))" → "Central Idea"
   */
  private extractMindmapLabel(text: string): string {
    let m: RegExpMatchArray | null;
    // ((text)) — circle
    m = text.match(/^\w*\(\((.+?)\)\)/);
    if (m) return m[1].trim();
    // [text] — rect
    m = text.match(/^\w*\[(.+?)\]/);
    if (m) return m[1].trim();
    // (text) — rounded
    m = text.match(/^\w*\((.+?)\)/);
    if (m) return m[1].trim();
    // {{text}} — hexagon
    m = text.match(/^\w*\{\{(.+?)\}\}/);
    if (m) return m[1].trim();
    // >text] — flag/asymmetric
    m = text.match(/^\w*>(.+?)\]/);
    if (m) return m[1].trim();
    // Plain text
    return text.trim();
  }

  // ─── Shared Helpers ────────────────────────────────────────────────────────

  private extractId(text: string): string {
    const match = text.match(/^([^\s\->([{|}]+)/);
    return match ? match[1] : text.trim();
  }

  private ensureNodeExists(
    nodes: Map<string, Node>,
    id: string,
    parentId?: string,
    keywords?: Record<string, string>,
    label?: string,
    type: string = 'architectureNode',
    rawShape?: string,
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
        domainClass: 'core',
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
