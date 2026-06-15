/**
 * migrate.ts — Convert legacy React Flow mindmap data (v1) to mind-elixir format (v2)
 */
import type { NodeObj } from 'mind-elixir';
import type { VizlyMindMapV1Data, VizlyMindMapV2Data } from './types';
import { VIZLY_HYPER_THEME } from './theme';
import { applyTaskMeta, getTaskMeta, normalizeTags, type TaskPriority, type TaskStatus } from './mindmapTaskModel';
import { downloadFile } from '../../utils/downloadUtils';
import { toSafeExternalUrl } from '../../utils/sanitizeHtml';
import {
    cleanMindMapIcons,
    cleanMindMapColor,
    cleanMindMapNote,
    cleanMindMapTags,
    cleanMindMapTopic,
    MINDMAP_MAX_CHILDREN_PER_NODE,
    MINDMAP_MAX_DEPTH,
    MINDMAP_MAX_NODES,
} from './mindmapTreeSanitizer';

const MAX_IMPORT_TEXT_LENGTH = 512 * 1024;
const MAX_IMPORT_LINES = 5000;

interface WalkContext {
    count: number;
}

/** Strip HTML tags from a label string */
function stripHtml(html: string): string {
    return cleanMindMapTopic(html.replace(/<[^>]+>/g, ''), 'Untitled');
}

function escapeXmlAttr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function hasTaskSignal(node: NodeObj): boolean {
    const tags = normalizeTags(node.tags as unknown[] | undefined);
    return Boolean((node as { task?: unknown }).task)
        || tags.some(tag => ['待办', '进行中', '已完成', 'todo', 'doing', 'done', '高', '中', '低', '高优先级', '中优先级', '低优先级'].includes(tag));
}

function assertImportSize(value: string, label: string): void {
    if (value.length > MAX_IMPORT_TEXT_LENGTH) {
        throw new Error(`${label} 内容过大`);
    }
}

function safeLines(value: string): string[] {
    return value.split('\n').slice(0, MAX_IMPORT_LINES);
}

function canVisit(ctx: WalkContext, depth: number): boolean {
    return ctx.count < MINDMAP_MAX_NODES && depth <= MINDMAP_MAX_DEPTH;
}

function cleanTaskText(value: unknown): string | undefined {
    return cleanMindMapTopic(value, '').trim() || undefined;
}

/**
 * Map Vizly's direction string to mind-elixir direction integer
 * MindElixir.LEFT=3, MindElixir.RIGHT=1, MindElixir.SIDE=2, MindElixir.ROOT=0
 */
export function directionStringToInt(dir: string): number {
    const map: Record<string, number> = {
        LR: 2,  // SIDE — root in center, branches left and right
        R: 1,   // RIGHT
        L: 3,   // LEFT
        TB: 0,  // ROOT (top-down, root at top center)
        BT: 0,  // mind-elixir doesn't have native BT, fallback to ROOT
        FISHBONE: 2, // FISHBONE not supported natively, fallback to SIDE
    };
    return map[dir] ?? 2;
}

