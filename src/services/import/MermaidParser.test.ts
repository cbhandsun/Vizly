import { describe, it, expect } from 'vitest';
import { MermaidParser } from './MermaidParser';

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
});
