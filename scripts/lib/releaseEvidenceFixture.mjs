import { NATIVE_CHECKS } from './nativeReleaseEvidence.mjs';
import { CORE_QUALITY_GATES, CORE_QUALITY_CHECKS } from './coreQualityReleaseEvidence.mjs';
import { CORE_HOST_GATES, CORE_HOST_CHECKS } from './coreHostReleaseEvidence.mjs';
import { BUSINESS_CHECKS, BUSINESS_RELEASE_GATES, BROWSER_CHECKS, businessProfile } from './businessReleaseEvidence.mjs';
// Synthetic release evidence for tests only; never a real CI receipt producer.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compiledTreeDigest, digest, ENGINEERING_GATES, PROMOTION_GATES } from './releaseEvidence.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export async function syntheticReleaseFixture(root, prepared, promotion = false) {
  const evidence = join(root, `evidence-${prepared.deploymentEnvironment}`); await mkdir(evidence);
  await mkdir(join(evidence, 'backend')); await writeFile(join(evidence, 'backend/index.js'), 'export const synthetic = true;');
  await writeFile(join(evidence, 'sdk.tgz'), 'SYNTHETIC TEST PACKAGE');
  const configuration = { profile: prepared.deploymentEnvironment, telemetryEnabled: true };
  const migrations = [{ version: 'synthetic-v1', sha256: 'f'.repeat(64) }];
  const identity = { app: { repository: 'test/app', commit: 'a'.repeat(40), tree: 'b'.repeat(40), lockSha256: '2'.repeat(64), clean: true },
    core: { repository: 'test/core', commit: 'c'.repeat(40), tree: 'd'.repeat(40), lockSha256: '3'.repeat(64), clean: true },
    sdkVersion: '0.1.0-test', sdkSha256: sha(await readFile(join(evidence, 'sdk.tgz'))),
    frontendSha256: await compiledTreeDigest(join(prepared.root, '.vercel/output')),
    backendSha256: await compiledTreeDigest(join(evidence, 'backend')), configurationSha256: digest(configuration), migrationsSha256: digest(migrations),
    projectId: prepared.projectId, teamId: prepared.teamId, environment: prepared.deploymentEnvironment };
  const previousCompatible = { deploymentId: 'dpl_Synthetic', releaseIdentitySha256: '1'.repeat(64), databaseRollback: 'additive-compatible' };
  const gates = [];
  for (const id of [...ENGINEERING_GATES, ...(promotion ? PROMOTION_GATES : [])]) {
    const repo = id.startsWith('core-') ? 'core' : 'app';
    const native = syntheticNativeReport(identity, repo);
    const business = syntheticBusinessCiReport(identity);
    const quality = syntheticCoreQualityReport(identity);
    const host = syntheticCoreHostReport(identity);
    const raw = JSON.stringify(id.includes('-gitea-') ? native
      : BUSINESS_RELEASE_GATES.includes(id) ? business : CORE_QUALITY_GATES.includes(id) ? quality
        : CORE_HOST_GATES.includes(id) ? host : { synthetic: true, id, status: 'passed' });
    await writeFile(join(evidence, `${id}.log`), raw);
    const report = { schema: 'vizly-release-gate-v1', id, status: 'passed', exitCode: 0, identitySha256: digest(identity),
      evidence: { path: `${id}.log`, sha256: sha(raw) },
      ...(id === 'rollback-save-reopen-collaboration' ? { rollbackIdentitySha256: digest(previousCompatible) } : {}),
      ...(id.includes('-gitea-') ? { provider: 'gitea', repository: identity[repo].repository, commit: identity[repo].commit, runId: '123', workflow: 'devfleet-native.yaml', jobId: native.jobs.find(job => id.endsWith(job.name === 'native-complete' ? 'aggregate' : job.name)).id } : {}),
      ...(CORE_QUALITY_GATES.includes(id) ? { provider: 'gitea', repository: identity.core.repository, commit: identity.core.commit,
        runId: quality.run.id, workflow: quality.workflow, jobId: '31' } : {}),
      ...(CORE_HOST_GATES.includes(id) ? { provider: 'gitea', repository: identity.core.repository, commit: identity.core.commit,
        runId: host.run.id, workflow: host.workflow, jobId: '41' } : {}),
      ...(BUSINESS_RELEASE_GATES.includes(id) ? { provider: 'gitea', repository: identity.app.repository,
        commit: identity.app.commit, runId: business.run.id, workflow: business.workflow,
        jobId: business.jobs.find(job => job.name === `business-${businessProfile(id)}`).id } : {}) };
    const bytes = JSON.stringify(report); await writeFile(join(evidence, `${id}.json`), bytes);
    gates.push({ id, path: `${id}.json`, sha256: sha(bytes) });
  }
  const manifest = { schema: 'vizly-release-v1', identity, sdkArtifact: 'sdk.tgz', backendDirectory: 'backend', configuration, migrations, gates,
    ...(promotion ? { previousCompatible } : {}) };
  const manifestPath = join(evidence, 'release.json'); await writeFile(manifestPath, JSON.stringify(manifest));
  return { manifestPath, manifest, evidence };
}

