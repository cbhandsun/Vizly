import type { ReactNode } from 'react';

export type FlowchartShape =
  | 'rectangle' | 'diamond' | 'pill' | 'parallelogram' | 'database'
  | 'ellipse' | 'triangle' | 'hexagon' | 'star'
  | 'document' | 'cloud' | 'manual-input' | 'preparation' | 'delay' | 'display'
  | 'trapezoid' | 'predefined-process' | 'multi-document' | 'off-page' | 'internal-storage'
  | 'circle' | 'note'
  | 'underline' | 'box';

/** Portable flowchart node contract shared by editors, renderers, and update APIs. */
export interface FlowchartNodeData extends Record<string, unknown> {
  label: string;
  description?: string;
  collapsed?: boolean;
  shape?: FlowchartShape;
  domainClass?: string;
  domain?: string;
  theme?: {
    main?: string;
    border?: string;
    background?: string;
    text?: string;
  };
  icon?: ReactNode | string;
  style?: {
    strokeDasharray?: string;
    gradient?: { from: string; to: string; direction?: 'vertical' | 'horizontal' | 'diagonal' };
    shadow?: 'none' | 'soft' | 'medium' | 'strong' | 'glow';
    opacity?: number;
    borderStyle?: 'solid' | 'dashed' | 'dotted' | 'double';
    [key: string]: unknown;
  };
  locked?: boolean;
  sequence?: number;
  themeColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  isEditing?: boolean;
  businessKey?: string;
  layer?: string;
}
