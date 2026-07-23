// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NodeObj } from 'mind-elixir';
import { downloadText, markdownToNodeObj, migrateV1ToV2, nodeObjToFlowchartJson, nodeObjToMarkdown, nodeObjToOpml, opmlToNodeObj } from '../migrate';
import { isMindMapV1, isMindMapV2 } from '../types';
import { MINDMAP_TASK_ASSIGNEE_MAX_LENGTH } from '../mindmapTaskModel';
import {
    MINDMAP_MAX_CHILDREN_PER_NODE,
    MINDMAP_MAX_NOTE_LENGTH,
    MINDMAP_MAX_TOPIC_LENGTH,
} from '../mindmapTreeSanitizer';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('nodeObjToMarkdown', () => {
    it('exports task metadata only for task-aware nodes', () => {
        const root: NodeObj = {
            id: 'root',
            topic: '项目计划',
            children: [
                {
                    id: 'plain',
                    topic: '普通节点',
                    children: [],
                },
                {
                    id: 'task',
                    topic: '交付首版',
                    children: [],
                    ...{
                        task: {
                            status: 'doing',
                            priority: '高',
                            assignee: 'Alex',
                            dueDate: '2026-06-20',
                            progress: 60,
                        },
                    },
                },
            ],
        };

        const markdown = nodeObjToMarkdown(root);

        expect(markdown).toContain('- 普通节点');
        expect(markdown).toContain('- 交付首版');
        expect(markdown).toContain('任务: 状态: 进行中 | 优先级: 高 | 负责人: Alex | 截止: 2026-06-20 | 进度: 60%');
        expect(markdown).not.toMatch(/普通节点\n\s+> 任务:/);
    });

    it('round-trips task metadata through OPML', () => {
        const root: NodeObj = {
            id: 'root',
            topic: '项目计划',
            children: [
                {
                    id: 'task',
                    topic: '交付首版',
                    note: '需要跨团队协同',
                    children: [],
                    ...{
                        task: {
                            status: 'doing',
                            priority: '高',
                            assignee: 'Alex & Lee',
                            dueDate: '2026-06-20',
                            progress: 60,
                        },
                    },
                },
            ],
        };

        const opml = nodeObjToOpml(root);
        expect(opml).toContain('_vizly_task_status="doing"');
        expect(opml).toContain('_vizly_task_priority="高"');
        expect(opml).toContain('_vizly_task_assignee="Alex &amp; Lee"');

        const imported = opmlToNodeObj(opml) as NodeObj & {
            children?: Array<NodeObj & { task?: unknown }>;
        };
        const task = imported.children?.[0];
        expect(task?.note).toBe('需要跨团队协同');
        expect(task?.task).toMatchObject({
            status: 'doing',
            priority: '高',
            assignee: 'Alex & Lee',
            dueDate: '2026-06-20',
            progress: 60,
        });
        expect(task?.tags).toEqual(['进行中', '高']);
    });

    it('exports only safe OPML hyperlinks', () => {
        const root: NodeObj = {
            id: 'root',
            topic: 'Links',
            children: [
                { id: 'safe', topic: 'Safe', hyperLink: 'example.com/doc', children: [] },
                { id: 'bad', topic: 'Bad', hyperLink: 'javascript:alert(1)', children: [] },
            ],
        };

        const opml = nodeObjToOpml(root);

        expect(opml).toContain('url="https://example.com/doc"');
        expect(opml).not.toContain('javascript:');
        expect(opml).not.toMatch(/<outline text="Bad"[^>]*url=/);
    });

    it('imports only safe OPML hyperlinks', () => {
        const imported = opmlToNodeObj(`
            <opml version="2.0">
              <body>
                <outline text="Root">
                  <outline text="Safe" url="example.com/doc" />
                  <outline text="Bad" url="javascript:alert(1)" />
                </outline>
              </body>
            </opml>
        `);

        expect(imported.children?.[0]?.hyperLink).toBe('https://example.com/doc');
        expect(imported.children?.[1]?.hyperLink).toBeUndefined();
    });

    it('migrates only safe v1 mindmap links', () => {
        const migrated = migrateV1ToV2({
            nodes: [
                { id: 'root', type: 'mindmap', data: { label: 'Root', url: 'javascript:alert(1)' }, position: { x: 0, y: 0 } },
                { id: 'child', type: 'mindmap', data: { label: 'Child', url: 'example.com/doc' }, position: { x: 0, y: 100 } },
            ],
            edges: [{ id: 'e1', source: 'root', target: 'child' }],
        });

        expect(migrated.nodeData.hyperLink).toBeUndefined();
        expect(migrated.nodeData.children?.[0]?.hyperLink).toBe('https://example.com/doc');
    });

    it('migrates only safe v1 mindmap branch colors', () => {
        const migrated = migrateV1ToV2({
            nodes: [
                { id: 'root', type: 'mindmap', data: { label: 'Root', branchColor: 'url(javascript:alert(1))' }, position: { x: 0, y: 0 } },
                { id: 'child', type: 'mindmap', data: { label: 'Child', branchColor: '#22c55e' }, position: { x: 0, y: 100 } },
            ],
            edges: [{ id: 'e1', source: 'root', target: 'child' }],
        });

        expect(migrated.nodeData.style).toBeUndefined();
        expect(migrated.nodeData.children?.[0]?.style).toEqual({ color: '#22c55e' });
    });

    it('ignores malformed legacy records and validates the complete v2 marker', () => {
        const migrated = migrateV1ToV2({
            nodes: [null, { id: 1 }, { id: 'root', type: 'mindmap', data: { label: 'Root' } }],
            edges: [{ source: 'root', target: 3 }, 'invalid'],
        });

        expect(migrated.nodeData.topic).toBe('Root');
        expect(isMindMapV2({ _version: 'mindmap-v2' })).toBe(false);
        expect(isMindMapV2(migrated)).toBe(true);
    });

    it('recognizes only complete legacy map containers', () => {
        expect(isMindMapV1({ nodes: [], edges: [] })).toBe(true);
        expect(isMindMapV1({ nodes: [] })).toBe(false);
        expect(isMindMapV1({ nodes: {}, edges: [] })).toBe(false);
        expect(isMindMapV1(null)).toBe(false);
    });

    it('bounds markdown import size, text, and child fan-out', () => {
        expect(() => markdownToNodeObj('# ' + 'x'.repeat(512 * 1024))).toThrow('Markdown 内容过大');

        const imported = markdownToNodeObj([
            '# ' + 'r'.repeat(MINDMAP_MAX_TOPIC_LENGTH + 10),
            ...Array.from({ length: MINDMAP_MAX_CHILDREN_PER_NODE + 5 }, (_, index) => `## child-${index}`),
        ].join('\n'));

        expect(imported.topic).toHaveLength(MINDMAP_MAX_TOPIC_LENGTH);
        expect(imported.children).toHaveLength(MINDMAP_MAX_CHILDREN_PER_NODE);
        expect(imported.children?.at(-1)?.topic).toBe(`child-${MINDMAP_MAX_CHILDREN_PER_NODE - 1}`);
    });

    it('bounds OPML import size, fields, task metadata, and child fan-out', () => {
        expect(() => opmlToNodeObj('<opml>' + 'x'.repeat(512 * 1024) + '</opml>')).toThrow('OPML 内容过大');

        const children = Array.from({ length: MINDMAP_MAX_CHILDREN_PER_NODE + 5 }, (_, index) => (
            `<outline text="child-${index}" _note="${'n'.repeat(MINDMAP_MAX_NOTE_LENGTH + 10)}" _vizly_task_status="doing" _vizly_task_priority="高" _vizly_task_assignee="${'a'.repeat(MINDMAP_MAX_TOPIC_LENGTH + 10)}"/>`
        )).join('');
        const imported = opmlToNodeObj(`
            <opml version="2.0">
              <body>
                <outline text="${'r'.repeat(MINDMAP_MAX_TOPIC_LENGTH + 10)}">
                  ${children}
                </outline>
              </body>
            </opml>
        `);

        expect(imported.topic).toHaveLength(MINDMAP_MAX_TOPIC_LENGTH);
        expect(imported.children).toHaveLength(MINDMAP_MAX_CHILDREN_PER_NODE);
        const child = imported.children?.[0] as NodeObj & { task?: { assignee?: string } };
        expect(child.note).toHaveLength(MINDMAP_MAX_NOTE_LENGTH);
        expect(child.task?.assignee).toHaveLength(MINDMAP_TASK_ASSIGNEE_MAX_LENGTH);
    });

    it('bounds markdown, OPML, and flowchart export for stale unsafe trees', () => {
        const root: NodeObj = {
            id: 'root',
            topic: 't'.repeat(MINDMAP_MAX_TOPIC_LENGTH + 10),
            note: 'n'.repeat(MINDMAP_MAX_NOTE_LENGTH + 10),
            children: Array.from({ length: MINDMAP_MAX_CHILDREN_PER_NODE + 5 }, (_, index) => ({
                id: `child-${index}`,
                topic: `child-${index}`,
                children: [],
            })),
        };

        const markdown = nodeObjToMarkdown(root);
        const opml = nodeObjToOpml(root);
        const flowchart = JSON.parse(nodeObjToFlowchartJson(root));

        expect(markdown).not.toContain('n'.repeat(MINDMAP_MAX_NOTE_LENGTH + 1));
        expect(opml).not.toContain(`child-${MINDMAP_MAX_CHILDREN_PER_NODE}`);
        expect(flowchart.nodes).toHaveLength(MINDMAP_MAX_CHILDREN_PER_NODE + 1);
        expect(flowchart.nodes[0].data.label).toHaveLength(MINDMAP_MAX_TOPIC_LENGTH);
        expect(flowchart.nodes[0].data.note).toHaveLength(MINDMAP_MAX_NOTE_LENGTH);
    });
});

describe('downloadText', () => {
    it('sanitizes user-derived filenames before triggering a download', () => {
        vi.useFakeTimers();
        let downloadedName = '';
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mindmap-export');
        const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
            downloadedName = this.download;
        });

        downloadText('../CON:<bad>\n.md', 'content', 'text/markdown');

        expect(downloadedName).toBe('_CON_bad_.md');
        expect(revokeSpy).not.toHaveBeenCalled();
        vi.runOnlyPendingTimers();
        expect(revokeSpy).toHaveBeenCalledWith('blob:mindmap-export');
        vi.useRealTimers();
    });
});
