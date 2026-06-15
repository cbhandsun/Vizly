import type { Theme, ThemeColor } from '../themes/types/ThemeTypes';

export interface NodeDomainSource {
  /**
   * 函数级注释：domainClass
   * 作用：透传最终域类标识（如 'ch'、'fe'、'mid'、'be-scm'、'be-logistics'、'be-corp'、'data'、'infra'）。
   * 原则：如果提供该字段，则优先使用该值进行主题解析，避免静态映射与别名不确定性。
   */
  domainClass?: string;
  domain?: string;
  /**
   * 函数级注释：描述字段
   * 为了统一节点文本来源，节点不再使用 label，若部分解析函数需要携带文本上下文，请使用 description。
   */
  description?: string;
}

// 统一的域键同义词映射（小写）
// 映射目标尽量对齐项目的标准域键：
// ch / fe / mid / be-scm / be-logistics / be-corp / data / infra
const SYNONYMS: Record<string, string> = {
  // 渠道/外部（优先映射到 ch，确保全局主题可用）
  ch: 'ch',
  channel: 'ch',
  external: 'ch',
  // 反向别名（当主题只有 external 时兜底）
  'external-system': 'ch',
  'ext': 'ch',

  // 前台/前端（映射到 fe）
  fe: 'fe',
  frontend: 'fe',
  'front-end': 'fe',

  // 中台/中间件（映射到 mid）
  mid: 'mid',
  middleware: 'mid',
  middle: 'mid',
  'middle-ware': 'mid',

  // 数据/数据库（映射到 data）
  data: 'data',
  database: 'data',
  db: 'data',
  tech: 'data',
  gps: 'data',
  'data-base': 'data',

  // 后端/业务域（通用 backend 保留，细分映射优先）
  be: 'backend',
  backend: 'backend',

  // 细分后端域
  wms: 'be-scm',
  scm: 'be-scm',
  'be-scm': 'be-scm',
  'be_scm': 'be-scm',
  'beScm': 'be-scm',

  tms: 'be-logistics',
  logistics: 'be-logistics',
  yms: 'be-logistics',
  customs: 'be-logistics',
  'be-logistics': 'be-logistics',
  'be_logistics': 'be-logistics',
  'beLogistics': 'be-logistics',

  'be-corp': 'be-corp',
  'be_corp': 'be-corp',
  'beCorp': 'be-corp',
  corp: 'be-corp',

  // 基础设施
  infra: 'infra',
  infrastructure: 'infra',

  // 生态参与方
  carrier: 'ch',
  supplier: 'ch',

  // —— 中文别名映射 ——
  // 前端/前台
  '前端': 'fe',
  '前台': 'fe',
  // 中台/中间件
  '中台': 'mid',
  '中间件': 'mid',
  // 数据/数据库
  '数据': 'data',
  '数据库': 'data',
  // 外部/渠道
  '外部': 'ch',
  '渠道': 'ch',
  // 后端/业务域
  '后端': 'backend',
  '业务': 'backend',
  // 仓储（仓库/存储/WCS）映射到 be-scm
  '仓储': 'be-scm',
  '仓库': 'be-scm',
  '存储': 'be-scm',
  '仓库管理': 'be-scm',
  // 物流/运输/路由 映射到 be-logistics
  '物流': 'be-logistics',
  '运输': 'be-logistics',
  '路由': 'be-logistics',
  '场地管理': 'be-logistics',
  // 企业/集团 映射到 be-corp
  '企业': 'be-corp',
  '集团': 'be-corp',

  // 业务别名（与主题域键联动）
  // 仓储相关别名映射到 be-scm（若主题无 be-scm，会在解析时兜底到 backend）
  warehouse: 'be-scm',
  storage: 'be-scm',
  wcs: 'be-scm',
  // 订单/编排相关别名映射到 be-logistics
  order: 'be-logistics',
  orchestrator: 'be-logistics',
  oms: 'be-logistics',
  // 运输相关别名映射到 be-logistics
  transport: 'be-logistics',
  routing: 'be-logistics'
  ,
  // —— 统一域主题策略 ——
  // 移除到 WMS 专业主题域键的专用映射，改为依赖 domainClass 与通用域别名。
  // 若节点未提供 domainClass，以下语义域键将按统一策略回退：
  // - order_source -> ch（渠道/外部）
  // - order_ingestion -> backend（后端，若主题含 be-* 细分则进一步增强）
  // - task_orchestration -> backend
  // - task_execution -> backend
  // - system_feedback -> data（数据域）
  'order_source': 'ch',
  'order-source': 'ch',
  'order_ingestion': 'backend',
  'order-ingestion': 'backend',
  'task_orchestration': 'backend',
  'task-orchestration': 'backend',
  'task_execution': 'backend',
  'task-execution': 'backend',
  'system_feedback': 'data',
  'system-feedback': 'data'
};

// 角色型域的降级映射（用于颜色兜底）
const ROLE_FALLBACK: Record<string, string> = {
  core: 'frontend',
  strategy: 'middleware',
  interface: 'external',
};

// 域键的等价候选（当主题没有首选键时，尝试这些等价键）
const ALT_KEYS: Record<string, string[]> = {
  ch: ['external'],
  external: ['ch'],
  fe: ['frontend'],
  frontend: ['fe'],
  mid: ['middleware'],
  middleware: ['mid'],
  data: ['database'],
  database: ['data'],
  'be-scm': ['backend'],
  'be-logistics': ['backend'],
  'be-corp': ['backend'],
};

// 判断主题是否包含域键
const hasDomainKey = (theme: Theme | null | undefined, key?: string): boolean => {
  if (!theme || !key) return false;
  // 兼容老图表结构 theme.domains 和新版 theme.diagram.domains
  const domainsSource = theme.diagram?.domains || (theme as any).domains || {};
  return Object.prototype.hasOwnProperty.call(domainsSource, key);
};

