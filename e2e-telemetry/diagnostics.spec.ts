import { expect,test } from '@playwright/test';
import type { TelemetryBatch } from '../src/observability/operationTelemetry';
test('installed SDK reports actual export and routing operations through the browser transport',async({page})=>{
 const batches:TelemetryBatch[]=[];
 await page.route('**/telemetry',async route=>{
  const request=route.request();expect(request.headers()['authorization']).toBeUndefined();expect(request.headers()['cookie']).toBeUndefined();
  batches.push(request.postDataJSON());await route.fulfill({status:202,body:''});
 });
 await page.addInitScript(()=>localStorage.setItem('i18nextLng','zh'));
 await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1');
 await expect(page.locator('.react-flow__node[data-id="order-import"]')).toContainText('订单导入/创建');
 await page.getByRole('button',{name:'导出',exact:true}).click();
 const pending=page.waitForEvent('download');
 await page.locator('#diagram-export-actions-menu').getByText('PNG 格式',{exact:true}).click();
 expect(await (await pending).failure()).toBeNull();
 await expect.poll(()=>batches.flatMap(b=>b.events).some(e=>e.operation==='export'&&e.outcome==='success')).toBe(true);
 const beforeLayout={
  started:Math.max(0,...batches.map(b=>b.metrics.route.started)),
  success:Math.max(0,...batches.map(b=>b.metrics.route.success)),
 };
 await page.getByRole('button',{name:/自动布局|layout/i}).click();
 await page.locator('[data-menu-id$="group-swimlane-process"]').filter({visible:true}).hover();
 await page.locator('[data-menu-id$="domain-lanes-lr"]').filter({visible:true}).click();
 await expect.poll(()=>batches.some(b=>b.metrics.route.started>beforeLayout.started
  &&b.metrics.route.success>beforeLayout.success
  &&b.events.some(e=>e.operation==='route'&&e.outcome==='success'))).toBe(true);
 expect(batches.flatMap(b=>b.events).some(e=>e.operation==='startup'&&e.outcome==='success')).toBe(true);
 expect(batches.every(b=>b.releaseId==='a'.repeat(40))).toBe(true);
 expect(JSON.stringify(batches)).not.toContain('order-import');expect(JSON.stringify(batches)).not.toContain('订单导入');
});