/** Convert from React Flow nodes/edges mindmap-v1 → mind-elixir NodeObj tree */
export function migrateV1ToV2(v1: VizlyMindMapV1Data): VizlyMindMapV2Data {
    const nodes = Array.isArray(v1.nodes) ? v1.nodes.slice(0, MINDMAP_MAX_NODES) : [];
    const edges = Array.isArray(v1.edges) ? v1.edges : [];

    // Build children map from edges
    const childrenMap = new Map<string, string[]>();
    edges.forEach((e: any) => {
        if (e.type === 'relationshipEdge') return; // skip relationship lines
        if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
        childrenMap.get(e.source)!.push(e.target);
    });

    // Find root node (not targeted by any edge, and type === 'mindmap')
    const targetIds = new Set(edges.map((e: any) => e.target));
    const rootNode = nodes.find(
        (n: any) => n.type === 'mindmap' && !targetIds.has(n.id)
    ) ?? nodes.find((n: any) => n.type === 'mindmap' && n.data?.depth === 0);

    if (!rootNode) {
        // Fallback: return a blank tree
        return {
            _version: 'mindmap-v2',
            nodeData: { id: 'root', topic: '中心主题', root: true, children: [] },
            direction: 2,
            theme: VIZLY_HYPER_THEME,
        };
    }

    const nodeMap = new Map<string, any>(nodes.map((n: any) => [n.id, n]));

    const ctx: WalkContext = { count: 0 };

    function convertNode(rfNode: any, depth = 0): NodeObj | null {
        if (!rfNode || !canVisit(ctx, depth)) return null;
        ctx.count += 1;

        const label = stripHtml((rfNode.data?.label as string) || '');
        const childIds = (childrenMap.get(rfNode.id) || []).sort((a: string, b: string) => {
            const na = nodeMap.get(a);
            const nb = nodeMap.get(b);
            return (na?.position?.y ?? 0) - (nb?.position?.y ?? 0);
        }).slice(0, MINDMAP_MAX_CHILDREN_PER_NODE);

        const nodeObj: NodeObj = {
            id: cleanMindMapTopic(rfNode.id, genId()),
            topic: label,
            expanded: !rfNode.data?.collapsed,
            children: childIds.map(id => convertNode(nodeMap.get(id), depth + 1)).filter(Boolean) as NodeObj[],
        };

        // Migrate note
        const note = rfNode.data?.note || rfNode.data?.description;
        if (note) {
            nodeObj.note = cleanMindMapNote(stripHtml(note));
        }

        // Migrate hyperlink
        const url = rfNode.data?.url || rfNode.data?.hyperLink;
        if (url) {
            const safeUrl = toSafeExternalUrl(String(url));
            if (safeUrl) nodeObj.hyperLink = safeUrl;
        }

        // Migrate icon/icons
        const icon = rfNode.data?.icon;
        if (icon) {
            nodeObj.icons = cleanMindMapIcons([icon]);
        } else if (rfNode.data?.icons) {
            nodeObj.icons = cleanMindMapIcons(rfNode.data.icons);
        }

        // Migrate style
        const branchColor = cleanMindMapColor(rfNode.data?.branchColor);
        if (branchColor) {
            nodeObj.style = { color: branchColor };
        }

        // Migrate tags
        const tags = rfNode.data?.tags as string[] | undefined;
        if (tags && tags.length > 0) {
            nodeObj.tags = cleanMindMapTags(tags);
        }

        return nodeObj;
    }

    const direction = directionStringToInt(
        (rootNode.data?.direction as string) || 'LR'
    );

    return {
        _version: 'mindmap-v2',
        nodeData: { ...(convertNode(rootNode) ?? { id: 'root', topic: '中心主题', children: [] }), root: true },
        direction,
        theme: VIZLY_HYPER_THEME,
    };
}

/** Convert mind-elixir NodeObj back to a simple markdown-like string for AI */
export function nodeObjToMarkdown(node: NodeObj, depth = 0, ctx: WalkContext = { count: 0 }): string {
    if (!canVisit(ctx, depth)) return '';
    ctx.count += 1;

    const indent = '  '.repeat(depth);
    const prefix = depth === 0 ? '# ' : indent + '- ';
    const lines = [prefix + cleanMindMapTopic(node.topic, '')];
    if (node.note) lines.push(indent + `  > ${cleanMindMapNote(node.note) ?? ''}`);
    if (hasTaskSignal(node)) {
        const task = getTaskMeta(node);
        const statusLabel = task.status === 'done' ? '已完成' : task.status === 'doing' ? '进行中' : '待办';
        const taskParts = [`状态: ${statusLabel}`];
        if (task.priority && task.priority !== '无') taskParts.push(`优先级: ${task.priority}`);
        if (task.assignee) taskParts.push(`负责人: ${cleanTaskText(task.assignee)}`);
        if (task.dueDate) taskParts.push(`截止: ${cleanTaskText(task.dueDate)}`);
        if (task.progress) taskParts.push(`进度: ${task.progress}%`);
        lines.push(indent + `  > 任务: ${taskParts.join(' | ')}`);
    }
    for (const child of (node.children ?? []).slice(0, MINDMAP_MAX_CHILDREN_PER_NODE)) {
        if (ctx.count >= MINDMAP_MAX_NODES) break;
        const childMarkdown = nodeObjToMarkdown(child, depth + 1, ctx);
        if (childMarkdown) lines.push(childMarkdown);
    }
    return lines.join('\n');
}

