import { safeLog } from '../utils/consoleCleanup';
import { redactSensitiveLogValue } from '../utils/logSecurity';

const toSafeSummary = (summary: unknown): unknown => {
  if (!Array.isArray(summary)) return redactSensitiveLogValue(summary);
  return summary.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return redactSensitiveLogValue(entry);
    }
    const record = entry as Record<string, unknown>;
    return {
      subGroups: record.subGroups,
      biz: record.biz,
      orphanCount: record.orphanCount,
    };
  });
};

const toSafeSubGroupSample = (sample: unknown): unknown => {
  if (!Array.isArray(sample)) return redactSensitiveLogValue(sample);
  return sample.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return redactSensitiveLogValue(entry);
    }
    const record = entry as Record<string, unknown>;
    const size = record.size && typeof record.size === 'object' && !Array.isArray(record.size)
      ? record.size as Record<string, unknown>
      : undefined;
    return {
      childrenCount: record.childrenCount,
      size: size ? { w: size.w, h: size.h } : undefined,
    };
  });
};

export const logWorkerLayoutFailure = (strategyName: string, error: unknown): void => {
  safeLog.error(`[${strategyName}] Worker Layout Failed:`, redactSensitiveLogValue(error));
};

export const logLayoutWorkerTimeout = (strategyName: string): void => {
  safeLog.warn(`[${strategyName}] Layout worker timed out`);
};

export const logDomainElkContainerUpdateFailure = (error: unknown): void => {
  safeLog.warn('[DomainElkLayout] Container update failed:', redactSensitiveLogValue(error));
};

export const logElkEdgeRouterFallback = (error: unknown): void => {
  safeLog.warn('[ELK Edge Router] Failed, falling back to default routing:', redactSensitiveLogValue(error));
};

export const logDomainDagreMissingNodeHandle = (edgeId: string, sourcePresent: boolean, targetPresent: boolean): void => {
  safeLog.warn('[DomainDagre] Edge source/target missing in idMap, using default handle.', {
    edgeId,
    sourcePresent,
    targetPresent,
  });
};

export const logLayoutDiagnosticsSummary = (summary: unknown): void => {
  safeLog.warn('[LayoutDiagnostics] Summary', toSafeSummary(summary));
};

export const logSubGroupDebugSample = (sample: unknown): void => {
  safeLog.debug('[SubGroupDebug] sample', toSafeSubGroupSample(sample));
};

export const logRegisteredLayoutStrategyMetadata = (keys: string[]): void => {
  safeLog.debug('[LayoutStrategy] Registered metadata:', keys.join(', '));
};
