import { createHash } from 'node:crypto';
import path from 'node:path';

export const TYPECHECK_BASELINE_SCHEMA_VERSION = 1;
export const MAX_COMPILER_OUTPUT_BYTES = 64 * 1024 * 1024;
export const MAX_DIAGNOSTIC_COUNT = 100_000;
export const MAX_BASELINE_JSON_CHARS = 32 * 1024 * 1024;

const MAX_FILE_LENGTH = 2_048;
const MAX_MESSAGE_LENGTH = 2 * 1024 * 1024;
const ANSI_ESCAPE_PATTERN = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/g;
const FILE_DIAGNOSTIC_PATTERN = /^(.*)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s*(.*)$/i;
const GLOBAL_DIAGNOSTIC_PATTERN = /^(error|warning)\s+TS(\d+):\s*(.*)$/i;

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const assertBoundedString = (value, name, maxLength) => {
  if (typeof value !== 'string') {
    throw new TypeError(`${name} must be a string`);
  }
  if (value.length > maxLength) {
    throw new RangeError(`${name} exceeds the ${maxLength}-character safety limit`);
  }
};

const normalizeSlashes = (value) => value.replace(/\\/g, '/');

const normalizeDiagnosticFile = (rawFile, projectRoot) => {
  const trimmed = rawFile.trim();
  assertBoundedString(trimmed, 'diagnostic file', MAX_FILE_LENGTH);

  const normalizedRoot = normalizeSlashes(path.resolve(projectRoot));
  const normalizedFile = normalizeSlashes(trimmed);
  if (!normalizedFile) {
    throw new TypeError('diagnostic file must not be empty');
  }
  const isAbsolute = path.isAbsolute(trimmed) || /^[A-Za-z]:\//.test(normalizedFile);

  if (!isAbsolute) {
    return normalizedFile.replace(/^\.\//, '');
  }

  const rootPrefix = `${normalizedRoot}/`;
  if (normalizedFile.toLowerCase().startsWith(rootPrefix.toLowerCase())) {
    return normalizedFile.slice(rootPrefix.length);
  }

  const nodeModulesMarker = '/node_modules/';
  const nodeModulesIndex = normalizedFile.toLowerCase().lastIndexOf(nodeModulesMarker);
  if (nodeModulesIndex >= 0) {
    return `<external>${normalizedFile.slice(nodeModulesIndex)}`;
  }

  return `<external>/${path.basename(normalizedFile)}`;
};

const normalizeDiagnosticMessage = (rawMessage, projectRoot) => {
  assertBoundedString(rawMessage, 'diagnostic message', MAX_MESSAGE_LENGTH);

  const resolvedRoot = path.resolve(projectRoot);
  const rootVariants = new Set([
    resolvedRoot,
    normalizeSlashes(resolvedRoot),
    resolvedRoot.replace(/\//g, '\\'),
  ]);

  let normalized = rawMessage.replace(ANSI_ESCAPE_PATTERN, '');
  for (const rootVariant of rootVariants) {
    if (!rootVariant) continue;
    normalized = normalized.replace(new RegExp(escapeRegExp(rootVariant), 'gi'), '<project>');
  }

  return normalizeSlashes(normalized).replace(/\s+/g, ' ').trim();
};

const hashMessage = (message) => createHash('sha256').update(message).digest('hex');

// Source positions intentionally do not participate in the identity. A nearby
// edit may move historical debt without changing the underlying diagnostic.
// The normalized message is hashed so a string-literal type cannot persist a
// token or other sensitive value in the reviewed baseline artifact.
const diagnosticKey = ({ category, file, code, messageHash }) => (
  JSON.stringify([category, file ?? null, code, messageHash])
);

const parsePositiveInteger = (raw, name) => {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
};

export const parseTypeScriptDiagnostics = (
  output,
  {
    projectRoot = process.cwd(),
    maxOutputChars = MAX_COMPILER_OUTPUT_BYTES,
    maxDiagnosticCount = MAX_DIAGNOSTIC_COUNT,
  } = {},
) => {
  if (!Number.isSafeInteger(maxOutputChars) || maxOutputChars < 1) {
    throw new TypeError('maxOutputChars must be a positive safe integer');
  }
  assertBoundedString(output, 'compiler output', maxOutputChars);
  if (!Number.isSafeInteger(maxDiagnosticCount) || maxDiagnosticCount < 1) {
    throw new TypeError('maxDiagnosticCount must be a positive safe integer');
  }

  const diagnostics = [];
  const unparsedPreamble = [];
  let current = null;

  const commitCurrent = () => {
    if (!current) return;
    const message = normalizeDiagnosticMessage(current.messageLines.join(' '), projectRoot);
    diagnostics.push({
      category: current.category,
      file: current.file,
      line: current.line,
      column: current.column,
      code: current.code,
      messageHash: hashMessage(message),
    });
    if (diagnostics.length > maxDiagnosticCount) {
      throw new RangeError(`compiler output exceeds the ${maxDiagnosticCount}-diagnostic safety limit`);
    }
    current = null;
  };

  const normalizedOutput = output.replace(ANSI_ESCAPE_PATTERN, '').replace(/\r\n?/g, '\n');
  for (const rawLine of normalizedOutput.split('\n')) {
    const line = rawLine.trimEnd();
    const fileMatch = line.match(FILE_DIAGNOSTIC_PATTERN);
    const globalMatch = fileMatch ? null : line.match(GLOBAL_DIAGNOSTIC_PATTERN);

    if (fileMatch) {
      commitCurrent();
      current = {
        category: fileMatch[4].toLowerCase(),
        file: normalizeDiagnosticFile(fileMatch[1], projectRoot),
        line: parsePositiveInteger(fileMatch[2], 'diagnostic line'),
        column: parsePositiveInteger(fileMatch[3], 'diagnostic column'),
        code: parsePositiveInteger(fileMatch[5], 'diagnostic code'),
        messageLines: [fileMatch[6]],
      };
      continue;
    }

    if (globalMatch) {
      commitCurrent();
      current = {
        category: globalMatch[1].toLowerCase(),
        file: null,
        line: null,
        column: null,
        code: parsePositiveInteger(globalMatch[2], 'diagnostic code'),
        messageLines: [globalMatch[3]],
      };
      continue;
    }

    if (!line.trim()) continue;
    if (current && /^\s/.test(rawLine)) {
      current.messageLines.push(line.trim());
    } else {
      commitCurrent();
      unparsedPreamble.push(line.trim());
    }
  }
  commitCurrent();

  return { diagnostics, unparsedPreamble };
};

export const summarizeDiagnostics = (diagnostics) => {
  if (!Array.isArray(diagnostics)) {
    throw new TypeError('diagnostics must be an array');
  }
  if (diagnostics.length > MAX_DIAGNOSTIC_COUNT) {
    throw new RangeError('diagnostics exceed the diagnostic count safety limit');
  }

  const byKey = new Map();
  diagnostics.forEach((diagnostic, index) => {
    validateBaselineEntry({ ...diagnostic, count: 1 }, '<current>', index);
    const key = diagnosticKey(diagnostic);
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    byKey.set(key, {
      category: diagnostic.category,
      file: diagnostic.file ?? null,
      code: diagnostic.code,
      messageHash: diagnostic.messageHash,
      count: 1,
    });
  });

  return [...byKey.values()].sort((left, right) => (
    (left.file ?? '').localeCompare(right.file ?? '')
    || left.code - right.code
    || left.category.localeCompare(right.category)
    || left.messageHash.localeCompare(right.messageHash)
  ));
};

export const interpretCompilerResult = (
  result,
  { projectName, projectRoot = process.cwd(), maxOutputChars = MAX_COMPILER_OUTPUT_BYTES } = {},
) => {
  if (!result || typeof result !== 'object') {
    throw new TypeError('compiler result must be an object');
  }
  const label = typeof projectName === 'string' && projectName ? projectName : 'TypeScript project';

  if (result.error) {
    const code = typeof result.error.code === 'string' ? ` (${result.error.code})` : '';
    throw new Error(`${label} compiler process could not start or exceeded its resource limit${code}`);
  }
  if (result.signal) {
    throw new Error(`${label} compiler process terminated by signal ${String(result.signal)}`);
  }
  if (![0, 1, 2].includes(result.status)) {
    throw new Error(`${label} compiler process failed with unexpected exit status ${String(result.status)}`);
  }

  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  const combinedOutput = [stdout, stderr].filter(Boolean).join('\n');
  const parsed = parseTypeScriptDiagnostics(combinedOutput, { projectRoot, maxOutputChars });

  if (parsed.unparsedPreamble.length > 0) {
    throw new Error(`${label} compiler emitted unrecognized output outside its diagnostics`);
  }
  if (result.status === 0 && parsed.diagnostics.length > 0) {
    throw new Error(`${label} compiler returned success while emitting diagnostics`);
  }
  if (result.status !== 0 && parsed.diagnostics.length === 0) {
    throw new Error(`${label} compiler failed without parseable TypeScript diagnostics`);
  }

  return parsed.diagnostics;
};

const validateBaselineEntry = (entry, projectName, index) => {
  const prefix = `baseline project ${projectName} diagnostic ${index}`;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new TypeError(`${prefix} must be an object`);
  }
  if (entry.category !== 'error' && entry.category !== 'warning') {
    throw new TypeError(`${prefix} has an invalid category`);
  }
  if (entry.file !== null) {
    assertBoundedString(entry.file, `${prefix} file`, MAX_FILE_LENGTH);
    if (!entry.file) {
      throw new TypeError(`${prefix} file must not be empty`);
    }
  }
  if (!Number.isSafeInteger(entry.code) || entry.code < 1) {
    throw new TypeError(`${prefix} has an invalid diagnostic code`);
  }
  if (typeof entry.messageHash !== 'string' || !/^[a-f0-9]{64}$/.test(entry.messageHash)) {
    throw new TypeError(`${prefix} has an invalid message hash`);
  }
  if (!Number.isSafeInteger(entry.count) || entry.count < 1 || entry.count > MAX_DIAGNOSTIC_COUNT) {
    throw new TypeError(`${prefix} has an invalid count`);
  }
};

export const validateTypecheckBaseline = (baseline, expectedProjectNames = []) => {
  if (!Array.isArray(expectedProjectNames) || expectedProjectNames.length > 100) {
    throw new TypeError('expected project names must be a bounded array');
  }
  const expected = new Set();
  for (const projectName of expectedProjectNames) {
    assertBoundedString(projectName, 'expected project name', 256);
    if (!projectName || expected.has(projectName)) {
      throw new TypeError('expected project names must be non-empty and unique');
    }
    expected.add(projectName);
  }
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) {
    throw new TypeError('typecheck baseline must be an object');
  }
  if (baseline.schemaVersion !== TYPECHECK_BASELINE_SCHEMA_VERSION) {
    throw new TypeError(`unsupported typecheck baseline schema version: ${String(baseline.schemaVersion)}`);
  }
  if (!baseline.projects || typeof baseline.projects !== 'object' || Array.isArray(baseline.projects)) {
    throw new TypeError('typecheck baseline projects must be an object');
  }

  for (const projectName of expected) {
    if (!Object.hasOwn(baseline.projects, projectName)) {
      throw new TypeError(`typecheck baseline is missing project ${projectName}`);
    }
  }

  for (const [projectName, entries] of Object.entries(baseline.projects)) {
    assertBoundedString(projectName, 'baseline project name', 256);
    if (!projectName) {
      throw new TypeError('baseline project name must not be empty');
    }
    if (expected.size > 0 && !expected.has(projectName)) {
      throw new TypeError(`typecheck baseline contains unexpected project ${projectName}`);
    }
    if (!Array.isArray(entries)) {
      throw new TypeError(`baseline project ${projectName} must be an array`);
    }
    if (entries.length > MAX_DIAGNOSTIC_COUNT) {
      throw new RangeError(`baseline project ${projectName} exceeds the diagnostic safety limit`);
    }

    const seen = new Set();
    let diagnosticCount = 0;
    entries.forEach((entry, index) => {
      validateBaselineEntry(entry, projectName, index);
      diagnosticCount += entry.count;
      if (diagnosticCount > MAX_DIAGNOSTIC_COUNT) {
        throw new RangeError(`baseline project ${projectName} exceeds the diagnostic count safety limit`);
      }
      const key = diagnosticKey(entry);
      if (seen.has(key)) {
        throw new TypeError(`baseline project ${projectName} contains a duplicate diagnostic entry`);
      }
      seen.add(key);
    });
  }

  return baseline;
};

