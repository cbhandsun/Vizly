import { useMemo, useState, useEffect } from 'react';
import type { Node, Edge } from '@xyflow/react';

export interface LintRule {
    id: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    messageKey?: string;
    /** 匹配条件：source 类型 → target 类型 */
    sourceTypes: string[];
    targetTypes: string[];
}

export interface LintViolation {
    ruleId: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    messageKey?: string;
    edgeId: string;
    sourceId: string;
    targetId: string;
}

export interface TopologyLinterOptions {
    enabled?: boolean;
    customRules?: LintRule[];
}

// ====== 默认规则集（对标 AWS Well-Architected 基础安全/可靠性要求） ======
export const DEFAULT_TOPOLOGY_LINT_RULES: LintRule[] = [
    // 安全层
    { id: 'SEC-001', severity: 'error',   message: 'Client applications must not connect directly to databases.', messageKey: 'designer.architecture.validation.rules.sec001',
      sourceTypes: ['frontend'], targetTypes: ['database'] },
    { id: 'SEC-002', severity: 'error',   message: 'Client applications must not connect directly to object storage.', messageKey: 'designer.architecture.validation.rules.sec002',
      sourceTypes: ['frontend'], targetTypes: ['storage'] },
    { id: 'SEC-003', severity: 'error',   message: 'Client applications must not connect directly to the cache layer.', messageKey: 'designer.architecture.validation.rules.sec003',
      sourceTypes: ['frontend'], targetTypes: ['cache'] },
    { id: 'SEC-004', severity: 'error',   message: 'Client applications must not connect directly to the internal message bus.', messageKey: 'designer.architecture.validation.rules.sec004',
      sourceTypes: ['frontend'], targetTypes: ['messageQueue'] },
    { id: 'SEC-005', severity: 'warning', message: 'Route client requests through a gateway instead of calling a microservice directly.', messageKey: 'designer.architecture.validation.rules.sec005',
      sourceTypes: ['frontend'], targetTypes: ['microservice'] },

    // 数据流方向
    { id: 'FLOW-001', severity: 'error',  message: 'Databases should not initiate requests back to a gateway.', messageKey: 'designer.architecture.validation.rules.flow001',
      sourceTypes: ['database'], targetTypes: ['gateway'] },
    { id: 'FLOW-002', severity: 'error',  message: 'Databases should not initiate requests back to a client.', messageKey: 'designer.architecture.validation.rules.flow002',
      sourceTypes: ['database'], targetTypes: ['frontend'] },
    { id: 'FLOW-003', severity: 'error',  message: 'Storage services should not initiate requests back to a client.', messageKey: 'designer.architecture.validation.rules.flow003',
      sourceTypes: ['storage'], targetTypes: ['frontend'] },
    { id: 'FLOW-004', severity: 'warning',message: 'Cache services should not normally push data directly to a gateway.', messageKey: 'designer.architecture.validation.rules.flow004',
      sourceTypes: ['cache'], targetTypes: ['gateway'] },

    { id: 'REL-002', severity: 'info',    message: 'A direct gateway-to-cache dependency increases coupling; route through a service layer.', messageKey: 'designer.architecture.validation.rules.rel002',
      sourceTypes: ['gateway'], targetTypes: ['cache'] },

    // ====== 网络拓扑规则 (NEW in 2.0) ======
    { id: 'NET-001', severity: 'warning', message: 'Place cloud resources inside a network container such as a VPC or subnet.', messageKey: 'designer.architecture.validation.rules.net001',
      sourceTypes: ['networkNode'], targetTypes: [] }, // 特殊处理：检查父容器
    { id: 'NET-002', severity: 'error',   message: 'Internal resources must not bypass subnet controls to connect directly to the public internet.', messageKey: 'designer.architecture.validation.rules.net002',
      sourceTypes: ['networkNode'], targetTypes: ['public'] },
    { id: 'ISO-001', severity: 'info',    message: 'This component is isolated and is not connected to the architecture.', messageKey: 'designer.architecture.validation.rules.iso001',
      sourceTypes: ['architectureNode', 'networkNode'], targetTypes: [] },
];

const SEVERITY_EDGE_STYLE: Record<string, { stroke: string; strokeWidth: number; strokeDasharray: string }> = {
    error:   { stroke: '#f5222d', strokeWidth: 3, strokeDasharray: '4 6' },
    warning: { stroke: '#faad14', strokeWidth: 2.5, strokeDasharray: '6 4' },
    info:    { stroke: '#1890ff', strokeWidth: 2, strokeDasharray: '2 4' },
};

export interface TopologyLintResult {
    lintedNodes: Node[];
    lintedEdges: Edge[];
    violations: LintViolation[];
}

