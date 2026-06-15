/**
 * exportXmind.ts — 自实现 XMind 2021 格式导出
 *
 * XMind 文件本质是 ZIP 包，内含 content.json + metadata.json + manifest.json
 * 兼容 XMind 2020+ 及 XMind 8（可直接用 XMind 打开）
 *
 * 数据格式参考：https://xmind.app/blog/a-brief-on-xmind-file-format/
 */

import type { NodeObj } from 'mind-elixir';
import { getTaskMeta, normalizeTags } from './mindmapTaskModel';
import { downloadBlob } from '../../utils/downloadUtils';
import { toSafeExternalUrl, toSafeImageUrl } from '../../utils/sanitizeHtml';
import {
    cleanMindMapNote,
    cleanMindMapTags,
    cleanMindMapTopic,
    MINDMAP_MAX_CHILDREN_PER_NODE,
    MINDMAP_MAX_DEPTH,
    MINDMAP_MAX_NODES,
} from './mindmapTreeSanitizer';

// ─── XMind 内部类型 ────────────────────────────────────────────────────────────

interface XmindTopic {
    id: string;
    class: 'topic';
    title: string;
    structureClass?: string;
    style?: { properties?: Record<string, string> };
    labels?: string[];
    notes?: { plain: { content: string } };
    href?: string;
    image?: { src: string; width: number; height: number };
    children?: { attached: XmindTopic[] };
}

interface XmindSheet {
    id: string;
    class: 'sheet';
    title: string;
    rootTopic: XmindTopic;
    theme?: { id: string; name: string };
}

interface ExportContext {
    count: number;
}

// ─── Unique ID generator (XMind uses 26-char hex-like IDs) ───────────────────

function xid(): string {
    const hex = () => Math.random().toString(16).slice(2).padEnd(8, '0').slice(0, 8);
    return `${hex()}${hex()}${hex().slice(0, 2)}`;
}

function safeDimension(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(1, Math.min(2048, Math.trunc(value)))
        : fallback;
}

// ─── Convert mind-elixir NodeObj → XmindTopic recursively ────────────────────

function taskNoteText(node: NodeObj): string {
    const task = getTaskMeta(node);
    const hasTask =
        !!(node as any).task ||
        task.status !== 'todo' ||
        task.priority !== '无' ||
        !!task.assignee ||
        !!task.dueDate ||
        !!task.progress;

    if (!hasTask) return '';

    const parts = [
        `状态: ${task.status === 'done' ? '已完成' : task.status === 'doing' ? '进行中' : '待办'}`,
        task.priority !== '无' ? `优先级: ${task.priority}` : null,
        task.assignee ? `负责人: ${task.assignee}` : null,
        task.dueDate ? `截止: ${task.dueDate}` : null,
        task.progress ? `进度: ${task.progress}%` : null,
    ].filter(Boolean);

    return `任务:\n${parts.join('\n')}`;
}

export function nodeToXmindTopic(node: NodeObj, depth: number): XmindTopic {
    return nodeToXmindTopicBounded(node, depth, { count: 0 });
}

function nodeToXmindTopicBounded(node: NodeObj, depth: number, ctx: ExportContext): XmindTopic {
    ctx.count += 1;
    const topic: XmindTopic = {
        id: cleanMindMapTopic(node.id || xid(), xid()),
        class: 'topic',
        title: cleanMindMapTopic(node.topic, ''),
    };

    // Root structure
    if (depth === 0) {
        topic.structureClass = 'org.xmind.ui.logic.right';
    }

    // Style: node background color / text color
    const styleProps: Record<string, string> = {};
    if (node.style?.background) styleProps['svg:fill'] = node.style.background;
    if (node.style?.color) styleProps['fo:color'] = node.style.color;
    if (node.style?.fontSize) styleProps['fo:font-size'] = `${node.style.fontSize}pt`;
    if (Object.keys(styleProps).length > 0) {
        topic.style = { properties: styleProps };
    }

    // Tags → labels
    if (node.tags && node.tags.length > 0) {
        topic.labels = cleanMindMapTags(normalizeTags(node.tags as unknown[] | undefined));
    }

    // Note + task metadata → notes.plain
    const noteParts = [cleanMindMapNote(node.note), cleanMindMapNote(taskNoteText(node))].filter(Boolean);
    if (noteParts.length > 0) {
        topic.notes = { plain: { content: noteParts.join('\n\n') } };
    }

    // Hyperlink → href
    if (node.hyperLink) {
        const safeUrl = toSafeExternalUrl(node.hyperLink);
        if (safeUrl) topic.href = safeUrl;
    }

    // Image
    if (node.image?.url) {
        const safeImageUrl = toSafeImageUrl(node.image.url);
        if (safeImageUrl) {
            topic.image = {
                src: safeImageUrl,
                width: safeDimension(node.image.width, 160),
                height: safeDimension(node.image.height, 100),
            };
        }
    }

    // Children
    if (node.children && node.children.length > 0 && depth < MINDMAP_MAX_DEPTH && ctx.count < MINDMAP_MAX_NODES) {
        const attached: XmindTopic[] = [];
        for (const child of node.children.slice(0, MINDMAP_MAX_CHILDREN_PER_NODE)) {
            if (ctx.count >= MINDMAP_MAX_NODES) break;
            attached.push(nodeToXmindTopicBounded(child, depth + 1, ctx));
        }
        topic.children = {
            attached,
        };
    }

    return topic;
}

// ─── Main export function ─────────────────────────────────────────────────────

/**
 * Export mind-elixir data to .xmind file (XMind 2020+ format).
 * Uses JSZip to create the ZIP archive.
 */
export async function exportXmind(nodeData: NodeObj, filename = 'mindmap'): Promise<void> {
    // Dynamic import to keep bundle lean
    const JSZip = (await import('jszip')).default;

    const sheet: XmindSheet = {
        id: xid(),
        class: 'sheet',
        title: cleanMindMapTopic(nodeData.topic, 'Mind Map'),
        rootTopic: nodeToXmindTopic(nodeData, 0),
        theme: {
            id: 'vizly-dark',
            name: 'Vizly Dark',
        },
    };

    const contentJson = JSON.stringify([sheet], null, 2);

    const metadataJson = JSON.stringify({
        creator: {
            name: 'Vizly',
            version: '1.0.0',
        },
        created: new Date().toISOString(),
    }, null, 2);

    const manifestJson = JSON.stringify({
        'file-entries': {
            'content.json': {},
            'metadata.json': {},
        },
    }, null, 2);

    const zip = new JSZip();
    zip.file('content.json', contentJson);
    zip.file('metadata.json', metadataJson);
    zip.file('manifest.json', manifestJson);

    const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
    });

    downloadBlob(blob, `${filename}.xmind`, 'mindmap.xmind');
}
