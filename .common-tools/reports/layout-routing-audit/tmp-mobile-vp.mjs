import { setTimeout as delay } from 'node:timers/promises';
import { DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT } from '../../../scripts/lib/display-routing-browser-capture.mjs';
import { withPrecompiledRouteBrowser } from '../../../scripts/lib/precompiled-display-route-cdp.mjs';
const base=process.env.PRECOMPILED_ROUTE_BASE_URL;
const preset='wms-demand-allocation-strategy-v2';
const wait=async(s,expr,label)=>{const end=Date.now()+30000;while(Date.now()<end){const v=await s.evaluate(expr); if(v) return v; await delay(150);} throw new Error(label)};
const r=await withPrecompiledRouteBrowser(async s=>{
 await s.send('Page.addScriptToEvaluateOnNewDocument',{source:DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT});
 await s.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
 await s.send('Page.navigate',{url:`${base}/?canonicalPreset=${preset}&probe=${Date.now()}#/?diagram=${preset}`});
 await wait(s,`(() => { const r=window.__vizlyBaseReactFlowDisplayRouting||{}; return r.stage==='final-applied'&&r.renderAuthorityStatus==='accepted'?true:null })()`,'ready');
 await delay(1000);
 return await s.evaluate(`(() => {
 const vp=window.reactFlowInstance?.getViewport?.();
 const nodes=Array.from(document.querySelectorAll('.react-flow__node')).map(e=>{const r=e.getBoundingClientRect(); return {text:e.textContent.trim().slice(0,40), left:Math.round(r.left), top:Math.round(r.top), right:Math.round(r.right), bottom:Math.round(r.bottom), w:Math.round(r.width), h:Math.round(r.height)}});
 const pane=document.querySelector('.react-flow__pane')?.getBoundingClientRect();
 return {vp, pane: pane&&{left:pane.left,top:pane.top,right:pane.right,bottom:pane.bottom,width:pane.width,height:pane.height}, minTop:Math.min(...nodes.map(n=>n.top)), maxBottom:Math.max(...nodes.map(n=>n.bottom)), visibleNodes:nodes.filter(n=>n.bottom>0&&n.top<innerHeight&&n.right>0&&n.left<innerWidth).slice(0,10), count:nodes.length};
})()`);
});
console.log(JSON.stringify(r,null,2));
