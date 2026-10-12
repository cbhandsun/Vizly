import { expect, test, type WebSocketRoute } from '@playwright/test';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as sync from 'y-protocols/sync';

test.use({reducedMotion: 'no-preference'});
// Real host/Core UI with a protocol fixture; does not prove Supabase identities.
for (const [id, selector] of [['sticky-test', '.sticky-note-content'], ['mind-test', '.mindmap-node'], ['title-test', '.title-text'], ['sub-test', '.sub-group-title span']] as const) test(id + ' rejects readonly editing and discards drafts on downgrade', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let socket: WebSocketRoute | undefined;
  let fixtureUpdate: Uint8Array | undefined;
  const role = (value: 'editor' | 'viewer') => {
    if (!socket) throw new Error('Fixture transport not connected');
    const encoder = encoding.createEncoder(); encoding.writeVarUint(encoder, 4); encoding.writeVarString(encoder, value);
    socket.send(Buffer.from(encoding.toUint8Array(encoder)));
  };
  await page.routeWebSocket(/\/vizly-room-wms-process-flow-v1(?:\?|$)/, route => {
    socket = route;
    let initialized = false;
    route.onMessage(() => {
      if (initialized) return;
      initialized = true; role('viewer');
      const doc = new Y.Doc();
      const nodes = doc.getMap('flowchart-nodes');
      for (const [id, type, x, y] of [
        ['sticky-test', 'sticky-note', 100, 100], ['mind-test', 'mindmap', 350, 100],
        ['title-test', 'titleGroup', 100, 280], ['sub-test', 'subGroup', 460, 280],
      ] as const) nodes.set(id, { id, type, position: { x, y }, width: 240, height: 120,
        data: { label: id, description: id, domain: 'wms', depth: 1, isEditing: false } });
      fixtureUpdate = Y.encodeStateAsUpdate(doc);
      const initial = new Y.Doc();
      const encoder = encoding.createEncoder(); encoding.writeVarUint(encoder, 0); sync.writeSyncStep2(encoder, initial);
      route.send(Buffer.from(encoding.toUint8Array(encoder))); doc.destroy(); initial.destroy();
    });
  });
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.goto('/?precompiledCapture=wms-process-flow-v1#/?diagram=wms-process-flow-v1&room=vizly-room-wms-process-flow-v1');
  const connected = page.getByRole('button', { name: '打开协作详情：已连接协作服务', exact: true });
  await expect(connected).toBeVisible();
  // Exercise a live remote update after the built-in canvas finishes loading.
  // Initial nonempty remote hydration is a separate acceptance boundary.
  await expect(page.locator('.react-flow__node[data-id="order-import"]')).toBeVisible();
  if (!socket || !fixtureUpdate) throw new Error('Remote fixture unavailable');
  const update = encoding.createEncoder(); encoding.writeVarUint(update, 0); sync.writeUpdate(update, fixtureUpdate);
  socket.send(Buffer.from(encoding.toUint8Array(update)));
  await expect(page.locator('.react-flow__node[data-id="sticky-test"]')).toBeVisible();
  await page.getByRole('button', { name: '适应屏幕', exact: true }).click();
    const node = page.locator(`.react-flow__node[data-id="${id}"]`);
    const title = node.locator(selector).first();
    // The subgroup's top connection handle overlaps the title center. Exercise
    // the visible text edge without bypassing pointer hit testing.
    const editTitle = () => title.dblclick();
    await editTitle(); await expect(node.locator('input,textarea')).toHaveCount(0);
    role('editor'); await expect(page.getByRole('button', { name: /选择.*\(V\)/ })).toBeVisible();
    if (id === 'sub-test') {
      const centers = async () => node.evaluate(element=>{
        const bounds=element.getBoundingClientRect();
        return [...element.querySelectorAll('.react-flow__handle.source')].map(handle=>{
          const rect=handle.getBoundingClientRect(); const side=handle.getAttribute('data-handleid');
          const expectedX=side==='left'?bounds.left:side==='right'?bounds.right:bounds.x+bounds.width/2;
          const expectedY=side==='top'?bounds.top:side==='bottom'?bounds.bottom:bounds.y+bounds.height/2;
          return {side,x:rect.x+rect.width/2,y:rect.y+rect.height/2,
            offsetX:Math.abs(rect.x+rect.width/2-expectedX),offsetY:Math.abs(rect.y+rect.height/2-expectedY)};
        });
      });
      console.log('SUBGROUP_INITIAL_PORT_CENTERS '+JSON.stringify({motion:'no-preference',centers:await centers()}));
      await expect.poll(async()=>Math.max(...(await centers()).flatMap(value=>[value.offsetX,value.offsetY]))).toBeLessThanOrEqual(2);
      const idle=await centers(); expect(idle).toHaveLength(4);
      for (const item of idle) {
        expect(item.offsetX).toBeLessThanOrEqual(2); expect(item.offsetY).toBeLessThanOrEqual(2);
        await page.mouse.move(item.x,item.y);
        await expect.poll(async()=>Math.max(...(await centers()).flatMap(value=>[value.offsetX,value.offsetY]))).toBeLessThanOrEqual(2);
      }
      console.log('SUBGROUP_PORT_CENTERS '+JSON.stringify({motion:'no-preference',idle,hovered:await centers()}));
      const from=await node.locator('.source[data-handleid="bottom"]').boundingBox();
      const to=await page.locator('.react-flow__node[data-id="title-test"] .source[data-handleid="right"]').boundingBox();
      if (!from||!to) throw new Error('Connection endpoint bounds missing');
      const before=await page.locator('.react-flow__edge').count();
      const hit = await page.evaluate(({from,to})=>[from,to].map(rect=>{
        const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
        return {tag:hit?.tagName,classes:hit?.className,handle:hit?.getAttribute('data-handleid')};
      }),{from,to}); console.log('SUBGROUP_CONNECTION_HIT '+JSON.stringify({motion:'no-preference',hit}));
      await page.mouse.move(from.x+from.width/2,from.y+from.height/2); await page.mouse.down();
      await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:15}); await page.mouse.up();
      await expect(page.locator('.react-flow__edge')).toHaveCount(before+1);
    }

    await editTitle(); const editor = node.locator('input,textarea'); await expect(editor).toBeVisible();
    if (id !== 'sticky-test') await editor.fill('Draft must not survive downgrade');
    role('viewer'); await expect(page.getByRole('button', { name: /选择.*\(V\)/ })).toHaveCount(0);
    await expect(editor).toHaveCount(0); await editTitle(); await expect(editor).toHaveCount(0);
    role('editor'); await expect(page.getByRole('button', { name: /选择.*\(V\)/ })).toBeVisible();
    await editTitle(); await expect(editor).toHaveValue(id); role('viewer'); await expect(page.getByRole('button', { name: /选择.*\(V\)/ })).toHaveCount(0); await expect(editor).toHaveCount(0);
  expect(errors).toEqual([]);
});
