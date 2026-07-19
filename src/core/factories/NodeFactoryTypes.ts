/** NodeFactory 的公共输入与验证模型。 */

/**
 * 节点类型枚举
 */
export enum NodeType {
  CUSTOM = 'custom',
  SUB_GROUP = 'subGroup',
  DOMAIN = 'domain',
  INPUT = 'input',
  OUTPUT = 'output',
  DEFAULT = 'default'
}

/**
 * 节点创建配置接口
 */
export interface NodeConfig {
  id: string;
  type?: NodeType;
  position: { x: number; y: number };
  description: string;
  draggable?: boolean;
  theme?: any; // 暂时使用any类型
  /**
   * 函数级注释：域类标识（强制）
   * - 新数据必须显式提供，用于唯一域主题解析。
   */
  domainClass?: string;
  domain?: string;
  /**
   * 函数级注释：新增字段 subDomain
   * - 目的：标准化数据中的顶层 `subDomain` 能被工厂透传到 `node.data.subDomain`
   * - 背景：布局的 applySubGrouping 按 `node.data.subDomain` 聚合；若未透传则不会生成子域容器
   */
  subDomain?: string;
  parentId?: string;
  zIndex?: number;
  width?: number;
  height?: number;
  style?: Record<string, any>;
  data?: Record<string, any>;
  shape?: string;
  metadata?: any;
}

/**
 * 节点验证结果接口
 */
export interface NodeValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
