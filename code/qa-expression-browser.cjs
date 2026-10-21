// Real local models + fake media. Face scores below are explicitly SYNTHETIC.
// This tests wiring and UI, never recognition accuracy on a human face.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const neutral = { browInnerUp: .035, mouthFrownLeft: .025, mouthFrownRight: .03, mouthSmileLeft: .05, mouthSmileRight: .04, browOuterUpLeft: .04, browOuterUpRight: .04, eyeWideLeft: .03, eyeWideRight: .03, jawOpen: .04, browDownLeft: .025, browDownRight: .025 };
const sad = { ...neutral, mouthFrownLeft: .2, mouthFrownRight: .16, browInnerUp: .23 };
const screenshotFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'qa/fixtures/expression-screenshots.json'), 'utf8'));
const screenshot = Object.fromEntries(Object.entries(screenshotFixture.frames).map(([key, values]) => [key, Object.fromEntries(screenshotFixture.names.map((name, i) => [name, values[i]]))]));
async function main() {
  const tab = await (await fetch('http://127.0.0.1:9227/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map(), errors = [], checks = [];
  ws.addEventListener('message', ({ data }) => { const d = JSON.parse(data); if (d.id) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(d.error) : p.resolve(d.result); } if (d.method === 'Runtime.exceptionThrown') errors.push(d.params); });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
  const run = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }); assert(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const click = s => run(`document.querySelector(${JSON.stringify(s)}).click()`);
  const snap = () => run('resonanceDemo.snapshot()');
  const set = values => run(`window.__scores=${JSON.stringify(values)}`);
  const wait = async (predicate, ms = 60000) => { const start = Date.now(); while (Date.now() - start < ms) { if (await predicate()) return; await sleep(200); } throw Error('Timed out: ' + JSON.stringify(await snap())); };
  const pass = t => { checks.push(t); console.log('PASS ' + t); };
  const shot = async name => { const d = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(__dirname, 'qa', name + '.png'), Buffer.from(d.data, 'base64')); };
  try {
    await send('Runtime.enable'); await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__scores=${JSON.stringify(neutral)}; window.__face=true;window.__hidden=false;window.__mediaCalls=0;
      Object.defineProperty(document,'hidden',{get:()=>window.__hidden});
      const getMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia=(...args)=>{__mediaCalls++;return getMedia(...args);};
      const OriginalWorker=Worker;
      window.Worker=class extends OriginalWorker {
        set onmessage(fn){super.onmessage=e=>{
          if(e.data.type==='result' && 'categories' in e.data) fn({data:{...e.data,
            categories:__face?Object.entries(__scores).map(([categoryName,score])=>({categoryName,score})):[],face:__face?{x:.5,y:.5}:null}});
          else fn(e);
        };}
      };
    ` });
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'http://127.0.0.1:4173/' }); await wait(() => run('!!window.resonanceDemo'));
    assert.equal(await run('__mediaCalls'), 0); await click('#meet'); await click('#start');
    await wait(async () => (await snap()).stage === 'live'); await click('#mute');
    await wait(async () => { const s = await snap(); return s.live.hands.frames >= 3 && s.live.body.frames >= 2; }, 90000);
    assert.equal(await run('document.querySelector("#expression-debug").open'), false);
    await sleep(1500); const before = await snap();
    await set(sad); await wait(async () => (await snap()).live.expression === 'sad'); await sleep(1800);
    const after = await snap();
    assert(after.signals.sad > .6); assert(after.color[2] > after.color[1] + 35);
    assert(after.speed < before.speed * .75); assert(after.expansion < before.expansion - .12);
    assert(after.center[1] > before.center[1] + before.radius * .08, JSON.stringify({ before, after }));
    assert(after.familiarity >= before.familiarity); assert.equal(after.signals.smile, 0);
    pass('Synthetic moderate sad scores reach blue tint, slower flow, gathering and sinking without reducing familiarity');
    await run('document.querySelector("#expression-debug").open=true'); await sleep(300);
    assert(await run('document.querySelector("#expression-raw").textContent.includes("browInnerUp0.230")'));
    assert(await run('document.querySelector("#expression-decision").textContent.includes("Final: Sad-looking cue")'));
    assert(await run('document.querySelector("#expression-thresholds").textContent.includes("sad 0.28")'));
    await run('document.querySelector("#expression-debug").scrollIntoView({block:"start"})'); await shot('expression-desktop');
    pass('Default-collapsed English diagnostics show actual raw values, decision, thresholds and animation strength');
    await set({ ...neutral, mouthSmileLeft: .9, mouthSmileRight: .9 });
    await wait(async () => (await snap()).live.expression === 'smile'); await sleep(1000); assert((await snap()).color[0] > (await snap()).color[2]);
    await set(sad); await wait(async () => (await snap()).live.expression === 'sad');
    await set({ ...sad, jawOpen: .9 }); await wait(async () => (await snap()).live.expression === null); assert.equal((await snap()).signals.surprise, 0);
    await set({ ...neutral, browOuterUpLeft: .8, browOuterUpRight: .8, eyeWideLeft: .8, eyeWideRight: .8, jawOpen: .6 });
    await wait(async () => (await snap()).live.expression === 'surprise');
    await set(neutral); await wait(async () => (await snap()).live.expression === null);
    pass('Synthetic smile → sad → speech-like open mouth → surprise → neutral transitions reach Live correctly');
    assert(await run('document.querySelector("#expression-surprise-reason").textContent.includes("outer brow mean")'));
    assert(await run('document.querySelector("#expression-animation").textContent.includes("target")'));
    await click('#sample-expression');
    await wait(() => run('!document.querySelector("#expression-sample-report").hidden'), 10000);
    let sample = await run('JSON.parse(document.querySelector("#expression-sample-data").value)');
    assert.equal(sample.samples[0].intended, 'neutral'); assert.equal(sample.samples[0].raw.browInnerUp.mean, neutral.browInnerUp);
    assert.equal(sample.samples[0].changeFromNeutral.browInnerUp, 0); assert(sample.samples[0].frames >= 6);
    await set(sad); await wait(async () => (await snap()).live.expression === 'sad');
    await run('document.querySelector("#expression-sample-label").value="sad"'); await click('#sample-expression');
    await wait(() => run('JSON.parse(document.querySelector("#expression-sample-data").value).samples.length===2'), 10000);
    sample = await run('JSON.parse(document.querySelector("#expression-sample-data").value)');
    assert(Math.abs(sample.samples[1].changeFromNeutral.browInnerUp - .195) < .001);
    assert.equal(sample.samples[1].lastDecision.active, 'sad'); assert(sample.samples[1].animation.target.sad > .6);
    // Clipboard denial must leave an ordinary selectable text field available.
    await run('Object.defineProperty(navigator,"clipboard",{value:{writeText:async()=>{throw Error("Test clipboard denied")}},configurable:true})');
    await click('#copy-expression-samples'); await sleep(100);
    assert(await run('document.querySelector("#expression-sample-status").textContent.includes("Select and copy")'));
    await click('#sample-expression'); await run('window.__face=false'); await sleep(800);
    assert(await run('document.querySelector("#expression-sample-status").textContent.includes("interrupted")'));
    await run('window.__face=true'); await set(neutral); await sleep(500);
    pass('Synthetic 3-second samples export raw ranges, neutral deltas, decisions and animation delivery; clipboard fallback and face-loss cancellation work');
    const resting = { ...neutral, mouthFrownLeft: .25, mouthFrownRight: .26, browInnerUp: .15 };
    await set(resting); await wait(async () => (await snap()).live.expression === 'sad');
    await click('#calibrate-expression'); await wait(async () => !!(await snap()).live.expressionDebug.baseline, 15000);
    await sleep(500); assert.equal((await snap()).live.expression, null);
    assert.equal((await snap()).live.expressionDebug.baseline.mouthFrownLeft, .25);
    await set({ ...resting, mouthFrownLeft: .45, mouthFrownRight: .42, browInnerUp: .38 }); await wait(async () => (await snap()).live.expression === 'sad');
    await run('window.__hidden=true;document.dispatchEvent(new Event("visibilitychange"))');
    await sleep(500); assert.equal((await snap()).live.expression, null); assert((await snap()).live.expressionDebug.baseline);
    await run('window.__hidden=false;document.dispatchEvent(new Event("visibilitychange"))');
    await set(resting); await sleep(1000); assert.equal((await snap()).live.expression, null);
    await click('#calibrate-expression'); await run('window.__face=false'); await sleep(700);
    assert.equal((await snap()).live.expressionDebug.calibrating, false); assert.equal((await snap()).signals.sad, 0);
    await run('window.__face=true'); await sleep(300); await click('#reset-expression-calibration');
    assert.equal((await snap()).live.expressionDebug.baseline, null); await set(neutral);
    pass('Optional calibration works in UI, survives visibility pauses, cancels on face loss and resets on request');
    // Replay transcribed real single-frame values; held durations here are synthetic.
    await set(screenshot.neutral); await sleep(1500); await click('#calibrate-expression');
    await wait(async () => !!(await snap()).live.expressionDebug.baseline, 15000);
    await sleep(1500); const relativeNeutral = await snap(); assert.equal(relativeNeutral.live.expression, null);
    await set(screenshot.sad); await wait(async () => (await snap()).live.expression === 'sad'); await sleep(1800);
    const relativeSad = await snap(); assert(relativeSad.signals.sad > .6);
    assert(relativeSad.color[2] > relativeSad.color[1] + 35); assert(relativeSad.speed < relativeNeutral.speed * .75);
    assert(relativeSad.expansion < relativeNeutral.expansion - .12); assert(relativeSad.center[1] > relativeNeutral.center[1] + relativeNeutral.radius * .08);
    await run('document.querySelector("#expression-debug").scrollIntoView({block:"start"})'); await shot('expression-relative-sad');
    await set(screenshot.surprise); await wait(async () => (await snap()).live.expression === 'surprise'); await sleep(1000);
    const relativeSurprise = await snap(); assert(relativeSurprise.signals.surprise > .5);
    assert(relativeSurprise.color[2] > relativeSurprise.color[1] + 40); assert(relativeSurprise.color[0] > relativeSad.color[0] + 35);
    await shot('expression-relative-surprise');
    await set(screenshot.smile); await wait(async () => (await snap()).live.expression === 'smile');
    await set(screenshot.speaking); await wait(async () => (await snap()).live.expression === null); assert.equal((await snap()).signals.surprise, 0);
    await set(screenshot.neutral); await sleep(800); assert.equal((await snap()).live.expression, null);
    assert(await run('document.querySelector("#expression-relative-thresholds").textContent.includes("Effective change thresholds")'));
    pass('User screenshot values replay through neutral calibration, subtle sad blue/sink/gather, surprise purple, preserved smile and neutral speaking; this is NOT post-fix human testing');
    for (const [width, height] of [[320, 740], [390, 844]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      await run('document.querySelector("#expression-debug").scrollIntoView({block:"start"})'); await sleep(300);
      assert(await run('document.documentElement.scrollWidth<=innerWidth && document.querySelector("#live-controls").scrollWidth<=document.querySelector("#live-controls").clientWidth'));
      await shot('expression-mobile-' + width);
      await run('document.querySelector("#calibrate-expression").scrollIntoView({block:"center"})'); await sleep(200);
      assert(await run('(()=>{const r=document.querySelector("#calibrate-expression").getBoundingClientRect(),p=document.querySelector("#live-controls").getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom&&r.height>=44})()'));
    }
    pass('Expanded diagnostics fit 320 / 390 px layouts and calibration buttons remain reachable');
    assert.equal(await run('__mediaCalls'), 1); await click('#home');
    assert.equal((await snap()).live.tracks.length, 0); assert.equal((await snap()).live.worker, false); assert.equal((await snap()).live.expressionDebug.baseline, null);
    assert.equal(await run('document.querySelector("#expression-sample-data").value'), '');
    assert.equal(errors.length, 0); pass('Single device request, Home cleanup and no uncaught browser errors');
  } finally {
    await click('#home').catch(() => {});
    fs.writeFileSync(path.join(__dirname, 'qa/expression-browser-report.json'), JSON.stringify({ input: 'Synthetic blendshape scores injected only by this test; real local models with Chrome fake camera/microphone. No human accuracy validation.', checks, errors }, null, 2));
    await send('Page.close').catch(() => {}); ws.close();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });


