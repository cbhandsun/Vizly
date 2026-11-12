// @vitest-environment node
import { expect, it } from 'vitest';
import WebSocket from 'ws';
import { createCollaborationServer } from './server.js';
import { createOperationTelemetry, type TelemetryBatch } from './operationTelemetry.js';
import { configureServerTelemetry, observeServerOperation } from './serverTelemetry.js';
it.each(['denied','lease-failed'] as const)('observes the real server %s path without credentials',async scenario=>{
 const batches:TelemetryBatch[]=[];const telemetry=createOperationTelemetry({releaseId:'c'.repeat(40),transport:async b=>{batches.push(b);}});
 const stop=configureServerTelemetry(telemetry);
 const server=createCollaborationServer({authorize:async()=>scenario==='denied'?null:{userId:'verified',role:'editor'},
  persistence:{load:async()=>null,save:async()=>{}},origins:new Set(['https://vizly.test']),
  acquireRoomLease:async()=>{throw Error('CANARY-LEASE');}});
 const {url}=await server.listen();
 try {
  await new Promise<void>(resolve=>{
   const socket=new WebSocket(`${url}/vizly-room-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?token=CANARY-CREDENTIAL`,{origin:'https://vizly.test'});
   socket.on('error',()=>{});socket.on('close',()=>resolve());
  });
  await telemetry.flush();
  expect(batches[0].metrics.permission.started).toBe(1);
  expect(batches[0].metrics.permission[scenario==='denied'?'failure':'success']).toBe(1);
  expect(batches[0].metrics.lease.failure).toBe(scenario==='denied'?0:1);
  expect(JSON.stringify(batches)).not.toContain('CANARY');
 }finally{await server.stop();stop();}
});
it('preserves operation results and thrown errors when monitoring delivery fails',async()=>{
 const telemetry=createOperationTelemetry({releaseId:'d'.repeat(40),transport:async()=>{throw Error('sink unavailable');}});const stop=configureServerTelemetry(telemetry);
 try {
  expect(await observeServerOperation('cas',async()=>false,result=>result?null:'conflict')).toBe(false);
  const original=new Error('original');await expect(observeServerOperation('lease',async()=>{throw original;})).rejects.toBe(original);
  await expect(telemetry.flush()).resolves.toBeUndefined();
 }finally{stop();}
});
