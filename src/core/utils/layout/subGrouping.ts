import type { Node as ReactFlowNode } from '@xyflow/react';
import type { GroupNodeData, StandardNodeData } from '../../models/DiagramModels';
import { diagramConfigManager } from '../../config/DiagramConfig';
import { deriveDomainClassFromDomain } from '../domainKey';
import { calculateBoundingBox } from './geometryUtils';

const GROUP_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain']);

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const nodeData = (node: ReactFlowNode): Record<string, unknown> => asRecord(node.data);
const metadataData = (data: Record<string, unknown>): Record<string, unknown> =>
  asRecord(data.metadata);
const isGroupType = (type: unknown): boolean => GROUP_TYPES.has(String(type || ''));
const cloneNodeData = (node: ReactFlowNode): ReactFlowNode => ({
  ...node,
  data: { ...nodeData(node) },
});
const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const stringValues = (values: unknown[]): string[] =>
  values.filter((value): value is string => typeof value === 'string' && value.length > 0);
const subDomainOf = (data: Record<string, unknown>): string =>
  String(data.subDomain ?? data.subdomain ?? metadataData(data).subDomain ?? '').trim();
const majority = (values: string[]): string | undefined => {
  if (values.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
};

/**
 * @file 统一布局工具函数
 * @description 整合所有图表的布局计算逻辑，避免重复代码
 */

/**
 * 应用子域分组（函数级注释）
 * - 按 `node.data.subDomain` 聚合并为每个子域创建 `subGroup` 容器
 * - 可选 `whitelist` 只为指定子域生成容器，其他子域跳过
 * - 初始 children 直接按子域做合并设置，避免在布局前用几何包含导致误归属
 */
export const applySubGrouping = (
  nodes: ReactFlowNode[],
  whitelist?: string[]
): ReactFlowNode[] => {
  const { SUB_GROUP_PADDING } = diagramConfigManager.getLayoutConfig();

  // 按域+子域组合键做合并，避免跨域子域容器
  const groupedByDomainAndSub: Record<string, ReactFlowNode[]> = {};
  const keyOf = (domain: string, sub: string) => `${domain}__${sub}`;
  nodes.forEach(node => {
    const data = nodeData(node);
    const domain = String(data.domain || '').trim();
    const subDomain = subDomainOf(data);
    if (!subDomain) return;
    if (Array.isArray(whitelist) && whitelist.length > 0 && !whitelist.includes(subDomain)) return;
    if (!domain) return;
    const k = keyOf(domain, subDomain);
    (groupedByDomainAndSub[k] || (groupedByDomainAndSub[k] = [])).push(node);
  });

  if (!Object.keys(groupedByDomainAndSub).length) return nodes;

  const result: ReactFlowNode[] = [...nodes];

  for (const k of Object.keys(groupedByDomainAndSub)) {
    const children = groupedByDomainAndSub[k];
    if (!children.length) continue;
    const firstChildData = nodeData(children[0]);
    const domain = String(firstChildData.domain || '').trim();
    const subDomain = subDomainOf(firstChildData);

    const bbox = calculateBoundingBox(children);
    const width = bbox.width + SUB_GROUP_PADDING.H * 2;
    const height = bbox.height + SUB_GROUP_PADDING.V_TOP + SUB_GROUP_PADDING.V_BOTTOM;
    const x = bbox.x - SUB_GROUP_PADDING.H;
    const y = bbox.y - SUB_GROUP_PADDING.V_TOP;

    // 函数级注释：从子节点的 domainClass 多数值获取容器的 domainClass
    // domainClass 只影响主题颜色，不影响域和子域的归属
    const domainClass = (() => {
      const childClasses = children
        .map(c => nodeData(c).domainClass);
      const normalizedChildClasses = stringValues(childClasses);
      if (normalizedChildClasses.length) {
        return majority(normalizedChildClasses);
      }
      // 回退：若子节点都没有 domainClass，尝试从 domain 推导
      try { return deriveDomainClassFromDomain(domain); } catch { return undefined; }
    })();

    const subGroupNode: ReactFlowNode<GroupNodeData> = {
      id: `subgroup-${domain}-${subDomain}`,
      type: 'subGroup',
      position: { x, y },
      style: { width, height },
      data: {
        id: `subgroup-${domain}-${subDomain}`,
        type: 'subGroup',
        description: subDomain,
        subDomain: subDomain,
        measured: { width, height },
        position: { x, y },
        data: children[0].data as StandardNodeData,
        children: children.map(c => c.id),
        domain,
        domainClass,
        hidden: Array.isArray(whitelist) && whitelist.length > 0 ? !whitelist.includes(subDomain) : false,
      },
      measured: { width, height },
      zIndex: -1,
      draggable: false, // 锁定自动生成的子域
    };
    result.push(subGroupNode);
  }

  return result;
};

/**
 * 为已存在的子组节点分配 children（函数级注释）
 * - 仅依据语义归属：节点的 `data.subDomain` 与容器的 `data.description/subDomain/id` 一致；
 * - 如容器声明了 `data.domain`，要求节点 `data.domain` 与之相同；
 * - 若 sg.data.children 已存在且非空，保留现有映射；否则按语义归属填充；
 * - 始终补充 sg.data.domain（按 children 多数域推断）。
 */

/**
 * 为已存在的子组节点分配 children（函数级注释）
 * - 仅依据语义归属：节点的 `data.subDomain` 与容器的 `data.description/subDomain/id` 一致；
 * - 如容器声明了 `data.domain`，要求节点 `data.domain` 与之相同；
 * - 若 sg.data.children 已存在且非空，保留现有映射；否则按语义归属填充；
 * - 始终补充 sg.data.domain（按 children 多数域推断）。
 */
export const assignChildrenToSubGroups = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const updated = nodes.map(n => n);
  const candidates = updated.filter(n => !isGroupType(n.type));
  const subGroups = updated.filter(n => String(n.type || '') === 'subGroup');

  for (const sg of subGroups) {
    const data = nodeData(sg);
    const parsedChildren = stringArray(data.children);
    const existingChildren = parsedChildren.length > 0 ? parsedChildren : null;
    const childIds: string[] = existingChildren ? existingChildren.slice() : [];
    if (!existingChildren) {
      const key = String((data?.subDomain || '')).trim();
      const dKey = String((data?.domain || '')).trim();
      for (const c of candidates) {
        const cData = nodeData(c);
        const cSub = subDomainOf(cData);
        const cDom = String(cData.domain || '').trim();
        if (!key) continue;
        if (cSub === key && (!dKey || cDom === dKey)) childIds.push(c.id);
      }
    }
    data.children = childIds;

    if (!data.domain) {
      const childDomains = updated
        .filter(n => childIds.includes(n.id))
        .map(n => nodeData(n).domain);
      const normalizedChildDomains = stringValues(childDomains);
      if (normalizedChildDomains.length) {
        data.domain = majority(normalizedChildDomains);
      }
    }
    // 函数级注释：补充 domainClass（若缺失），仅从子节点的 domainClass 多数值获取
    if (!data.domainClass) {
      const childClasses = updated
        .filter(n => childIds.includes(n.id))
        .map(n => nodeData(n).domainClass);
      const normalizedChildClasses = stringValues(childClasses);
      if (normalizedChildClasses.length) {
        data.domainClass = majority(normalizedChildClasses);
      }
    }

    sg.data = data;
  }

  return updated;
};



