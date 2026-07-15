/**
 * Worker-safe edge renderer identifiers.
 *
 * Keep this module free of React, React Flow, DOM, theme, and configuration
 * imports. Routing workers need these string values without initializing the
 * UI-facing EdgeFactory module graph.
 */
export enum EdgeType {
  DEFAULT = 'default',
  STRAIGHT = 'straight',
  STEP = 'step',
  SMOOTHSTEP = 'smoothstep',
  BEZIER = 'bezier',
  SMART_BEZIER = 'smart-bezier',
  SMART_STRAIGHT = 'smart-straight',
  SMART_STEP = 'smart-step',
  ADVANCED_SMART_STEP = 'advanced-smart-step',
  ADVANCED_SMART_BEZIER = 'advanced-smart-bezier',
  ADVANCED_SMART_STRAIGHT = 'advanced-smart-straight',
  ADVANCED_CUSTOM = 'advancedCustomEdge',
  ELK = 'elk',
}
