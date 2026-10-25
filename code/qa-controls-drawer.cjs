// Real browser layout/lifecycle tests with virtual media devices and local models.
// Emulated phone viewports do not validate physical phones or real hand/face accuracy.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const checks = [], errors = [], layouts = [];
  const tab = await (await fetch('http://127.0.0.1:9227/json/new?about:blank', { method:'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(resolve => ws.addEventListener('open', resolve, { once:true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', ({ data }) => { const d = JSON.parse(data); if (d.id) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(d.error) : p.resolve(d.result); }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params); });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n,{resolve,reject}); ws.send(JSON.stringify({ id:n,method,params })); });
  const run = async expression => { const r = await send('Runtime.evaluate', { expression,returnByValue:true,awaitPromise:true,userGesture:true }); assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const snap = () => run('resonanceDemo.snapshot()');
  const rect = selector => run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}})()`);
  const tapAt = async (x,y) => { await send('Input.dispatchTouchEvent',{ type:'touchStart',touchPoints:[{x,y}] }); await send('Input.dispatchTouchEvent',{ type:'touchEnd',touchPoints:[] }); };
  const tap = async selector => { const r = await rect(selector); await tapAt(r.x+r.width/2,r.y+r.height/2); };
  const click = selector => run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const wait = async (predicate, timeout=15000) => { const start=Date.now();while(Date.now()-start<timeout){if(await predicate())return;await sleep(70);}throw Error('Timeout '+JSON.stringify(await snap())); };
  const shot = async name => { const image=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(__dirname,'qa',name+'.png'),Buffer.from(image.data,'base64')); };
  const pass = message => { checks.push(message);console.log('PASS '+message); };
  const drawerOpen = () => run('document.querySelector("#live-controls").classList.contains("drawer-open")');
  const key = async name => { await send('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:name,windowsVirtualKeyCode:27}); };
  try {
    await send('Runtime.enable');await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`
      window.__drawerQA={streams:[],workers:0,music:[]};
      const media=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async o=>{const stream=await media(o);__drawerQA.streams.push(stream);return stream;};
      const NativeWorker=Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);__drawerQA.workers++;}};
      const create=AudioContext.prototype.createMediaElementSource;AudioContext.prototype.createMediaElementSource=function(element){__drawerQA.music.push(element);return create.call(this,element);};
    `});
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true});
    await send('Page.navigate',{url:'http://127.0.0.1:4173/'});await wait(()=>run('!!window.resonanceDemo'));
    if(!(await snap()).playback.musicEnabled)await tap('#site-music [data-music]');
    await tap('#meet');await tap('#start');await wait(async()=>(await snap()).stage==='live',75000);
    assert(!await drawerOpen());assert(await run('document.querySelector("#live-controls").inert'));
    assert.equal(await run('getComputedStyle(document.querySelector("#live-controls")).opacity'),'0');
    assert(!await run('document.querySelector("#controls-toggle").hidden'));
    const initial=await rect('#creature');assert(initial.height>500);assert(initial.width===390);
    await wait(async()=>(await snap()).live.hands.frames>2&&(await snap()).live.body.frames>1,75000);
    const workers=await run('__drawerQA.workers');
    await run('window.__canvasSizes=[];window.__drawerResize=new ResizeObserver(entries=>__canvasSizes.push([entries[0].contentRect.width,entries[0].contentRect.height]));__drawerResize.observe(document.querySelector("#creature"))');
    await sleep(200);const before=await snap(),videoBefore=await run('document.querySelector("#camera").currentTime'),musicBefore=await run('__drawerQA.music[0].currentTime');
    await tap('#controls-toggle');await wait(drawerOpen);await sleep(350);
    const opened=await rect('#creature');assert.deepEqual(opened,initial);assert.equal((await snap()).radius,before.radius);
    assert.equal(await run('document.activeElement.getAttribute("aria-label")'),'Close controls');
    await run('document.querySelector("#live-controls").scrollTop=1400');await sleep(250);
    const close=await rect('#live-controls [data-close-controls]'),panel=await rect('#live-controls');assert(close.y>=panel.y&&close.bottom<=panel.bottom);assert(close.height>=44);
    await tap('#live-controls [data-close-controls]');await wait(async()=>!await drawerOpen());assert.equal(await run('document.activeElement.id'),'controls-toggle');
    await sleep(1300);const after=await snap();assert.deepEqual(await rect('#creature'),initial);assert.equal(after.radius,before.radius);
    assert(after.live.frames>before.live.frames);assert(after.live.hands.frames>before.live.hands.frames);assert(after.live.body.frames>before.live.body.frames);
    assert(await run(`document.querySelector('#camera').currentTime>${videoBefore}`));assert(after.live.tracks.every(t=>t.state==='live'&&t.enabled));assert.equal(after.live.audio,'running');
    assert(await run(`((__drawerQA.music[0].currentTime-${musicBefore}+__drawerQA.music[0].duration)%__drawerQA.music[0].duration)>.5`));
    assert.equal(await run('__drawerQA.streams.length'),1);assert.equal(await run('__drawerQA.workers'),workers);assert.equal(await run('__drawerQA.music.length'),1);
    assert(await run('__canvasSizes.every(([w,h])=>w===__canvasSizes[0][0]&&h===__canvasSizes[0][1])'));
    pass('Live starts with Controls closed; opening/closing leaves canvas dimensions and radius identical, and the original video, mic, three models and one music track keep running');
    for(const [width,height,mobile]of [[390,844,true],[430,932,true],[820,900,false],[900,650,false],[768,720,false],[600,480,false]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await sleep(250);
      const canvas=await rect('#creature');assert(canvas.width===width);assert(await run('document.documentElement.scrollWidth<=innerWidth'));
      const buttons=await run('[...document.querySelectorAll(".toolbar button")].filter(b=>!b.hidden).map(b=>{const r=b.getBoundingClientRect();return{x:r.x,right:r.right,width:r.width,height:r.height}})');
      assert.equal(buttons.length,6);for(let i=0;i<buttons.length;i++){assert(buttons[i].width>=44&&buttons[i].height>=44);if(i)assert(buttons[i].x>=buttons[i-1].right-1);}
      await shot('controls-closed-'+width);await tap('#controls-toggle');await wait(drawerOpen);await sleep(250);
      const drawer=await rect('#live-controls'),toolbar=await rect('.toolbar'),home=await rect('#home');
      assert(drawer.height<=height*.65+1);assert(drawer.bottom<=toolbar.y-4);assert(drawer.y>=home.bottom);assert(drawer.x>=0&&drawer.right<=width);
      assert.deepEqual(await rect('#creature'),canvas);layouts.push({width,height,canvas,drawer,toolbar});
      await run('document.querySelector("#live-controls").scrollTop=0');await shot('controls-open-'+width);
      await tapAt(width*.55,Math.max(home.bottom+10,drawer.y-16));await wait(async()=>!await drawerOpen());
      assert.deepEqual(await rect('#creature'),canvas);
    }
    pass('390/430 px phones and 600/768/820/900 px windows have a full-width canvas, six non-overlapping touch targets, a scrollable drawer under 65%, and mask close without reflow');
    await tap('#controls-toggle');await wait(drawerOpen);await tap('#help-button');
    assert(await run('document.querySelector("#help-dialog").open'));assert(!await drawerOpen());assert(await run('document.querySelector("#controls-backdrop").hidden'));
    await click('#controls-toggle');await wait(drawerOpen);assert(!await run('document.querySelector("#help-dialog").open'));
    assert.equal(await run('document.activeElement.getAttribute("aria-label")'),'Close controls');await key('Escape');await wait(async()=>!await drawerOpen());
    await click('.skip-link');await wait(drawerOpen);await tap('#controls-toggle');await wait(async()=>!await drawerOpen());
    pass('Help and Controls are mutually exclusive; Esc and the existing keyboard skip link work without changing the Live stage');
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await send('Emulation.setTouchEmulationEnabled',{enabled:false});await sleep(350);
    assert(await run('document.querySelector("#controls-toggle").hidden'));assert(!await run('document.querySelector("#live-controls").inert'));
    assert.equal(await run('getComputedStyle(document.querySelector("#live-controls")).opacity'),'1');
    const wide=await rect('#live-controls'),wideCanvas=await rect('#creature');assert.equal(wide.width,300);assert.equal(wideCanvas.width,1440-348);await shot('controls-wide-desktop');
    await send('Emulation.setDeviceMetricsOverride',{width:430,height:932,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true});await sleep(250);
    assert(!await drawerOpen());assert(await run('document.querySelector("#live-controls").inert'));
    await tap('#home');assert((await snap()).live.tracks.length===0);await tap('#meet');await tap('#try-demo');
    assert(await run('document.querySelector("#demo-controls").inert'));await tap('#controls-toggle');assert(await run('document.querySelector("#demo-controls").classList.contains("drawer-open")'));
    assert.equal(await run('document.querySelector("#controls-toggle").getAttribute("aria-controls")'),'demo-controls');assert.equal(errors.length,0);
    pass('Wide desktop keeps its original sidebar; narrowing resets the drawer closed, Home still releases capture, and Demo uses the same compact Controls entry');
  }finally{
    await run('dispatchEvent(new PageTransitionEvent("pagehide"))').catch(()=>{});
    fs.writeFileSync(path.join(__dirname,'qa/controls-drawer-report.json'),JSON.stringify({checks,errors,layouts,limitation:'Chrome virtual media devices, actual local model workers and touch/key events, emulated viewport dimensions. Physical phones, notches and mobile Safari remain untested.'},null,2));
    await send('Page.close').catch(()=>{});ws.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
