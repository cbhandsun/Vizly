import {
  collectRouteStabilityViolations,
  resolveRouteBudget,
} from '../smokeRouteBudgetUtils.mjs';

export const getUnexpectedLogs = (logs, allowedWarningPatterns) => logs.filter((entry) => {
  if (entry.level === 'error') return true;
  return !allowedWarningPatterns.some((pattern) => pattern.test(entry.message));
});

export const dedupeRouteAssets = (assets) => {
  if (!Array.isArray(assets)) return [];

  const byFile = new Map();
  for (const asset of assets) {
    if (!asset || typeof asset !== 'object' || typeof asset.file !== 'string' || !asset.file) continue;
    const existing = byFile.get(asset.file);
    if (!existing) {
      byFile.set(asset.file, { ...asset });
      continue;
    }
    byFile.set(asset.file, {
      ...existing,
      startTime: Math.min(existing.startTime, asset.startTime),
      duration: Math.max(existing.duration, asset.duration),
      transferSize: Math.max(existing.transferSize, asset.transferSize),
      encodedBodySize: Math.max(existing.encodedBodySize, asset.encodedBodySize),
      decodedBodySize: Math.max(existing.decodedBodySize, asset.decodedBodySize),
    });
  }
  return [...byFile.values()];
};

export const partitionRouteAssetsByReadyTime = (assets, readyAt) => {
  const criticalAssets = [];
  const backgroundAssets = [];
  const criticalCutoff = Number.isFinite(readyAt) ? Math.max(0, readyAt) : 0;

  for (const asset of Array.isArray(assets) ? assets : []) {
    if (asset && Number.isFinite(asset.startTime) && asset.startTime <= criticalCutoff) {
      criticalAssets.push(asset);
    } else {
      backgroundAssets.push(asset);
    }
  }

  return { criticalCutoff, criticalAssets, backgroundAssets };
};

export const getRouteAssetReport = async (session, readyAt) => session.evaluate(`(() => {
  const readyAt = ${Number.isFinite(readyAt) ? readyAt : 0};
  const rawAssets = performance.getEntriesByType('resource')
    .filter((entry) => entry.name.includes('/assets/'))
    .map((entry) => ({
      file: entry.name.split('/').pop(),
      startTime: Math.round(entry.startTime),
      duration: Math.round(entry.duration),
      transferSize: entry.transferSize || 0,
      encodedBodySize: entry.encodedBodySize || 0,
      decodedBodySize: entry.decodedBodySize || 0,
    }));
  const assets = (${dedupeRouteAssets.toString()})(rawAssets)
    .sort((a, b) => b.decodedBodySize - a.decodedBodySize || a.file.localeCompare(b.file));

  const { criticalCutoff, criticalAssets, backgroundAssets } = (
    ${partitionRouteAssetsByReadyTime.toString()}
  )(assets, readyAt);
  const decodedKB = (items) => Math.round(items.reduce((sum, asset) => sum + asset.decodedBodySize, 0) / 102.4) / 10;
  const storageAssetPattern = /storage|supabase|share|event-streams|UnifiedStorageService|StorageService|SupabaseStorage|DataService/i;
  const layoutAssetPattern = /layout|dagre|elk|LayoutAlgorithms|LayoutRefinement|Domain.*LayoutStrategy|designerUtils/i;

  return {
    readyAt: Math.round(readyAt),
    criticalCutoff: Math.round(criticalCutoff),
    totalAssets: assets.length,
    totalDecodedKB: decodedKB(assets),
    criticalAssets: criticalAssets.length,
    criticalDecodedKB: decodedKB(criticalAssets),
    backgroundAssets: backgroundAssets.length,
    backgroundDecodedKB: decodedKB(backgroundAssets),
    largestAssets: assets.slice(0, 12),
    vendorAssets: assets
      .filter((asset) => asset.file.startsWith('vendor-'))
      .slice(0, 12),
    criticalVendorAssets: criticalAssets
      .filter((asset) => asset.file.startsWith('vendor-'))
      .sort((a, b) => b.decodedBodySize - a.decodedBodySize || a.file.localeCompare(b.file))
      .slice(0, 12),
    criticalAppAssets: criticalAssets
      .filter((asset) => !asset.file.startsWith('vendor-'))
      .sort((a, b) => b.decodedBodySize - a.decodedBodySize || a.file.localeCompare(b.file)),
    backgroundVendorAssets: backgroundAssets
      .filter((asset) => asset.file.startsWith('vendor-'))
      .sort((a, b) => b.decodedBodySize - a.decodedBodySize || a.file.localeCompare(b.file))
      .slice(0, 12),
    storageAssets: assets
      .filter((asset) => storageAssetPattern.test(asset.file))
      .map((asset) => ({
        ...asset,
        phase: asset.startTime <= criticalCutoff ? 'critical' : 'background',
      }))
      .slice(0, 20),
    layoutAssets: assets
      .filter((asset) => layoutAssetPattern.test(asset.file))
      .map((asset) => ({
        ...asset,
        phase: asset.startTime <= criticalCutoff ? 'critical' : 'background',
      }))
      .slice(0, 24),
  };
})()`);

