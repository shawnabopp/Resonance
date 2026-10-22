// Actual browser button, approved WAV, rendering, and error branches.
// Chrome's camera/microphone are fake devices. No injected face/hand geometry.
// This does not validate physical approach detection or human listening.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const checks = [], errors = [], samples = {};
  const tab = await (await fetch('http://127.0.0.1:9227/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', ({ data }) => { const d = JSON.parse(data); if (d.id) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(d.error) : p.resolve(d.result); }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params); });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
  const run = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    assert(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const click = selector => run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const snap = () => run('resonanceDemo.snapshot()');
  const diag = async () => { await sleep(300); return run('JSON.parse(document.querySelector("#approach-report").value)'); };
  const wait = async (predicate, timeout = 15000) => { const start = Date.now(); while (Date.now() - start < timeout) { if (await predicate()) return; await sleep(60); } throw Error('Timeout: ' + JSON.stringify(await snap())); };
  const pass = text => { checks.push(text); console.log('PASS ' + text); };
  const cooldown = async () => { await wait(async () => (await diag()).cooldownMs === 0); };
  try {
    await send('Runtime.enable'); await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__failAfraid=false;window.__throwSource=false;window.__streams=[];
      const realFetch=fetch;window.fetch=(url,options)=>__failAfraid&&String(url).endsWith('afraid-adjusted.wav')?Promise.resolve(new Response('missing',{status:404})):realFetch(url,options);
      const media=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async options=>{const stream=await media(options);__streams.push(stream);return stream;};
      const create=AudioContext.prototype.createBufferSource;AudioContext.prototype.createBufferSource=function(){const source=create.call(this),start=source.start.bind(source);source.start=(...args)=>{if(__throwSource)throw new DOMException('QA scheduling failure','InvalidStateError');return start(...args);};return source;};
    ` });
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'http://127.0.0.1:4173/' }); await wait(() => run('!!window.resonanceDemo'));
    await click('#meet'); await click('#start'); await wait(async () => (await snap()).stage === 'live', 75000);
    await wait(async () => (await snap()).playback.ready); await click('#mute');
    await run('document.querySelector("#approach-debug").open=true');
    await wait(async () => (await snap()).live.frames >= 3);
    samples.noFace = await diag();
    assert.equal(samples.noFace.faceFrame.faceDetected, false); assert.equal(samples.noFace.facePresent, false);
    assert(samples.noFace.faceFrame.width > 0); assert.equal(samples.noFace.faceFrame.geometry, false);
    const frames = (await snap()).live.frames; await sleep(600); assert((await snap()).live.frames > frames);
    pass('Unmodified real Face Landmarker pipeline updates the diagnostics from fake video: no face is reported honestly, with dimensions and frame age');
    const before = await snap(); await click('#test-afraid');
    await wait(async () => (await snap()).playback.counts.afraid === 1); await sleep(300);
    const peak = await snap(); samples.button = await diag();
    assert(peak.depth > .65); assert(peak.scale < before.scale * .9); assert(peak.expansion < before.expansion - .1);
    assert(peak.bounds[2] - peak.bounds[0] < (before.bounds[2] - before.bounds[0]) * .8);
    assert.equal(samples.button.lastEvent.source, 'Test Afraid');
    assert.equal(samples.button.lastEvent.id, peak.playback.history.at(-1).eventId);
    assert.equal(peak.playback.history.at(-1).duration, .499);
    assert.match(samples.button.audio.playback.status, /Playback/);
    await click('#test-afraid'); assert.match(await run('document.querySelector("#approach-test-status").textContent'), /cooldown/);
    await sleep(500); assert.equal((await snap()).playback.counts.afraid, 1);
    pass('Test Afraid invokes one shared event ID: the real adjusted WAV is scheduled once, particles visibly shrink/gather, and repeated clicks show the shared cooldown');
    await cooldown(); await click('#live-controls [data-effects]'); await click('#test-afraid'); samples.off = await diag();
    assert.equal(samples.off.audio.playback.status, 'Not played'); assert.match(samples.off.audio.playback.detail, /Sound Effects is off/);
    assert.equal((await snap()).playback.counts.afraid, 1); assert((await snap()).depth > .3);
    await click('#live-controls [data-effects]');
    pass('Sound Effects Off still permits retreat and explicitly explains why Afraid was not played');
    await cooldown(); await run('__throwSource=true'); await click('#test-afraid'); await sleep(450); samples.error = await diag();
    assert.equal(samples.error.audio.playback.status, 'Not played'); assert.match(samples.error.audio.playback.detail, /InvalidStateError: QA scheduling failure/);
    assert.equal((await snap()).playback.counts.afraid, 1); await run('__throwSource=false');
    pass('A forced source.start failure exposes its actual exception and does not increment successful playback counts');
    await cooldown(); await click('#test-afraid'); await wait(async () => (await snap()).playback.counts.afraid === 2);
    await sleep(4300); assert((await snap()).depth < .01); assert((await snap()).scale > peak.scale + .1);
    for (const [width, height] of [[390,844], [844,390]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      await run('document.querySelector("#approach-debug").scrollIntoView({block:"center"})'); await sleep(300);
      assert(await run('document.documentElement.scrollWidth<=innerWidth'));
      assert(await run('document.querySelector("#test-afraid").getBoundingClientRect().height>=44'));
      if (width === 390) { const shot = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(__dirname, 'qa/afraid-debug-mobile.png'), Buffer.from(shot.data, 'base64')); }
    }
    await click('#copy-approach'); assert(await run('!document.querySelector("#approach-report").hidden'));
    await click('#home'); assert.equal((await snap()).live.tracks.length, 0); assert.equal((await snap()).playback.current, null);
    assert.equal(await run('document.querySelector("#approach-report").value'), '');
    assert(await run('__streams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))'));
    // Clear decoded output via a fresh document to test a real fetch failure.
    await send('Page.reload'); await wait(() => run('!!window.resonanceDemo')); await run('__failAfraid=true');
    await click('#meet'); await click('#start'); await wait(async () => (await snap()).stage === 'live', 75000);
    await wait(async () => (await snap()).playback.ready); await click('#mute');
    await run('document.querySelector("#approach-debug").open=true'); await click('#test-afraid'); await sleep(500);
    samples.httpError = await diag(); assert.equal(samples.httpError.audio.decoded, false);
    assert.match(samples.httpError.audio.playback.detail, /afraid-adjusted.wav: HTTP 404/);
    await run('__failAfraid=false'); await cooldown(); await click('#test-afraid');
    await wait(async () => (await snap()).playback.counts.afraid === 1); samples.retry = await diag();
    assert.equal(samples.retry.audio.decoded, true); assert.equal(errors.length, 0);
    pass('Retreat recovers smoothly; mobile diagnostics fit; Home releases tracks; a failed WAV fetch shows HTTP 404 and Test Afraid retries successfully');
  } finally {
    await run('dispatchEvent(new PageTransitionEvent("pagehide"))').catch(() => {});
    fs.writeFileSync(path.join(__dirname, 'qa/afraid-debug-report.json'), JSON.stringify({ checks, errors, samples,
      limitation: 'Actual browser button, decoded approved audio and rendering, fake media devices. Error cases are deliberately injected. No physical camera approach, speaker audibility or phone hardware test.' }, null, 2));
    await send('Page.close').catch(() => {}); ws.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
