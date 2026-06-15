import { describe, it, expect } from 'vitest';
import {
  MermaidParser,
  MERMAID_PARSER_MAX_CHARS,
  MERMAID_PARSER_MAX_EDGES,
  MERMAID_PARSER_MAX_LABEL_CHARS,
  MERMAID_PARSER_MAX_NODES,
} from './MermaidParser';

describe('MermaidParser', () => {
  const parser = MermaidParser.getInstance();

  it('应该能够解析基础的 graph TD 结构', () => {
    const input = `
      graph TD
      A[开始] --> B[处理]
      B --> C{决策}
    `;
    const { nodes, edges } = parser.parse(input);

    expect(nodes.length).toBe(3);
    expect(edges.length).toBe(2);
    
    const nodeA = nodes.find(n => n.id === 'A');
    expect(nodeA?.data.label).toBe('开始');
    expect(nodeA?.data.shape).toBe('rectangle');

    const nodeC = nodes.find(n => n.id === 'C');
    expect(nodeC?.data.shape).toBe('diamond');
  });

  it('应该能识别架构组件子类型', () => {
    const input = `
      graph LR
      MainGW[API 网关] --> OrderService[订单服务]
      OrderService --> OrderDB[(订单数据库)]
    `;
    const { nodes } = parser.parse(input);

    const gw = nodes.find(n => n.id === 'MainGW');
    expect(gw?.data.type).toBe('gateway');

    const db = nodes.find(n => n.id === 'OrderDB');
    expect(db?.data.type).toBe('database');
    expect(db?.data.label).toBe('订单数据库');
  });

  it('应该能处理带文本的连线', () => {
    const input = `
      graph TD
      A -->|请求| B
      B -- 返回 --> C
    `;
    const { edges } = parser.parse(input);

    expect(edges[0].label).toBe('请求');
    expect(edges[1].label).toBe('返回');
  });

  it('应该能正确映射子图 (subgraph)', () => {
    const input = `
      graph TD
      subgraph ClusterA [集群 A]
        A[节点 1]
        B[节点 2]
      end
      A --> B
    `;
    const { nodes } = parser.parse(input);

    const nodeA = nodes.find(n => n.id === 'A');
    const nodeB = nodes.find(n => n.id === 'B');
    const cluster = nodes.find(n => n.id === 'ClusterA');

    expect(cluster?.type).toBe('group');
    expect(cluster?.data.label).toBe('集群 A');
    expect(nodeA?.parentId).toBe('ClusterA');
    expect(nodeB?.parentId).toBe('ClusterA');
  });

  it('应该能处理复杂的多重连线', () => {
    const input = `
      graph LR
      A --> B --> C
      D -- test --> E -.-> F
    `;
    const { nodes, edges } = parser.parse(input);

    expect(nodes.length).toBe(6);
    expect(edges.length).toBe(4);
    expect(edges.find(e => e.source === 'E' && e.target === 'F')?.animated).toBe(true);
  });

  it('应该拒绝超大的 Mermaid 输入', () => {
    expect(() => parser.parse('x'.repeat(MERMAID_PARSER_MAX_CHARS + 1))).toThrow('too large');
  });

  it('应该限制 flowchart 导入生成的节点和连线数量', () => {
    const lines = ['graph TD'];
    for (let i = 0; i < MERMAID_PARSER_MAX_EDGES + 50; i += 1) {
      lines.push(`N${i}[Node ${i}] --> N${i + 1}[Node ${i + 1}]`);
    }

    const { nodes, edges } = parser.parse(lines.join('\n'));

    expect(nodes.length).toBeLessThanOrEqual(MERMAID_PARSER_MAX_NODES);
    expect(edges.length).toBeLessThanOrEqual(MERMAID_PARSER_MAX_EDGES);
  });

  it('应该截断过长的节点标签', () => {
    const longLabel = 'x'.repeat(MERMAID_PARSER_MAX_LABEL_CHARS + 100);
    const { nodes } = parser.parse(`graph TD\nA[${longLabel}]`);

    expect(nodes.find(n => n.id === 'A')?.data.label).toHaveLength(MERMAID_PARSER_MAX_LABEL_CHARS);
  });

  it('应该拒绝危险的原型污染节点 ID', () => {
    const { nodes, edges } = parser.parse(`
      graph TD
      __proto__[Unsafe] --> Safe[Safe]
      Safe --> constructor[Unsafe Edge Target]
    `);

    expect(nodes.map(node => node.id)).toEqual(expect.arrayContaining(['node-0', 'Safe', 'node-2']));
    expect(nodes.map(node => node.id)).not.toContain('__proto__');
    expect(nodes.map(node => node.id)).not.toContain('constructor');
    expect(edges.every(edge => edge.source !== '__proto__' && edge.target !== 'constructor')).toBe(true);
  });

  it('应该限制 mindmap 导入规模并保留缩进层级', () => {
    const lines = ['mindmap', '  root((Root))'];
    for (let i = 0; i < MERMAID_PARSER_MAX_NODES + 50; i += 1) {
      lines.push(`    Child ${i}`);
    }

    const { nodes, edges } = parser.parse(lines.join('\n'));

    expect(nodes.length).toBeLessThanOrEqual(MERMAID_PARSER_MAX_NODES);
    expect(edges.length).toBeLessThanOrEqual(MERMAID_PARSER_MAX_EDGES);
    expect(edges[0]?.source).toBe('mm-import-1');
  });
});
