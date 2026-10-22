// Browser integration checks with deliberately rejected autoplay promises.
// This exercises the fallback path; it is not a physical mobile/browser-policy test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  const checks = [], errors = [];
  const tab = await (await fetch('http://127.0.0.1:9227/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', ({ data }) => {
    const d = JSON.parse(data);
    if (d.id) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(d.error) : p.resolve(d.result); }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
  const run = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }); assert(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const snap = () => run('resonanceDemo.snapshot().playback');
  const click = selector => run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const wait = async predicate => { const start = Date.now(); while (Date.now() - start < 12000) { if (await predicate()) return; await sleep(60); } throw Error('Timed out: ' + JSON.stringify(await snap())); };
  const pass = message => { checks.push(message); console.log('PASS ' + message); };
  try {
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      if(!sessionStorage.getItem('qa.music-autoplay')){localStorage.removeItem('resonance.music');sessionStorage.setItem('qa.music-autoplay','1');}
      window.__permitMusic=false;window.__attempts=0;window.__players=new Set();window.__contexts=[];window.__effects=0;
      const NativeAudio=AudioContext;window.AudioContext=class extends NativeAudio{
        constructor(...args){super(...args);__contexts.push(this);}
        createBufferSource(){__effects++;return super.createBufferSource();}
      };
      const nativePlay=HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play=function(){
        if(this.src.includes('/sounds/waterfall.mp3')){
          __players.add(this);__attempts++;
          if(!__permitMusic)return Promise.reject(new DOMException('Forced autoplay rejection for QA','NotAllowedError'));
        }
        return nativePlay.call(this);
      };
    ` });
    await send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
    await wait(() => run('!!window.resonanceDemo'));
    await wait(async () => (await snap()).blocked);
    assert.equal(await run('__attempts'), 1); assert.equal((await snap()).musicPlaying, false);
    await wait(() => run('!document.querySelector("[data-music-status]").hidden'));
    assert.match(await run('document.querySelector("[data-music-status]").textContent'), /tap or click/i);
    await run('__permitMusic=true;document.body.dispatchEvent(new Event("touchend",{bubbles:true}))');
    await wait(async () => (await snap()).musicPlaying && (await snap()).musicGain > .095);
    assert.equal(await run('__players.size'), 1); assert.equal(await run('__contexts.length'), 1); assert.equal(await run('__effects'), 0);
    pass('A forced NotAllowedError shows an English prompt; first touch retries on the same player without starting effects');
    await click('#site-music [data-music]'); assert.equal((await snap()).musicEnabled, false);
    const attempts = await run('__attempts');
    await run('for(const type of ["click","pointerup","touchend","keydown"])document.body.dispatchEvent(new Event(type,{bubbles:true}))');
    await click('#meet'); await click('#try-demo'); await sleep(850); await click('#home');
    assert.equal((await snap()).musicPlaying, false); assert.equal(await run('__attempts'), attempts);
    await send('Page.reload'); await wait(() => run('!!window.resonanceDemo'));
    assert.equal((await snap()).musicEnabled, false); assert.equal(await run('__attempts'), 0); assert.equal(await run('__contexts.length'), 0);
    assert.equal(await run('document.querySelector("#site-music [data-music]").getAttribute("aria-pressed")'), 'false');
    await run('__permitMusic=true;document.body.click()'); assert.equal(await run('__attempts'), 0);
    await click('#site-music [data-music]'); await wait(async () => (await snap()).musicPlaying);
    assert.equal(await run('__players.size'), 1); assert.equal(await run('__effects'), 0);
    pass('Manual Off survives gestures, Home, new interaction and reload; only explicit Music On enables it again');
    await send('Page.reload'); await wait(() => run('!!window.resonanceDemo')); await wait(async () => (await snap()).blocked);
    await click('#site-music [data-music]'); const blockedAttempts = await run('__attempts');
    await run('__permitMusic=true;document.body.dispatchEvent(new Event("touchend",{bubbles:true}));document.body.click()');
    await sleep(200); assert.equal(await run('__attempts'), blockedAttempts); assert.equal((await snap()).musicPlaying, false);
    assert.equal((await snap()).musicEnabled, false); assert.equal(errors.length, 0);
    pass('Choosing Off while autoplay is blocked prevents the first gesture fallback from turning it back on');
  } finally {
    await run('dispatchEvent(new PageTransitionEvent("pagehide"))').catch(() => {});
    fs.writeFileSync(path.join(__dirname, 'qa/music-autoplay-report.json'), JSON.stringify({ checks, errors, limitations: 'Chrome with forced NotAllowedError and synthetic gesture events. No physical touch device, native Safari policy or listening test.' }, null, 2));
    await send('Page.close').catch(() => {}); ws.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
