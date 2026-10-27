// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOperationTelemetry, type FailureCode, type Operation, type TelemetryBatch } from '../operationTelemetry';
import { classifyOperationFailure, configureApplicationTelemetry } from '../applicationTelemetry';
import { startApplication } from '../../main/applicationStartup';
const releaseId = 'a'.repeat(40);
afterEach(() => { vi.useRealTimers(); });
describe('operation telemetry boundary', () => {
 it('projects semantic events, preserves denominators, and finishes each operation once',async()=>{
  let time=10; const batches:TelemetryBatch[]=[];
  const t=createOperationTelemetry({releaseId,now:()=>time,transport:async batch=>{batches.push(batch);}});
  const finish=t.begin('save');time=30;finish('success');finish('failure','denied');
  t.begin('save')('failure','denied');t.begin('save')('cancelled');await t.flush();
  expect(batches[0].metrics.save).toEqual({started:3,success:1,failure:1,cancelled:1});
  expect(batches[0].events[0]).toMatchObject({releaseId,operation:'save',durationMs:20,code:null});
  expect(new Set(batches[0].events.map(x=>x.requestId)).size).toBe(3);
  expect(Object.isFrozen(batches[0].events[0])).toBe(true);t.dispose();
 });
 it('rejects sensitive fields and arbitrary enum strings without copying exception payloads',async()=>{
  const secret='token=CANARY-DOCUMENT-SECRET?key=private'; const transport=vi.fn(async()=>{});
  const t=createOperationTelemetry({releaseId:secret,transport});
  t.begin(secret as Operation)('failure'); t.begin('export')('failure',secret as FailureCode);await t.flush();
  const serialized=JSON.stringify(transport.mock.calls);
  expect(serialized).not.toContain('CANARY');expect(serialized).not.toContain('private');
  expect(t.snapshot().metrics.export.failure).toBe(1);t.dispose();
 });
 it('bounds queued and per-minute events while retaining complete local counters',async()=>{
  let time=0;const transport=vi.fn(async()=>{});const t=createOperationTelemetry({releaseId,transport,now:()=>time});
  for(let i=0;i<200;i++)t.begin('connect')('failure','network');
  expect(t.snapshot().events).toHaveLength(64);expect(t.snapshot().dropped).toBe(136);await t.flush();
  for(let i=0;i<100;i++)t.begin('connect')('success');
  expect(t.snapshot().events).toHaveLength(48);expect(t.snapshot().metrics.connect.started).toBe(300);await t.flush();
  for(let i=0;i<8;i++)t.begin('connect')('success');expect(t.snapshot().events).toHaveLength(8);await t.flush();
  t.begin('connect')('success');expect(t.snapshot().events).toHaveLength(0);
  time=60_000;t.begin('connect')('success');expect(t.snapshot().events).toHaveLength(1);t.dispose();
 });
 it('aborts a hung transport and opens the circuit instead of accumulating sends',async()=>{
  vi.useFakeTimers();let signal:AbortSignal|undefined;
  const transport=vi.fn((_batch:TelemetryBatch,s:AbortSignal)=>{signal=s;return new Promise<void>(()=>{});});
  const t=createOperationTelemetry({releaseId,transport});t.begin('route')('success');const flight=t.flush();
  await vi.advanceTimersByTimeAsync(5000);await flight;expect(signal?.aborted).toBe(true);
  for(let i=0;i<100;i++)t.begin('route')('success');await vi.advanceTimersByTimeAsync(60_000);await t.flush();
  expect(transport).toHaveBeenCalledTimes(1);expect(t.snapshot().events).toHaveLength(0);
  expect(t.snapshot().metrics.route.success).toBe(101);t.dispose();
 });
 it('contains throwing adapters and clocks, and remains disabled without a transport',async()=>{
  const t=createOperationTelemetry({releaseId,now:()=>{throw Error('CANARY');},transport:()=>{throw Error('CANARY');}});
  t.begin('startup')('failure','initialization');await expect(t.flush()).resolves.toBeUndefined();t.dispose();
  const off=createOperationTelemetry({releaseId});off.begin('save')('success');expect(off.snapshot().events).toHaveLength(0);off.dispose();
 });
 it('replacement cleanup cannot dispose a newer host instance',async()=>{
  const a=createOperationTelemetry({releaseId,transport:async()=>{}}),send=vi.fn(async()=>{});
  const b=createOperationTelemetry({releaseId,transport:send});const stopA=configureApplicationTelemetry(a);const stopB=configureApplicationTelemetry(b);
  stopA();await startApplication({initialize:()=>{},ready:Promise.resolve(),mount:()=>{},onFailure:vi.fn()});await b.flush();
  expect(send).toHaveBeenCalledTimes(1);expect(b.snapshot().metrics.startup.success).toBe(1);stopB();
 });
 it('captures actual startup failure without the original exception, and sends automatically',async()=>{
  vi.useFakeTimers();const send=vi.fn(async()=>{});const t=createOperationTelemetry({releaseId,transport:send});const stop=configureApplicationTelemetry(t);
  expect(await startApplication({initialize:()=>{throw Error('token=CANARY');},ready:Promise.resolve(),mount:()=>{},onFailure:vi.fn()})).toBe(false);
  await vi.advanceTimersByTimeAsync(250);expect(send).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(send.mock.calls)).not.toContain('CANARY');expect(t.snapshot().metrics.startup.failure).toBe(1);stop();
 });
});

