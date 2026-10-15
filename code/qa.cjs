// Browser acceptance checks using the local Chrome DevTools endpoint, no dependencies.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const tab = await (await fetch('http://127.0.0.1:9227/json/new?http://127.0.0.1:4173', { method: 'PUT' })).json();
  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map(), errors = [], network = [];
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.id) { const request = pending.get(data.id); pending.delete(data.id); if (data.error) request.reject(data.error); else request.resolve(data.result); }
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails);
    if (data.method === 'Network.requestWillBeSent') network.push(data.params.request.url);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, { resolve, reject }); socket.send(JSON.stringify({ id: requestId, method, params })); });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const range = (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${value};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const snapshot = () => evaluate('window.resonanceDemo.snapshot()');
  const out = path.join(__dirname, 'qa'); fs.mkdirSync(out, { recursive: true });
  const shot = async name => { const result = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(result.data, 'base64')); };
  const report = { tests: [], errors, snapshots: {}, network };
  const passed = message => { report.tests.push(message); console.log('PASS ' + message); };
  try {
    await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.reload'); await sleep(2200);
    assert.equal(await evaluate('document.querySelector("h1").textContent'), 'RESONANCE');
    assert.equal(await evaluate('getComputedStyle(document.querySelector("h1")).fontWeight'), '100');
    report.font = await evaluate('document.fonts.check("100 80px Outfit")');
    await shot('desktop-home');
    await click('#meet'); await sleep(500);
    assert.equal(await evaluate('document.querySelector("#home").hidden'), false);
    assert.equal(await evaluate('document.querySelectorAll("#prep [data-theme]").length'), 8);
    await shot('desktop-prepare'); await click('#try-demo'); await sleep(1600);
    const neutral = await snapshot(); report.snapshots.neutral = neutral; await shot('desktop-neutral');
    assert(neutral.familiarity < .041);
    passed('Home → preparation → Demo; eight original themes; Outfit weight 100');
    await click('[data-expression="smile"]'); await sleep(2200);
    const smile = await snapshot(); report.snapshots.smile = smile; await shot('desktop-smile');
    assert(smile.color[0] > 240 && smile.color[2] < 145); assert(smile.expansion > neutral.expansion + .15); assert(smile.center[1] < neutral.center[1] - 10); assert(smile.speed > neutral.speed);
    passed('Smile: warm yellow, expanded, upward approach and faster rhythm');
    await click('[data-expression="sad"]'); await sleep(2500);
    const sad = await snapshot(); report.snapshots.sad = sad; await shot('desktop-sad');
    assert(sad.color[2] > 240 && sad.color[0] < 150); assert(sad.expansion < .85); assert(sad.speed < .5); assert(sad.center[1] > neutral.center[1] + 15);
    passed('Sad: blue, slower, gathers and sinks');
    await click('#reset'); await sleep(1800); await click('[data-expression="surprise"]'); await sleep(650);
    const surprised = await snapshot(); await shot('desktop-surprise'); await sleep(3500); const recovered = await snapshot();
    assert(surprised.expansion > recovered.expansion + .2); assert(recovered.surprise === 0); assert(recovered.color[2] > 240 && recovered.color[0] > 185);
    passed('Surprise: one outward pulse, automatic recovery, purple tint remains');
    await click('#reset'); await range('#sound', .3); await sleep(800); const quiet = await snapshot();
    await range('#sound', .95); await sleep(800); const loud = await snapshot(); assert(loud.level > quiet.level + .5);
    await click('#sustain'); const levels = []; for (let i = 0; i < 5; i++) { await sleep(200); levels.push((await snapshot()).level); }
    assert(Math.max(...levels) - Math.min(...levels) > .08);
    await click('#clap'); await sleep(350); const clap = await snapshot(); await shot('desktop-clap'); await sleep(4200);
    assert(clap.clap > .7); assert.equal((await snapshot()).clap, 0);
    await click('#mute'); await sleep(1000); assert((await snapshot()).level < .01);
    passed('Sound: amplitude response, continuous modulation, single clap and recovery, mute');
    await click('#reset');
    const beforeOnset = (await snapshot()).events.clap;
    await evaluate('document.querySelector("#sound").dispatchEvent(new PointerEvent("pointerdown"))');
    for (const value of [.2, .4, .6, .8, 1]) { await range('#sound', value); await sleep(30); }
    await sleep(400); assert.equal((await snapshot()).events.clap, beforeOnset + 1);
    passed('Rapid multi-event slider rise triggers exactly one loud onset');
    await click('#reset'); await range('#openness', 1); await sleep(1200); const open = await snapshot();
    await range('#openness', 0); await sleep(1200); const closed = await snapshot(); assert(open.expansion - closed.expansion > .6);
    await range('#openness', .5);
    const rect = await evaluate('(()=>{const r=document.querySelector("#creature").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()');
    for (let i = 0; i < 22; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x + rect.w * (.5 + i * .012), y: rect.y + rect.h * .5 }); await sleep(65); }
    await sleep(1000); const following = await snapshot(); assert(following.center[0] > following.viewport[0] / 2 + 30);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x + rect.w * .75, y: rect.y + rect.h * .5 }); await sleep(20);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x + rect.w * .1, y: rect.y + rect.h * .2 }); await sleep(350);
    assert((await snapshot()).retreat > .4); await sleep(3000); assert.equal((await snapshot()).retreat, 0);
    passed('Hand: open/close, actual pointer slow follow and fast retreat/recovery');
    await click('#reset'); await range('#body', .25); await sleep(1000); const lowA = await snapshot(); await sleep(500); const lowB = await snapshot();
    await range('#body', 1); await sleep(1200); const highA = await snapshot(); await sleep(500); const highB = await snapshot();
    assert(highB.rotation - highA.rotation > (lowB.rotation - lowA.rotation) * 1.5);
    passed('Body: stronger input increases rotation speed and whole-creature sway');
    await click('[data-expression="smile"]'); await range('#sound', 1); await range('#openness', 1); await click('#clap'); await sleep(400);
    const combined = await snapshot(); report.snapshots.combined = combined; await shot('desktop-combined');
    assert(combined.color[0] > combined.color[2]); assert(combined.level > .8);
    assert(combined.bounds[0] >= 0 && combined.bounds[1] >= 0 && combined.bounds[2] <= combined.viewport[0] && combined.bounds[3] <= combined.viewport[1]);
    passed('Combined maximum inputs remain inside canvas with simultaneous color and motion');
    await click('#reset'); await click('[data-expression="smile"]'); await range('#sound', .25); await range('#openness', .65);
    const beforeBond = await snapshot(); await sleep(18000); const afterBond = await snapshot();
    assert(afterBond.familiarity > beforeBond.familiarity + .3);
    report.snapshots.familiar = afterBond; passed('18 seconds of gentle combined input increases familiarity by over 30 percentage points');
    await click('[data-dialog="shape-dialog"]'); await click('#shape-dialog [data-shape="cloud"]'); await sleep(1800); assert.equal((await snapshot()).shape, 'cloud'); await shot('desktop-cloud-dialog'); await click('#shape-dialog .close');
    await click('[data-dialog="shape-dialog"]'); await click('#shape-dialog [data-shape="bloom"]'); await sleep(1800); await click('#shape-dialog .close'); await shot('desktop-bloom');
    await click('[data-dialog="theme-dialog"]'); for (let i = 0; i < 8; i++) { await click(`#theme-dialog [data-theme="${i}"]`); assert.equal(await evaluate(`document.querySelector('#theme-dialog [data-theme="${i}"]').getAttribute('aria-pressed')`), 'true'); }
    await click('#theme-dialog .close'); await click('[data-dialog="help-dialog"]'); await click('#restart'); await sleep(200); assert((await snapshot()).familiarity < .05);
    passed('Three shapes, all eight themes, dialogs and familiarity reset');
    await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: out });
    await click('#capture'); await sleep(700);
    const captures = fs.readdirSync(out).filter(name => /^resonance-.*\.png$/.test(name));
    assert(captures.length > 0); assert(fs.statSync(path.join(out, captures.at(-1))).size > 1000);
    passed('Capture downloads a nonempty PNG');
    await click('[data-dialog="shape-dialog"]'); await click('#shape-dialog [data-shape="seed"]'); await click('#shape-dialog .close');
    await click('[data-dialog="theme-dialog"]'); await click('#theme-dialog [data-theme="2"]'); await click('#theme-dialog .close');
    await click('#home');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true }); await sleep(700); await shot('mobile-home');
    await click('#meet'); await sleep(500); await shot('mobile-prepare'); await click('#try-demo'); await sleep(700); await shot('mobile-demo');
    assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
    await click('#hand');
    const mobileRect = await evaluate('(()=>{const r=document.querySelector("#creature").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()');
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mobileRect.w * .5, y: mobileRect.y + mobileRect.h * .5 }] });
    for (let i = 0; i < 12; i++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: mobileRect.w * (.5 + i * .02), y: mobileRect.y + mobileRect.h * .5 }] }); await sleep(100); }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(800); assert((await snapshot()).center[0] > mobileRect.w * .53);
    await click('[data-expression="smile"]'); await range('#sound', 1); await range('#openness', 1); await range('#body', 1); await click('#clap'); await sleep(400);
    const mobileMax = await snapshot(); assert(mobileMax.bounds[0] >= 0 && mobileMax.bounds[1] >= 0 && mobileMax.bounds[2] <= mobileMax.viewport[0] && mobileMax.bounds[3] <= mobileMax.viewport[1]); await shot('mobile-combined');
    await click('#reset');
    await evaluate('document.querySelector("#demo-controls").scrollTop=480'); await sleep(400); await shot('mobile-controls-scroll');
    assert(await evaluate('document.querySelector("#creature").getBoundingClientRect().bottom > 100'));
    await click('[data-dialog="help-dialog"]'); await sleep(300); await shot('mobile-help');
    assert(await evaluate('document.querySelector("#help-dialog .dialog-home").getBoundingClientRect().top >= 0'));
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    assert.equal(await evaluate('document.querySelectorAll("dialog[open]").length'), 0);
    for (const [width, height] of [[320, 568], [375, 667], [768, 1024], [844, 390]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 }); await sleep(300);
      assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `overflow at ${width}`);
      if (width === 320) { await evaluate('window.scrollTo(0,0)'); await shot('mobile-320'); }
    }
    passed('Mobile 320/375/390, tablet 768 and landscape 844: no horizontal overflow; touch follow, sticky canvas, Help and Escape');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await click('#home'); await click('#meet'); await click('#try-demo'); await range('#body', 1); await sleep(1000); assert((await snapshot()).bounds.every(Number.isFinite));
    passed('Reduced-motion mode remains functional');
    report.frameTiming = await evaluate('new Promise(resolve=>{const times=[];let previous=performance.now();function measure(now){times.push(now-previous);previous=now;if(times.length<60)requestAnimationFrame(measure);else resolve({averageMs:times.reduce((a,b)=>a+b,0)/times.length,maxMs:Math.max(...times)});}requestAnimationFrame(measure);})');
    assert.equal(errors.length, 0); assert(!network.some(url => /mediapipe|elevenlabs|face_landmarker|hand_landmarker/.test(url)));
    passed('No JavaScript exceptions; no tracking model or ElevenLabs requests');
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    socket.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