/**
 * 解析到主题可用的域键
 * 规则：
 * 1) 优先使用原始候选值（domain/group/titleGroup），若主题包含该键则直接使用
 * 2) 否则进行同义词映射（SYNONYMS），若主题包含映射后的键则使用
 * 3) 对 be-* 前缀的值做兜底：若主题无该细分域，则降级到 backend
 * 4) 对角色型域做兜底：core/strategy/interface -> frontend/middleware/external
 * 5) 最终兜底：frontend
 */
/**
 * 函数级注释：resolveThemeDomainKey
 * 用途：将节点来源中的域标识规范化并映射到主题中可用的域键，确保颜色正确获取。
 * 规则：
 * 1) 规范化：小写、去空格、将下划线转为连字符；将驼峰转为短横（如 beScm -> be-scm）。
 * 2) 原始候选命中：如果主题包含原始候选键，直接使用。
 * 3) 同义词映射：使用 SYNONYMS 将别名映射为标准键；命中则使用。
 * 4) 等价键兜底：若标准键不存在，尝试 ALT_KEYS 中的等价键（如 ch <-> external）。
 * 5) be-* 细分域兜底到 backend（当主题未定义细分域时）。
 * 6) 角色型兜底：core/strategy/interface -> frontend/middleware/external。
 * 7) 最终兜底：frontend；若也不存在，则使用主题 domains 的第一个键或 'frontend'。
 */
export function resolveThemeDomainKey(
  theme: Theme | null | undefined,
  source: NodeDomainSource
): string {
  const normalize = (v?: string): string => {
    const s = String(v || '').toLowerCase().trim();
    if (!s) return '';
    return s.replace(/_/g, '-').replace(/([a-z])([A-Z])/g, (_m, a: string, b: string) => `${a}-${b.toLowerCase()}`);
  };

  const domainClass = normalize(source.domainClass);
  const domain = normalize(source.domain);

  // 1. 尝试直接从 domainClass 解析
  if (domainClass) {
    // 直接命中
    if (hasDomainKey(theme, domainClass)) return domainClass;

    // 同义词映射
    const mapped = SYNONYMS[domainClass];
    if (mapped && hasDomainKey(theme, mapped)) return mapped;

    // 等价候选
    const alts = ALT_KEYS[domainClass] || (mapped ? ALT_KEYS[mapped] : undefined) || [];
    for (const alt of alts) {
      if (hasDomainKey(theme, alt)) return alt;
    }
  }

  // 2. 尝试从 domain 解析 (兜底)
  if (domain) {
    if (hasDomainKey(theme, domain)) return domain;
    const mapped = SYNONYMS[domain];
    if (mapped && hasDomainKey(theme, mapped)) return mapped;
  }

  // 3. be-* 系列降级到 backend
  if ((domainClass.startsWith('be-') || domain.startsWith('be-')) && hasDomainKey(theme, 'backend')) {
    return 'backend';
  }

  // 4. ROLE 降级
  const roleKey = ROLE_FALLBACK[domainClass] || ROLE_FALLBACK[domain];
  if (roleKey && hasDomainKey(theme, roleKey)) return roleKey;

  // 5. 最终兜底
  if (hasDomainKey(theme, 'frontend')) return 'frontend';
  return Object.keys(theme?.diagram?.domains || {})[0] || 'frontend';
}

/**
 * 获取域对应的主题颜色对象
 */
export function getDomainTheme(
  theme: Theme | null | undefined,
  source: NodeDomainSource
): ThemeColor | undefined {
  /**
   * 函数级注释：getDomainTheme
   * 目标：以 domainClass 为主、domain 为辅取色；无则回退到 'frontend' 或第一个域。
   */
  const key = resolveThemeDomainKey(theme, { 
      domainClass: source.domainClass, 
      domain: source.domain 
  });
  const domainsSource = theme?.diagram?.domains || (theme as any)?.domains || {};
  return domainsSource[key];
}

/**
 * 导出映射表（如需在其他模块使用）
 */
export const DOMAIN_SYNONYMS = SYNONYMS;
export const DOMAIN_ROLE_FALLBACK = ROLE_FALLBACK;

/**
 * 函数级注释：根据节点的 domain 推导缺失的 domainClass
 * 目的：在数据集中未显式提供 domainClass 时，为统一域主题着色补齐该字段。
 * 规则（尽量保持最小推导，不影响“直接用 domainClass”原则）：
 * - 若 domain 已是规范域类键（ch/fe/mid/be-scm/be-logistics/be-corp/data/infra/backend），直接返回自身
 * - 常见别名到规范类：external->ch, frontend->fe, middleware->mid, database->data
 * - 行业域：wms 或前缀 wms- -> be-scm；tms/logistics/yms/customs -> be-logistics
 * - 其他未知返回 undefined（由上层回退处理）
 */
export function deriveDomainClassFromDomain(domain?: string): string | undefined {
  const d = (domain || '').trim().toLowerCase();
  if (!d) return undefined;

  const canonical = new Set([
    'ch', 'fe', 'mid', 'be-scm', 'be-logistics', 'be-corp', 'data', 'infra', 'backend'
  ]);
  if (canonical.has(d)) return d;

  // 常见别名
  if (d === 'external') return 'ch';
  if (d === 'frontend') return 'fe';
  if (d === 'middleware') return 'mid';
  if (d === 'database') return 'data';

  // 行业域前缀/别名
  if (d === 'wms' || d.startsWith('wms-')) return 'be-scm';
  if (d === 'tms' || d === 'logistics' || d === 'yms' || d === 'customs') return 'be-logistics';

  return undefined;
}
