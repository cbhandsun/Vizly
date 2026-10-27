// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createOperationTelemetry } from '../../src/observability/operationTelemetry.js';
import { createTelemetryJournal, queryTelemetryJournal } from './telemetryJournal.js';

it('persists projected events, supports release/request lookup after reopening and deduplicates retries',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'vizly-telemetry-'));
 const journal=createTelemetryJournal(directory);
 const t=createOperationTelemetry({releaseId:'a'.repeat(40),transport:journal.accept});
 try {
  t.begin('reconnect')('failure','network');await t.flush();
  const rows=await queryTelemetryJournal(directory,{releaseId:'a'.repeat(40)});
  expect(rows).toHaveLength(1);const id=rows[0].events[0].requestId;
  await journal.accept({...rows[0],token:'CANARY'} as typeof rows[0],new AbortController().signal);
  expect(await queryTelemetryJournal(directory,{releaseId:'a'.repeat(40),requestId:id})).toHaveLength(1);
  expect(await queryTelemetryJournal(directory,{releaseId:'b'.repeat(40)})).toHaveLength(0);
  expect(await readFile(join(directory,'telemetry-0.jsonl'),'utf8')).not.toContain('CANARY');
  expect((await stat(join(directory,'telemetry-0.jsonl'))).mode & 0o077).toBe(0);
 } finally {t.dispose();await journal.drain();await rm(directory,{recursive:true,force:true});}
});
it('rotates bounded files and tolerates an interrupted final line',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'vizly-telemetry-'));
 const journal=createTelemetryJournal(directory);
 const t=createOperationTelemetry({releaseId:'c'.repeat(40),transport:journal.accept});
 try {
  for(let index=0;index<4;index++)await writeFile(join(directory,`telemetry-${index}.jsonl`),'x'.repeat(1_048_576));
  t.begin('save')('success');await t.flush();
  expect((await readdir(directory)).sort()).toEqual([0,1,2,3].map(n=>`telemetry-${n}.jsonl`));
  for(const file of await readdir(directory))expect((await stat(join(directory,file))).size).toBeLessThanOrEqual(1_048_576);
  expect(await queryTelemetryJournal(directory,{releaseId:'c'.repeat(40)})).toHaveLength(1);
 } finally {t.dispose();await journal.drain();await rm(directory,{recursive:true,force:true});}
});