/**
 * 域内自由节点按行吸附与打包（函数级注释）
 * 目标：将同一域内的自由业务节点按 Y 位置聚类成若干行，并在行内进行水平打包与居中，确保行内不重叠；
 * 规则：
 * - 行容差 = `NODE_V_GAP * 0.35`，同一行内节点的 Y 中心偏差不超过容差；
 * - 行宽 = 节点宽度之和 + 间距；起点 = 域内部左侧 + max(0, (innerWidth - 行宽)/2)；
 * - 超出右侧边界时进行钳制；最终写回节点坐标。
 */

/**
 * 函数级注释：按语义分配子域 children
 * 依据节点的 `data.subDomain` 与容器的 `data.description/subDomain/id` 进行匹配；
 * 若容器声明了 `data.domain`，则要求节点的 `data.domain` 与之相同；
 * 不做任何几何包含判断，避免“容器误吸收自由节点”的问题。
 */
export const assignChildrenToSubGroupsBySemantic = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  /**
   * 函数级注释：子域键归一化匹配
   * - 目的：仅去除首尾空白，保留原始大小写与空格，严格遵从用户输入。
   * - 修改：用户明确要求“有指定认指定”，因此移除 aggressive normalization。
   */
  const normalizeKey = (s: string) => s.trim();
  const updated = nodes.map(cloneNodeData);
  const candidates = updated.filter(n => !isGroupType(n.type));
  for (let i = 0; i < updated.length; i++) {
    const sg = updated[i];
    if (String(sg.type || '') !== 'subGroup') continue;
    const data = nodeData(sg);
    const keyRaw = (() => {
      const k1 = String((data?.subDomain || '')).trim();
      if (k1) return k1;
      const kDom = String((data?.domain || '')).trim();
      return kDom;
    })();
    const key = normalizeKey(keyRaw);
    const dKey = String((data?.domain || '')).trim();
    const childIds: string[] = [];
    for (const c of candidates) {
      const cd = nodeData(c);
      const cSub = normalizeKey(subDomainOf(cd));
      const cDom = String(cd.domain || '').trim();
      if (!key) continue;
      if (key === normalizeKey('__virtual__')) {
        if (!cSub && (!dKey || cDom === dKey)) childIds.push(c.id);
      } else {
        if (cSub === key && (!dKey || cDom === dKey)) childIds.push(c.id);
      }
    }
    data.children = childIds;

    // 函数级注释：补充 domainClass（若缺失），从子节点的 domainClass 多数值获取
    // 保持与 assignChildrenToSubGroups 一致的逻辑，确保子域样式能正确联动主题
    if (!data.domainClass) {
      const childClasses = updated
        .filter(n => childIds.includes(n.id))
        .map(n => nodeData(n).domainClass);
      const normalizedChildClasses = stringValues(childClasses);
      if (normalizedChildClasses.length) {
        data.domainClass = majority(normalizedChildClasses);
      }
    }

    sg.data = data;
    updated[i] = sg;
  }
  return updated;
};