/** Convert mind-elixir NodeObj to OPML XML string (compatible with Logseq / Obsidian / OmniOutliner) */
export function nodeObjToOpml(root: NodeObj): string {
    const ctx: WalkContext = { count: 0 };
    function convertNode(node: NodeObj, depth: number): string {
        if (!canVisit(ctx, depth)) return '';
        ctx.count += 1;

        const indent = '  '.repeat(depth + 2);
        const text = escapeXmlAttr(cleanMindMapTopic(node.topic, ''));
        const extras: string[] = [];
        const note = cleanMindMapNote(node.note);
        if (note) extras.push(`_note="${escapeXmlAttr(note)}"`);
        if (node.hyperLink) {
            const safeUrl = toSafeExternalUrl(node.hyperLink);
            if (safeUrl) extras.push(`url="${escapeXmlAttr(safeUrl)}"`);
        }
        if (hasTaskSignal(node)) {
            const task = getTaskMeta(node);
            extras.push(`_vizly_task_status="${task.status}"`);
            extras.push(`_vizly_task_priority="${task.priority}"`);
            if (task.assignee) extras.push(`_vizly_task_assignee="${escapeXmlAttr(cleanTaskText(task.assignee) ?? '')}"`);
            if (task.dueDate) extras.push(`_vizly_task_due_date="${escapeXmlAttr(cleanTaskText(task.dueDate) ?? '')}"`);
            if (task.progress) extras.push(`_vizly_task_progress="${task.progress}"`);
        }
        const extrasStr = extras.length ? ' ' + extras.join(' ') : '';
        const children = (node.children ?? []).slice(0, MINDMAP_MAX_CHILDREN_PER_NODE);
        if (children.length === 0) {
            return `${indent}<outline text="${text}"${extrasStr}/>`;
        }
        const childLines = children.map(c => convertNode(c, depth + 1)).filter(Boolean).join('\n');
        return `${indent}<outline text="${text}"${extrasStr}>\n${childLines}\n${indent}</outline>`;
    }
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<opml version="2.0">',
        '  <head><title>' + escapeXmlAttr(cleanMindMapTopic(root.topic, '')) + '</title></head>',
        '  <body>',
        convertNode(root, 0),
        '  </body>',
        '</opml>',
    ].join('\n');
}

/** Trigger a browser download of text content */
export function downloadText(filename: string, content: string, mimeType = 'text/plain') {
    downloadFile(content, filename, mimeType);
}

/** Convert mind-elixir NodeObj to Vizly Flowchart JSON */
export function nodeObjToFlowchartJson(root: NodeObj): string {
    const nodes: any[] = [];
    const edges: any[] = [];
    let yCounter = 0;
    const ctx: WalkContext = { count: 0 };

    function traverse(node: NodeObj, depth: number, parentId: string | null) {
        if (!canVisit(ctx, depth)) return;
        ctx.count += 1;

        const id = node.id === 'root' ? 'me_root' : cleanMindMapTopic(node.id, genId());
        
        nodes.push({
            id: id,
            type: depth === 0 ? 'terminal' : 'task',
            position: { x: depth * 280, y: yCounter * 110 },
            data: {
                label: cleanMindMapTopic(node.topic, ''),
                ...(node.note ? { note: cleanMindMapNote(node.note) } : {}),
            }
        });
        
        if (parentId) {
            edges.push({
                id: `e_${parentId}_${id}`,
                source: parentId,
                target: id,
                type: 'editableEdge'
            });
        }
        
        const children = (node.children || []).slice(0, MINDMAP_MAX_CHILDREN_PER_NODE);
        if (children.length === 0) {
            yCounter++;
        } else {
            let first = true;
            for (const child of children) {
                if (ctx.count >= MINDMAP_MAX_NODES) break;
                if (!first) yCounter++;
                traverse(child, depth + 1, id);
                first = false;
            }
        }
    }
    
    traverse(root, 0, null);
    
    return JSON.stringify({
        version: "1.0",
        pluginId: "flowchart",
        nodes,
        edges
    }, null, 2);
}

