// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildMarkdownDiagramExport } from '../markdownDiagramExport';

const exportDiagram = (value: unknown, title = 'Fixture') =>
    buildMarkdownDiagramExport(value, title, new Date('2026-10-08T00:00:00Z'));

describe('Markdown diagram export', () => {
    it('preserves standard top-level descriptions and domains from the actual node schema', () => {
        const result = exportDiagram({
            nodes: [{ id: 'order-import', description: '<b>订单导入/创建</b><br/>OMS/ERP/API/手工', domainClass: 'be-scm' }],
            edges: [],
        });
        expect(result).toContain('| order-import | 订单导入/创建 | be-scm |');
        expect(result).toContain('OMS/ERP/API/手工');
        expect(result).toContain('n0["订单导入/创建"]');
        expect(result).not.toContain('<b>');
    });

    it('supports legacy React Flow data while preferring canonical standard descriptions', () => {
        const result = exportDiagram({ nodes: [
            { id: 'a', description: 'Current', data: { label: 'Stale', description: 'Old' } },
            { id: 'b', data: { label: 'Legacy', domainClass: 'legacy-domain' } },
        ], edges: [{ source: 'a', target: 'b', label: 'connect' }] });
        expect(result).toContain('| a | Current |');
        expect(result).toContain('| b | Legacy | legacy-domain |');
        expect(result).toContain('n0 -->|"connect"| n1');
        expect(result).not.toContain('Stale');
    });

    it('retains disconnected nodes and avoids Mermaid ID normalization collisions', () => {
        const result = exportDiagram({ nodes: [{ id: 'a-b' }, { id: 'a_b' }, { id: 'isolated' }], edges: [{ source: 'a-b', target: 'a_b' }] });
        expect(result).toContain('n0["a-b"]');
        expect(result).toContain('n1["a_b"]');
        expect(result).toContain('n2["isolated"]');
        expect(result).toContain('n0 --> n1');
    });

    it('removes executable HTML and escapes table and Mermaid boundaries', () => {
        const result = exportDiagram({ nodes: [{ id: 'safe', description: '<script>secret()</script><b>A|B</b><img src=x onerror=steal()>' }], edges: [] }, '<script>bad()</script>Title');
        expect(result).not.toMatch(/secret\(\)|bad\(\)|onerror|<script|<img/);
        expect(result).toContain('A\\|B');
        expect(result).toContain('Architecture Blueprint: Title');
    });

    it('keeps entity-decoded HTML and untrusted identifiers inert in exported Markdown', () => {
        const result = exportDiagram({ nodes: [{
            id: '<img src=x onerror=steal()>',
            description: '&lt;script&gt;literal text&lt;/script&gt;',
        }], edges: [] }, '&lt;iframe src=x&gt;');
        expect(result).not.toMatch(/<img|<script|<iframe/);
        expect(result).toContain('&lt;img src=x onerror=steal()&gt;');
        expect(result).toContain('&lt;script&gt;literal text&lt;/script&gt;');
        expect(result).toContain('Architecture Blueprint: &lt;iframe src=x&gt;');
    });

    it('accepts an empty diagram and rejects malformed external containers', () => {
        expect(exportDiagram({ nodes: [], edges: [] })).toContain('graph TD');
        for (const value of [null, [], {}, { nodes: {}, edges: [] }, { nodes: [], edges: null }]) {
            expect(() => exportDiagram(value)).toThrow('Invalid diagram');
        }
    });

    it('ignores invalid nodes and dangling edges without coercing object content', () => {
        const result = exportDiagram({ nodes: [null, { id: '' }, { id: 'a', description: { private: 'not text' } }], edges: [null, { source: 'a', target: 'missing' }] });
        expect(result).toContain('| a | a | N/A |');
        expect(result).not.toContain('[object Object]');
        expect(result).not.toContain('missing');
    });

    it('keeps original node and edge limits and excludes truncated targets', () => {
        const nodes = Array.from({ length: 1001 }, (_, index) => ({ id: `node${index}` }));
        const edges = Array.from({ length: 2001 }, () => ({ source: 'node0', target: 'node1' }));
        edges.push({ source: 'node0', target: 'node1000' });
        const result = exportDiagram({ nodes, edges });
        expect(result).not.toContain('node1000');
        expect(result.match(/^- node0 --> node1$/gm)).toHaveLength(2000);
        expect(result).toContain('n999["node999"]');
    });
});
