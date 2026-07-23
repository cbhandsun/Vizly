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

    { id: 'REL-002', severity: 'info',    message: '提示: 网关直连缓存会导致耦合，建议经过服务层',
      sourceTypes: ['gateway'], targetTypes: ['cache'] },

    // ====== 网络拓扑规则 (NEW in 2.0) ======
    { id: 'NET-001', severity: 'warning', message: '建议: 云资源节点应放置在容器（如 VPC/子网）内',
      sourceTypes: ['networkNode'], targetTypes: [] }, // 特殊处理：检查父容器
    { id: 'NET-002', severity: 'error',   message: '安全违规: 内部资源不应绕过子网限制直连外部公网',
      sourceTypes: ['networkNode'], targetTypes: ['public'] },
    { id: 'ISO-001', severity: 'info',    message: '提示: 该节点目前为孤立状态，未连接到任何组件',
      sourceTypes: ['architectureNode', 'networkNode'], targetTypes: [] },
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

        // 1. 节点级校验 (孤立节点、容器合规)
        nextNodes.forEach(node => {
            const isArch = node.type === 'architectureNode';
            const isNet = node.type === 'networkNode';
            if (!isArch && !isNet) return;

            const errs = node.data.linterErrors as string[];
            
            // NET-001: 检查网络节点是否在容器内
            if (isNet && !node.parentId) {
                const rule = allRules.find(r => r.id === 'NET-001');
                if (rule) {
                    const msg = `[${rule.id}] ${rule.message}`;
                    if (!errs.includes(msg)) errs.push(msg);
                    violations.push({
                        ruleId: rule.id,
                        severity: rule.severity,
                        message: rule.message,
                        edgeId: '',
                        sourceId: node.id,
                        targetId: '',
                    });
                }
            }

            // ISO-001: 检查孤立节点
            const isConnected = debouncedEdges.some(e => e.source === node.id || e.target === node.id);
            if (!isConnected) {
                const rule = allRules.find(r => r.id === 'ISO-001');
                if (rule) {
                    const msg = `[${rule.id}] ${rule.message}`;
                    if (!errs.includes(msg)) errs.push(msg);
                    violations.push({
                        ruleId: rule.id,
                        severity: rule.severity,
                        message: rule.message,
                        edgeId: '',
                        sourceId: node.id,
                        targetId: '',
                    });
                }
            }
        });

        // 2. 边级校验 (拓扑流向)
        nextEdges.forEach(edge => {
            const sourceNode = nodeMap.get(edge.source);
            const targetNode = nodeMap.get(edge.target);
            if (!sourceNode || !targetNode) return;

            // 检查 architectureNode 或 networkNode
            const sType = sourceNode.type;
            const tType = targetNode.type;
            const isValidType = (t: string | undefined) => t === 'architectureNode' || t === 'networkNode';
            if (!isValidType(sType) || !isValidType(tType)) return;

            const sourceData = sourceNode.data as Record<string, unknown>;
            const targetData = targetNode.data as Record<string, unknown>;
            const stypeAttr = typeof sourceData.type === 'string' ? sourceData.type : '';
            const ttypeAttr = typeof targetData.type === 'string' ? targetData.type : '';

            for (const rule of allRules) {
                // 如果 rule.targetTypes 为空，说明是节点级规则，跳过
                if (rule.targetTypes.length === 0) continue;

                if (rule.sourceTypes.includes(stypeAttr || sType) && rule.targetTypes.includes(ttypeAttr || tType)) {
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
                    const targetErrs = targetNode.data.linterErrors as string[];
                    const msg = `[${rule.id}] ${rule.message}`;
                    if (!targetErrs.includes(msg)) targetErrs.push(msg);

                    break; 
                }
            }
        });

        return { lintedNodes: nextNodes, lintedEdges: nextEdges, violations };
    }, [debouncedNodes, debouncedEdges, enabled, allRules]);
}
