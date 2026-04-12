import { useMemo, useState, useEffect } from 'react';
import type { Node, Edge } from '@xyflow/react';

export interface LintRule {
    id: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    /** 匹配条件：source 类型 → target 类型 */
    sourceTypes: string[];
    targetTypes: string[];
}

export interface LintViolation {
    ruleId: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    edgeId: string;
    sourceId: string;
    targetId: string;
}

export interface TopologyLinterOptions {
    enabled?: boolean;
    customRules?: LintRule[];
}

// ====== 默认规则集（对标 AWS Well-Architected 基础安全/可靠性要求） ======
const DEFAULT_RULES: LintRule[] = [
    // 安全层
    { id: 'SEC-001', severity: 'error',   message: '安全违规: 终端不可绕过网关直连数据库',
      sourceTypes: ['frontend'], targetTypes: ['database'] },
    { id: 'SEC-002', severity: 'error',   message: '安全违规: 终端不可绕过网关直连对象存储',
      sourceTypes: ['frontend'], targetTypes: ['storage'] },
    { id: 'SEC-003', severity: 'error',   message: '安全违规: 终端不可绕过网关直连缓存层',
      sourceTypes: ['frontend'], targetTypes: ['cache'] },
    { id: 'SEC-004', severity: 'error',   message: '安全违规: 终端不可直连内部消息总线',
      sourceTypes: ['frontend'], targetTypes: ['messageQueue'] },
    { id: 'SEC-005', severity: 'warning', message: '建议: 终端不应直接调用微服务，应经过网关路由',
      sourceTypes: ['frontend'], targetTypes: ['microservice'] },

    // 数据流方向
    { id: 'FLOW-001', severity: 'error',  message: '数据流异常: 数据库不应向网关反向发起请求',
      sourceTypes: ['database'], targetTypes: ['gateway'] },
    { id: 'FLOW-002', severity: 'error',  message: '数据流异常: 数据库不应向终端反向发起请求',
      sourceTypes: ['database'], targetTypes: ['frontend'] },
    { id: 'FLOW-003', severity: 'error',  message: '数据流异常: 存储层不应向终端反向发起请求',
      sourceTypes: ['storage'], targetTypes: ['frontend'] },
    { id: 'FLOW-004', severity: 'warning',message: '建议: 缓存层通常不主动向网关推送数据',
      sourceTypes: ['cache'], targetTypes: ['gateway'] },

    // 可靠性
    { id: 'REL-001', severity: 'info',    message: '提示: 网关直连数据库会导致耦合，建议经过服务层',
      sourceTypes: ['gateway'], targetTypes: ['database'] },
    { id: 'REL-002', severity: 'info',    message: '提示: 网关直连缓存会导致耦合，建议经过服务层',
      sourceTypes: ['gateway'], targetTypes: ['cache'] },
];

const SEVERITY_EDGE_STYLE: Record<string, { stroke: string; strokeWidth: number; strokeDasharray: string }> = {
    error:   { stroke: '#f5222d', strokeWidth: 3, strokeDasharray: '4 6' },
    warning: { stroke: '#faad14', strokeWidth: 2.5, strokeDasharray: '6 4' },
    info:    { stroke: '#1890ff', strokeWidth: 2, strokeDasharray: '2 4' },
};

/**
 * 架构拓扑验证引擎 (Topology Linter)
 * - 12 条默认规则，覆盖 AWS Well-Architected 的安全/可靠性/数据流基础要求
 * - 支持 customRules 扩展
 * - 返回 lintedNodes / lintedEdges（可直接传入 ReactFlow）+ violations 列表
 */
export function useTopologyLinter(nodes: Node[], edges: Edge[], options: TopologyLinterOptions = {}) {
    const { enabled = true, customRules = [] } = options;
    const allRules = useMemo(() => [...DEFAULT_RULES, ...customRules], [customRules]);

    const [debouncedNodes, setDebouncedNodes] = useState(nodes);
    const [debouncedEdges, setDebouncedEdges] = useState(edges);

    // Debounce updates to prevent heavy topology linting from blocking React Flow renders during node drags
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedNodes(nodes);
            setDebouncedEdges(edges);
        }, 300);
        return () => clearTimeout(handler);
    }, [nodes, edges]);

    return useMemo(() => {
        if (!enabled || debouncedNodes.length === 0 || debouncedEdges.length === 0) {
            return { lintedNodes: debouncedNodes, lintedEdges: debouncedEdges, violations: [] as LintViolation[] };
        }

        const violations: LintViolation[] = [];

        // 浅复制
        const nextNodes = debouncedNodes.map(n => ({
            ...n,
            data: { ...n.data, linterErrors: [] as string[] }
        }));
        const nextEdges = debouncedEdges.map(e => ({ ...e }));
        const nodeMap = new Map(nextNodes.map(n => [n.id, n]));

        nextEdges.forEach(edge => {
            const sourceNode = nodeMap.get(edge.source);
            const targetNode = nodeMap.get(edge.target);
            if (!sourceNode || !targetNode) return;

            // 仅对 architectureNode 生效
            if (sourceNode.type !== 'architectureNode' || targetNode.type !== 'architectureNode') return;

            const stype = (sourceNode.data as Record<string, unknown>).type as string;
            const ttype = (targetNode.data as Record<string, unknown>).type as string;

            for (const rule of allRules) {
                if (rule.sourceTypes.includes(stype) && rule.targetTypes.includes(ttype)) {
                    violations.push({
                        ruleId: rule.id,
                        severity: rule.severity,
                        message: rule.message,
                        edgeId: edge.id,
                        sourceId: edge.source,
                        targetId: edge.target,
                    });

                    // 视觉标记：边
                    const sevStyle = SEVERITY_EDGE_STYLE[rule.severity];
                    if (rule.severity === 'error' || rule.severity === 'warning') {
                        edge.animated = true;
                        edge.style = { ...edge.style, ...sevStyle };
                        edge.zIndex = 9999;
                    }

                    // 视觉标记：节点
                    const errs = targetNode.data.linterErrors as string[];
                    const msg = `[${rule.id}] ${rule.message}`;
                    if (!errs.includes(msg)) errs.push(msg);

                    break; // 每条边只报最高优先级的第一条
                }
            }
        });

        return { lintedNodes: nextNodes, lintedEdges: nextEdges, violations };
    }, [nodes, edges, enabled, allRules]);
}
