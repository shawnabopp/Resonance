// Real local ml5 inference on an official photo + explicitly injected keypoint cases.
// No physical webcam movements, phone hardware or human pose accuracy claim.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { shapeFixture } = require('./qa-hand-shapes.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const checks = [], errors = [], snapshots = {};
  const tab = await (await fetch('http://127.0.0.1:9227/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', ({ data }) => { const d = JSON.parse(data); if (d.id) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(d.error) : p.resolve(d.result); }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params); });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id:n, method, params })); });
  const run = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true, userGesture:true }); assert(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const click = selector => run(`document.querySelector(${JSON.stringify(selector)}).click()`), snap = () => run('resonanceDemo.snapshot()');
  const wait = async (predicate, timeout = 15000) => { const start = Date.now(); while (Date.now() - start < timeout) { if (await predicate()) return; await sleep(80); } throw Error('Timeout ' + JSON.stringify(await snap())); };
  const shot = async name => { const image = await send('Page.captureScreenshot', { format:'png' }); fs.writeFileSync(path.join(__dirname, 'qa', name + '.png'), Buffer.from(image.data, 'base64')); };
  const pass = message => { checks.push(message); console.log('PASS ' + message); };
  try {
    await send('Runtime.enable'); await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__shapeFixture=${shapeFixture.toString()};window.__mode='native';window.__gesture='open';window.__wiggle=false;window.__x=.5;window.__roll=0;window.__calls=0;window.__streams=[];
      const media=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async o=>{__calls++;const stream=await media(o);__streams.push(stream);return stream;};
      const NativeWorker=Worker;window.Worker=class extends NativeWorker{
        postMessage(data,...rest){if(data.type==='hand-frame'&&__mode==='photo'){data.image.close();createImageBitmap(__photo).then(image=>super.postMessage({...data,image,width:320,height:Math.round(320*image.height/image.width)},[image]));return;}super.postMessage(data,...rest);}
        set onmessage(fn){super.onmessage=e=>{if(e.data.type!=='hand-result'||['native','photo'].includes(__mode)){fn(e);return;}
          const {width,height,time}=e.data;fn({data:{...e.data,hands:__mode==='absent'?[]:__shapeFixture(__gesture,{width,height,x:__x,roll:__roll,finger:1,wiggle:__wiggle?Math.sin(time/180)*.30:0})}});};}
      };
    ` });
    await send('Emulation.setDeviceMetricsOverride', { width:1440, height:900, deviceScaleFactor:1, mobile:false });
    await send('Page.navigate', { url:'http://127.0.0.1:4173/' }); await wait(() => run('!!window.resonanceDemo'));
    await click('#meet'); await click('#start'); await wait(async () => (await snap()).live.hands.frames >= 3, 75000); await click('#mute');
    await run('window.__photo=new Image();__photo.src="qa/fixtures/hands.jpg";__photo.decode().then(()=>{__mode="photo"})');
    await wait(async () => (await snap()).handShape.gesture === 'open', 30000); await sleep(1500);
    snapshots.photo = await snap(); assert(snapshots.photo.handShape.blend > .35 && snapshots.photo.handShape.blend < .49); await shot('hand-shape-photo');
    pass('Actual pinned ml5 detector + landmark model on the official open-hand photo confirms the new open-palm route (image-based only)');
    await run('__mode="synthetic"'); await wait(async () => (await snap()).signals.handPresent); await sleep(1600);
    const retreatBefore = (await snap()).events.retreat;
    for (const gesture of ['open','fist','v','point']) {
      await run(`__gesture=${JSON.stringify(gesture)}`);
      if (gesture !== 'open') { await sleep(220); assert.notEqual((await snap()).handShape.gesture, gesture); }
      await wait(async () => (await snap()).handShape.gesture === gesture); await sleep(1400);
      snapshots[gesture] = await snap(); assert(snapshots[gesture].handShape.blend > .35 && snapshots[gesture].handShape.blend < .49);
      assert(snapshots[gesture].handShape.driftingParticles > snapshots[gesture].handShape.contourParticles * 2);
      const [a,b,c,d] = snapshots[gesture].bounds, [w,h] = snapshots[gesture].viewport;
      assert(a >= 0 && b >= 0 && c <= w && d <= h); await shot('hand-shape-' + gesture);
    }
    assert.equal((await snap()).events.retreat, retreatBefore);
    pass('Synthetic open/fist/V/point transitions retain broad clouds: a weakly attracted minority, a freely drifting majority, and bounded positions without a startle');
    await run('__gesture="open"'); await wait(async () => (await snap()).handShape.gesture === 'open'); await sleep(1200);
    await run('__wiggle=true'); let peak = 0, energy = 0, speed = 0;
    for (let i = 0; i < 14; i++) { await sleep(150); const s = await snap(); peak = Math.max(peak, s.handShape.rippleMaxPx); energy = Math.max(energy, s.handShape.energy[1]); speed = Math.max(speed, s.signals.handSpeed); }
    snapshots.fingers = await snap(); assert(peak > 2); assert(energy > .2); assert(speed < 1e-6);
    assert.equal(snapshots.fingers.events.retreat, retreatBefore); await shot('hand-shape-finger-ripples');
    pass('Only the index moves: rendered local ripple displacement exceeds 2 px, palm speed stays zero, and no retreat is triggered');
    await run('__wiggle=false'); await sleep(2300); assert((await snap()).handShape.rippleMaxPx < peak * .1);
    const ticks = await run('new Promise(resolve=>{let n=0;const start=performance.now();function frame(t){n++;if(t-start>1500)resolve(n);else requestAnimationFrame(frame)}requestAnimationFrame(frame)})');
    assert(ticks > 30); snapshots.animationFramesIn1500ms = ticks;
    for (const [width,height] of [[390,844],[320,720],[844,390]]) {
      await send('Emulation.setDeviceMetricsOverride', { width,height,deviceScaleFactor:1,mobile:true });
      await run('__gesture="v";__roll=.25'); await wait(async () => (await snap()).handShape.gesture === 'v'); await sleep(1200);
      assert(await run('document.documentElement.scrollWidth<=innerWidth'));
      const s = await snap(), [a,b,c,d] = s.bounds, [w,h] = s.viewport; assert(a >= 0 && b >= 0 && c <= w && d <= h);
      await shot('hand-shape-' + width);
      if (width === 390) for (const gesture of ['open','fist','point']) {
        await run(`__gesture=${JSON.stringify(gesture)}`); await wait(async () => (await snap()).handShape.gesture === gesture); await sleep(900);
        const s = await snap(), [a,b,c,d] = s.bounds, [w,h] = s.viewport; assert(a >= 0 && b >= 0 && c <= w && d <= h);
        await shot('hand-shape-390-' + gesture);
      }
    }
    pass('Ripple input settles smoothly; animation continues with all real workers; 320/390 px portrait and landscape remain within bounds');
    await click('[data-dialog="shape-dialog"]'); await click('#shape-dialog [data-shape="cloud"]'); await click('#shape-dialog .close');
    await run('__mode="absent"'); await wait(async () => !(await snap()).signals.handPresent);
    const loss = await snap(); assert(loss.handShape.blend > .1); assert.equal(loss.signals.handPose, null);
    await sleep(5500); snapshots.loss = await snap(); assert(snapshots.loss.handShape.blend < .003); assert.equal(snapshots.loss.shape, 'cloud');
    await shot('hand-shape-loss');
    await run('__mode="synthetic";__gesture="point"'); await wait(async () => (await snap()).handShape.gesture === 'point');
    await click('#toggle-preview'); const count = (await snap()).live.hands.frames; await sleep(700); assert((await snap()).live.hands.frames > count);
    assert.equal(await run('__calls'), 1); await click('#home');
    assert(await run('__streams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))')); assert.equal((await snap()).signals.handPose, null);
    assert.equal(errors.length, 0); pass('Loss gradually restores the selected base, reacquisition works, hiding preview keeps tracking, and Home cleans the single camera stream');
  } finally {
    await run('dispatchEvent(new PageTransitionEvent("pagehide"))').catch(() => {});
    fs.writeFileSync(path.join(__dirname, 'qa/hand-shapes-browser-report.json'), JSON.stringify({ checks, errors, snapshots,
      limitation:'Chrome fake camera/microphone; actual ml5 inference on an official photo, synthetic landmark sequences for articulation and other poses. No human webcam or physical phone validation.' }, null, 2));
    await send('Page.close').catch(() => {}); ws.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
