import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const trackedArtifactPrefixes = [
  'coverage/',
  '.coverage/',
  'dist/',
  'dist-ssr/',
  'test-results/',
];

const forbiddenTrackedFiles = new Set([
  'scripts/apply_flowchart_ui.cjs',
  'src/core/components/diagrams/rewrite.py',
  'replace.py',
  'update_pills.py',
  'recovered.tsx',
  '_inject_debug.cjs',
  'fix_css.cjs',
]);

const trackedTemporaryFilePattern = /(^|\/)(?:[^/]+(?:_temp(?:_[^/]*)?|\.tmp|\.bak|\.old|\.orig|\.rej)|.*~)$/i;

const output = execFileSync('git', ['ls-files', ...trackedArtifactPrefixes], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

const allTrackedOutput = execFileSync('git', ['ls-files'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

const trackedArtifacts = output
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean);

const trackedForbiddenFiles = allTrackedOutput
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean)
  .filter(file => existsSync(file))
  .filter(file =>
    forbiddenTrackedFiles.has(file)
    || /(^|\/)(rewrite|replace|recovered|_inject_debug|fix_css)\.(py|cjs|tsx?)$/i.test(file)
    || trackedTemporaryFilePattern.test(file)
  );

const failures = [...trackedArtifacts, ...trackedForbiddenFiles];

if (failures.length > 0) {
  const preview = failures.slice(0, 20).map(file => `  - ${file}`).join('\n');
  const suffix = failures.length > 20
    ? `\n  ... and ${failures.length - 20} more`
    : '';
  const trackedPrefixes = trackedArtifactPrefixes
    .filter(prefix => trackedArtifacts.some(file => file === prefix.slice(0, -1) || file.startsWith(prefix)))
    .map(prefix => prefix.slice(0, -1));

  console.error([
    `Found ${failures.length} tracked generated or temporary artifact(s).`,
    'Generated output and one-off rewrite scripts should stay out of the Git index:',
    preview + suffix,
    '',
    trackedPrefixes.length > 0
      ? [
        'To untrack generated directories without deleting local files, run:',
        `  git rm --cached -r ${trackedPrefixes.join(' ')}`,
      ].join('\n')
      : 'Remove the tracked temporary files or move them under scratch/.',
  ].join('\n'));
  process.exit(1);
}

console.log('No tracked generated or temporary artifacts found.');
