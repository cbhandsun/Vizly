import { LayoutType } from './layout';

export interface OrchestrationOptions {
  type: LayoutType;
  subDomainWhitelist?: string[];
  generateDomainGroups?: boolean;
  generateSubDomainGroups?: boolean;
  domainWhitelist?: string[];
  direction?: 'TB' | 'BT' | 'LR' | 'RL';
  autoDirection?: boolean;
  spacing?: { horizontal: number; vertical: number };
  groupPadding?: number;
  autoRowSplit?: boolean;
  layout?: {
    fanGroups?: { enabled?: boolean };
    dynamicSpacing?: { enabled?: boolean };
    domainPriority?: Record<string, number>;
    [key: string]: unknown;
  };
  /** 节点布局策略（函数级注释）
   * - 用于域/子域内节点的排布策略，如 Grid/Horizontal/Vertical/Centered
   */
  nodeLayout?: LayoutType;
  /** 容器尺寸（函数级注释）
   * - 目的：为节点布局提供可用视口宽高，避免因固定列宽导致水平布局失效
   * - 格式：{ width: number; height: number }
   */
  containerSize?: { width: number; height: number };
  /** 域内容水平等比适配开关（函数级注释）
   * - 当为 true（默认）时，域垂直策略在统一域宽后按域内部可用宽度对内容进行水平等比缩放；结构与层次不变。
   * - 设为 false 可显式关闭。
   */
  fitDomainContent?: boolean;
  /** 显式域顺序 */
  domainOrder?: string[];
  /** 显式子域顺序（全局或按域） */
  subDomainOrder?: string[] | Record<string, string[]>;
}
