import i18n from '@/i18n';

const enDebug = {
  panel: {
    title: 'Routing Debugger',
    close: 'Close',
    toggleHint: 'Toggle with {{shortcut}}',
    tab: { perf: 'Perf', cache: 'Cache', visual: 'Visual' },
  },
  visualizer: {
    title: 'Pathfinding Visualizer',
    close: 'Close',
    debug: 'Debug',
    maximize: 'Maximize',
    restore: 'Restore',
    edgeIdPlaceholder: 'Edge ID (e.g. edge-1)',
    selectEdgeHint: 'Select an edge to debug it.',
    noDebugData: 'No debug data',
    grid: 'Grid',
    obstacles: 'Obstacles',
    vg: 'VG',
    quadTree: 'QuadTree',
    legend: {
      obstacle: 'Obstacle', source: 'Source', target: 'Target', lineCross: 'Line Cross',
      turn: 'Turn', buffer: 'Buffer', visited: 'Visited', rawPath: 'Raw Path',
    },
    stats: {
      strategy: 'Strategy: {{value}}', grid: 'Grid: {{value}}', vg: 'VG: {{value}}',
      qt: 'QT: {{value}}', visited: 'Visited: {{count}} nodes',
      ports: 'Ports: {{source}} → {{target}} | Dir: {{dir}} | Geo: {{geo}} | d=({{dx}},{{dy}})',
      time: 'Time: {{ms}}ms', steps: 'Steps: {{count}}', length: 'Length: {{value}}',
    },
  },
};

const zhDebug = {
  panel: {
    title: '路由调试器',
    close: '关闭',
    toggleHint: '使用 {{shortcut}} 开关调试面板',
    tab: { perf: '性能', cache: '缓存', visual: '可视化' },
  },
  visualizer: {
    title: '寻路可视化',
    close: '关闭',
    debug: '调试',
    maximize: '最大化',
    restore: '还原',
    edgeIdPlaceholder: '边 ID（例如 edge-1）',
    selectEdgeHint: '选择一条连线以进行调试。',
    noDebugData: '暂无调试数据',
    grid: '网格',
    obstacles: '障碍',
    vg: '可视图',
    quadTree: '四叉树',
    legend: {
      obstacle: '障碍', source: '起点', target: '终点', lineCross: '穿越线',
      turn: '拐点', buffer: '缓冲', visited: '访问过', rawPath: '原始路径',
    },
    stats: {
      strategy: '策略：{{value}}', grid: '网格：{{value}}', vg: '可视图：{{value}}',
      qt: '四叉树：{{value}}', visited: '访问：{{count}} 个节点',
      ports: '端口：{{source}} → {{target}}｜方向：{{dir}}｜几何：{{geo}}｜d=({{dx}},{{dy}})',
      time: '耗时：{{ms}}ms', steps: '步数：{{count}}', length: '长度：{{value}}',
    },
  },
};

export const registerRoutingDebugTranslations = (): void => {
  i18n.addResourceBundle('en', 'translation', { designer: { debug: enDebug } }, true, true);
  i18n.addResourceBundle('zh', 'translation', { designer: { debug: zhDebug } }, true, true);
};
