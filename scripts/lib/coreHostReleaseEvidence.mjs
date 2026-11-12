// The private Core workflow owns its browser implementation. Public release
// tooling validates the execution contract, pinned App input and SDK identity.
export const CORE_HOST_CHECKS = Object.freeze([
  ['core-browser-host', 'scripts/verify-display-routing-host-suite.mjs'],
  ['core-performance-navigation', 'scripts/verify-display-routing-navigation-performance.mjs'],
  ['core-performance-business', 'scripts/verify-display-routing-business-performance.mjs'],
  ['core-performance-saved', 'scripts/verify-display-routing-saved-performance.mjs'],
  ['core-performance-large', 'scripts/verify-display-routing-large-performance.mjs'],
]);
export const CORE_HOST_GATES = Object.freeze(CORE_HOST_CHECKS.map(([id]) => id));
const preparation = ['host-source', 'core-install', 'core-build-sdk', 'core-package-contents', 'core-pack-sdk',
  'host-sdk-bind', 'host-install', 'host-build'];
const journeys = ['saved-initial-wms', 'saved-layout-logistics', 'multi-page-roundtrip',
  'topology-edit-cycle', 'business-edit-stability', 'swimlane-edit-stability'];
const presets = ['logistics-architecture-v1', 'wms-demand-allocation-strategy-v2', 'wms-process-flow-v1',
  'tms-architecture-v1', 'enterprise-architecture-v2'];
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const duration = value => Number.isFinite(value) && value >= 0;
const id = value => typeof value === 'string' && /^[1-9]\d*$/.test(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const stats = (value, count, max = Infinity) => value && value.sampleCount === count
  && ['medianMs', 'p95Ms', 'maxMs'].every(key => duration(value[key]))
  && value.medianMs <= value.p95Ms && value.p95Ms <= value.maxMs && value.maxMs <= max;
const profile = value => value && Number.isSafeInteger(value.nodeCount) && value.nodeCount > 0
  && Number.isSafeInteger(value.edgeCount) && value.edgeCount >= 0
  && Number.isSafeInteger(value.maxNestingDepth) && value.maxNestingDepth >= 0 && value.maxNestingDepth < value.nodeCount
  && Number.isSafeInteger(value.selfLoopCount) && value.selfLoopCount >= 0 && value.selfLoopCount <= value.edgeCount
  && duration(value.edgesPerNode) && duration(value.directedEdgeDensity);

function summaryPassed(gate, summary, browser) {
  if (gate === 'core-browser-host') return same(summary?.journeys, journeys) && summary.startupCases === 6;
  if (summary?.passed !== true || summary.sampleCount !== 5 || !Array.isArray(summary.groups)
    || !summary.groups.every(group => profile(group?.graphProfile))) return false;
  const business = gate === 'core-performance-business', saved = gate === 'core-performance-saved';
  const expected = business ? presets.flatMap(p => ['drag-away', 'drag-reverse'].map(d => `${p}/${d}`))
    : saved ? ['saved-initial-wms', 'saved-layout-logistics']
      : (gate === 'core-performance-large' ? ['performance-grid-200'] : presets).flatMap(p => ['cold', 'warm'].map(c => `${p}/${c}`));
  const actual = summary.groups.map(group => saved ? group?.id : `${group?.presetId}/${group?.[business ? 'operation' : 'cache']}`);
  if (actual.length !== expected.length || new Set(actual).size !== expected.length || expected.some(key => !actual.includes(key))) return false;
  if (business) return summary.groups.every(group => [
    ['releaseToFinal', 300], ['workerToFinal', 300], ['localRoute', 150],
  ].every(([metric, budget]) => {
    const value = group?.metrics?.[metric];
    return stats(value, 5) && value.budgetMs === budget && value.passed === true && value.p95Ms <= budget;
  }));
  return summary.browser?.product === browser.product && summary.browser?.revision === browser.revision && summary.groups.every(group => {
    const cached = group?.validatedCacheCount;
    return group?.sampleCount === 5 && Number.isInteger(cached) && cached >= 0 && cached <= 5
      && group[saved ? 'passed' : 'workerBudgetPassed'] === true
      && (cached === 5 ? group.workerRouting === null : stats(group.workerRouting, 5 - cached, 750));
  });
}

export function coreHostReleaseFacts(raw, { identity }) {
  const reject = () => { throw Error('Core host release evidence: incomplete, failed or mismatched execution'); };
  const core = identity?.core, app = identity?.app;
  for (const source of [core, app]) {
    if (!source || source.clean !== true || !/^[a-f0-9]{40}$/.test(source.commit ?? '')
      || !/^[a-f0-9]{40}$/.test(source.tree ?? '') || !hex(source.lockSha256)
      || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.repository ?? '')) reject();
  }
  if (!hex(identity.sdkSha256) || raw?.schema !== 'vizly-gitea-host-v1' || raw.provider !== 'gitea'
    || raw.repository !== core.repository || raw.workflow !== 'devfleet-host-performance.yaml'
    || !id(raw.run?.id) || raw.run.head_sha !== core.commit || raw.run.status !== 'completed' || raw.run.conclusion !== 'success') reject();
  const names = ['core-host-performance', 'host-performance-complete'];
  if (!Array.isArray(raw.jobs) || raw.jobs.length !== 2 || new Set(raw.jobs.map(job => job?.name)).size !== 2
    || new Set(raw.jobs.map(job => job?.id)).size !== 2 || names.some(name => !raw.jobs.some(job => job?.name === name))
    || raw.jobs.some(job => !id(job.id) || job.status !== 'completed' || job.conclusion !== 'success')) reject();
  const job = raw.jobs.find(item => item.name === 'core-host-performance'), result = job.host_result;
  if (result?.schema !== 'vizly-core-host-v1' || result.scope !== 'sdk-host-performance' || result.status !== 'passed'
    || result.deployment !== false || result.os !== 'Darwin' || result.node !== '22.23.4' || result.npm !== '12.0.1'
    || result.source !== core.commit || result.source_after !== core.commit || result.tree !== core.tree || result.tree_after !== core.tree
    || result.lock_sha256 !== core.lockSha256 || result.lock_sha256_after !== core.lockSha256
    || !Array.isArray(result.working_tree_before) || result.working_tree_before.length
    || !Array.isArray(result.working_tree_after) || result.working_tree_after.length
    || result.app_source?.repository !== app.repository || result.app_source?.commit !== app.commit
    || result.app_source?.tree !== app.tree || result.app_source?.lock_sha256 !== app.lockSha256
    || result.sdk_sha256 !== identity.sdkSha256 || !hex(result.app_snapshot_sha256)
    || !Number.isSafeInteger(result.installed_sdk_files) || result.installed_sdk_files <= 0
    || !hex(result.host_source_digest_before) || result.host_source_digest_after !== result.host_source_digest_before
    || result.host_source_unchanged !== true || result.owned_host_dependencies_removed !== true
    || !hex(result.chrome_binary_sha256_before) || result.chrome_binary_sha256_after !== result.chrome_binary_sha256_before
    || typeof result.browser?.product !== 'string' || !result.browser.product.startsWith('Chrome/')
    || typeof result.browser.revision !== 'string' || !result.browser.revision.length) reject();
  if (!Array.isArray(result.preparation) || result.preparation.length !== preparation.length
    || !same(result.preparation.map(item => item?.id), preparation)
    || result.preparation.some(item => item.exit_code !== 0 || !duration(item.seconds))) reject();
  if (!Array.isArray(result.gates) || result.gates.length !== CORE_HOST_CHECKS.length
    || new Set(result.gates.map(gate => gate?.id)).size !== CORE_HOST_CHECKS.length
    || CORE_HOST_CHECKS.some(([key, script]) => !result.gates.some(gate => gate?.id === key && gate.status === 'passed'
      && gate.exit_code === 0 && gate.owned_port_released === true && duration(gate.seconds)
      && same(gate.argv, ['node', script]) && hex(gate.evidence_sha256)
      && Number.isSafeInteger(gate.evidence_bytes) && gate.evidence_bytes > 0 && gate.evidence_bytes <= 32 * 1024 * 1024
      && summaryPassed(key, gate.summary, result.browser)))) reject();
  return CORE_HOST_GATES.map(key => ({ id: key, provider: 'gitea', repository: core.repository, commit: core.commit,
    workflow: raw.workflow, runId: raw.run.id, jobId: job.id }));
}
