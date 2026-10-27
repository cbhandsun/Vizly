// @vitest-environment node
import { expect, it } from 'vitest';
import { createOperationTelemetry, type TelemetryBatch } from '../operationTelemetry';
import { configureApplicationTelemetry } from '../applicationTelemetry';
import { createConnectionTelemetry } from '../connectionTelemetry';
it('tracks sync success, failed reconnect and cleanup without double counting socket events',async()=>{
 const batches:TelemetryBatch[]=[];const t=createOperationTelemetry({releaseId:'e'.repeat(40),transport:async b=>{batches.push(b);}});
 const stop=configureApplicationTelemetry(t);
 try {
  const c=createConnectionTelemetry();c.status('connecting');c.status('connected');
  expect(t.snapshot().metrics.connect.success).toBe(0);
  c.synced();c.synced();c.status('disconnected');c.status('connecting');c.status('disconnected');
  c.status('connecting');c.dispose();c.synced();c.status('connecting');await t.flush();
  expect(batches[0].metrics.connect).toEqual({started:1,success:1,failure:0,cancelled:0});
  expect(batches[0].metrics.reconnect).toEqual({started:2,success:0,failure:1,cancelled:1});
 }finally{stop();}
});
