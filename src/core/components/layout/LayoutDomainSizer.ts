import type { DomainData } from '../../types/master-data';

export type { DomainData } from '../../types/master-data';

type DomainMasterData = Record<string, DomainData>;

const MAX_DOMAIN_COUNT = 1_000;
const MAX_DOMAIN_ITEM_COUNT = 1_000;
const MAX_DOMAIN_TEXT_LENGTH = 10_000;
const MAX_LAYOUT_DIMENSION = 1_000_000;
const UNSAFE_RECORD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
};

const isBoundedStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= MAX_DOMAIN_ITEM_COUNT &&
  value.every(item => typeof item === 'string' && item.length <= MAX_DOMAIN_TEXT_LENGTH);

const normalizeDimensions = (value: unknown): number[] => {
  if (!Array.isArray(value) || value.length > MAX_DOMAIN_ITEM_COUNT) return [];

  return value.map(item =>
    typeof item === 'number' && Number.isFinite(item) && item >= 0
      ? Math.min(item, MAX_LAYOUT_DIMENSION)
      : 0
  );
};

const parseDomainData = (value: unknown): DomainData | undefined => {
  if (!isRecord(value)) return undefined;
  if (typeof value.title !== 'string' || value.title.length > MAX_DOMAIN_TEXT_LENGTH) return undefined;
  if (!isBoundedStringArray(value.nodes) || !isBoundedStringArray(value.descs)) return undefined;

  return {
    title: value.title,
    nodes: [...value.nodes],
    descs: [...value.descs],
  };
};

const parseMasterData = (value: unknown): DomainMasterData | undefined => {
  if (!isRecord(value)) return undefined;

  const entries = Object.entries(value);
  if (entries.length > MAX_DOMAIN_COUNT) return undefined;

  const parsed = Object.create(null) as DomainMasterData;
  for (const [key, domain] of entries) {
    if (key.length > MAX_DOMAIN_TEXT_LENGTH || UNSAFE_RECORD_KEYS.has(key)) return undefined;
    const parsedDomain = parseDomainData(domain);
    if (!parsedDomain) return undefined;
    parsed[key] = parsedDomain;
  }

  return parsed;
};

export interface LayoutDomainSizingDependencies {
  getConfig: () => {
    NODE_H_GAP: number;
    NODE_V_GAP: number;
    DOMAIN_H_GAP: number;
    BE_COLUMN_GAP: number;
    GROUP_PADDING: { H: number; V: number };
    SUB_GROUP_PADDING: { H: number; V_TOP: number; V_BOTTOM: number };
  };
  calculateMultipleNodeWidths: (descriptions: string[], options?: { domainKey?: string }) => number[];
  calculateMultipleNodeHeights: (descriptions: string[], options?: { domainKey?: string }) => number[];
}

/** 纯域/子域尺寸规划器；文本测量与配置状态由调用方注入。 */
export class LayoutDomainSizer {
  constructor(private readonly dependencies: LayoutDomainSizingDependencies) {}

  /**
   * 优化的子域宽度计算
   */
  public calculateSubDomainWidth(
    nodeDescriptions: unknown,
    layout: 'single' | 'double' = 'single',
    options?: { domainKey?: string }
  ): number {
    const descriptions = isBoundedStringArray(nodeDescriptions) ? nodeDescriptions : [];
    const nodeWidths = normalizeDimensions(
      this.dependencies.calculateMultipleNodeWidths(descriptions, options)
    );

    if (layout === 'double') {
      // 双列布局：计算每行的宽度，取最大值
      const rows: number[] = [];
      for (let i = 0; i < nodeWidths.length; i += 2) {
        const rowWidth = nodeWidths[i] +
          (nodeWidths[i + 1] || 0) +
          (nodeWidths[i + 1] ? this.dependencies.getConfig().NODE_H_GAP : 0);
        rows.push(rowWidth);
      }
      const maxRowWidth = Math.max(0, ...rows);
      const subGroupPaddingH = this.dependencies.getConfig().SUB_GROUP_PADDING?.H ?? 30;
      return maxRowWidth + subGroupPaddingH * 2 + 40; // 安全边距
    } else {
      // 单列布局：取最大节点宽度
      const maxNodeWidth = Math.max(0, ...nodeWidths);
      const subGroupPaddingH = this.dependencies.getConfig().SUB_GROUP_PADDING?.H ?? 30;
      return maxNodeWidth + subGroupPaddingH * 2 + 20; // 安全边距
    }
  }