export function syntheticBusinessReport(identity) {
  const source = identity.app;
  return { schema: 'vizly-business-v1', synthetic: true, scope: 'integration', status: 'passed',
    installation_exit_code: 0, deployment: false, os: 'Linux', node: '22.23.4', npm: '12.0.1',
    source: source.commit, source_after: source.commit, tree: source.tree, tree_after: source.tree,
    lock_sha256: source.lockSha256, lock_sha256_after: source.lockSha256,
    working_tree_before: [], working_tree_after: [],
    gates: BUSINESS_CHECKS.map(([id, command]) => ({ id, command, exit_code: 0, seconds: 1 })),
  };
}

export function syntheticBusinessCiReport(identity) {
  const integration = syntheticBusinessReport(identity);
  return { schema: 'vizly-gitea-business-v1', synthetic: true, provider: 'gitea',
    repository: identity.app.repository, workflow: 'devfleet-business.yaml',
    run: { id: '456', head_sha: identity.app.commit, status: 'completed', conclusion: 'success' },
    jobs: [
      { id: '21', name: 'business-integration', status: 'completed', conclusion: 'success', business_result: integration },
      { id: '22', name: 'business-security', status: 'completed', conclusion: 'success', business_result: {
        ...integration, scope: 'security', gates: [{ id: 'app-security', command: 'audit:all', exit_code: 0, seconds: 1 }],
      } },
      { id: '23', name: 'business-complete', status: 'completed', conclusion: 'success' },
      { id: '24', name: 'business-browser', status: 'completed', conclusion: 'success', business_result: {
        ...integration, schema: 'vizly-business-v2', scope: 'browser', gates: BROWSER_CHECKS.map(([id, command]) => ({ id, command, exit_code: 0, seconds: 1,
          ...(command.startsWith('test:e2e:') ? { browser: { expected: 1, unexpected: 0, skipped: 0, flaky: 0, cases: 1, reportSha256: 'a'.repeat(64) } } : {}) })),
      } },
    ] };
}

export function syntheticNativeReport(identity, repo) {
  const source = identity[repo];
  return { schema: 'vizly-gitea-native-v1', synthetic: true, provider: 'gitea', repository: source.repository, workflow: 'devfleet-native.yaml',
    run: { id: '123', head_sha: source.commit, status: 'completed', conclusion: 'success' },
    jobs: ['macos', 'windows', 'linux', 'native-complete'].map((name, index) => ({ id: String(index + 1), name,
      status: 'completed', conclusion: 'success', ...(name === 'native-complete' ? {} : { native_result: {
        schema: 'vizly-native-v2', status: 'passed', installation_exit_code: 0, project: repo, scope: 'native-only', deployment: false,
        os: { macos: 'Darwin', windows: 'Windows', linux: 'Linux' }[name], node: '22.23.4', npm: '12.0.1',
        source: source.commit, source_after: source.commit, tree: source.tree, tree_after: source.tree,
        lock_sha256: source.lockSha256, lock_sha256_after: source.lockSha256, working_tree_before: [], working_tree_after: [],
        gates: NATIVE_CHECKS[repo].map(check => ({ name: check, exit_code: 0, seconds: 1 })),
      } }),
    })),
  };
}

export function syntheticCoreQualityReport(identity) {
  const source = identity.core;
  return { schema: 'vizly-gitea-quality-v1', synthetic: true, provider: 'gitea', repository: source.repository,
    workflow: 'devfleet-quality.yaml', run: { id: '567', head_sha: source.commit, status: 'completed', conclusion: 'success' },
    jobs: [{ id: '31', name: 'core-quality', status: 'completed', conclusion: 'success', quality_result: {
      schema: 'vizly-core-quality-v1', scope: 'quality-only', status: 'passed', installation_exit_code: 0, deployment: false,
      os: 'Linux', node: '22.23.4', npm: '12.0.1', source: source.commit, source_after: source.commit,
      tree: source.tree, tree_after: source.tree, lock_sha256: source.lockSha256, lock_sha256_after: source.lockSha256,
      working_tree_before: [], working_tree_after: [],
      gates: CORE_QUALITY_CHECKS.map(([id, argv]) => ({ id, argv: [...argv], exit_code: 0, seconds: 1 })),
    } }, { id: '32', name: 'quality-complete', status: 'completed', conclusion: 'success' }] };
}

