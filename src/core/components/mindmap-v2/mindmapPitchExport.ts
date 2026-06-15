import type { NodeObj } from 'mind-elixir';
import { getTaskMeta } from './mindmapTaskModel';
import {
    cleanMindMapNote,
    cleanMindMapTopic,
    MINDMAP_MAX_CHILDREN_PER_NODE,
    MINDMAP_MAX_DEPTH,
    MINDMAP_MAX_NODES,
} from './mindmapTreeSanitizer';

interface PitchNode {
    node: NodeObj;
    depth: number;
    path: string[];
    index: number;
}

function flattenForPitch(node: NodeObj, depth = 0, path: string[] = [], result: PitchNode[] = []): PitchNode[] {
    if (result.length >= MINDMAP_MAX_NODES || depth > MINDMAP_MAX_DEPTH) return result;

    const nextPath = [...path, cleanText(node.topic)];
    result.push({ node, depth, path: nextPath, index: result.length + 1 });

    if (node.expanded !== false) {
        for (const child of (node.children ?? []).slice(0, MINDMAP_MAX_CHILDREN_PER_NODE)) {
            flattenForPitch(child, depth + 1, nextPath, result);
            if (result.length >= MINDMAP_MAX_NODES) break;
        }
    }

    return result;
}

function cleanText(text: unknown): string {
    return cleanMindMapTopic(text, '').replace(/\s+/g, ' ').trim();
}

function cleanNoteText(text: unknown): string {
    return (cleanMindMapNote(text) ?? '').replace(/\s+/g, ' ').trim();
}

function headingLevel(depth: number): string {
    return '#'.repeat(Math.min(depth + 2, 6));
}

function taskLine(node: NodeObj): string | null {
    const task = getTaskMeta(node);
    const hasTask =
        !!(node as any).task ||
        task.status !== 'todo' ||
        task.priority !== '无' ||
        !!task.assignee ||
        !!task.dueDate ||
        !!task.progress;

    if (!hasTask) return null;

    const parts = [
        `状态: ${task.status === 'done' ? '已完成' : task.status === 'doing' ? '进行中' : '待办'}`,
        task.priority !== '无' ? `优先级: ${task.priority}` : null,
        task.assignee ? `负责人: ${cleanText(task.assignee)}` : null,
        task.dueDate ? `截止: ${cleanText(task.dueDate)}` : null,
        task.progress ? `进度: ${task.progress}%` : null,
    ].filter(Boolean);

    return parts.join(' | ');
}

function slideSummary(node: NodeObj): string {
    const children = node.expanded === false ? [] : (node.children ?? []);
    if (children.length === 0) {
        return cleanNoteText(node.note) || '围绕该主题补充背景、关键判断和下一步行动。';
    }

    const childTopics = children.slice(0, 5).map(child => cleanText(child.topic)).filter(Boolean);
    return `本页围绕 ${cleanText(node.topic)} 展开，重点覆盖：${childTopics.join('、')}。`;
}

export function nodeObjToPitchMarkdown(root: NodeObj): string {
    const nodes = flattenForPitch(root);
    const lines: string[] = [
        `# ${cleanText(root.topic) || '思维导图演示稿'}`,
        '',
        `> 共 ${nodes.length} 页，按当前展开状态生成。`,
        '',
        '## 演示目录',
        '',
        ...nodes.map(item => `${'  '.repeat(Math.max(item.depth, 0))}- ${item.index}. ${cleanText(item.node.topic)}`),
        '',
        '---',
        '',
    ];

    for (const item of nodes) {
        const title = cleanText(item.node.topic) || `Slide ${item.index}`;
        const children = item.node.expanded === false ? [] : (item.node.children ?? []).slice(0, MINDMAP_MAX_CHILDREN_PER_NODE);
        const task = taskLine(item.node);

        lines.push(`${headingLevel(item.depth)} ${item.index}. ${title}`);
        lines.push('');
        lines.push(`路径: ${item.path.join(' > ')}`);
        lines.push('');
        lines.push('要点:');

        if (children.length > 0) {
            children.forEach(child => lines.push(`- ${cleanText(child.topic)}`));
        } else {
            lines.push('- 补充背景');
            lines.push('- 明确判断');
            lines.push('- 推进行动');
        }

        if (task) {
            lines.push('');
            lines.push(`任务: ${task}`);
        }

        if (item.node.note) {
            lines.push('');
            lines.push('备注:');
            lines.push(cleanNoteText(item.node.note));
        }

        lines.push('');
        lines.push('演讲提示:');
        lines.push(slideSummary(item.node));
        lines.push('');
        lines.push('---');
        lines.push('');
    }

    return lines.join('\n');
}
