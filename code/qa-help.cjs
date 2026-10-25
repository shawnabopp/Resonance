// Browser UI/lifecycle verification with actual local models and fake media devices.
// Desktop/mobile viewport emulation is not physical phone or screen-reader testing.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const checks = [], errors = [], samples = {};
  const tab = await (await fetch('http://127.0.0.1:9227/json/new?about:blank', { method:'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(resolve => ws.addEventListener('open', resolve, { once:true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', ({ data }) => { const d = JSON.parse(data); if (d.id) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(d.error) : p.resolve(d.result); }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params); });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve,reject }); ws.send(JSON.stringify({ id:n,method,params })); });
  const run = async expression => { const r = await send('Runtime.evaluate', { expression,returnByValue:true,awaitPromise:true,userGesture:true }); assert(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const click = selector => run(`document.querySelector(${JSON.stringify(selector)}).click()`), snap = () => run('resonanceDemo.snapshot()');
  const wait = async (predicate, timeout = 15000) => { const start = Date.now(); while (Date.now() - start < timeout) { if (await predicate()) return; await sleep(70); } throw Error('Timeout: ' + JSON.stringify(await snap())); };
  const key = async (key, code = key, modifiers = 0) => { await send('Input.dispatchKeyEvent', { type:'keyDown',key,code,modifiers,windowsVirtualKeyCode:key === 'Tab' ? 9 : 27 }); await send('Input.dispatchKeyEvent', { type:'keyUp',key,code,modifiers,windowsVirtualKeyCode:key === 'Tab' ? 9 : 27 }); };
  const rect = selector => run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}})()`);
  const shot = async name => { const image = await send('Page.captureScreenshot', { format:'png' }); fs.writeFileSync(path.join(__dirname,'qa',name + '.png'), Buffer.from(image.data,'base64')); };
  const pass = message => { checks.push(message); console.log('PASS ' + message); };
  const open = () => run('document.querySelector("#help-dialog").open');
  try {
    await send('Runtime.enable'); await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source:`
      window.__helpQA={streams:[],music:[]};
      const media=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async o=>{const s=await media(o);__helpQA.streams.push(s);return s;};
      const create=AudioContext.prototype.createMediaElementSource;AudioContext.prototype.createMediaElementSource=function(element){__helpQA.music.push(element);return create.call(this,element);};
    ` });
    await send('Emulation.setDeviceMetricsOverride', { width:1440,height:900,deviceScaleFactor:1,mobile:false });
    await send('Page.navigate', { url:'http://127.0.0.1:4173/' }); await wait(() => run('!!window.resonanceDemo'));
    if (!(await snap()).playback.musicEnabled) await click('#site-music [data-music]');
    assert.equal(await run('document.querySelectorAll("[data-dialog=help-dialog]").length'), 1);
    await click('#meet'); await click('#try-demo'); await click('#help-button'); assert(await open());
    assert.match(await run('document.querySelector("#help-mode").textContent'), /SIMULATED/);
    assert.match(await run('document.querySelector("[data-help=voice]").textContent'), /Demo sound controls/);
    assert(await run('document.querySelector("#help-nudge").hidden'));
    await click('#help-dialog .close'); await wait(() => run('document.activeElement.id==="help-button"'));
    await click('#home'); await click('#meet'); await click('#start');
    await wait(async () => (await snap()).stage === 'live', 75000);
    await wait(() => run('!document.querySelector("#help-nudge").hidden')); await shot('help-first-live-hint');
    const hint = await rect('#help-nudge'), button = await rect('#help-button'); assert(hint.bottom < button.y); assert(hint.x >= 0 && hint.right <= 1440);
    await click('#help-button'); assert(await run('document.querySelector("#help-nudge").hidden'));
    assert.equal(await run('document.querySelector("#help-title").textContent'), 'How to interact');
    assert.equal(await run('document.querySelectorAll("#help-dialog .help-list li").length'), 5);
    assert.match(await run('document.querySelector("[data-help=hands]").textContent'), /wiggle your fingers/);
    assert(!/Move closer|Sudden approach/i.test(await run('document.querySelector("#help-dialog").textContent')));
    assert(await run('document.activeElement===document.querySelector("#help-dialog .close")'));
    assert.equal(await run('document.querySelector("#help-button").getAttribute("aria-expanded")'), 'true');
    pass('One existing Help entry shows five Live tips, honest Demo controls, and a once-per-session Live hint that disappears on opening');
    await wait(async () => (await snap()).live.hands.frames >= 2, 75000); await wait(async () => (await snap()).playback.musicPlaying);
    const before = await snap(), music = await run('__helpQA.music[0].currentTime');
    await sleep(1500); const after = await snap(); samples.continuity = { before,after };
    assert(after.live.frames > before.live.frames); assert(after.live.hands.frames > before.live.hands.frames);
    assert.notEqual(after.rotation, before.rotation); assert.equal(after.playback.musicTracks, 1); assert.equal(after.playback.context,'running');
    assert.equal(await run('__helpQA.streams.length'), 1); assert.equal(await run('__helpQA.music.length'), 1);
    assert(await run(`((__helpQA.music[0].currentTime-${music}+__helpQA.music[0].duration)%__helpQA.music[0].duration)>.5`));
    const desktop = await rect('#help-dialog'); assert(desktop.width <= 380 && desktop.x >= 16 && desktop.y >= 16 && desktop.bottom < button.y);
    await shot('help-desktop');
    await run('document.querySelector("#restart").focus()'); await key('Tab');
    assert(await run('document.activeElement===document.querySelector("#help-dialog .dialog-home")'));
    await key('Tab','Tab',8); assert.equal(await run('document.activeElement.id'), 'restart');
    for (let i = 0; i < 7; i++) { await key('Tab'); assert(await run('document.querySelector("#help-dialog").contains(document.activeElement)')); }
    await key('Escape'); await wait(async () => !await open()); assert.equal(await run('document.activeElement.id'),'help-button');
    await click('#help-button'); await send('Input.dispatchMouseEvent', { type:'mousePressed',x:8,y:8,button:'left',clickCount:1 });
    await send('Input.dispatchMouseEvent', { type:'mouseReleased',x:8,y:8,button:'left',clickCount:1 }); await wait(async () => !await open());
    assert.equal(await run('document.activeElement.id'),'help-button');
    pass('Desktop popover anchors above Help; focus enters and stays inside, Esc/outside click restore focus, while particles, models and the same music track continue');
    await click('#home'); await click('#meet'); await click('#start'); await wait(async () => (await snap()).stage === 'live',75000);
    assert(await run('document.querySelector("#help-nudge").hidden'));
    for (const [width,height] of [[390,844],[320,568],[844,390]]) {
      await send('Emulation.setDeviceMetricsOverride', { width,height,deviceScaleFactor:1,mobile:true });
      await send('Emulation.setTouchEmulationEnabled', { enabled:true }); await click('#help-button'); await sleep(250);
      const sheet = await rect('#help-dialog'); assert(sheet.x >= -.5 && sheet.right <= width + .5 && Math.abs(sheet.bottom - height) < 2);
      assert(await run('document.documentElement.scrollWidth<=innerWidth'));
      const area = await rect('.help-scroll');
      await send('Input.dispatchMouseEvent', { type:'mouseWheel',x:area.x + area.width / 2,y:area.y + area.height / 2,deltaX:0,deltaY:800 }); await sleep(300);
      if (height <= 568) assert(await run('document.querySelector(".help-scroll").scrollTop>0'));
      const close = await rect('#help-dialog .close'), restart = await rect('#restart'); assert(close.height >= 44 && restart.height >= 44 && restart.bottom <= height);
      await shot('help-sheet-' + width);
      await send('Input.dispatchTouchEvent', { type:'touchStart',touchPoints:[{ x:close.x + close.width / 2,y:close.y + close.height / 2 }] });
      await send('Input.dispatchTouchEvent', { type:'touchEnd',touchPoints:[] }); await wait(async () => !await open());
      if (width === 390) {
        await click('#help-button');
        await send('Input.dispatchTouchEvent', { type:'touchStart',touchPoints:[{ x:8,y:8 }] });
        await send('Input.dispatchTouchEvent', { type:'touchEnd',touchPoints:[] }); await wait(async () => !await open());
        assert.equal(await run('document.activeElement.id'),'help-button');
      }
      assert.equal((await snap()).stage,'live'); assert((await snap()).playback.musicPlaying);
    }
    pass('Phone-sized portrait/landscape sheets sit at the bottom, scroll internally, keep 44 px close/reset targets, and close by touch without ending Live or Music');
    await send('Page.reload'); await wait(() => run('!!window.resonanceDemo')); await click('#meet'); await click('#start');
    await wait(async () => (await snap()).stage === 'live',75000); assert(await run('document.querySelector("#help-nudge").hidden'));
    pass('The hint stays dismissed across Home, reentry and reload in the same browser session');
    // A fresh diagnostic session exercises automatic expiry without opening Help.
    await click('#home'); await run('sessionStorage.removeItem("resonance.helpHintSeen")'); await send('Page.reload'); await wait(() => run('!!window.resonanceDemo'));
    await click('#meet'); await click('#start'); await wait(async () => (await snap()).stage === 'live',75000);
    await wait(() => run('!document.querySelector("#help-nudge").hidden')); const started = await run('performance.now()');
    await sleep(5400); assert(await run('!document.querySelector("#help-nudge").hidden'));
    await wait(() => run('document.querySelector("#help-nudge").hidden')); samples.hintVisibleMs = (await run('performance.now()')) - started;
    assert(samples.hintVisibleMs >= 5700 && samples.hintVisibleMs < 6900); assert.equal(errors.length,0);
    pass('In a fresh session the untouched hint expires after about 6 seconds');
  } finally {
    await run('dispatchEvent(new PageTransitionEvent("pagehide"))').catch(() => {});
    fs.writeFileSync(path.join(__dirname,'qa/help-report.json'), JSON.stringify({ checks,errors,samples,
      limitation:'Chrome virtual media devices, actual local inference tasks, keyboard/mouse/touch events and emulated mobile viewports. No physical phone or assistive-technology test.' },null,2));
    await send('Page.close').catch(() => {}); ws.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