/**
 * 函数级注释：确保业务节点 measured 就绪
 * 目标：为所有非容器节点补齐 `measured.width/height` 与 `style.width/height`，容器节点保持已有 `style/measured` 一致。
 * 规则：
 * - 非容器节点：优先读取 `data.description`，否则用 `label`；宽高使用 LayoutOptimizer 同步计算；
 * - 容器节点：若 `measured` 缺失，使用 `style.width/height` 或已知尺寸回填；
 * - 写回：`style.width/height` 与 `measured` 保持一致，方便后续布局与投影。
*/

/**
 * 函数级注释：语义净化子域 children
 * 目的：过滤每个子域容器的 children，保留 `subDomain` 与容器键一致的业务节点（可选校验同域），降低误归属风险。
 */
export const purgeSubGroupChildrenBySemantic = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  /**
   * 函数级注释：子域 children 语义净化（键归一化）
   * - 目的：仅去除首尾空白，保留原始大小写与空格，严格遵从用户输入。
   */
  const normalizeKey = (s: string) => s.trim();
  const updated = nodes.map(cloneNodeData);
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  for (let i = 0; i < updated.length; i++) {
    const sg = updated[i];
    if (String(sg.type || '') !== 'subGroup') continue;
    const data = nodeData(sg);
    const keyRaw = (() => {
      const k1 = String((data?.subDomain || '')).trim();
      if (k1) return k1;
      const kDom = String((data?.domain || '')).trim();
      return kDom;
    })();
    const key = normalizeKey(keyRaw);
    const dKey = String((data?.domain || '')).trim();
    const children = stringArray(data.children);
    const filtered = children.filter(cid => {
      const node = idMap.get(cid);
      if (!node || isGroupType(node.type)) return false;
      const nd = nodeData(node);
      const sub = normalizeKey(subDomainOf(nd));
      const dom = String(nd.domain || '').trim();
      if (!key) return false;
      if (key === normalizeKey('__virtual__')) {
        if (sub) return false;
      } else {
        if (sub !== key) return false;
      }
      if (dKey && dom !== dKey) return false;
      return true;
    });
    data.children = filtered;
    sg.data = data;
    updated[i] = sg;
  }
  return updated;
};