export const parseTypecheckBaselineJson = (
  serialized,
  expectedProjectNames,
  { maxJsonChars = MAX_BASELINE_JSON_CHARS } = {},
) => {
  if (!Number.isSafeInteger(maxJsonChars) || maxJsonChars < 1) {
    throw new TypeError('maxJsonChars must be a positive safe integer');
  }
  assertBoundedString(serialized, 'typecheck baseline JSON', maxJsonChars);

  let baseline;
  try {
    baseline = JSON.parse(serialized);
  } catch {
    throw new TypeError('typecheck diagnostic baseline is not valid JSON');
  }
  return validateTypecheckBaseline(baseline, expectedProjectNames);
};

export const parseTypecheckTimeoutMs = (raw) => {
  if (raw === undefined || raw === '') return 600_000;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 900_000) {
    throw new TypeError('TYPECHECK_TIMEOUT_MS must be an integer between 1000 and 900000');
  }
  return value;
};

export const parseTypecheckArguments = (args) => {
  if (!Array.isArray(args) || args.some((argument) => typeof argument !== 'string')) {
    throw new TypeError('typecheck gate arguments must be a string array');
  }
  if (args.length === 0) return { writeBaseline: false };
  if (args.length === 1 && args[0] === '--write-baseline') return { writeBaseline: true };
  throw new TypeError('Unsupported typecheck gate arguments were provided');
};

