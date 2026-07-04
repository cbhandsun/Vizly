import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const DEFAULT_MAX_LINES = 1200;

const oversizedBaseline = new Map([
  ['src/core/utils/layout/subGroupLayout.ts', 4903],
  ['src/core/algorithms/smartEdgeUtils.ts', 4065],
  ['src/core/strategies/DomainVerticalLayoutStrategy.ts', 3258],
  ['src/core/services/EdgeRoutingCoordinator.ts', 3050],
  ['src/core/workers/core/EdgeRoutingWorker.ts', 2267],
  ['src/core/components/custom-edges/hooks/useSmartEdgeRouting.ts', 2036],
  ['src/core/strategies/DomainDagreLayoutStrategy.ts', 2026],
  ['src/core/algorithms/pathfinding.ts', 1727],
  ['src/core/components/diagrams/FlowchartDesigner.tsx', 1537],
  ['src/core/algorithms/orthogonalWaypointRefiner.ts', 1471],
  ['src/core/algorithms/__tests__/routingCrossingScorer.test.ts', 1469],
  ['src/components/debug/tabs/VisualizerTab.tsx', 1410],
  ['src/core/routing/utils/AdvancedRouting.ts', 1354],
  ['src/components/ai/AIChatPanel.tsx', 1353],
  ['src/core/components/diagrams/hooks/useMindMapOrchestrator.ts', 1329],
  ['src/core/strategies/shared/edgeRoutingPipeline.ts', 1245],
  ['src/components/ui/ConfigurationPanel.tsx', 1239],
]);

const sourceFiles = execFileSync('git', ['ls-files', 'src'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(file => file && /\.(?:tsx?|jsx?)$/i.test(file) && existsSync(file));

const failures = [];

for (const file of sourceFiles) {
  const lineCount = readFileSync(file, 'utf8').split(/\r?\n/).length;
  const baseline = oversizedBaseline.get(file);

  if (baseline !== undefined) {
    if (lineCount > baseline) {
      failures.push(`${file}: ${lineCount} lines exceeds oversized baseline ${baseline}`);
    }
    continue;
  }

  if (lineCount > DEFAULT_MAX_LINES) {
    failures.push(`${file}: ${lineCount} lines exceeds ${DEFAULT_MAX_LINES}; split or add a justified baseline`);
  }
}

for (const file of oversizedBaseline.keys()) {
  if (!existsSync(file)) {
    failures.push(`${file}: oversized baseline entry points to a missing file`);
  }
}

if (failures.length > 0) {
  console.error([
    `Source size gate failed (${failures.length} finding${failures.length === 1 ? '' : 's'}):`,
    ...failures.map(entry => `  - ${entry}`),
    '',
    'Keep main entry points and ordinary modules below 1200 lines.',
    'For existing complex modules, reduce the baseline when extracting cohesive helpers; do not raise it without an explicit architecture review.',
  ].join('\n'));
  process.exit(1);
}

console.log(`Source size gate passed for ${sourceFiles.length} source files.`);
