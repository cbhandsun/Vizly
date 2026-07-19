import type { ReactNode } from 'react';
import type { EdgeType } from '../types/edgeType';

/**
 * 边缘样式类型枚举
 */
export enum EdgeStyleType {
  MAIN = 'main',           // 主流程
  DEPENDENCY = 'dependency', // 依赖关系
  DATA = 'data',           // 数据流
  SUPPORT = 'support',     // 支撑关系
  CORE = 'core',           // 核心流程
  CHANNEL = 'channel',     // 渠道
  MIDEND = 'midend',       // 中台
  SCM = 'scm',             // 供应链
  LOGISTICS = 'logistics', // 物流
  CORP = 'corp',           // 企业
  INFRA = 'infra',         // 基础设施
  FEEDBACK = 'feedback',    // 反馈/回流
  CUSTOM = 'custom'      // 自定义样式
}

/**
 * 连接点方向枚举
 */
export enum HandleDirection {
  TOP = 't',
  BOTTOM = 'b',
  LEFT = 'l',
  RIGHT = 'r'
}

/**
 * 边缘创建配置接口
 */
export interface EdgeConfig {
  id?: string;
  source: string;
  target: string;
  type?: EdgeType;
  styleType?: EdgeStyleType;
  // 允许更细粒度的角落把手，如 'r-t' | 'r-b' | 'l-t' | 'l-b'
  // 默认仍支持基础方向 't' | 'b' | 'l' | 'r'
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: ReactNode;
  animated?: boolean;
  strokeWidth?: number;
  strokeColor?: string;
  strokeDasharray?: string;
  /**
   * 是否启用终点箭头标记；默认启用
   * 说明：当值为 false 时，不设置 markerEnd；其他情况根据样式自动设置
   */
  markerEnd?: boolean;
  /**
   * 是否启用起点箭头标记；默认启用
   * 说明：为满足“连线有起止点”的可读性要求，默认在起点也添加箭头标记。
   * 当值为 false 时，不设置 markerStart。
   */
  markerStart?: boolean;
  style?: Record<string, any>;
  data?: Record<string, any>;
}

/**
 * 边缘验证结果接口
 */
export interface EdgeValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