export function syntheticCoreHostReport(identity) {
  const source = identity.core, app = identity.app;
  const browser = { product: 'Chrome/0.0.0.0', revision: 'synthetic-only' };
  const stats = { sampleCount: 5, medianMs: 10, p95Ms: 20, maxMs: 20 };
  const graphProfile = { nodeCount: 14, edgeCount: 14, edgesPerNode: 1,
    directedEdgeDensity: 14 / (14 * 13), maxNestingDepth: 1, selfLoopCount: 0 };
  const presets = ['logistics-architecture-v1', 'wms-demand-allocation-strategy-v2', 'wms-process-flow-v1',
    'tms-architecture-v1', 'enterprise-architecture-v2'];
  const journeys = ['saved-initial-wms', 'saved-layout-logistics', 'multi-page-roundtrip',
    'topology-edit-cycle', 'business-edit-stability', 'swimlane-edit-stability'];
  const summary = key => {
    if (key === 'core-browser-host') return { journeys, startupCases: 6 };
    if (key === 'core-performance-business') return { sampleCount: 5, passed: true,
      groups: presets.flatMap(presetId => ['drag-away', 'drag-reverse'].map(operation => ({ presetId, operation, graphProfile,
        metrics: Object.fromEntries([['releaseToFinal', 300], ['workerToFinal', 300], ['localRoute', 150]]
          .map(([name, budgetMs]) => [name, { ...stats, budgetMs, passed: true }])) }))) };
    const saved = key === 'core-performance-saved';
    const groups = saved ? ['saved-initial-wms', 'saved-layout-logistics'].map(id => ({ id }))
      : (key === 'core-performance-large' ? ['performance-grid-200'] : presets)
        .flatMap(presetId => ['cold', 'warm'].map(cache => ({ presetId, cache })));
    return { sampleCount: 5, passed: true, browser,
      groups: groups.map(group => ({ ...group, graphProfile, sampleCount: 5, validatedCacheCount: 0,
        workerRouting: { ...stats }, ...(saved ? { passed: true } : { workerBudgetPassed: true }) })) };
  };
  return { schema: 'vizly-gitea-host-v1', synthetic: true, provider: 'gitea', repository: source.repository,
    workflow: 'devfleet-host-performance.yaml', run: { id: '678', head_sha: source.commit, status: 'completed', conclusion: 'success' },
    jobs: [{ id: '41', name: 'core-host-performance', status: 'completed', conclusion: 'success', host_result: {
      schema: 'vizly-core-host-v1', scope: 'sdk-host-performance', status: 'passed', deployment: false,
      os: 'Darwin', node: '22.23.4', npm: '12.0.1', source: source.commit, source_after: source.commit,
      tree: source.tree, tree_after: source.tree, lock_sha256: source.lockSha256, lock_sha256_after: source.lockSha256,
      working_tree_before: [], working_tree_after: [],
      app_source: { repository: app.repository, commit: app.commit, tree: app.tree, lock_sha256: app.lockSha256 },
      sdk_sha256: identity.sdkSha256, app_snapshot_sha256: 'a'.repeat(64), installed_sdk_files: 1,
      host_source_digest_before: 'b'.repeat(64), host_source_digest_after: 'b'.repeat(64), host_source_unchanged: true,
      owned_host_dependencies_removed: true, chrome_binary_sha256_before: 'e'.repeat(64), chrome_binary_sha256_after: 'e'.repeat(64), browser,
      preparation: ['host-source', 'core-install', 'core-build-sdk', 'core-package-contents', 'core-pack-sdk', 'host-sdk-bind', 'host-install', 'host-build']
        .map(id => ({ id, exit_code: 0, seconds: 1 })),
      gates: CORE_HOST_CHECKS.map(([id, script]) => ({ id, argv: ['node', script], status: 'passed', exit_code: 0,
        seconds: 1, evidence_sha256: 'f'.repeat(64), evidence_bytes: 100, owned_port_released: true, summary: summary(id) })),
    } }, { id: '42', name: 'host-performance-complete', status: 'completed', conclusion: 'success' }] };
}
