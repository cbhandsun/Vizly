import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const sourceFiles = execFileSync('git', ['ls-files', 'src'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(file => file && /\.(?:tsx?|jsx?)$/i.test(file) && existsSync(file));

const styleInjectionPattern = /<style\b[^>]*dangerouslySetInnerHTML\s*=/;
const failures = [];

for (const file of sourceFiles) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (styleInjectionPattern.test(line)) {
      failures.push(`${file}:${index + 1}`);
    }
  });
}

if (failures.length > 0) {
  console.error([
    `Found ${failures.length} unsafe style injection sink(s):`,
    ...failures.map(entry => `  - ${entry}`),
    '',
    'Use a stylesheet, CSS variables, inline style props, or textContent-based style injection instead of <style dangerouslySetInnerHTML>.',
  ].join('\n'));
  process.exit(1);
}

console.log('No unsafe style injection sinks found.');
