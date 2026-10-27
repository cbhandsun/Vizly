// @vitest-environment node
import { createServer } from 'node:http';
import { once } from 'node:events';
import { expect, it, vi } from 'vitest';
import { createTelemetryHttp } from './telemetryHttp.js';
import { createOperationTelemetry, type TelemetryBatch } from '../../src/observability/operationTelemetry.js';
import { createHttpTelemetryTransport } from '../../src/observability/httpTelemetryTransport.js';
import { projectTelemetryPayload } from './telemetryPayload.js';

it('delivers generated failure events over HTTP with release/request lookup and no canary payload', async () => {
 const accepted: ReturnType<typeof projectTelemetryPayload>[]=[];
 const http=createServer(createTelemetryHttp({origins:new Set(['https://vizly.test']),accept:async batch=>{accepted.push(batch);}}));
 http.listen(0,'127.0.0.1');await once(http,'listening');
 const address=http.address();if(!address||typeof address==='string')throw Error('No address');
 const url=`http://127.0.0.1:${address.port}`;
 const transport=createHttpTelemetryTransport(async (path,options)=>{
  expect(options?.credentials).toBe('omit');expect(options?.referrerPolicy).toBe('no-referrer');
  return fetch(url+path,{...options,headers:{...options?.headers,Origin:'https://vizly.test'}});
 });
 const t=createOperationTelemetry({releaseId:'b'.repeat(40),transport});
 try {
  t.begin('startup')('failure','initialization');t.begin('save')('failure','denied');await t.flush();
  expect(accepted).toHaveLength(1);expect(accepted[0].events.map(e=>e.operation)).toEqual(['startup','save']);
  expect(accepted[0].releaseId).toBe('b'.repeat(40));expect(accepted[0].events[0].requestId).toMatch(/^[a-f0-9-]{36}$/);
  const contaminated={...accepted[0],token:'CANARY',events:accepted[0].events.map(e=>({...e,body:'CANARY'}))};
  expect((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://vizly.test'},body:JSON.stringify(contaminated)})).status).toBe(202);
  expect(JSON.stringify(accepted)).not.toContain('CANARY');
  expect((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.test'},body:JSON.stringify(contaminated)})).status).toBe(403);
  expect((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://vizly.test'},body:'{}'})).status).toBe(400);
 } finally {t.dispose();http.closeAllConnections();await new Promise<void>(resolve=>http.close(()=>resolve()));}
});
it('rejects invalid metrics and event enums and projects counters without extra fields',async()=>{
 let batch: TelemetryBatch|undefined;
 const t=createOperationTelemetry({releaseId:'c'.repeat(40),transport:async b=>{batch=b;}});
 t.begin('save')('success');await t.flush();t.dispose();
 expect(()=>projectTelemetryPayload({...batch,metrics:{...batch!.metrics,save:{started:0,success:1,failure:0,cancelled:0}}})).toThrow();
 expect(()=>projectTelemetryPayload({...batch,events:[{...batch!.events[0],operation:'CANARY'}]})).toThrow();
 const malicious={...batch,metrics:{...batch!.metrics,save:{...batch!.metrics.save,token:'CANARY'}}};
 expect(JSON.stringify(projectTelemetryPayload(malicious))).not.toContain('CANARY');
});
it('does not expose sink failures to callers',async()=>{
 const sink=vi.fn(async()=>{throw Error('CANARY');});
 const t=createOperationTelemetry({releaseId:'d'.repeat(40),transport:sink});t.begin('save')('success');await expect(t.flush()).resolves.toBeUndefined();t.dispose();
});

it('mounts telemetry on the real collaboration server only when explicitly enabled',async()=>{
 const {createCollaborationServer}=await import('./server.js');
 const accepted:ReturnType<typeof projectTelemetryPayload>[]=[];
 for(const enabled of [false,true]){
  const server=createCollaborationServer({authorize:async()=>null,persistence:{load:async()=>null,save:async()=>{}},origins:new Set(['https://vizly.test']),
   ...(enabled?{telemetry:{accept:async (batch:ReturnType<typeof projectTelemetryPayload>)=>{accepted.push(batch);}}}:{})});
  const address=await server.listen();
  try {
   let payload:TelemetryBatch|undefined;const t=createOperationTelemetry({releaseId:'f'.repeat(40),transport:async b=>{payload=b;}});
   t.begin('startup')('failure','mount');await t.flush();t.dispose();
   const response=await fetch(`http://127.0.0.1:${address.port}/telemetry`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://vizly.test'},body:JSON.stringify(payload)});
   expect(response.status).toBe(enabled?202:404);
   expect((await fetch(`http://127.0.0.1:${address.port}/health`)).status).toBe(200);
  }finally{await server.stop();}
 }
 expect(accepted).toHaveLength(1);
});
