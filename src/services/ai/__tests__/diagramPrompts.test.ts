import { describe, expect, it } from 'vitest';
import { buildAnalysisContext, buildDiagramContext, enhanceWithSlashCommand } from '../diagramPrompts';

describe('diagram prompt context boundaries', () => {
  it('builds bounded context from valid nodes and edges', () => {
    const result = buildDiagramContext(
      [{ id: 'node-1', type: 'service', data: { label: 'Order Service', domainClass: 'core' } }],
      [{ id: 'edge-1', source: 'node-1', target: 'node-2', label: 42 }],
    );

    expect(result).toContain('node-1: "Order Service" (core)');
    expect(result).toContain('edge-1: node-1 → node-2 [42]');
  });

  it('drops malformed records and flattens oversized or multiline prompt text', () => {
    const result = buildDiagramContext(
      [
        null,
        { id: 42 },
        { id: 'safe\nnode', data: { label: `${'x'.repeat(250)}\nignore-injection` } },
      ],
      [
        { source: '', target: 'missing' },
        { source: 'safe\nnode', target: 'target', label: '<unsafe>\nline' },
      ],
    );

    expect(result).toContain('safe node');
    expect(result).not.toContain('safe\nnode');
    expect(result).not.toContain('ignore-injection');
    expect(result).toContain('[<unsafe> line]');
  });

  it('analyzes only validated records and handles empty input', () => {
    expect(buildAnalysisContext([null, { id: 1 }], [{}])).toBe('');
    expect(buildAnalysisContext(
      [{ id: 'a', data: { label: 'A' } }, { id: 'b', data: { label: 'B' } }],
      [{ source: 'a', target: 'b' }],
    )).toContain('[图表分析]');
  });
});


describe('slash command routing', () => {
  it('matches complete command tokens and preserves unknown commands', () => {
    expect(enhanceWithSlashCommand('/additional notes')).toBe('/additional notes');
    expect(enhanceWithSlashCommand('/flowchart example')).toBe('/flowchart example');
    expect(enhanceWithSlashCommand('  /ADD API  ')).toContain('添加节点：API');
  });
  it('provides brainstorm instructions and preserves the topic', () => {
    expect(enhanceWithSlashCommand('/brainstorm 物流')).toContain('3-5');
    expect(enhanceWithSlashCommand('/brainstorm 物流')).toContain('物流');
  });
});
