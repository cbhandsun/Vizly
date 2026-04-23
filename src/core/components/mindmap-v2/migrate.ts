/**
 * migrate.ts — Convert legacy React Flow mindmap data (v1) to mind-elixir format (v2)
 */
import type { NodeObj } from 'mind-elixir';
import type { VizlyMindMapV1Data, VizlyMindMapV2Data } from './types';
import { VIZLY_HYPER_THEME } from './theme';

/** Strip HTML tags from a label string */
function stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, '').trim() || 'Untitled';
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
    const { nodes, edges } = v1;

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

    function convertNode(rfNode: any): NodeObj {
        const label = stripHtml((rfNode.data?.label as string) || '');
        const childIds = (childrenMap.get(rfNode.id) || []).sort((a: string, b: string) => {
            const na = nodeMap.get(a);
            const nb = nodeMap.get(b);
            return (na?.position?.y ?? 0) - (nb?.position?.y ?? 0);
        });

        const nodeObj: NodeObj = {
            id: rfNode.id,
            topic: label,
            expanded: !rfNode.data?.collapsed,
            children: childIds.map(id => convertNode(nodeMap.get(id)!)).filter(Boolean),
        };

        // Migrate style
        const branchColor = rfNode.data?.branchColor as string | undefined;
        if (branchColor) {
            nodeObj.style = { color: branchColor };
        }

        // Migrate tags
        const tags = rfNode.data?.tags as string[] | undefined;
        if (tags && tags.length > 0) {
            nodeObj.tags = tags;
        }

        return nodeObj;
    }

    const direction = directionStringToInt(
        (rootNode.data?.direction as string) || 'LR'
    );

    return {
        _version: 'mindmap-v2',
        nodeData: { ...convertNode(rootNode), root: true },
        direction,
        theme: VIZLY_HYPER_THEME,
    };
}

/** Convert mind-elixir NodeObj back to a simple markdown-like string for AI */
export function nodeObjToMarkdown(node: NodeObj, depth = 0): string {
    const indent = '  '.repeat(depth);
    const prefix = depth === 0 ? '# ' : indent + '- ';
    const lines = [prefix + node.topic];
    if (node.note) lines.push(indent + `  > ${node.note}`);
    for (const child of node.children ?? []) {
        lines.push(nodeObjToMarkdown(child, depth + 1));
    }
    return lines.join('\n');
}

/** Convert mind-elixir NodeObj to OPML XML string (compatible with Logseq / Obsidian / OmniOutliner) */
export function nodeObjToOpml(root: NodeObj): string {
    function convertNode(node: NodeObj, depth: number): string {
        const indent = '  '.repeat(depth + 2);
        const text = node.topic
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        const extras: string[] = [];
        if (node.note) extras.push(`_note="${node.note.replace(/"/g, '&quot;')}"`);
        if (node.hyperLink) extras.push(`url="${node.hyperLink}"`);
        const extrasStr = extras.length ? ' ' + extras.join(' ') : '';
        const children = node.children ?? [];
        if (children.length === 0) {
            return `${indent}<outline text="${text}"${extrasStr}/>`;
        }
        const childLines = children.map(c => convertNode(c, depth + 1)).join('\n');
        return `${indent}<outline text="${text}"${extrasStr}>\n${childLines}\n${indent}</outline>`;
    }
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<opml version="2.0">',
        '  <head><title>' + root.topic.replace(/</g, '&lt;') + '</title></head>',
        '  <body>',
        convertNode(root, 0),
        '  </body>',
        '</opml>',
    ].join('\n');
}

/** Trigger a browser download of text content */
export function downloadText(filename: string, content: string, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
    const lines = md.split('\n').map(l => l.trimEnd()).filter(l => l.trim());

    // ── Try heading-based ──────────────────────────────────────────────────────
    const headingLines = lines.filter(l => /^#{1,6}\s/.test(l));
    if (headingLines.length > 0) {
        // Find min heading level used → becomes depth 0
        const minLevel = Math.min(...headingLines.map(l => l.match(/^(#+)/)![1].length));

        const stack: Array<{ node: NodeObj; depth: number }> = [];
        let root: NodeObj | null = null;

        for (const line of lines) {
            const m = line.match(/^(#{1,6})\s+(.*)/);
            if (!m) continue;
            const depth = m[1].length - minLevel;
            const topic = m[2].trim();
            const node: NodeObj = { id: genId(), topic, children: [] };

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
                (parent.children ??= []).push(node);
                stack.push({ node, depth });
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

    for (const line of lines) {
        const m = line.match(/^\s*[-*+]\s+(.*)/);
        if (!m) continue;
        const indent = getIndent(line);
        const topic = m[1].trim();
        const node: NodeObj = { id: genId(), topic, children: [] };

        if (stack2.length === 0 || indent === 0) {
            root2 = node;
            stack2.length = 0;
            stack2.push({ node, indent: 0 });
        } else {
            while (stack2.length > 1 && stack2[stack2.length - 1].indent >= indent) {
                stack2.pop();
            }
            const parent = stack2[stack2.length - 1].node;
            (parent.children ??= []).push(node);
            stack2.push({ node, indent });
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
        children: lines.slice(0, 20).map(l => ({
            id: genId(),
            topic: l.replace(/^[-*#\s]+/, '').trim() || l,
            children: [],
        })),
    };
}

/**
 * Parse an OPML XML string into a mind-elixir NodeObj tree.
 * Compatible with files exported by Logseq, OmniOutliner, and nodeObjToOpml().
 */
export function opmlToNodeObj(opmlStr: string): NodeObj {
    const parser = new DOMParser();
    const doc = parser.parseFromString(opmlStr, 'application/xml');

    // Check for parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
        throw new Error('OPML 格式解析失败：' + parseError.textContent?.slice(0, 80));
    }

    const titleEl = doc.querySelector('head > title');
    const rootTitle = titleEl?.textContent?.trim() || '导入的思维导图';

    function convertOutline(el: Element, depth: number): NodeObj {
        const topic = el.getAttribute('text') ?? el.getAttribute('_text') ?? '节点';
        const note = el.getAttribute('_note') ?? undefined;
        const hyperLink = el.getAttribute('url') ?? undefined;

        const children: NodeObj[] = [];
        for (const child of Array.from(el.children)) {
            if (child.tagName.toLowerCase() === 'outline') {
                children.push(convertOutline(child, depth + 1));
            }
        }

        const node: NodeObj = { id: genId(), topic, children };
        if (note) node.note = note;
        if (hyperLink) node.hyperLink = hyperLink;
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