/**
 * 计算边界框
 * @param nodes 节点列表
 * @returns 边界矩形
 */

/**
 * 函数级注释：补齐子域容器的 domain
 * 目标：若 `subGroup.data.domain` 缺失，则以其 children 的多数 `domain` 作为归属，便于同域聚类。
 * 注意：不修改任何业务节点的 domain，仅回填子域容器的域字段。
 */
export const normalizeSubGroupDomainByChildren = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const EXCLUDE = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
  const pickMajority = (arr: string[]): string | undefined => {
    if (!arr.length) return undefined;
    const count = new Map<string, number>();
    for (const v of arr) count.set(v, (count.get(v) || 0) + 1);
    return Array.from(count.entries()).sort((a, b) => b[1] - a[1])[0][0];
  };
  for (let i = 0; i < updated.length; i++) {
    const sg = updated[i];
    if (String(sg.type || '') !== 'subGroup') continue;
    const data = nodeData(sg);
    const children = stringArray(data.children);
    const domains = children
      .map(id => idMap.get(id))
      .filter((n): n is ReactFlowNode => !!n && !EXCLUDE.has(String(n.type || '')))
      .map(n => String(nodeData(n).domain || ''))
      .filter(value => value.length > 0);
    const majorityDomain = pickMajority(domains);
    if (majorityDomain) {
      if (!data.domain) data.domain = majorityDomain;
      sg.data = data;
    }
  }
  return updated;
};

/**
 * 瀛愬煙瀹瑰櫒琛屾墦鍖呮帓甯冿紙鍑芥暟绾ф敞閲婏級
 * 目标：在同一 domain 内，将所有 subGroup 按域内部边界进行“依行打包”，避免随意重叠。
 * 规则：
 * - 域内部边界：left = titleGroup.x + domain.padding.horizontal；right = titleGroup.width - domain.padding.horizontal；
 * - 起始行顶：innerTop = title.height + title.padding.vertical + title.safeGap；
 * - 行内依次设置子域；超出右边界则换行；行高为该行子域最大高度；行距 = NODE_V_GAP；
 * - 子域位移时，同步 children 的坐标（dx/dy）。
 */

/**
 * 函数级注释：子域绑定一致性审计与修复
 * - 目标：保证每个业务节点至少绑定一个子域，且子域的 children 集合完整且一致；
 * - 规则：按定义键优先级进行绑定（subDomain > metadata.subDomain > description），以匹配同域；
 * - 行为：为每个 subGroup 重建 children 集合（去重），并移除重复绑定；返回新的节点集合。
 */
export const auditAndFixSubGroupChildrenBindings = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const updated = nodes.map(n => ({ ...n }));
  const subGroups = updated.filter(n => String(n.type || '') === 'subGroup');
  const bizNodes = updated.filter(n => {
    const t = String(n.type || '');
    return !['titleGroup', 'subGroup', 'group', 'domain', 'swimlane'].includes(t);
  });
  const pickKey = (data: Record<string, unknown>): string => {
    const k1 = String(data.subDomain ?? metadataData(data).subDomain ?? '').trim();
    if (k1) return k1;
    const k2 = String(data.description ?? '').trim();
    return k2;
  };
  const sgKey = (sg: ReactFlowNode): string => {
    const dt = nodeData(sg);
    const base = String(dt.domain ?? '').trim();
    const sub = pickKey(dt);
    return `${base}::${sub}`;
  };
  const bnKey = (bn: ReactFlowNode): string => {
    const dt = nodeData(bn);
    const base = String(dt.domain ?? '').trim();
    const sub = pickKey(dt);
    return `${base}::${sub}`;
  };
  const sgMap = new Map<string, ReactFlowNode>();
  for (const sg of subGroups) sgMap.set(sgKey(sg), sg);
  const ownerOf = new Map<string, string>();
  const childrenOf = new Map<string, Set<string>>();
  for (const bn of bizNodes) {
    const key = bnKey(bn);
    const sg = sgMap.get(key);
    if (!sg) continue;
    if (!childrenOf.has(key)) childrenOf.set(key, new Set());
    if (!ownerOf.has(bn.id)) {
      (childrenOf.get(key) as Set<string>).add(bn.id);
      ownerOf.set(bn.id, key);
    }
  }
  for (let i = 0; i < updated.length; i++) {
    const n = updated[i];
    if (String(n.type || '') !== 'subGroup') continue;
    const key = sgKey(n);
    const set = childrenOf.get(key) || new Set<string>();
    const list = Array.from(set);
    updated[i].data = { ...nodeData(updated[i]), children: list };
  }
  return updated;
};

