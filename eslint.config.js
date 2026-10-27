import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  // Lint source and diagnostic fixtures; compiled bundles have separate artifact gates.
  globalIgnores(['dist', 'dist-collaboration', 'coverage', 'node_modules', 'tmp/**/assets/**', 'tmp/vercel-collaboration-production/api/index.js']),
  {
    files: ['scripts/database-path.mjs', 'scripts/build-database-paths.mjs', 'scripts/check-database-paths.mjs', 'scripts/prepare-vercel-static.mjs', 'scripts/deploy-prepared-vercel-static.mjs',
      'scripts/lib/check-telemetry-journal-database.mjs',
      'scripts/query-telemetry.mjs',
      'scripts/check-telemetry-storage.mjs', 'scripts/fixtures/telemetry-journal/https-client.mjs',
      'scripts/install-locked-core-artifact.mjs',
      'scripts/verify-ci-negative-gates.mjs', 'scripts/lib/ciNegativeGateProbe.mjs', 'scripts/lib/ciNegativeGateProbe.test.mjs',
      'scripts/lib/isolatedPostgresReadiness.mjs', 'scripts/lib/isolatedPostgresReadiness.test.mjs',
      'scripts/lib/coreArtifactLockOverlay.mjs', 'scripts/lib/coreArtifactLockOverlay.test.mjs',
      'scripts/lib/installLockedCoreArtifact.mjs', 'scripts/lib/installLockedCoreArtifact.test.mjs',
      'scripts/lib/vercelDeploymentEnvironment.mjs', 'scripts/lib/vercelDeploymentEnvironment.test.mjs',
      'scripts/lib/jsonCheckpoint.mjs', 'scripts/lib/jsonCheckpoint.test.mjs',
      'scripts/lib/isolatedS3Integration.mjs', 'scripts/lib/isolatedS3Integration.test.mjs',
      'scripts/lib/s3ReadinessProbe.mjs', 'scripts/lib/s3ReadinessProbe.test.mjs',
      'scripts/lib/vercel-static-artifact.mjs', 'scripts/lib/vercel-static-artifact.test.mjs',
      'scripts/lib/preparedVercelDeployment.mjs', 'scripts/lib/preparedVercelDeployment.test.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2023, globals: globals.node, sourceType: 'module' },
  },
  {
    files: ['scripts/import-core-host-release-evidence.mjs', 'scripts/lib/coreHostReleaseEvidence.mjs',
      'scripts/lib/coreHostReleaseEvidence.test.mjs', 'scripts/lib/releaseEvidenceFixture.mjs', 'scripts/lib/releaseEvidence.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2023, globals: globals.node, sourceType: 'module' },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'react-hooks/static-components': 'off',
      'react-refresh/only-export-components': 'warn',
    },
  },
  { files: ['src/components/diagrams/plugins/**/*.tsx'], rules: { 'react-refresh/only-export-components': 'off' } },
]);