const summarizeInitiator = (initiator) => {
  if (!initiator) return undefined;
  const frames = initiator.stack?.callFrames || initiator.stack?.parent?.callFrames || [];
  const frame = frames.find((item) => item.url) || frames[0];
  return {
    type: initiator.type,
    url: frame?.url ? frame.url.split('/').pop() : undefined,
    functionName: frame?.functionName || undefined,
    lineNumber: typeof frame?.lineNumber === 'number' ? frame.lineNumber + 1 : undefined,
    columnNumber: typeof frame?.columnNumber === 'number' ? frame.columnNumber + 1 : undefined,
  };
};

export const attachInitiators = (session, report) => {
  const byFile = new Map();
  for (const request of session.requests.values()) {
    if (!request.url?.includes('/assets/')) continue;
    byFile.set(request.url.split('/').pop(), summarizeInitiator(request.initiator));
  }

  const decorate = (asset) => ({ ...asset, initiator: byFile.get(asset.file) });
  return {
    ...report,
    largestAssets: report.largestAssets.map(decorate),
    vendorAssets: report.vendorAssets.map(decorate),
    criticalVendorAssets: report.criticalVendorAssets.map(decorate),
    backgroundVendorAssets: report.backgroundVendorAssets.map(decorate),
    storageAssets: report.storageAssets.map(decorate),
    layoutAssets: report.layoutAssets.map(decorate),
  };
};

const upperMedian = (values) => {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  return sorted[Math.floor(sorted.length / 2)];
};

export const aggregateRouteSamples = (samples) => {
  if (samples.length === 1) {
    return samples[0];
  }

  const reports = samples.map((sample) => sample.assetReport);
  const medianReadyAt = upperMedian(reports.map((report) => report.readyAt));
  const representativeSample = samples.find((sample) => sample.assetReport.readyAt === medianReadyAt) || samples[0];
  const worstReport = reports.reduce((worst, report) => (
    report.readyAt > worst.readyAt ? report : worst
  ), reports[0]);

  return {
    ...representativeSample,
    sampleCount: samples.length,
    samples,
    worstReport,
    assetReport: {
      ...representativeSample.assetReport,
      readyAt: medianReadyAt,
      criticalAssets: upperMedian(reports.map((report) => report.criticalAssets)),
      criticalDecodedKB: upperMedian(reports.map((report) => report.criticalDecodedKB)),
      totalAssets: upperMedian(reports.map((report) => report.totalAssets)),
      totalDecodedKB: upperMedian(reports.map((report) => report.totalDecodedKB)),
    },
  };
};