  /**
   * 优化的域宽度计算
   */
  public calculateDomainWidth(
    subDomainWidths: unknown,
    nodeDescriptions: unknown = [],
    layout: 'horizontal' | 'vertical' = 'horizontal',
    options?: { domainKey?: string }
  ): number {
    const safeSubDomainWidths = normalizeDimensions(subDomainWidths);
    const descriptions = isBoundedStringArray(nodeDescriptions) ? nodeDescriptions : [];
    let maxWidth = 0;

    // 考虑子域宽度
    if (safeSubDomainWidths.length > 0) {
      if (layout === 'horizontal') {
        // 水平排列：所有子域宽度之和加间隙
        const totalSubDomainWidth = safeSubDomainWidths.reduce((sum, w) => sum + w, 0) +
          (safeSubDomainWidths.length - 1) * this.dependencies.getConfig().DOMAIN_H_GAP;
        maxWidth = Math.max(maxWidth, totalSubDomainWidth);
      } else {
        // 垂直排列：取最大子域宽度
        maxWidth = Math.max(maxWidth, Math.max(0, ...safeSubDomainWidths));
      }
    }

    // 考虑直接节点宽度
    if (descriptions.length > 0) {
      const nodeWidths = normalizeDimensions(
        this.dependencies.calculateMultipleNodeWidths(descriptions, options)
      );
      const totalNodeWidth = nodeWidths.reduce((sum, w) => sum + w, 0) +
        (nodeWidths.length - 1) * this.dependencies.getConfig().NODE_H_GAP;
      maxWidth = Math.max(maxWidth, totalNodeWidth);
    }

    const groupPaddingH = this.dependencies.getConfig().GROUP_PADDING?.H ?? 40;
    // 加上域的内边距和安全边距
    return maxWidth + groupPaddingH * 2 + 60; // 安全边距
  }

  /**
   * 计算单层域的实际需要宽度（基于内容）
   */
  public calculateSingleLayerDomainWidth(domainData: unknown, domainKey?: string): number {
    const parsedDomain = parseDomainData(domainData);
    if (!parsedDomain) return 800;

    const nodeWidths = normalizeDimensions(
      this.dependencies.calculateMultipleNodeWidths(parsedDomain.descs, { domainKey })
    );
    const totalNodeWidth = nodeWidths.reduce((sum, w) => sum + w, 0);
    const totalGap = Math.max(0, nodeWidths.length - 1) * this.dependencies.getConfig().NODE_H_GAP;

    const groupPaddingH = this.dependencies.getConfig().GROUP_PADDING?.H ?? 40;
    return totalNodeWidth + totalGap + groupPaddingH * 2;
  }

  /**
   * 计算后台域的最小宽度需求（基于实际内容计算）
   */
  public calculateBackendDomainMinWidth(domainData: unknown, domainKey?: string): number {
    const parsedDomain = parseDomainData(domainData);
    if (!parsedDomain) return 800;

    const nodeWidths = normalizeDimensions(
      this.dependencies.calculateMultipleNodeWidths(parsedDomain.descs, { domainKey })
    );

    // 根据域的特点选择布局策略
    if (parsedDomain.nodes.length === 6) {
      // SCM域：2x3布局
      const rows = [
        [nodeWidths[0], nodeWidths[1]], // 第一行
        [nodeWidths[2], nodeWidths[3]], // 第二行
        [nodeWidths[4], nodeWidths[5]]  // 第三行
      ];

      const maxRowWidth = Math.max(0, ...rows.map(row =>
        row.reduce((sum, w) => sum + (w || 0), 0) + (row.length - 1) * this.dependencies.getConfig().NODE_H_GAP
      ));

      const subGroupPaddingH = this.dependencies.getConfig().SUB_GROUP_PADDING?.H ?? 30;
      return maxRowWidth + subGroupPaddingH * 2 + 40;
    } else if (parsedDomain.nodes.length === 5) {
      // 物流域：1（调度中心） + 3（同排） + 1（计费结算）
      const row1Width = nodeWidths[0] || 0;
      const row2Width = (nodeWidths[1] || 0) + (nodeWidths[2] || 0) + (nodeWidths[3] || 0) + this.dependencies.getConfig().NODE_H_GAP * 2;
      const row3Width = nodeWidths[4] || 0;
      const maxRowWidth = Math.max(row1Width, row2Width, row3Width);
      const subGroupPaddingH = this.dependencies.getConfig().SUB_GROUP_PADDING?.H ?? 30;
      return maxRowWidth + subGroupPaddingH * 2 + 40;
    } else {
      // 其他域：单列布局
      const maxNodeWidth = Math.max(0, ...nodeWidths);
      const subGroupPaddingH = this.dependencies.getConfig().SUB_GROUP_PADDING?.H ?? 30;
      return maxNodeWidth + subGroupPaddingH * 2 + 20;
    }
  }

