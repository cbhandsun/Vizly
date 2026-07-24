/**
 * DiagramAnalyzer — 图表智能分析器 (Phase C)
 *
 * 扫描当前画布节点和连线，检测常见问题并生成优化建议。
 * 纯函数，无副作用，可用于 AI 上下文增强或独立展示。
 */

export interface AnalysisIssue {
  /** 问题类型 */
  type: 'orphan_node' | 'duplicate_edge' | 'self_loop' | 'missing_label' | 'layout_suggestion' | 'connectivity' | 'layer_violation' | 'cyclic_dependency';
  /** 严重程度 */
  severity: 'info' | 'warning' | 'error';
  /** 人类可读描述 */
  message: string;
  /** 涉及的节点/边 ID */
  relatedIds: string[];
  /** 可选：AI 建议的修复 prompt */
  suggestedPrompt?: string;
}

export interface AnalysisResult {
  issues: AnalysisIssue[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    orphanCount: number;
    connectedComponents: number;
    maxDepth: number;
  };
  /** 格式化摘要（可直接注入 AI 上下文） */
  summary: string;
}

export interface AnalysisNode {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data?: { label?: string; description?: string; domainClass?: string };
  parentId?: string;
}

export interface AnalysisEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

/**
 * 主分析函数
 */
export function analyzeDiagram(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[]
): AnalysisResult {
  const issues: AnalysisIssue[] = [];

  // 过滤掉容器类节点（titleGroup/group）
  const leafNodes = nodes.filter(
    n => n.type !== 'titleGroup' && n.type !== 'titleGroupNode' && n.type !== 'group' && n.type !== 'subGroup'
  );
  const _nodeIds = new Set(leafNodes.map(n => n.id));

  // 1. 孤立节点检测
  const connectedIds = new Set<string>();
  edges.forEach(e => {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  });

  const orphans = leafNodes.filter(n => !connectedIds.has(n.id));
  if (orphans.length > 0) {
    issues.push({
      type: 'orphan_node',
      severity: orphans.length > 3 ? 'warning' : 'info',
      message: `发现 ${orphans.length} 个孤立节点（无任何连线）：${orphans.slice(0, 5).map(n => n.data?.label || n.id).join('、')}`,
      relatedIds: orphans.map(n => n.id),
      suggestedPrompt: `请帮我为以下孤立节点建立合理的连接关系：${orphans.map(n => n.data?.label || n.id).join('、')}`,
    });
  }

  // 2. 重复连线检测
  const edgeKeys = new Map<string, string[]>();
  edges.forEach(e => {
    const key = `${e.source}->${e.target}`;
    const list = edgeKeys.get(key) || [];
    list.push(e.id);
    edgeKeys.set(key, list);
  });

  edgeKeys.forEach((ids, key) => {
    if (ids.length > 1) {
      issues.push({
        type: 'duplicate_edge',
        severity: 'warning',
        message: `检测到重复连线 ${key}（共 ${ids.length} 条）`,
        relatedIds: ids,
      });
    }
  });

  // 3. 自环检测
  const selfLoops = edges.filter(e => e.source === e.target);
  if (selfLoops.length > 0) {
    issues.push({
      type: 'self_loop',
      severity: 'warning',
      message: `检测到 ${selfLoops.length} 条自环连线`,
      relatedIds: selfLoops.map(e => e.id),
    });
  }

  // 4. 缺少标签检测
  const unlabeledNodes = leafNodes.filter(n => !n.data?.label || n.data.label.trim() === '');
  if (unlabeledNodes.length > 0) {
    issues.push({
      type: 'missing_label',
      severity: 'info',
      message: `${unlabeledNodes.length} 个节点缺少标签`,
      relatedIds: unlabeledNodes.map(n => n.id),
    });
  }

  // 5. 连通分量分析（BFS）
  const components = countConnectedComponents(leafNodes, edges);

  if (components > 1) {
    issues.push({
      type: 'connectivity',
      severity: 'info',
      message: `图表包含 ${components} 个独立子图，可能存在未连接的模块`,
      relatedIds: [],
      suggestedPrompt: '请分析当前图表中的独立子图，并建议如何将它们连接起来',
    });
  }

  // 6. 布局密度建议
  if (leafNodes.length > 10) {
    const nodesWithPos = leafNodes.filter(n => n.position);
    const positions = nodesWithPos.map(n => n.position!);
    const xs = positions.map(p => p.x);
    const ys = positions.map(p => p.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    const area = Math.max(width, 1) * Math.max(height, 1);
    const density = leafNodes.length / (area / 10000);

    if (density > 5) {
      issues.push({
        type: 'layout_suggestion',
        severity: 'info',
        message: '节点密度较高，建议使用"布局"功能自动整理',
        relatedIds: [],
        suggestedPrompt: '/layout dagre',
      });
    }
  }

  // 7. 架构层级偏向性校验 (Domain Layer Check)
  // 定义标准层级顺序: ch -> fe -> mid -> data
  const LAYER_ORDER: Record<string, number> = {
    'ch': 0,    // Channel/User
    'fe': 1,    // Frontend/Gateway
    'mid': 2,   // Middleware/Business
    'data': 3   // Data/Storage
  };

  edges.forEach(e => {
    const sourceNode = leafNodes.find(n => n.id === e.source);
    const targetNode = leafNodes.find(n => n.id === e.target);
    
    if (sourceNode?.data?.domainClass && targetNode?.data?.domainClass) {
        const sRank = LAYER_ORDER[sourceNode.data.domainClass];
        const tRank = LAYER_ORDER[targetNode.data.domainClass];
        
        if (sRank !== undefined && tRank !== undefined) {
            // 0. 安全风险：前端/用户端直连数据层
            if ((sourceNode.data.domainClass === 'ch' || sourceNode.data.domainClass === 'fe') && targetNode.data.domainClass === 'data') {
                issues.push({
                    type: 'layer_violation',
                    severity: 'error',
                    message: `🚩 重大安全风险：${sourceNode.data.label || sourceNode.id} 直连数据库，建议增加 API 网关或后端服务进行中转`,
                    relatedIds: [sourceNode.id, targetNode.id, e.id],
                    suggestedPrompt: `请在 ${sourceNode.data.label || sourceNode.id} 和 ${targetNode.data.label || targetNode.id} 之间增加一个后端业务节点`
                });
            }
            // 1. 逆向依赖检测 (e.g. data -> ch)
            else if (sRank > tRank) {
                issues.push({
                    type: 'layer_violation',
                    severity: 'warning',
                    message: `检测到层级违规：从 ${sourceNode.data.domainClass} 层到 ${targetNode.data.domainClass} 层的逆向调用`,
                    relatedIds: [sourceNode.id, targetNode.id, e.id]
                });
            }
            // 2. 跨层跃迁检测 (e.g. ch -> mid, skipping fe)
            else if (tRank - sRank > 1) {
                issues.push({
                    type: 'layer_violation',
                    severity: 'info',
                    message: `检测到跨层调用：从 ${sourceNode.data.domainClass} 层直接调用了 ${targetNode.data.domainClass} 层，建议通过中间层解耦`,
                    relatedIds: [sourceNode.id, targetNode.id, e.id]
                });
            }
        }
    }
  });

  // 7.5 单点故障检测 (SPOF)
  const inDegrees = new Map<string, number>();
  leafNodes.forEach(n => inDegrees.set(n.id, 0));
  edges.forEach(e => inDegrees.set(e.target, (inDegrees.get(e.target) || 0) + 1));

  leafNodes.forEach(n => {
    const inD = inDegrees.get(n.id) || 0;
    if (inD >= 3) {
      // 检查是否有兄弟节点（同父 ID 或 标签相似）
      const siblings = leafNodes.filter(s => s.id !== n.id && (s.parentId === n.parentId && !!n.parentId));
      if (siblings.length === 0) {
        issues.push({
          type: 'connectivity',
          severity: 'warning',
          message: `疑似单点故障：节点 "${n.data?.label || n.id}" 承载了 ${inD} 条入站流，建议增加冗余备份`,
          relatedIds: [n.id],
          suggestedPrompt: `请为 "${n.data?.label || n.id}" 增加一个冗余节点以提高系统可用性`
        });
      }
    }
  });

  // 8. 循环依赖检测 (Tarjan 或简易 DFS)
  const cycles = detectCycles(leafNodes, edges);
  if (cycles.length > 0) {
    issues.push({
        type: 'cyclic_dependency',
        severity: 'error',
        message: `检测到 ${cycles.length} 个服务的循环依赖，这可能导致调用链死锁`,
        relatedIds: cycles.flat()
    });
  }

  // 计算最大深度（从入度为 0 的节点出发的最长路径）
  const maxDepth = computeMaxDepth(leafNodes, edges);

  // 生成摘要
  const stats = {
    nodeCount: leafNodes.length,
    edgeCount: edges.length,
    orphanCount: orphans.length,
    connectedComponents: components,
    maxDepth,
  };

  const summary = buildAnalysisSummary(stats, issues);

  return { issues, stats, summary };
}

/**
 * BFS 计算连通分量数
 */
function countConnectedComponents(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[]
): number {
  const adj = new Map<string, Set<string>>();
  nodes.forEach(n => adj.set(n.id, new Set()));
  edges.forEach(e => {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  });

  const visited = new Set<string>();
  let components = 0;

  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    components++;
    const queue = [node.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      adj.get(current)?.forEach(neighbor => {
        if (!visited.has(neighbor)) queue.push(neighbor);
      });
    }
  }

  return components;
}

