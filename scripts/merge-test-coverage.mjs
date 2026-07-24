import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';

import {
  findCoverageThresholdFailures,
  validateCoverageThresholds,
} from './lib/coverage-policy.mjs';
import {
  getTestCiCoverageReportName,
  TEST_CI_COVERAGE_EXEMPT_SHARDS,
  TEST_CI_SHARDS,
} from './lib/test-ci-shards.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const shardRoot = path.join(projectRoot, 'coverage', 'shards');
const outputDirectory = path.join(projectRoot, '.coverage');
const thresholdsPath = path.join(scriptDirectory, 'coverage-thresholds.json');
const MAX_REPORT_FILES = 100;
const MAX_REPORT_BYTES = 128 * 1024 * 1024;

const findCoverageReports = (directory) => {
  if (!existsSync(directory)) return [];
  const reportsFound = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile() && entry.name === 'coverage-final.json') {
        reportsFound.push(entryPath);
        if (reportsFound.length > MAX_REPORT_FILES) {
          throw new Error(`Coverage report count exceeds ${MAX_REPORT_FILES}`);
        }
      }
    }
  }
  return reportsFound.sort();
};

const coverageFiles = findCoverageReports(shardRoot);
if (coverageFiles.length === 0) {
  throw new Error('No shard coverage-final.json files were found');
}

const expectedReportNames = TEST_CI_SHARDS
  .filter((shardName) => !TEST_CI_COVERAGE_EXEMPT_SHARDS.includes(shardName))
  .map(getTestCiCoverageReportName)
  .sort();
const actualReportNames = coverageFiles.map((reportPath) => path.basename(path.dirname(reportPath))).sort();
const missingReportNames = expectedReportNames.filter((name) => !actualReportNames.includes(name));
const unexpectedReportNames = actualReportNames.filter((name) => !expectedReportNames.includes(name));
if (missingReportNames.length > 0 || unexpectedReportNames.length > 0) {
  throw new Error([
    missingReportNames.length > 0 ? `Missing coverage reports: ${missingReportNames.join(', ')}` : '',
    unexpectedReportNames.length > 0 ? `Unexpected coverage reports: ${unexpectedReportNames.join(', ')}` : '',
  ].filter(Boolean).join('\n'));
}

const coverageMap = libCoverage.createCoverageMap({});
for (const reportPath of coverageFiles) {
  if (statSync(reportPath).size > MAX_REPORT_BYTES) {
    throw new Error(`Coverage report exceeds the ${MAX_REPORT_BYTES}-byte safety limit`);
  }
  const parsed = JSON.parse(readFileSync(reportPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError(`Coverage report is not an object: ${path.relative(projectRoot, reportPath)}`);
  }
  coverageMap.merge(parsed);
}

const thresholds = validateCoverageThresholds(JSON.parse(readFileSync(thresholdsPath, 'utf8')));
const summary = coverageMap.getCoverageSummary().toJSON();
const failures = findCoverageThresholdFailures(summary, thresholds);

mkdirSync(outputDirectory, { recursive: true });
const reportContext = libReport.createContext({ dir: outputDirectory, coverageMap });
for (const reporter of ['text-summary', 'html', 'json', 'lcov']) {
  reports.create(reporter).execute(reportContext);
}
writeFileSync(
  path.join(outputDirectory, 'coverage-summary.json'),
  `${JSON.stringify({ total: summary }, null, 2)}\n`,
  'utf8',
);

process.stdout.write(`Merged ${coverageFiles.length} shard coverage report(s).\n`);
if (failures.length > 0) {
  for (const failure of failures) {
    process.stderr.write(
      `Coverage threshold failed for ${failure.metric}: ${failure.actual}% < ${failure.required}%\n`,
    );
  }
  process.exit(1);
}
process.stdout.write('Merged coverage thresholds passed.\n');