  /**
   * 计算复杂域的实际需要宽度（包含子域）
   */
  public calculateComplexDomainWidth(domainKey: string, masterData: unknown): number {
    const domainData = parseMasterData(masterData)?.[domainKey];
    if (!domainData) return 800;

    // 根据不同域的特点计算宽度
    switch (domainKey) {
      case 'mid': {
        // 中台域：多行布局
        const nodeWidths = normalizeDimensions(
          this.dependencies.calculateMultipleNodeWidths(domainData.descs, { domainKey })
        );
        const rows = [
          [nodeWidths[0], nodeWidths[1], nodeWidths[2]], // 第一行：交易、支付、履约
          [nodeWidths[3], nodeWidths[4], nodeWidths[5]], // 第二行：商品、价格、会员
          [nodeWidths[6], nodeWidths[7]], // 第三行：风控、营销
          [nodeWidths[8], nodeWidths[9]]  // 第四行：规则、库存
        ];

        const maxRowWidth = Math.max(0, ...rows.map(row =>
          row.reduce((sum, w) => sum + (w || 0), 0) + (row.length - 1) * this.dependencies.getConfig().NODE_H_GAP
        ));

        const groupPaddingH = this.dependencies.getConfig().GROUP_PADDING?.H ?? 40;
        return maxRowWidth + groupPaddingH * 2;
      }

      case 'data':
        // 数据域：2x3布局
        return this.calculateSingleLayerDomainWidth(domainData, domainKey);

      default:
        return this.calculateSingleLayerDomainWidth(domainData, domainKey);
    }
  }

  /**
   * 计算后端复合域的宽度（包含三个子域）
   */
  public calculateBackendComplexDomainWidth(masterData: unknown): number {
    const parsedMasterData = parseMasterData(masterData);
    const scmWidth = this.calculateBackendDomainMinWidth(parsedMasterData?.['be-scm'], 'be-scm');
    const logisticsWidth = this.calculateBackendDomainMinWidth(parsedMasterData?.['be-logistics'], 'be-logistics');
    const corpWidth = this.calculateBackendDomainMinWidth(parsedMasterData?.['be-corp'], 'be-corp');

    const beColumnGap = this.dependencies.getConfig().BE_COLUMN_GAP ?? 60;
    // 三个子域水平排列，加上间隙
    const totalWidth = scmWidth + logisticsWidth + corpWidth + 2 * beColumnGap;

    const groupPaddingH = this.dependencies.getConfig().GROUP_PADDING?.H ?? 40;
    return totalWidth + groupPaddingH * 2;
  }

  /**
   * 计算所有域的宽度需求
   */
  public calculateAllDomainWidths(masterData: unknown): { [key: string]: number } {
    const parsedMasterData = parseMasterData(masterData);
    if (!parsedMasterData) return {};
    const domainWidths: { [key: string]: number } = {};

    // 计算后端复合域
    domainWidths['backend'] = this.calculateBackendComplexDomainWidth(parsedMasterData);

    // 计算其他域
    for (const [key, domainData] of Object.entries(parsedMasterData)) {
      if (key.startsWith('be-')) continue; // 跳过后端子域，已在复合域中计算

      if (key === 'mid' || key === 'data') {
        domainWidths[key] = this.calculateComplexDomainWidth(key, parsedMasterData);
      } else {
        domainWidths[key] = this.calculateSingleLayerDomainWidth(domainData, key);
      }
    }

    return domainWidths;
  }

  /**
   * 计算统一的域宽度（所有域中的最大宽度）
   */
  public calculateUnifiedDomainWidth(masterData: unknown): number {
    const allWidths = this.calculateAllDomainWidths(masterData);
    const maxWidth = Math.max(0, ...Object.values(allWidths));

    // 确保最小宽度
    return Math.max(maxWidth, 1200);
  }

  /**
   * 计算单层域的实际需要高度（基于内容）
   */
  public calculateSingleLayerDomainHeight(domainData: unknown, domainKey?: string): number {
    const parsedDomain = parseDomainData(domainData);
    if (!parsedDomain) return 400;

    const nodeHeights = normalizeDimensions(
      this.dependencies.calculateMultipleNodeHeights(parsedDomain.descs, { domainKey })
    );
    // 假设是单行水平布局，高度由最高的节点决定
    const maxNodeHeight = Math.max(0, ...nodeHeights);

    const groupPaddingV = this.dependencies.getConfig().GROUP_PADDING?.V ?? 40;
    return maxNodeHeight + groupPaddingV * 2;
  }