/**
 * 计算 DAG 最大深度
 */
function computeMaxDepth(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[]
): number {
  const nodeIds = new Set(nodes.map(n => n.id));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  nodeIds.forEach(id => {
    inDegree.set(id, 0);
    adj.set(id, []);
  });

  edges.forEach(e => {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
      adj.get(e.source)?.push(e.target);
    }
  });

  // 拓扑排序（BFS Kahn's）
  const queue = [...nodeIds].filter(id => inDegree.get(id) === 0);
  const depth = new Map<string, number>();
  queue.forEach(id => depth.set(id, 0));

  let maxD = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depth.get(current) || 0;
    maxD = Math.max(maxD, currentDepth);

    for (const neighbor of adj.get(current) || []) {
      const newIn = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newIn);
      const newDepth = currentDepth + 1;
      depth.set(neighbor, Math.max(depth.get(neighbor) || 0, newDepth));
      if (newIn === 0) queue.push(neighbor);
    }
  }

  return maxD;
}

/**
 * 简易 DFS 寻找循环依赖
 */
function detectCycles(nodes: AnalysisNode[], edges: AnalysisEdge[]): string[][] {
    const adj = new Map<string, string[]>();
    nodes.forEach(n => adj.set(n.id, []));
    edges.forEach(e => adj.get(e.source)?.push(e.target));

    const cycles: string[][] = [];
    const visited = new Set<string>();
    const stack = new Set<string>();
    const path: string[] = [];

    const dfs = (u: string) => {
        visited.add(u);
        stack.add(u);
        path.push(u);

        for (const v of adj.get(u) || []) {
            if (stack.has(v)) {
                // 发现环，提取路径
                const cycleStartIdx = path.indexOf(v);
                cycles.push([...path.slice(cycleStartIdx)]);
            } else if (!visited.has(v)) {
                dfs(v);
            }
        }

        stack.delete(u);
        path.pop();
    };

    nodes.forEach(n => {
        if (!visited.has(n.id)) dfs(n.id);
    });

    return cycles;
}

/**
 * 生成人类可读的分析摘要
 */
function buildAnalysisSummary(
  stats: AnalysisResult['stats'],
  issues: AnalysisIssue[]
): string {
  const lines = [
    `[图表分析] ${stats.nodeCount} 节点, ${stats.edgeCount} 连线, 深度 ${stats.maxDepth}, ${stats.connectedComponents} 个连通分量`,
  ];

  const warnings = issues.filter(i => i.severity === 'warning');
  const infos = issues.filter(i => i.severity === 'info');

  if (warnings.length > 0) {
    lines.push(`⚠️ ${warnings.length} 项警告: ${warnings.map(w => w.message).join('; ')}`);
  }
  if (infos.length > 0) {
    lines.push(`ℹ️ ${infos.length} 项建议: ${infos.map(i => i.message).join('; ')}`);
  }
  if (issues.length === 0) {
    lines.push('✅ 未发现问题');
  }

  return lines.join('\n');
}
