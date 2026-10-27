// @vitest-environment node
import { createServer } from 'node:http';
import { once } from 'node:events';
import { expect, it, vi } from 'vitest';
import { createHttpAlertDelivery, createTelemetryAlerts } from './telemetryAlerts.js';
import { createOperationTelemetry } from './operationTelemetry.js';
import { projectTelemetryPayload } from './telemetryPayload.js';

it('delivers a safe alert to an actual HTTP receiver and suppresses repeat failures',async()=>{
 const received:unknown[]=[];
 const http=createServer(async(request,response)=>{
  let text='';for await(const bytes of request)text+=bytes;received.push(JSON.parse(text));response.writeHead(202);response.end();
 });http.listen(0,'127.0.0.1');await once(http,'listening');const address=http.address();if(!address||typeof address==='string')throw Error('No address');
 const alerts=createTelemetryAlerts(createHttpAlertDelivery(`http://127.0.0.1:${address.port}/alerts`));
 const telemetry=createOperationTelemetry({releaseId:'a'.repeat(40),transport:async batch=>alerts.submit(projectTelemetryPayload({...batch,token:'CANARY'}))});
 try {
  telemetry.begin('startup')('failure','mount');await telemetry.flush();await alerts.drain();
  telemetry.begin('startup')('failure','mount');await telemetry.flush();await alerts.drain();
  expect(received).toHaveLength(1);expect(received[0]).toMatchObject({schema:'vizly-alert-v1',releaseId:'a'.repeat(40),operation:'startup',code:'mount'});
  expect(JSON.stringify(received)).not.toContain('CANARY');
 }finally{telemetry.dispose();alerts.stop();http.closeAllConnections();await new Promise<void>(r=>http.close(()=>r()));}
});
it('opens the circuit for a hung receiver and does not accumulate sends',async()=>{
 vi.useFakeTimers();const deliver=vi.fn(()=>new Promise<void>(()=>{}));const alerts=createTelemetryAlerts(deliver);
 const telemetry=createOperationTelemetry({releaseId:'b'.repeat(40),transport:async batch=>alerts.submit(projectTelemetryPayload(batch))});
 try {
  telemetry.begin('save')('failure','unknown');await telemetry.flush();await vi.advanceTimersByTimeAsync(3000);await alerts.drain();
  telemetry.begin('connect')('failure','network');await telemetry.flush();await vi.advanceTimersByTimeAsync(60_000);
  expect(deliver).toHaveBeenCalledTimes(1);
 }finally{telemetry.dispose();alerts.stop();vi.useRealTimers();}
});
it.each(['http://remote.test/alerts','https://user:secret@example.com','https://example.com?token=CANARY','file:///tmp/alerts'])('rejects unsafe receiver configuration %s',endpoint=>{
 expect(()=>createHttpAlertDelivery(endpoint)).toThrow('Invalid alert receiver');
});