export const printRouteReports = (results, { enabled = false, log }) => {
  if (!enabled) return;

  log('\nRoute asset report:');
  for (const result of results) {
    const report = result.assetReport;
    const repeatSummary = result.sampleCount > 1 && result.worstReport
      ? `, samples ${result.sampleCount}, worst ready ${result.worstReport.readyAt} ms`
      : '';
    log(`- ${result.name}: critical ${report.criticalAssets}/${report.totalAssets} assets, ${report.criticalDecodedKB}/${report.totalDecodedKB} KB decoded, ready ${report.readyAt} ms${repeatSummary}`);
    for (const asset of report.criticalVendorAssets.slice(0, 6)) {
      const size = Math.round(asset.decodedBodySize / 102.4) / 10;
      const initiator = asset.initiator
        ? `, initiator ${asset.initiator.type}${asset.initiator.url ? ` ${asset.initiator.url}` : ''}${asset.initiator.lineNumber ? `:${asset.initiator.lineNumber}` : ''}`
        : '';
      log(`  critical ${asset.file} (${size} KB decoded, start ${asset.startTime} ms, ${asset.duration} ms${initiator})`);
    }
    for (const asset of (report.criticalAppAssets || []).slice(0, 24)) {
      const size = Math.round(asset.decodedBodySize / 102.4) / 10;
      log(`  critical app ${asset.file} (${size} KB decoded, start ${asset.startTime} ms, ${asset.duration} ms)`);
    }
    for (const asset of report.backgroundVendorAssets.slice(0, 3)) {
      const size = Math.round(asset.decodedBodySize / 102.4) / 10;
      log(`  background ${asset.file} (${size} KB decoded, start ${asset.startTime} ms, ${asset.duration} ms)`);
    }
    for (const asset of report.storageAssets || []) {
      const size = Math.round(asset.decodedBodySize / 102.4) / 10;
      const initiator = asset.initiator
        ? `, initiator ${asset.initiator.type}${asset.initiator.url ? ` ${asset.initiator.url}` : ''}${asset.initiator.lineNumber ? `:${asset.initiator.lineNumber}` : ''}`
        : '';
      log(`  ${asset.phase} storage ${asset.file} (${size} KB decoded, start ${asset.startTime} ms, ${asset.duration} ms${initiator})`);
    }
    for (const asset of report.layoutAssets || []) {
      const size = Math.round(asset.decodedBodySize / 102.4) / 10;
      const initiator = asset.initiator
        ? `, initiator ${asset.initiator.type}${asset.initiator.url ? ` ${asset.initiator.url}` : ''}${asset.initiator.lineNumber ? `:${asset.initiator.lineNumber}` : ''}`
        : '';
      log(`  ${asset.phase} layout ${asset.file} (${size} KB decoded, start ${asset.startTime} ms, ${asset.duration} ms${initiator})`);
    }
  }
};

export const collectBudgetViolations = (results, { enabled = false, isMobile = false } = {}) => {
  if (!enabled) return [];

  const violations = [];
  for (const result of results) {
    let budget;
    try {
      budget = resolveRouteBudget(result.name, {
        env: process.env,
        isMobile,
      });
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Failed to resolve route budget');
    }
    const report = result.assetReport;
    const checks = [
      {
        metric: 'criticalAssets',
        actual: report.criticalAssets,
        max: budget.criticalAssets,
        unit: 'assets',
      },
      {
        metric: 'criticalDecodedKB',
        actual: report.criticalDecodedKB,
        max: budget.criticalDecodedKB,
        unit: 'KB decoded',
      },
      {
        metric: 'readyMs',
        actual: report.readyAt,
        max: budget.readyMs,
        unit: 'ms',
      },
    ];

    for (const check of checks) {
      if (typeof check.max === 'number' && check.actual > check.max) {
        violations.push({
          route: result.name,
          metric: check.metric,
          actual: check.actual,
          max: check.max,
          unit: check.unit,
          sampleCount: result.sampleCount || 1,
          worstReadyMs: result.worstReport?.readyAt,
        });
      }
    }
    for (const violation of collectRouteStabilityViolations(
      result.stabilityReport,
      result.stabilityBudget,
    )) {
      violations.push({
        route: result.name,
        ...violation,
        sampleCount: result.sampleCount || 1,
      });
    }
  }

  return violations;
};

export const printBudgetSummary = (
  results,
  { enabled = false, isMobile = false, log },
) => {
  if (!enabled) return;

  log('\nRoute asset budget summary:');
  for (const result of results) {
    const budget = resolveRouteBudget(result.name, {
      env: process.env,
      isMobile,
    });
    const report = result.assetReport;
    const sampleSummary = result.sampleCount > 1 && result.worstReport
      ? `, samples ${result.sampleCount}, worst ready ${result.worstReport.readyAt} ms`
      : '';
    const readyBudget = typeof budget.readyMs === 'number'
      ? `${budget.readyMs} ms`
      : 'deferred';
    log(`- ${result.name}: critical assets ${report.criticalAssets}/${budget.criticalAssets}, decoded ${report.criticalDecodedKB}/${budget.criticalDecodedKB} KB, ready ${report.readyAt}/${readyBudget}${sampleSummary}`);
    if (result.stabilityReport) {
      const stability = result.stabilityReport;
      log(`  stability ${stability.durationMs} ms: long tasks ${stability.longTaskCount}, max ${stability.maxLongTaskMs} ms, heap ${stability.heapGrowthKB} KB, workers ${stability.activeWorkers}/${stability.queuedTasks}`);
    }
  }
};
