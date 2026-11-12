// @vitest-environment node
import { expect,it,vi } from 'vitest';
import { installApplicationTelemetry } from '../configureTelemetry';
import { beginApplicationOperation } from '../../observability/applicationTelemetry';
it('requires explicit opt-in and a build hash before sending browser diagnostics',async()=>{
 vi.useFakeTimers();const fetcher=vi.fn<typeof fetch>(async()=>new Response(null,{status:202}));
 try {
  for(const config of [{enabled:'false',releaseId:'a'.repeat(40)},{enabled:'true',releaseId:'token=CANARY'}]){
   const stop=installApplicationTelemetry(config,fetcher);beginApplicationOperation('startup')('success');await vi.advanceTimersByTimeAsync(250);stop();
  }
  expect(fetcher).not.toHaveBeenCalled();
  const stop=installApplicationTelemetry({enabled:'true',releaseId:'a'.repeat(40)},fetcher);
  beginApplicationOperation('startup')('success');await vi.advanceTimersByTimeAsync(250);
  expect(fetcher).toHaveBeenCalledOnce();expect(fetcher.mock.calls[0][0]).toBe('/telemetry');stop();
 }finally{vi.useRealTimers();}
});
