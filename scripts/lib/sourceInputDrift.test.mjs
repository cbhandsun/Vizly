// @vitest-environment node
import { expect, it } from 'vitest';
import { sourceInputDrift } from './sourceInputDrift.mjs';

it.each([
  [{}, {}, []],
  [{ 'src/a.ts': 'same' }, { 'src/a.ts': 'same' }, []],
  [{ 'src/a.ts': 'old' }, { 'src/a.ts': 'new' }, ['src/a.ts']],
  [{ 'src/a.ts': 'old' }, {}, ['src/a.ts']],
  [{}, { 'server/new.test.ts': 'new' }, ['server/new.test.ts']],
  [{ 'src/removed.ts': 'old' }, { 'server/new.ts': 'new' }, ['server/new.ts', 'src/removed.ts']],
])('identifies changed, removed and added inputs %#', (before, current, expected) => {
  expect(sourceInputDrift(before, current)).toEqual(expected);
});