it('classifies only allowlisted protocol statuses and never invokes payload getters',()=>{
 const message=vi.fn(()=>{throw Error('CANARY');});
 const error=Object.defineProperty({status:403},'message',{get:message});
 expect(classifyOperationFailure(error)).toBe('denied');expect(message).not.toHaveBeenCalled();
 expect(classifyOperationFailure({status:412})).toBe('conflict');
 expect(classifyOperationFailure({name:'AbortError'})).toBe('cancelled');
 expect(classifyOperationFailure(new Proxy({}, {getOwnPropertyDescriptor(){throw Error('CANARY');}}))).toBe('unknown');
});
it('flushes final counters even when event quota is exhausted',async()=>{
 const batches:TelemetryBatch[]=[];const t=createOperationTelemetry({releaseId,now:()=>0,transport:async batch=>{batches.push(batch);}});
 for(let i=0;i<120;i++){t.begin('save')('failure','denied');if(i===63)await t.flush();}await t.flush();
 t.begin('save')('failure','denied');await t.flush();
 expect(batches.at(-1)?.events).toHaveLength(0);expect(batches.at(-1)?.metrics.save).toEqual({started:121,success:0,failure:121,cancelled:0});t.dispose();
});

it('reserves bounded event capacity for failures after sustained successful traffic', async () => {
 const batches: TelemetryBatch[] = [];
 const t = createOperationTelemetry({ releaseId, now: () => 0, transport: async batch => { batches.push(batch); } });
 for (let index = 0; index < 120; index++) {
  t.begin('permission')('success');
  if (index % 20 === 19) await t.flush();
 }
 t.begin('permission')('failure', 'denied'); await t.flush();
 expect(batches.flatMap(batch => batch.events)).toContainEqual(expect.objectContaining({ operation: 'permission', outcome: 'failure', code: 'denied' }));
 expect(batches.flatMap(batch => batch.events).length).toBeLessThanOrEqual(120);
 expect(batches.at(-1)?.metrics.permission).toEqual({ started: 121, success: 120, failure: 1, cancelled: 0 });
 t.dispose();
});
it('leaves queue space for failures during a burst of successful operations', () => {
 const t = createOperationTelemetry({ releaseId, now: () => 0, transport: async () => {} });
 for (let index = 0; index < 64; index++) t.begin('permission')('success');
 t.begin('permission')('failure', 'denied');
 expect(t.snapshot().events).toContainEqual(expect.objectContaining({ outcome: 'failure', code: 'denied' }));
 expect(t.snapshot().events.length).toBeLessThanOrEqual(64);
 expect(t.snapshot().metrics.permission).toEqual({ started: 65, success: 64, failure: 1, cancelled: 0 });
 t.dispose();
});