  /**
   * 计算后台域的最小高度需求（基于实际内容计算）
   */
  public calculateBackendDomainMinHeight(domainData: unknown, domainKey?: string): number {
    const parsedDomain = parseDomainData(domainData);
    if (!parsedDomain) return 400;

    const nodeHeights = normalizeDimensions(
      this.dependencies.calculateMultipleNodeHeights(parsedDomain.descs, { domainKey })
    );
    let contentHeight: number;

    // 根据宽度计算中使用的相同布局逻辑来计算高度
    if (parsedDomain.nodes.length === 6) {
      // SCM域：2x3布局 (3行 x 2列)
      const rows = [
        [nodeHeights[0], nodeHeights[1]], // 第1行
        [nodeHeights[2], nodeHeights[3]], // 第2行
        [nodeHeights[4], nodeHeights[5]]  // 第3行
      ];

      const totalRowHeights = rows.map(row => Math.max(row[0] || 0, row[1] || 0))
        .reduce((sum, h) => sum + h, 0);
      contentHeight = totalRowHeights + (rows.length > 1 ? (rows.length - 1) * this.dependencies.getConfig().NODE_V_GAP : 0);

    } else {
      // 其他域：默认单列布局
      const totalNodeHeight = nodeHeights.reduce((sum, h) => sum + h, 0);
      contentHeight = totalNodeHeight + (nodeHeights.length > 1 ? (nodeHeights.length - 1) * this.dependencies.getConfig().NODE_V_GAP : 0);
    }

    const subGroupPaddingV = this.dependencies.getConfig().SUB_GROUP_PADDING.V_TOP + this.dependencies.getConfig().SUB_GROUP_PADDING.V_BOTTOM;
    return contentHeight + subGroupPaddingV;
  }

  /**
   * 计算复杂域的实际需要高度（包含子域）
   */
  public calculateComplexDomainHeight(domainKey: string, masterData: unknown): number {
    const domainData = parseMasterData(masterData)?.[domainKey];
    if (!domainData) return 400;

    switch (domainKey) {
      case 'mid': {
        // 中台域：多行布局
        const nodeHeights = normalizeDimensions(
          this.dependencies.calculateMultipleNodeHeights(domainData.descs, { domainKey })
        );
        const rows = [
          [nodeHeights[0], nodeHeights[1], nodeHeights[2]],
          [nodeHeights[3], nodeHeights[4], nodeHeights[5]],
          [nodeHeights[6], nodeHeights[7]],
          [nodeHeights[8], nodeHeights[9]]
        ];

        const totalRowHeights = rows.map(row => Math.max(0, ...row.map(height => height || 0)))
          .reduce((sum, h) => sum + h, 0);
        const contentHeight = totalRowHeights + (rows.length > 1 ? (rows.length - 1) * this.dependencies.getConfig().NODE_V_GAP : 0);

        const groupPaddingV = this.dependencies.getConfig().GROUP_PADDING?.V ?? 40;
        return contentHeight + groupPaddingV * 2;
      }

      default:
        return this.calculateSingleLayerDomainHeight(domainData, domainKey);
    }
  }

  /**
   * 计算后端复合域的高度（包含三个子域）
   */
  public calculateBackendComplexDomainHeight(masterData: unknown): number {
    const parsedMasterData = parseMasterData(masterData);
    const scmHeight = this.calculateBackendDomainMinHeight(parsedMasterData?.['be-scm'], 'be-scm');
    const logisticsHeight = this.calculateBackendDomainMinHeight(parsedMasterData?.['be-logistics'], 'be-logistics');
    const corpHeight = this.calculateBackendDomainMinHeight(parsedMasterData?.['be-corp'], 'be-corp');

    // 水平排列，高度取最大值
    const maxHeight = Math.max(scmHeight, logisticsHeight, corpHeight);

    const groupPaddingV = this.dependencies.getConfig().GROUP_PADDING?.V ?? 40;
    return maxHeight + groupPaddingV * 2;
  }

  /**
   * 计算自适应画布宽度（统一域宽度加上padding）
   */
  public calculateAdaptiveCanvasWidth(masterData: unknown): number {
    const unifiedWidth = this.calculateUnifiedDomainWidth(masterData);
    return unifiedWidth + this.dependencies.getConfig().DOMAIN_H_GAP;
  }
}