/**
 * 鍑芥暟绾ф敞閲婏細鍐欏叆瀛愬煙鐩稿鍋忕Щ蹇収
 * - 鐩爣锛氬湪杩涘叆鍨傜洿鍫嗗彔鍓嶏紝涓烘瘡涓瓙鍩熺殑涓氬姟鑺傜偣璁板綍鍏剁浉瀵瑰鍣ㄥ唴宸︿笂瑙掔殑鍋忕Щ锛?
 * - 琛屼负锛歝hild.data.__rel = { x: child.x - innerLeftSg, y: child.y - innerTopSg }锛屼粎鍐欏叆涓嶈皟鏁翠綅缃€?
 */

/**
 * 缂哄け瀛愬煙閿殑涓氬姟鑺傜偣琛ラ綈锛堝嚱鏁扮骇娉ㄩ噴锛?
 * 鐩爣锛氬綋涓氬姟鑺傜偣瀛樺湪 `domain` 浣嗙己灏?`subDomain` 鏃讹紝浣跨敤鍏?`domain` 鍊艰ˉ榻?`data.subDomain`锛堝苟鍙€夎ˉ榻?`metadata.subDomain`锛夛紝
 *      浣垮緱鏃犲瓙鍩熼敭鐨勮妭鐐瑰湪鍚庣画璇箟鍒嗙粍涓庢槧灏勬椂涓庢湁瀛愬煙閿殑鑺傜偣缁撴瀯涓€鑷达細domain 鈫?subDomain 鈫?node銆?
 */
export const normalizeMissingNodeSubDomainByDomain = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const updated = nodes.map(cloneNodeData);
  for (let i = 0; i < updated.length; i++) {
    const n = updated[i];
    if (isGroupType(n.type)) continue;
    const dt = nodeData(n);
    const d = String(dt.domain || '').trim();
    const subRaw = String(dt.subDomain ?? dt.subdomain ?? '').trim();
    if (d && !subRaw) {
      dt.subDomain = d;
      if (dt.metadata && typeof dt.metadata === 'object') {
        const metadata = metadataData(dt);
        if (!String(metadata.subDomain ?? '').trim()) {
          dt.metadata = { ...metadata, subDomain: d };
        }
      }
      updated[i].data = dt;
    }
  }
  return updated;
};

/**
 * 鍩熷唴瀹规按骞崇瓑姣旂缉鏀撅紙鍖呭惈瀛愬煙瀹瑰櫒涓庢櫘閫氳妭鐐癸級锛堝嚱鏁扮骇娉ㄩ噴锛?
 * 鐩爣锛氱粺涓€鍩熷鍣ㄥ搴﹀悗锛屽皢鍚屽煙鍐呮墍鏈夋垚鍛橈紙鎺掗櫎 titleGroup锛夎浣滄暣浣擄紝鎸夊煙鍐呴儴鍙敤瀹藉害杩涜鈥滄按骞崇瓑姣旂缉鏀锯€濓紱
 * 琛屼负锛氱缉鏀?X 涓?width锛屼繚鎸?Y 涓?height 涓嶅彉锛岄伩鍏嶆枃鏈瑙夎鈥滄媺浼糕€濄€?
 */