/** Simple unique ID generator for imported nodes */
function genId(): string {
    return `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Parse a Markdown string into a mind-elixir NodeObj tree.
 *
 * Supports two formats:
 *   1. Heading-based:  # Root  ## Branch  ### Sub-branch
 *   2. Bullet-based:   - Root  \n  - Branch  \n    - Sub
 *
 * The deepest heading becomes the leaf; the shallowest becomes root.
 * If both formats are mixed, headings take precedence.
 */
export function markdownToNodeObj(md: string): NodeObj {
    assertImportSize(md, 'Markdown');
    const lines = safeLines(md).map(l => l.trimEnd()).filter(l => l.trim());

    // ── Try heading-based ──────────────────────────────────────────────────────
    const headingLines = lines.filter(l => /^#{1,6}\s/.test(l));
    if (headingLines.length > 0) {
        // Find min heading level used → becomes depth 0
        const minLevel = Math.min(...headingLines.map(l => l.match(/^(#+)/)![1].length));

        const stack: Array<{ node: NodeObj; depth: number }> = [];
        let root: NodeObj | null = null;
        const ctx: WalkContext = { count: 0 };

        for (const line of lines) {
            if (ctx.count >= MINDMAP_MAX_NODES) break;
            const m = line.match(/^(#{1,6})\s+(.*)/);
            if (!m) continue;
            const depth = m[1].length - minLevel;
            if (depth > MINDMAP_MAX_DEPTH) continue;
            const topic = cleanMindMapTopic(m[2].trim());
            const node: NodeObj = { id: genId(), topic, children: [] };
            ctx.count += 1;

            if (depth === 0) {
                root = node;
                stack.length = 0;
                stack.push({ node, depth: 0 });
            } else {
                // Pop stack until parent is found
                while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
                    stack.pop();
                }
                const parent = stack[stack.length - 1].node;
                const children = parent.children ??= [];
                if (children.length < MINDMAP_MAX_CHILDREN_PER_NODE) {
                    children.push(node);
                    stack.push({ node, depth });
                }
            }
        }

        if (root) {
            root.id = 'root';
            return root;
        }
    }

    // ── Bullet-based fallback ──────────────────────────────────────────────────
    const getIndent = (l: string) => l.match(/^(\s*)/)?.[1].length ?? 0;

    const stack2: Array<{ node: NodeObj; indent: number }> = [];
    let root2: NodeObj | null = null;
    const ctx2: WalkContext = { count: 0 };

    for (const line of lines) {
        if (ctx2.count >= MINDMAP_MAX_NODES) break;
        const m = line.match(/^\s*[-*+]\s+(.*)/);
        if (!m) continue;
        const indent = getIndent(line);
        const depth = Math.floor(indent / 2);
        if (depth > MINDMAP_MAX_DEPTH) continue;
        const topic = cleanMindMapTopic(m[1].trim());
        const node: NodeObj = { id: genId(), topic, children: [] };
        ctx2.count += 1;

        if (stack2.length === 0 || indent === 0) {
            root2 = node;
            stack2.length = 0;
            stack2.push({ node, indent: 0 });
        } else {
            while (stack2.length > 1 && stack2[stack2.length - 1].indent >= indent) {
                stack2.pop();
            }
            const parent = stack2[stack2.length - 1].node;
            const children = parent.children ??= [];
            if (children.length < MINDMAP_MAX_CHILDREN_PER_NODE) {
                children.push(node);
                stack2.push({ node, indent });
            }
        }
    }

    if (root2) {
        root2.id = 'root';
        return root2;
    }

    // ── Fallback: single root with one child per non-empty line ───────────────
    return {
        id: 'root',
        topic: '导入的思维导图',
        children: lines.slice(0, Math.min(20, MINDMAP_MAX_CHILDREN_PER_NODE)).map(l => ({
            id: genId(),
            topic: cleanMindMapTopic(l.replace(/^[-*#\s]+/, '').trim() || l),
            children: [],
        })),
    };
}

/**
 * Parse an OPML XML string into a mind-elixir NodeObj tree.
 * Compatible with files exported by Logseq, OmniOutliner, and nodeObjToOpml().
 */
export function opmlToNodeObj(opmlStr: string): NodeObj {
    assertImportSize(opmlStr, 'OPML');
    const parser = new DOMParser();
    const doc = parser.parseFromString(opmlStr, 'application/xml');

    // Check for parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
        throw new Error('OPML 格式解析失败：' + parseError.textContent?.slice(0, 80));
    }

    const titleEl = doc.querySelector('head > title');
    const rootTitle = cleanMindMapTopic(titleEl?.textContent?.trim(), '导入的思维导图');
    const ctx: WalkContext = { count: 0 };

    function convertOutline(el: Element, depth: number): NodeObj {
        if (!canVisit(ctx, depth)) {
            return { id: genId(), topic: '节点', children: [] };
        }
        ctx.count += 1;

        const topic = cleanMindMapTopic(el.getAttribute('text') ?? el.getAttribute('_text') ?? '节点');
        const note = cleanMindMapNote(el.getAttribute('_note') ?? undefined);
        const hyperLink = el.getAttribute('url') ?? undefined;
        const status = el.getAttribute('_vizly_task_status') as TaskStatus | null;
        const priority = el.getAttribute('_vizly_task_priority') as TaskPriority | null;
        const assignee = cleanTaskText(el.getAttribute('_vizly_task_assignee') ?? undefined);
        const dueDate = cleanTaskText(el.getAttribute('_vizly_task_due_date') ?? undefined);
        const progressValue = el.getAttribute('_vizly_task_progress');
        const progress = progressValue === null ? undefined : Number(progressValue);

        const children: NodeObj[] = [];
        for (const child of Array.from(el.children)) {
            if (children.length >= MINDMAP_MAX_CHILDREN_PER_NODE || ctx.count >= MINDMAP_MAX_NODES) break;
            if (child.tagName.toLowerCase() === 'outline') {
                children.push(convertOutline(child, depth + 1));
            }
        }

        const node: NodeObj = { id: genId(), topic, children };
        if (note) node.note = note;
        if (hyperLink) {
            const safeUrl = toSafeExternalUrl(hyperLink);
            if (safeUrl) node.hyperLink = safeUrl;
        }
        if (status || priority || assignee || dueDate || Number.isFinite(progress)) {
            applyTaskMeta(node, {
                status: status === 'doing' || status === 'done' || status === 'todo' ? status : undefined,
                priority: priority === '高' || priority === '中' || priority === '低' || priority === '无' ? priority : undefined,
                assignee,
                dueDate,
                progress: Number.isFinite(progress) ? progress : undefined,
            });
        }
        return node;
    }

    const body = doc.querySelector('body');
    if (!body) {
        return { id: 'root', topic: rootTitle, children: [] };
    }

    // If body has a single outline child that wraps everything (our export format)
    const topOutlines = Array.from(body.children).filter(
        c => c.tagName.toLowerCase() === 'outline'
    );

    if (topOutlines.length === 1) {
        const root = convertOutline(topOutlines[0], 0);
        root.id = 'root';
        return root;
    }

    // Multiple top-level outlines → create synthetic root
    return {
        id: 'root',
        topic: rootTitle,
        children: topOutlines.map(o => convertOutline(o, 1)),
    };
}

/** Count total nodes in a NodeObj tree */
export function countNodes(node: NodeObj): number {
    return 1 + (node.children ?? []).reduce((sum, c) => sum + countNodes(c), 0);
}

/** Get max depth of a NodeObj tree */
export function getTreeDepth(node: NodeObj): number {
    if (!node.children || node.children.length === 0) return 0;
    return 1 + Math.max(...node.children.map(getTreeDepth));
}

/**
 * DFS search for a node by ID in the tree.
 * Replaces mind-elixir's `getObjById` which may not exist in v5.
 */
export function findNodeById(root: NodeObj, id: string): NodeObj | null {
    if (root.id === id) return root;
    for (const child of root.children ?? []) {
        const found = findNodeById(child, id);
        if (found) return found;
    }
    return null;
}
