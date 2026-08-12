import { safeLog } from './consoleCleanup';
import { redactSensitiveLogValue } from './logSecurity';

const classifyCacheKey = (key: string): string => {
  if (key.startsWith('<runtime-cache-index')) return 'runtime-cache-index';
  if (key.startsWith('flowchart-autosave-v2-')) return 'diagram-autosave';
  if (key.startsWith('GenericStandardDiagram.customPresets.')) return 'diagram-custom-preset';
  if (key.startsWith('flowchart.layers.diagram.')) return 'diagram-layers';
  if (key.startsWith('flowchart.activeLayerId.diagram.')) return 'diagram-active-layer';
  if (key.startsWith('vizly:standard-preset-canvas:')) return 'diagram-preset-runtime';
  if (key.startsWith('vizly:baseReactFlowDisplayEdges:')) return 'display-routing-runtime';
  return 'editor-ui-cache';
};

export const logFlowchartCacheClearFailure = (
  storageType: 'localStorage' | 'sessionStorage',
  key: string,
  error: unknown
): void => {
  safeLog.warn(
    `[clearFlowchartCache] Failed to clear ${storageType} ${classifyCacheKey(key)}:`,
    redactSensitiveLogValue(error)
  );
};
