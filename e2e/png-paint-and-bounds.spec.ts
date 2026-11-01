import { readFile } from 'node:fs/promises';
import { decode } from 'fast-png';
import { expect, test } from '@playwright/test';

test('PNG preserves node paint and complete outside loop after pan and zoom', async ({ page }, testInfo) => {
 await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
 await page.goto('/#/manage');
 await expect(page.getByRole('button', { name: '新建流程图', exact: true })).toBeVisible();
 await page.getByRole('button', { name: '新建流程图', exact: true }).click();
 await expect(page.getByRole('button', { name: '选择第一个图形', exact: true })).toBeVisible();
 const id = '77777777-7777-4777-8777-777777777777';
 await page.evaluate(async id => {
  const doc={id,name:'PNG regression synthetic',type:'flowchart',version:'2.0.0',nodes:[325,515,670].map((y,index)=>({id:'export-'+index,type:'custom',domain:'test',domainClass:'core',description:'',data:{label:'PNG '+String.fromCharCode(65+index)},metadata:{shape:'rectangle',width:140,height:70,canvasNodeType:'flowchart',canvasPosition:{x:385,y},style:{width:140,height:70},theme:{main:'#2196F3',text:'#fff',border:'#1e88e5'}}})),edges:[['export-0','export-1','bottom','top'],['export-1','export-2','bottom','top'],['export-0','export-2','left','left']].map(([source,target,sourceHandle,targetHandle],i)=>({id:'edge-'+i,source,target,type:'advanced-smart-step',style:{stroke:'#475569',strokeWidth:1.75},metadata:{sourceHandle,targetHandle,manualHandles:true}})),groups:[],theme:{name:'manual',displayName:'Manual',isCustom:true,domains:{test:{main:'#2196F3',text:'#fff',border:'#1e88e5'}}},layout:{type:'custom',direction:'LR',generateDomainGroups:false},metadata:{}};
  const request=indexedDB.open('VizlyLocalDB');const db=await new Promise<IDBDatabase>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});try{const tx=db.transaction('local_diagrams','readwrite');tx.objectStore('local_diagrams').put(doc);await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}
 }, id);
 await page.goto('/#/?diagram=' + id);
 await expect(page.locator('.react-flow__node')).toHaveCount(3);
 await page.waitForTimeout(700);
 await page.evaluate(async () => {
  const flow = (window as unknown as { reactFlowInstance: { setViewport: (value: { x: number; y: number; zoom: number }) => Promise<boolean> } }).reactFlowInstance;
  await flow.setViewport({ x: -130, y: 95, zoom: 0.65 });
 });
 const paint = await page.locator('.react-flow__node svg rect').first().evaluate(el => getComputedStyle(el).fill);
 const rgb = paint.match(/\d+/g)?.map(Number);
 if (!rgb || rgb.length < 3) throw new Error('Expected computed node RGB paint');
 const viewport = page.locator('.react-flow__viewport');
 const before = await viewport.getAttribute('style');
 await page.getByRole('button', { name: '导出', exact: true }).click();
 const pending = page.waitForEvent('download');
 await page.locator('#diagram-export-actions-menu').getByText('PNG 格式', { exact: true }).click();
 const download = await pending;
 expect(await download.failure()).toBeNull();
 const file = await download.path();
 if (!file) throw new Error('Missing PNG');
 const bytes = await readFile(file);
 const image = decode(bytes);
 expect(image.depth).toBe(8);
 expect([3, 4]).toContain(image.channels);
 const paintedRows = new Set<number>();
 let black = 0;
 let nonWhiteBorder = 0;
 for (let y = 0; y < image.height; y++) {
  let colored = 0;
  for (let x = 0; x < image.width; x++) {
   const i = (y * image.width + x) * image.channels;
   const [r, g, b] = image.data.subarray(i, i + 3);
   if (r === rgb[0] && g === rgb[1] && b === rgb[2]) colored++;
   if (r < 20 && g < 20 && b < 20) black++;
   // Every outside border must retain white padding; the old loop touched x=0.
   if ((x < 10 || x >= image.width - 10 || y < 10 || y >= image.height - 10) && (r !== 255 || g !== 255 || b !== 255)) nonWhiteBorder++;
  }
  if (colored > 100) paintedRows.add(y);
 }
 let bands = 0;
 let previous = -2;
 for (const row of paintedRows) { if (row > previous + 1) bands++; previous = row; }
 expect(bands).toBe(3);
 expect(nonWhiteBorder).toBe(0);
 expect(black / (image.width * image.height)).toBeLessThan(0.02);
 await expect(viewport).toHaveAttribute('style', before ?? '');
 await expect(page.locator('.react-flow__node')).toHaveCount(3);
 await testInfo.attach('export-complete-colored-png', { body: bytes, contentType: 'image/png' });
});
