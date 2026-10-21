// Run with local preview and Chrome at :9227 using fake media devices.
// This verifies the real local WASM/model, not recognition accuracy on a person's face.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  const out = path.join(__dirname, 'qa'); fs.mkdirSync(out, { recursive: true });
  const report = { tests: [], errors: [], deviceType: 'Chrome fake camera/microphone; real MediaPipe WASM and model' };
  const pass = text => { report.tests.push(text); console.log('PASS ' + text); };
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'vendor/manifest.json')));
  for (const asset of manifest.files) {
    const bytes = fs.readFileSync(path.join(__dirname, asset.file));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    const response = await fetch('http://127.0.0.1:4173/' + asset.file);
    assert.equal(response.status, 200);
    assert.equal(crypto.createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'), asset.sha256);
    if (asset.file.endsWith('.wasm')) assert(response.headers.get('content-type').includes('application/wasm'));
  }
  pass('Every pinned asset exists, matches SHA-256, and serves as binary with the correct MIME type');
  const tab = await (await fetch('http://127.0.0.1:9227/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', event => {
    const d = JSON.parse(event.data);
    if (d.id) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(d.error) : p.resolve(d.result); }
    if (d.method === 'Runtime.exceptionThrown') report.errors.push(d.params.exceptionDetails);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
  const run = async expression => { const d = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }); if (d.exceptionDetails) throw new Error(JSON.stringify(d.exceptionDetails)); return d.result.value; };
  const click = selector => run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const snap = () => run('resonanceDemo.snapshot()');
  const waitFor = async (condition, timeout = 50000) => { const start = Date.now(); while (Date.now() - start < timeout) { if (await run(condition)) return; await sleep(250); } throw new Error('Timed out: ' + condition + '\n' + JSON.stringify(await snap())); };
  const shot = async name => { const result = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(result.data, 'base64')); };
  try {
    await send('Runtime.enable'); await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__media={calls:0,streams:[],workers:0};
      const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia=async options=>{
        __media.calls++;
        if(window.__deny) throw new DOMException('Test refusal',window.__deny);
        if(window.__delay) await new Promise(r=>window.__release=r);
        const stream=await original(options); __media.streams.push(stream); return stream;
      };
      const OriginalWorker=Worker;
      window.Worker=class extends OriginalWorker{
        constructor(...args){super(...args);__media.workers++;}
        postMessage(data,...args){if(data.type==='init'&&window.__modelFailure)data.model+='-missing';super.postMessage(data,...args);}
      };
    ` });
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'http://127.0.0.1:4173/' }); await waitFor('!!window.resonanceDemo');
    assert.equal(await run('__media.calls'), 0); assert.equal(await run('document.documentElement.lang'), 'en');
    await click('#meet'); assert.equal(await run('__media.calls'), 0); await shot('live-prepare');
    await click('#try-demo'); await click('[data-expression="smile"]'); await sleep(600);
    assert.equal(await run('__media.calls'), 0); assert.equal(await run('__media.workers'), 0);
    pass('Home, preparation and Demo never request device access or load the face worker');
    await click('#home'); await click('#meet'); await click('#start'); await click('#start');
    await waitFor('resonanceDemo.snapshot().stage === "live" || resonanceDemo.snapshot().stage === "error"');
    assert.equal((await snap()).stage, 'live', await run('document.querySelector("#connection-message").textContent'));
    await waitFor('resonanceDemo.snapshot().live.frames >= 3');
    let live = await snap(); report.initialLive = live;
    await waitFor('resonanceDemo.snapshot().live.body.frames >= 2');
    assert.equal(await run('__media.calls'), 1); assert.equal(await run('__media.workers'), 3);
    assert(live.live.modelReady && live.live.active && live.live.tracks.length === 2);
    assert.equal(live.signals.bodyMotion, 0); assert.equal(live.signals.handPresent, false);
    pass('Real local MediaPipe initializes and infers on fake-camera frames; repeated Start creates one session');
    await shot('live-desktop');
    const frames = live.live.frames; await click('#toggle-preview'); await sleep(1000);
    assert((await snap()).live.frames > frames); assert((await snap()).live.previewHidden);
    pass('Hiding the mirrored camera preview keeps real inference running');
    await run('document.querySelector("#sound").value=1;document.querySelector("#sound").dispatchEvent(new Event("input"));document.querySelector("#body").value=1;document.querySelector("#body").dispatchEvent(new Event("input"));document.querySelector("#clap").click();document.querySelector("#retreat").click();');
    await sleep(300); live = await snap(); assert.equal(live.signals.bodyMotion, 0); assert.equal(live.signals.handPresent, false); assert.equal(live.events.retreat, 0);
    await click('#mute'); await sleep(800); live = await snap(); assert.equal(live.signals.level, 0); assert.equal(live.live.tracks.find(t => t.kind === 'audio').enabled, false);
    await click('#mute'); await click('#calibrate');
    pass('Live excludes simulated channels; microphone mute disables audio track and recalibration works');
    for (const [width,height] of [[390,844],[320,568],[844,390]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 }); await sleep(300);
      assert(await run('document.documentElement.scrollWidth <= innerWidth'));
      if (width === 390) { await click('#toggle-preview'); await shot('live-mobile'); }
    }
    pass('Live panel and preview fit mobile and landscape layouts');
    await click('#home'); assert.equal((await snap()).live.worker, false); assert.equal((await snap()).live.audio, 'closed');
    assert(await run('__media.streams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))'));
    await click('#meet'); await click('#start'); await waitFor('resonanceDemo.snapshot().stage === "live"'); await waitFor('resonanceDemo.snapshot().live.frames >= 2'); await click('#exit');
    assert(await run('__media.streams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))'));
    pass('Home and End interaction stop all tracks, close AudioContext and worker; re-entry runs normally');
    for (const name of ['NotAllowedError','NotFoundError','NotReadableError']) {
      await run(`window.__deny=${JSON.stringify(name)}`); await click('#meet'); await click('#start'); await waitFor('resonanceDemo.snapshot().stage === "error"');
      assert.equal((await snap()).live.audio, 'closed'); assert(await run('!document.querySelector("#retry").hidden'));
      assert(await run('!/[\\u4e00-\\u9fff]/.test(document.body.innerText)')); await shot('live-error-' + name); await click('#home');
    }
    await run('window.__deny=null;window.__modelFailure=true'); await click('#meet'); await click('#start'); await waitFor('resonanceDemo.snapshot().stage === "error"');
    assert(await run('document.querySelector("#connection-message").textContent.includes("face model")'));
    assert(await run('__media.streams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))'));
    await run('window.__modelFailure=false'); await click('#retry'); await waitFor('resonanceDemo.snapshot().stage === "live"'); await waitFor('resonanceDemo.snapshot().live.frames >= 2');
    pass('Permission denial, missing/busy device and real model 404 show English errors; Retry loads the model successfully');
    await click('#home'); await run('window.__delay=true'); await click('#meet'); await click('#start'); await waitFor('!!window.__release'); await click('#home');
    await run('window.__release();window.__delay=false'); await sleep(1200);
    assert.equal((await snap()).stage, 'welcome'); assert(await run('__media.streams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))'));
    pass('Leaving during pending permission stops late-arriving tracks without restarting the session');
    await click('#meet'); await click('#start'); await waitFor('document.querySelector("#connection-message").textContent.includes("face model")'); await click('#fallback-demo'); await sleep(800);
    assert.equal((await snap()).stage, 'demo'); assert.equal((await snap()).live.worker, false); assert(await run('__media.streams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))'));
    pass('Switching to Demo during model loading cancels the worker and stops devices');
    assert.equal(report.errors.length, 0); pass('No uncaught page JavaScript exceptions');
  } finally {
    await run('document.querySelector("#home")?.click()').catch(() => {});
    fs.writeFileSync(path.join(out, 'live-report.json'), JSON.stringify(report, null, 2));
    await send('Page.close').catch(() => {}); ws.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