const createViolation = (
    rule: LintRule,
    ids: Pick<LintViolation, 'edgeId' | 'sourceId' | 'targetId'>,
): LintViolation => ({
    ruleId: rule.id,
    severity: rule.severity,
    message: rule.message,
    messageKey: rule.messageKey,
    ...ids,
});

/** Pure topology validation so node-only diagrams and edge rules share one testable boundary. */
export const lintTopology = (
    nodes: Node[],
    edges: Edge[],
    rules: LintRule[] = DEFAULT_TOPOLOGY_LINT_RULES,
    enabled = true,
): TopologyLintResult => {
    if (!enabled || nodes.length === 0) {
        return { lintedNodes: nodes, lintedEdges: edges, violations: [] };
    }

    const violations: LintViolation[] = [];
    const nextNodes = nodes.map(node => ({
        ...node,
        data: { ...node.data, linterErrors: [] as string[] },
    }));
    const nextEdges = edges.map(edge => ({ ...edge }));
    const nodeMap = new Map(nextNodes.map(node => [node.id, node]));

    nextNodes.forEach(node => {
        const isArchitectureNode = node.type === 'architectureNode';
        const isNetworkNode = node.type === 'networkNode';
        if (!isArchitectureNode && !isNetworkNode) return;

        const nodeErrors = node.data.linterErrors as string[];
        if (isNetworkNode && !node.parentId) {
            const rule = rules.find(candidate => candidate.id === 'NET-001');
            if (rule) {
                nodeErrors.push(`[${rule.id}] ${rule.message}`);
                violations.push(createViolation(rule, {
                    edgeId: '',
                    sourceId: node.id,
                    targetId: '',
                }));
            }
        }

        const isConnected = edges.some(edge => edge.source === node.id || edge.target === node.id);
        if (!isConnected) {
            const rule = rules.find(candidate => candidate.id === 'ISO-001');
            if (rule) {
                nodeErrors.push(`[${rule.id}] ${rule.message}`);
                violations.push(createViolation(rule, {
                    edgeId: '',
                    sourceId: node.id,
                    targetId: '',
                }));
            }
        }
    });

    nextEdges.forEach(edge => {
        const sourceNode = nodeMap.get(edge.source);
        const targetNode = nodeMap.get(edge.target);
        if (!sourceNode || !targetNode) return;

        const isLintableNode = (type: string | undefined) => (
            type === 'architectureNode' || type === 'networkNode'
        );
        if (!isLintableNode(sourceNode.type) || !isLintableNode(targetNode.type)) return;

        const sourceData = sourceNode.data as Record<string, unknown>;
        const targetData = targetNode.data as Record<string, unknown>;
        const sourceType = typeof sourceData.type === 'string' ? sourceData.type : sourceNode.type ?? '';
        const targetType = typeof targetData.type === 'string' ? targetData.type : targetNode.type ?? '';

        const rule = rules.find(candidate => (
            candidate.targetTypes.length > 0
            && candidate.sourceTypes.includes(sourceType)
            && candidate.targetTypes.includes(targetType)
        ));
        if (!rule) return;

        violations.push(createViolation(rule, {
            edgeId: edge.id,
            sourceId: edge.source,
            targetId: edge.target,
        }));

        if (rule.severity === 'error' || rule.severity === 'warning') {
            edge.animated = true;
            edge.style = { ...edge.style, ...SEVERITY_EDGE_STYLE[rule.severity] };
            edge.zIndex = 9999;
        }

        const targetErrors = targetNode.data.linterErrors as string[];
        targetErrors.push(`[${rule.id}] ${rule.message}`);
    });

    return { lintedNodes: nextNodes, lintedEdges: nextEdges, violations };
};

/** Debounced React adapter for the pure topology validation boundary. */
export function useTopologyLinter(nodes: Node[], edges: Edge[], options: TopologyLinterOptions = {}) {
    const { enabled = true, customRules = [] } = options;
    const allRules = useMemo(
        () => [...DEFAULT_TOPOLOGY_LINT_RULES, ...customRules],
        [customRules],
    );
    const [debouncedNodes, setDebouncedNodes] = useState(nodes);
    const [debouncedEdges, setDebouncedEdges] = useState(edges);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedNodes(nodes);
            setDebouncedEdges(edges);
        }, 300);
        return () => clearTimeout(handler);
    }, [nodes, edges]);

    const result = useMemo(
        () => lintTopology(debouncedNodes, debouncedEdges, allRules, enabled),
        [allRules, debouncedEdges, debouncedNodes, enabled],
    );

    return {
        ...result,
        isPending: debouncedNodes !== nodes || debouncedEdges !== edges,
    };
}