export const createTypecheckBaseline = (projectDiagnostics) => {
  if (!projectDiagnostics || typeof projectDiagnostics !== 'object' || Array.isArray(projectDiagnostics)) {
    throw new TypeError('project diagnostics must be an object');
  }

  const projects = Object.create(null);
  for (const projectName of Object.keys(projectDiagnostics).sort()) {
    assertBoundedString(projectName, 'project name', 256);
    if (!projectName) {
      throw new TypeError('project name must not be empty');
    }
    projects[projectName] = summarizeDiagnostics(projectDiagnostics[projectName]);
  }
  return {
    schemaVersion: TYPECHECK_BASELINE_SCHEMA_VERSION,
    projects,
  };
};

export const compareTypecheckBaseline = (baseline, projectDiagnostics, expectedProjectNames) => {
  validateTypecheckBaseline(baseline, expectedProjectNames);
  if (!projectDiagnostics || typeof projectDiagnostics !== 'object' || Array.isArray(projectDiagnostics)) {
    throw new TypeError('project diagnostics must be an object');
  }
  for (const projectName of expectedProjectNames) {
    if (!Object.hasOwn(projectDiagnostics, projectName) || !Array.isArray(projectDiagnostics[projectName])) {
      throw new TypeError(`current diagnostics are missing project ${projectName}`);
    }
  }
  const current = createTypecheckBaseline(projectDiagnostics);
  const additions = [];
  const removals = [];

  for (const projectName of expectedProjectNames) {
    const baselineEntries = baseline.projects[projectName];
    const currentEntries = current.projects[projectName] ?? [];
    const baselineCounts = new Map(baselineEntries.map((entry) => [diagnosticKey(entry), entry]));
    const currentCounts = new Map(currentEntries.map((entry) => [diagnosticKey(entry), entry]));
    const keys = new Set([...baselineCounts.keys(), ...currentCounts.keys()]);

    for (const key of keys) {
      const baselineEntry = baselineCounts.get(key);
      const currentEntry = currentCounts.get(key);
      const baselineCount = baselineEntry?.count ?? 0;
      const currentCount = currentEntry?.count ?? 0;
      const detail = currentEntry ?? baselineEntry;
      if (currentCount > baselineCount) {
        additions.push({
          projectName,
          ...detail,
          baselineCount,
          currentCount,
          delta: currentCount - baselineCount,
        });
      } else if (currentCount < baselineCount) {
        removals.push({
          projectName,
          ...detail,
          baselineCount,
          currentCount,
          delta: baselineCount - currentCount,
        });
      }
    }
  }

  return { additions, removals, current };
};
