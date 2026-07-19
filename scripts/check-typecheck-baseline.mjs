import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_BASELINE_JSON_CHARS,
  MAX_COMPILER_OUTPUT_BYTES,
  compareTypecheckBaseline,
  createTypecheckBaseline,
  interpretCompilerResult,
  parseTypecheckArguments,
  parseTypecheckBaselineJson,
  parseTypecheckTimeoutMs,
} from './typeScriptDiagnosticBaseline.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const baselinePath = path.join(scriptDirectory, 'typecheck-diagnostic-baseline.json');
const compilerPath = path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const buildInfoDirectory = path.join(projectRoot, 'node_modules', '.cache', 'vizly-typecheck');
const projects = ['tsconfig.app.json', 'tsconfig.node.json'];
const { writeBaseline } = parseTypecheckArguments(process.argv.slice(2));

if (!existsSync(compilerPath)) {
  throw new Error('Local TypeScript compiler is missing; run npm install before typecheck');
}

const timeout = parseTypecheckTimeoutMs(process.env.TYPECHECK_TIMEOUT_MS);
const projectDiagnostics = {};
const startedAt = Date.now();
mkdirSync(buildInfoDirectory, { recursive: true });

for (const projectName of projects) {
  if (!existsSync(path.join(projectRoot, projectName))) {
    throw new Error(`Required TypeScript project is missing: ${projectName}`);
  }
  const projectStartedAt = Date.now();
  const result = spawnSync(
    process.execPath,
    [
      compilerPath,
      '-p', projectName,
      '--noEmit',
      '--pretty', 'false',
      '--incremental', 'true',
      '--tsBuildInfoFile', path.join(buildInfoDirectory, `${projectName}.tsbuildinfo`),
    ],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: process.env,
      maxBuffer: MAX_COMPILER_OUTPUT_BYTES,
      timeout,
      windowsHide: true,
    },
  );

  const diagnostics = interpretCompilerResult(result, {
    projectName,
    projectRoot,
    maxOutputChars: MAX_COMPILER_OUTPUT_BYTES,
  });
  const globalDiagnostic = diagnostics.find((diagnostic) => diagnostic.file === null);
  if (globalDiagnostic) {
    throw new Error(
      `${projectName} emitted global compiler diagnostic TS${globalDiagnostic.code}; configuration diagnostics cannot be baselined`,
    );
  }
  projectDiagnostics[projectName] = diagnostics;

  const elapsedSeconds = ((Date.now() - projectStartedAt) / 1000).toFixed(1);
  process.stdout.write(
    `[typecheck] ${projectName}: ${projectDiagnostics[projectName].length} diagnostic(s) in ${elapsedSeconds}s\n`,
  );
}

if (writeBaseline) {
  const baseline = createTypecheckBaseline(projectDiagnostics);
  const serializedBaseline = `${JSON.stringify(baseline, null, 2)}\n`;
  if (Buffer.byteLength(serializedBaseline, 'utf8') > MAX_BASELINE_JSON_CHARS) {
    throw new Error('Generated typecheck diagnostic baseline exceeds its file-size safety limit');
  }
  const temporaryPath = `${baselinePath}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryPath, serializedBaseline, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporaryPath, baselinePath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
  process.stdout.write(
    `[typecheck] refreshed ${path.relative(projectRoot, baselinePath).replace(/\\/g, '/')} explicitly\n`,
  );
} else {
  if (!existsSync(baselinePath)) {
    throw new Error('Typecheck diagnostic baseline is missing; review diagnostics and run npm run typecheck:baseline');
  }

  const baselineSize = statSync(baselinePath).size;
  if (baselineSize > MAX_BASELINE_JSON_CHARS) {
    throw new Error('Typecheck diagnostic baseline exceeds its file-size safety limit');
  }
  const baseline = parseTypecheckBaselineJson(readFileSync(baselinePath, 'utf8'), projects);

  const comparison = compareTypecheckBaseline(baseline, projectDiagnostics, projects);
  if (comparison.additions.length > 0) {
    process.stderr.write(
      `Typecheck baseline gate failed: ${comparison.additions.length} new or increased diagnostic fingerprint(s).\n`,
    );
    for (const addition of comparison.additions.slice(0, 50)) {
      const location = addition.file ?? '<global>';
      process.stderr.write(
        `  - ${addition.projectName}: ${location} TS${addition.code} ${addition.messageHash.slice(0, 12)} (+${addition.delta})\n`,
      );
    }
    if (comparison.additions.length > 50) {
      process.stderr.write(`  - ${comparison.additions.length - 50} additional fingerprint(s) omitted\n`);
    }
    process.stderr.write(
      'Fix new diagnostics. Refresh the baseline only after an explicit review of intentional historical debt.\n',
    );
    process.exit(1);
  }

  if (comparison.removals.length > 0) {
    process.stderr.write(
      `Typecheck baseline gate failed: ${comparison.removals.length} historical diagnostic fingerprint(s) decreased.\n`,
    );
    process.stderr.write(
      'Review the resolved diagnostics and run npm run typecheck:baseline so fixed debt cannot silently return.\n',
    );
    process.exit(1);
  }
}

process.stdout.write(`[typecheck] real app + node gate passed in ${((Date.now() - startedAt) / 1000).toFixed(1)}s\n`);
