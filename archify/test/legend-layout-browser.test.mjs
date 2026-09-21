import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ChromeVisualBrowser,findChrome} from '../bin/visual-check.mjs';
import {largeAdaptiveWorkflow} from './fixtures/large-adaptive-workflow.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const chrome=process.env.ARCHIFY_CHROME ? findChrome() : null;

test('legend badge geometry follows settled reader dimensions after cold load and resize',{
  skip:chrome ? false : 'Set ARCHIFY_CHROME to run real-browser legend layout checks.',
},async t=>{
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'archify-legend-layout-'));
  t.after(()=>fs.rmSync(scratch,{recursive:true,force:true}));
  const cases={architecture:'web-app.architecture.json',workflow:'agent-tool-call.workflow.json',
    dataflow:'product-analytics.dataflow.json',lifecycle:'agent-run.lifecycle.json',sequence:'cache-miss-request.sequence.json',largeWorkflow:null};
  const browser=new ChromeVisualBrowser(chrome);
  t.after(()=>browser.close());
  const session=await browser.sessionPromise;
  const send=(method,params={})=>browser.cdp.send(method,params,session);
  const run=async expression=>{
    const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    assert.equal(result.exceptionDetails,undefined,result.exceptionDetails?.exception?.description);
    return result.result.value;
  };
  await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Network.setBlockedURLs',{urls:['http://*','https://*']});
  await send('DOM.enable');await send('CSS.enable');await send('CSS.setLocalFontsEnabled',{enabled:false});
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  async function settled(){
    await run(`(async()=>{await document.fonts.ready;
      await Archify.readerLayout.whenStable();await Archify.viewerChromeLayout.whenStable();
      await Archify.readerLayout.whenStable();await Archify.viewerChromeLayout.whenStable();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    })()`);
  }
  async function check(label){
    await settled();
    const entries=await run(`(()=>{return [...document.querySelectorAll('[data-legend-kind]')].map(entry=>{
      const boxes=[...entry.children].filter(e=>!e.hasAttribute('data-legend-bridge-runtime')).map(e=>e.getBBox());
      const left=Math.min(...boxes.map(b=>b.x)),right=Math.max(...boxes.map(b=>b.x+b.width));
      const top=Math.min(...boxes.map(b=>b.y)),bottom=Math.max(...boxes.map(b=>b.y+b.height));
      const count=entry.getAttribute('data-legend-count'),width=Math.max(14,count.length*5+8),center=(top+bottom)/2;
      const text=entry.querySelector('[data-legend-count-badge] text'),hit=entry.querySelector('[data-legend-hit]');
      return {kind:entry.getAttribute('data-legend-kind'),actual:[text.getAttribute('x'),text.getAttribute('y'),hit.getAttribute('x'),hit.getAttribute('y'),hit.getAttribute('width')],
        expected:[(right+3+width/2).toFixed(2),(center+2.5).toFixed(2),(left-5).toFixed(2),(center-12).toFixed(2),Math.max(24,right+3+width+4-(left-5)).toFixed(2)]};
    });})()`);
    for(const entry of entries)assert.deepEqual(entry.actual,entry.expected,label+' '+entry.kind+' must use final source bounds');
    return entries;
  }
  for(const [mode,example] of Object.entries(cases))await t.test(mode,async()=>{
    const input=example ? JSON.parse(fs.readFileSync(path.join(root,'examples',example),'utf8')) : largeAdaptiveWorkflow();
    if(mode==='workflow')input.meta.legend={mode:'all'};
    const source=path.join(scratch,mode+'.json'),html=path.join(scratch,mode+'.html');
    fs.writeFileSync(source,JSON.stringify(input));
    const type=mode==='largeWorkflow' ? 'workflow' : mode;
    execFileSync(process.execPath,[path.join(root,`renderers/${type}/render-${type}.mjs`),source,html]);
    await browser.inspect({artifactPath:html,width:1600,height:1000,theme:'light'});
    const initial=await check(mode+' cold');
    if(mode!=='sequence')assert(initial.length>0,mode+' exercises real interactive legend entries');
    for(const [width,height] of [[1440,900],[1600,1000],[1100,720],[1600,1000]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await check(mode+' '+width+'x'+height);
    }
  });
});
