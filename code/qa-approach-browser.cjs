// Real local models + fake camera, injected geometry and a cropped/zoomed QA photo.
// Not physical-camera motion, human recognition accuracy or listening validation.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { fixture } = require('./qa-hands-filter.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  const checks = [], errors = [];
  const tab = await (await fetch('http://127.0.0.1:9227/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', ({ data }) => { const d = JSON.parse(data); if (d.id) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(d.error) : p.resolve(d.result); } if (d.method === 'Runtime.exceptionThrown') errors.push(d.params); });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
  const run = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }); assert(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const click = selector => run(`document.querySelector(${JSON.stringify(selector)}).click()`), snap = () => run('resonanceDemo.snapshot()');
  const wait = async (fn, ms = 15000) => { const start = Date.now(); while (Date.now() - start < ms) { if (await fn()) return; await sleep(65); } throw Error('Timed out ' + JSON.stringify(await snap())); };
  const pass = message => { checks.push(message); console.log('PASS ' + message); };
  const shot = async name => { const data = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(__dirname, 'qa', name + '.png'), Buffer.from(data.data, 'base64')); };
  let peak;
  try {
    await send('Runtime.enable'); await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__mode='synthetic';window.__calls=0;window.__streams=[];window.__ramps={};window.__sizes={face:1,hand:1};window.__face=true;window.__hand=false;window.__surprise=false;window.__realSamples=[];
      window.__fixture=${fixture.toString()};
      window.__scale=(kind,time)=>{const r=__ramps[kind];return r?Math.exp(Math.max(0,Math.min(r.duration,(time-r.start)/1000))*r.rate):__sizes[kind];};
      const media=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async options=>{__calls++;const s=await media(options);__streams.push(s);return s;};
      const NativeWorker=Worker;window.Worker=class extends NativeWorker{
        postMessage(data,...rest){
          if(data.type==='frame'&&__mode==='photo'){
            data.image.close();const scale=__scale('face',data.time),c=new OffscreenCanvas(320,240),ctx=c.getContext('2d'),w=360/scale,h=270/scale;
            ctx.drawImage(__photo,480-w/2,280-h/2,w,h,0,0,320,240);
            createImageBitmap(c).then(image=>super.postMessage({...data,image},[image]));return;
          }
          super.postMessage(data,...rest);
        }
        set onmessage(fn){super.onmessage=e=>{
          if(e.data.type==='result'&&'categories'in e.data){
            if(__mode==='photo'){if(e.data.face?.approach)__realSamples.push(e.data.face.approach);fn(e);return;}
            const scale=__scale('face',e.data.time);
            fn({data:{...e.data,categories:__surprise?[{categoryName:'browOuterUpLeft',score:.9},{categoryName:'browOuterUpRight',score:.9},{categoryName:'eyeWideLeft',score:.8},{categoryName:'eyeWideRight',score:.8},{categoryName:'jawOpen',score:.5}]:[{categoryName:'jawOpen',score:0}],
              face:__face?{x:.72,y:.5,approach:{width:.15*scale,height:.2*scale,x:.5,y:.5,frameAspect:4/3,identity:'face'}}:null}});return;
          }
          if(e.data.type==='hand-result'){
            const w=e.data.width,h=e.data.height,scale=__scale('hand',e.data.time)*.65,hands=__hand?__fixture(.5,true,w,h):[];
            if(hands[0])hands[0].keypoints=hands[0].keypoints.map(p=>({x:(p.x-w*.5)*scale+w*.5,y:(p.y-h*.5)*scale+h*.5}));
            fn({data:{...e.data,hands}});return;
          }
          fn(e);
        };}
      };
    ` });
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'http://127.0.0.1:4173/' }); await wait(() => run('!!window.resonanceDemo'));
    await click('#meet'); await click('#start'); await wait(async () => (await snap()).stage === 'live', 75000); await click('#mute');
    await wait(async () => (await snap()).live.hands.state === 'ready', 75000);
    await wait(async () => (await snap()).live.approach.face.armed);
    await run('__ramps.face={start:performance.now(),duration:1.5,rate:.15}'); await sleep(1800);
    assert.equal((await snap()).events.depth, 0); assert.equal((await snap()).playback.counts.afraid, 0);
    await run('delete __ramps.face;__sizes.face=1'); await sleep(1300);
    const before = await snap();
    await run('__ramps.face={start:performance.now(),duration:.7,rate:1.25}');
    await wait(async () => (await snap()).events.depth === 1); await wait(async () => (await snap()).playback.counts.afraid === 1);
    await sleep(320); peak = await snap();
    assert.equal(peak.depthSource, 'face'); assert(peak.depth > .6); assert(peak.scale < before.scale * .9);
    assert(peak.expansion < before.expansion - .07); assert(peak.bounds[2] - peak.bounds[0] < (before.bounds[2] - before.bounds[0]) * .85);
    assert(peak.bounds[2] - peak.bounds[0] > peak.radius * .5); assert.equal(peak.events.surprise, 0);
    assert(peak.color[1] > peak.color[2]); assert.equal(peak.playback.history.at(-1).duration, .499);
    assert.equal(peak.playback.history.at(-1).reason, 'sudden approach');
    await shot('approach-depth');
    pass('Injected slow face growth does not trigger; fast growth plays the approved 0.499 s Afraid once and visibly shrinks/gathers without purple or disappearance');
    await run('__hand=true'); await sleep(1000); await run('__ramps.hand={start:performance.now(),duration:1.1,rate:1}');
    await sleep(1300); assert.equal((await snap()).events.depth, 1); assert.equal((await snap()).playback.counts.afraid, 1);
    await sleep(2500); assert((await snap()).scale > peak.scale + .1);
    await run('__face=false;delete __ramps.face;__sizes.face=2'); await sleep(400); await run('__face=true'); await sleep(1000);
    assert.equal((await snap()).events.depth, 1);
    await run('delete __ramps.hand;__sizes.hand=1'); await sleep(1500);
    await wait(async () => (await snap()).live.approach.hand.armed);
    await run('__ramps.hand={start:performance.now(),duration:1.1,rate:1}');
    await wait(async () => (await snap()).events.depth === 2); await wait(async () => (await snap()).playback.counts.afraid === 2);
    assert.equal((await snap()).depthSource, 'hand');
    pass('Face/hand events share the startle guard; recovery never creates an approach; a later steady-then-fast palm approach triggers once');
    await sleep(4000); await run('__surprise=true'); await wait(async () => (await snap()).signals.surprise > .7); await sleep(900);
    const surprise = await snap(); assert(surprise.color[2] > surprise.color[1] + 30); assert.equal(surprise.playback.counts.afraid, 2);
    assert.equal(surprise.events.depth, 2); pass('Purple facial Surprise remains independent of the depth-startle event and Afraid sound');
    // Real Face Landmarker inference on a zoomed local photo, no injected face spans.
    await run('window.__photo=new Image();__photo.src="qa/fixtures/pose.jpg";__photo.decode()');
    await run('__mode="photo";__surprise=false;__sizes.face=1;delete __ramps.face;__hand=false');
    // This fixture is a side profile. Do not relabel a detection failure as a
    // successful real-face zoom test or change production thresholds to pass it.
    await sleep(3500);
    const realBefore = (await snap()).events.depth;
    if ((await snap()).live.approach.face.armed) {
      await run('__ramps.face={start:performance.now(),duration:.7,rate:1.2}');
      await wait(async () => (await snap()).events.depth > realBefore, 15000);
      assert(await run('__realSamples.length>=4'));
      pass('Actual local Face Landmarker spans from a zoomed QA photo trigger; this remains image-based, not physical-camera validation');
    } else {
      assert.equal((await snap()).events.depth, realBefore);
      pass('Side-profile QA photo did not acquire stable face geometry; it correctly creates no startle, and does NOT validate a real-face zoom');
    }
    assert.equal(await run('__calls'), 1);
    for (const [width, height] of [[390,844],[844,390]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      await run('document.querySelector("#approach-debug").open=true;document.querySelector("#approach-debug").scrollIntoView({block:"center"})'); await sleep(250);
      assert(await run('document.documentElement.scrollWidth<=innerWidth')); if (width === 390) await shot('approach-mobile');
    }
    await click('#home'); assert.equal((await snap()).live.tracks.length, 0); assert.equal((await snap()).live.approach.face.count, 0);
    assert.equal((await snap()).live.approach.hand.count, 0); assert(await run('__streams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))'));
    await click('#meet'); await click('#try-demo'); await wait(async () => (await snap()).playback.counts.wake === 1);
    await click('#approach'); await wait(async () => (await snap()).playback.counts.afraid === 1 && (await snap()).depth > .05); assert.equal((await snap()).depthSource, 'Demo');
    await click('#approach'); await sleep(350); assert.equal((await snap()).playback.counts.afraid, 1);
    assert.equal(errors.length, 0); pass('One shared camera, mobile/landscape diagnostics, Home cleanup and explicit Demo approach work without uncaught errors');
  } finally {
    await run('dispatchEvent(new PageTransitionEvent("pagehide"))').catch(() => {});
    fs.writeFileSync(path.join(__dirname, 'qa/approach-browser-report.json'), JSON.stringify({ checks, errors, peak,
      limitation: 'Chrome fake devices, injected geometric sequences, and actual Face Landmarker on a zoomed local QA photo. No physical webcam/phone approach or human listening test.' }, null, 2));
    await send('Page.close').catch(() => {}); ws.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
