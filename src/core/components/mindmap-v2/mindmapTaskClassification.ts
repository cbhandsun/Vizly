import type { NodeObj } from 'mind-elixir';
import type { TaskClassificationResult, TaskItemInput } from './mindmapTaskAIParsing';
import { applyTaskMeta } from './mindmapTaskModel';

const DONE_RE = /(已完成|完成|done|closed|resolved|上线|发布|验收通过)/i;
const DOING_RE = /(进行中|处理中|开发中|实现中|调试|联调|doing|in progress|wip)/i;
const HIGH_PRIORITY_RE = /(高优先级|紧急|阻塞|核心|关键|风险|安全|支付|故障|事故|p0|p1|urgent|critical|blocker)/i;
const LOW_PRIORITY_RE = /(低优先级|可选|优化|清理|文档|备注|归档|nice to have|later|low)/i;

function findNodePath(root: NodeObj, targetId: string, path: NodeObj[] = []): NodeObj[] | null {
    const nextPath = [...path, root];
    if (root.id === targetId) return nextPath;
    for (const child of root.children ?? []) {
        const found = findNodePath(child, targetId, nextPath);
        if (found) return found;
    }
    return null;
}

export function collectTaskCandidates(root: NodeObj, targetId: string): TaskItemInput[] {
    const path = findNodePath(root, targetId);
    const target = path?.[path.length - 1];
    if (!path || !target) return [];

    const result: TaskItemInput[] = [];
    const walk = (node: NodeObj, ancestors: NodeObj[]) => {
        const children = node.children ?? [];
        const isLeaf = children.length === 0;
        if (isLeaf && node.id !== target.id) {
            result.push({
                id: node.id,
                topic: node.topic,
                context: ancestors.map(item => item.topic).join(' > '),
            });
        }
        children.forEach(child => walk(child, [...ancestors, node]));
    };

    walk(target, path.slice(0, -1));
    return result;
}

export function applyTaskClassifications(root: NodeObj, classifications: TaskClassificationResult[]): number {
    const byId = new Map(classifications.map(item => [item.id, item]));
    let applied = 0;

    const walk = (node: NodeObj) => {
        const classification = byId.get(node.id);
        if (classification) {
            applyTaskMeta(node, {
                status: classification.status,
                priority: classification.priority,
            });
            applied += 1;
        }
        (node.children ?? []).forEach(walk);
    };

    walk(root);
    return applied;
}

export function classifyTaskCandidatesLocally(candidates: TaskItemInput[]): TaskClassificationResult[] {
    return candidates.map(candidate => {
        const text = `${candidate.context} ${candidate.topic}`;
        const status: TaskClassificationResult['status'] = DONE_RE.test(text)
            ? 'done'
            : DOING_RE.test(text)
                ? 'doing'
                : 'todo';

        const priority: TaskClassificationResult['priority'] = HIGH_PRIORITY_RE.test(text)
            ? '高'
            : LOW_PRIORITY_RE.test(text)
                ? '低'
                : '中';

        return {
            id: candidate.id,
            status,
            priority,
        };
    });
}
