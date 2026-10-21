// Real Web Audio rendering + headless browser lifecycle checks; not a human listening test.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const tab = await (await fetch('http://127.0.0.1:9227/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map(), errors = [], checks = [], metrics = {};
  ws.addEventListener('message', ({ data }) => {
    const d = JSON.parse(data);
    if (d.id) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(d.error) : p.resolve(d.result); }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
  const run = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }); assert(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const click = selector => run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const wait = async predicate => { for (let i = 0; i < 100; i++) { if (await run(predicate)) return; await sleep(50); } throw Error('Timeout: ' + predicate); };
  const pass = text => { checks.push(text); console.log('PASS ' + text); };
  const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(__dirname, 'qa', name + '.png'), Buffer.from(r.data, 'base64')); };
  try {
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__sound={contexts:[],sources:[],media:0};window.__hidden=false;
      Object.defineProperty(document,'hidden',{get:()=>__hidden});
      const OriginalAudio=AudioContext;
      window.AudioContext=class extends OriginalAudio {
        constructor(...args){super(...args);__sound.contexts.push(this);}
        createBufferSource(){const source=super.createBufferSource(),entry={start:null,end:null},start=source.start.bind(source),stop=source.stop.bind(source);
          __sound.sources.push(entry);
          source.start=(when=0)=>{entry.start=when;entry.end=when+source.buffer.duration;return start(when);};
          source.stop=(when=0)=>{entry.end=when;return stop(when);};return source;}
      };
      navigator.mediaDevices.getUserMedia=async()=>{__sound.media++;throw Error('Unexpected device request');};
    ` });
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'http://127.0.0.1:4173/sound-test.html' }); await wait('!!document.querySelector("#replay")');
    assert.equal(await run('__sound.contexts.length'), 0); assert.equal(await run('document.documentElement.lang'), 'en');
    await run('document.querySelector("#pitch").value=300;document.querySelector("#pitch").dispatchEvent(new Event("input"))');
    await click('#reset'); assert.equal(await run('__sound.contexts.length'), 0); assert.equal(await run('__sound.media'), 0);
    assert.deepEqual(await run('({min:document.querySelector("#duration").min,max:document.querySelector("#duration").max,value:settings().duration,label:document.querySelector("#duration-value").value})'), { min: '1', max: '1.5', value: 1.2, label: '1.20 s' });
    const approved = JSON.parse(fs.readFileSync(path.join(__dirname, 'qa/fixtures/approved-pure.json'), 'utf8'));
    assert.deepEqual(await run('settings()'), approved.defaults);
    assert.deepEqual(await run('Object.keys(versions)'), ['curious', 'happy']);
    assert.equal(await run('selected'), 'curious');
    assert.deepEqual(await run('[...document.querySelectorAll(".version strong,.recording-card h3")].map(e=>e.textContent).sort()'), ['Afraid', 'Curious', 'Happy', 'Wake']);
    assert(!await run('/Soft Ripple|Airy/.test(document.body.textContent)'));
    pass('Loading, moving sliders and Reset create no audio context, playback or microphone request');
    // Offline buffers are rendered with the same production function used by the buttons.
    const result = await run(`(async()=>{
      const result={},buffers={};
      function measure(buffer){const l=buffer.getChannelData(0),r=buffer.getChannelData(1);let peak=0,energy=0,stereo=0,step=0;
        for(let i=0;i<l.length;i++){peak=Math.max(peak,Math.abs(l[i]),Math.abs(r[i]));energy+=l[i]*l[i]+r[i]*r[i];stereo+=(l[i]-r[i])**2;if(i)step=Math.max(step,Math.abs(l[i]-l[i-1]),Math.abs(r[i]-r[i-1]));}
        const hz=(a,b)=>{let count=0;for(let i=Math.floor(a*buffer.sampleRate)+1;i<b*buffer.sampleRate;i++)if(l[i-1]<=0&&l[i]>0)count++;return count/(b-a);};
        let tailEnergy=0;const tailStart=Math.floor((buffer.duration-.04)*buffer.sampleRate);
        for(let i=tailStart;i<l.length;i++)tailEnergy+=l[i]*l[i]+r[i]*r[i];
        const phrase=[.28,.43,.65,.84].map(u=>{const center=(buffer.duration-.16)*u,start=Math.floor((center-.025)*buffer.sampleRate),end=Math.floor((center+.025)*buffer.sampleRate),cross=[];let energy=0;
          for(let i=start+1;i<end;i++){energy+=l[i]*l[i];if(l[i-1]<=0&&l[i]>0)cross.push((i-1-l[i-1]/(l[i]-l[i-1]))/buffer.sampleRate);}
          return {hz:(cross.length-1)/(cross.at(-1)-cross[0]),rms:Math.sqrt(energy/(end-start-1))};});
        return {duration:buffer.duration,peak,rms:Math.sqrt(energy/(l.length*2)),stereo:Math.sqrt(stereo/l.length),maxStep:step,tailRms:Math.sqrt(tailEnergy/((l.length-tailStart)*2)),edges:[l[0],r[0],l.at(-1),r.at(-1)],earlyHz:hz(buffer.duration*.15,buffer.duration*.32),lateHz:hz(buffer.duration*.6,buffer.duration*.76),phrase};}
      for(const name of Object.keys(versions)){const b=await renderTone(name,{...toneDefaults[name]});buffers[name]=b;result[name]=measure(b);}
      {const a=buffers.curious.getChannelData(0),b=buffers.happy.getChannelData(0);let e=0;for(let i=0;i<a.length;i++)e+=(a[i]-b[i])**2;result.happy.differenceFromCurious=Math.sqrt(e/a.length);}
      for(const name of Object.keys(versions)){
        result[name+'Max']=measure(await renderTone(name,{volume:.6,pitch:440,rise:4,depth:1,duration:name==='happy'?2:1.5}));
        result[name+'Short']=measure(await renderTone(name,{...toneDefaults[name],duration:name==='happy'?1.5:1}));
      }
      result.silent=measure(await renderTone('happy',{...toneDefaults.happy,volume:0}));
      const zero=await renderTone('happy',{...toneDefaults.happy,depth:0}),full=await renderTone('happy',{...toneDefaults.happy,depth:1});
      let e=0;for(let i=0;i<zero.length;i++)e+=(zero.getChannelData(0)[i]-full.getChannelData(0)[i])**2;result.depthDifference=Math.sqrt(e/zero.length);
      return result;
    })()`);
    Object.assign(metrics, result);
    for (const [name, m] of Object.entries(result)) if (typeof m === 'object') {
      // Happy's highest pitch + gentle second harmonic has a steeper natural sample slope.
      assert(m.peak <= .421, name); assert(m.edges.every(v => v === 0), name); assert(m.maxStep < (name.startsWith('happy') ? .045 : .04), name); assert(m.tailRms < .0001, name + ' should fade to silence');
    }
    for (const name of ['curious', 'happy']) {
      assert.equal(result[name].duration, name==='happy'?1.8:1.2); assert.equal(result[name+'Short'].duration, name==='happy'?1.5:1); assert.equal(result[name+'Max'].duration, name==='happy'?2:1.5);
      for (const suffix of ['', 'Short', 'Max']) {
        if(name==='curious') assert(result[name+suffix].lateHz > result[name+suffix].earlyHz + 10);
        else {
          const [first,dip,second,settle]=result[name+suffix].phrase;
          assert(first.hz > dip.hz + 10); assert(second.hz > first.hz + 5); assert(second.hz > settle.hz + 10);
          assert(dip.rms > Math.min(first.rms,second.rms)*.5, 'The two hums should remain connected');
        }
      }
    }
    assert.equal(result.silent.peak, 0);
    assert(result.happy.differenceFromCurious > .008); assert(result.depthDifference > .0001);
    assert(result.happy.earlyHz > result.curious.earlyHz + 10);
    for (const key of ['curious', 'curiousShort', 'curiousMax']) {
      for (const metric of ['duration', 'peak', 'rms', 'stereo', 'maxStep', 'tailRms', 'earlyHz', 'lateHz']) assert(Math.abs(result[key][metric] - approved[key][metric]) < 1e-8, key + ' changed from approved Pure: ' + metric);
    }
    pass('Four sound families only; Curious keeps approved Pure settings and render metrics; Happy stays continuous, rises gently and respects duration / peak / fade limits');
    await click('[data-version="curious"]'); await wait('!!voice'); await sleep(100);
    await click('[data-version="happy"]'); await wait('!!voice && !busy');
    assert.equal(await run('__sound.contexts.length'), 1); assert.equal(await run('selected'), 'happy');
    assert.deepEqual(await run('settings()'), { ...approved.defaults, duration: 1.8 });
    assert.deepEqual(await run('({min:document.querySelector("#duration").min,max:document.querySelector("#duration").max,value:document.querySelector("#duration-value").value})'), { min: '1.5', max: '2', value: '1.80 s' });
    assert(await run('document.querySelector("#replay").textContent.includes("Happy")'));
    await run('for(const [key,value]of Object.entries({pitch:320,duration:1.9})){document.querySelector("#"+key).value=value;document.querySelector("#"+key).dispatchEvent(new Event("input"));}');
    await click('[data-version="curious"]'); await wait('!!voice && !busy');
    assert.deepEqual(await run('settings()'), approved.defaults);
    await click('[data-version="happy"]'); await wait('!!voice && !busy');
    assert.equal(await run('settings().pitch'), 320); assert.equal(await run('settings().duration'), 1.9);
    await click('#reset'); assert.deepEqual(await run('settings()'), { ...approved.defaults, duration: 1.8 });
    pass('Happy tuning is independent: experimenting and switching back preserves approved Curious parameters');
    const sourcesBeforeRapid = await run('__sound.sources.length');
    await run('for(let i=0;i<12;i++)document.querySelector(`[data-version="${i%2?"happy":"curious"}"]`).click()');
    await wait('!!voice && !busy'); assert.equal(await run('selected'), 'happy');
    const sources = await run('__sound.sources');
    for (let i = 1; i < sources.length; i++) assert(sources[i].start >= sources[i - 1].end, JSON.stringify(sources));
    assert(sources.length <= sourcesBeforeRapid + 1, 'Rapid clicks should discard stale rendering requests');
    await click('#stop'); await sleep(80); assert(await run('voice===null && retiring.size===0'));
    pass('Version switching and rapid clicks retire the previous voice before the next starts; a single live context is reused');
    await click('#replay'); await click('#stop'); await sleep(300); assert(await run('!voice && !busy'));
    await click('#replay'); await wait('!!voice'); await sleep(2100); assert(await run('!voice && retiring.size===0'));
    assert(await run('document.querySelector("#status").textContent.includes("finished")'));
    await click('#replay'); await wait('!!voice'); await run('__hidden=true;document.dispatchEvent(new Event("visibilitychange"))'); await sleep(100);
    assert(await run('!voice && !busy')); await run('__hidden=false;document.dispatchEvent(new Event("visibilitychange"))'); await sleep(100); assert(await run('!voice'));
    await click('#reset'); assert.equal(await run('settings().pitch'), 280);
    pass('Stop cancels pending work; natural endings disconnect nodes; backgrounding stops audio and returning does not autoplay');
    // Decode the user's actual MP3s. Verify originals sample-for-sample at shared volume.
    const recorded = await run(`(async()=>{
      const results={};
      for(const name of ['afraid','wake']){
        const pair=await loadRecording(name),original=await renderRecording(name+'-original',{...defaults}),adjusted=await renderRecording(name+'-adjusted',{...defaults}),max=await renderRecording(name+'-adjusted',{...defaults,volume:.6});
        let originalError=0,endpoint=0,finite=true,maxStep=0,dot=0,a2=0,b2=0;
        for(let c=0;c<original.numberOfChannels;c++){
          const a=pair.original.getChannelData(c),o=original.getChannelData(c),b=adjusted.getChannelData(c);
          for(let i=0;i<o.length;i++)originalError=Math.max(originalError,Math.abs(o[i]-Math.fround(a[i]*defaults.volume)));
          endpoint=Math.max(endpoint,Math.abs(b[0]),Math.abs(b.at(-1)));
          for(let i=0;i<b.length;i++){finite=finite&&Number.isFinite(b[i]);if(i)maxStep=Math.max(maxStep,Math.abs(b[i]-b[i-1]));dot+=a[i]*b[i];a2+=a[i]*a[i];b2+=b[i]*b[i];}
        }
        const after=measureRecording(adjusted);
        results[name]={...pair.report,originalError,endpoint,finite,maxStep,correlation:dot/Math.sqrt(a2*b2),preview:after,maxVolumePeak:measureRecording(max).peak,relativeActiveDb:20*Math.log10(after.activeRms/pair.report.referenceActiveRms)};
      }
      return results;
    })()`);
    metrics.recordings = recorded;
    for (const [name, report] of Object.entries(recorded)) {
      assert.equal(report.originalError, 0, name + ' original was modified'); assert.equal(report.endpoint, 0); assert(report.finite);
      assert.equal(report.trimStart, 0); assert.equal(report.trimEnd, 0); assert.equal(report.playbackRate, 1);
      assert.equal(report.before.duration, report.after.duration); assert(report.maxVolumePeak <= .901);
      assert(report.maxPeakReductionDb <= 4.001); assert(report.correlation > .94);
      assert(Math.abs(report.relativeActiveDb) < 3, name + ' approximate active level differs too much: ' + report.relativeActiveDb);
      assert.deepEqual(report.before, approved.recordings[name].before);
      assert.deepEqual(report.after, approved.recordings[name].after);
    }
    const crypto = require('node:crypto');
    const before = JSON.parse(fs.readFileSync(path.join(__dirname, 'qa/source-sound-analysis.json'), 'utf8'));
    for (const name of ['afraid', 'wake']) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'sounds', name + '.mp3'))).digest('hex'), before.sounds[name].sha256);
    pass('Real MP3 decode: originals unchanged, timing and speed preserved, adjusted endpoints silent, bounded peaks and approximate active levels near curiosity');
    await click('[data-recording="afraid-original"]'); await wait('!!voice');
    assert(await run('document.querySelector("#duration").disabled && !document.querySelector("#volume").disabled'));
    assert(await run('document.querySelector("#replay").textContent.includes("Afraid · Original")'));
    await click('[data-recording="wake-adjusted"]'); await wait('!!voice && !busy');
    assert(await run('document.querySelector("#status").textContent.includes("Wake · Adjusted")'));
    await click('#replay'); await wait('!!voice && !busy');
    await click('[data-version="happy"]'); await wait('!!voice && !busy');
    assert(await run('!document.querySelector("#duration").disabled && settings().duration===1.8'));
    const allSources = await run('__sound.sources');
    for (let i = 1; i < allSources.length; i++) assert(allSources[i].start >= allSources[i - 1].end, 'Recorded and synthesized sounds overlapped');
    await click('#stop');
    // Force one fetch failure: an explicit Replay must retry instead of caching the error.
    await run('recordingCache.delete("afraid");window.__fetch=window.fetch;window.fetch=async()=>new Response("missing",{status:404})');
    await click('[data-recording="afraid-adjusted"]'); await wait('document.querySelector("#status").textContent.includes("Could not load")');
    assert(await run('!voice && !busy && !recordingCache.has("afraid")'));
    await run('window.fetch=window.__fetch'); await click('#replay'); await wait('!!voice && !busy'); await click('#stop');
    pass('Original / Adjusted / curiosity share one transport; volume works for all, synthesis sliders stay separate, missing MP3 shows a retry message');
    await shot('sound-test-desktop');
    for (const [width, height] of [[320, 740], [390, 844], [844, 390]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true }); await sleep(100);
      assert(await run('document.documentElement.scrollWidth<=innerWidth'));
      assert(await run('[...document.querySelectorAll("button")].every(b=>b.getBoundingClientRect().height>=44)'));
      await run('document.querySelector("#replay").scrollIntoView({block:"center"})');
      assert(await run('(()=>{const r=document.querySelector("#replay").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()'));
      if (width === 390) await shot('sound-test-mobile');
      await run('document.querySelector("#recordings-title").scrollIntoView({block:"start"})');
      if (width === 390) await shot('sound-test-recordings-mobile');
    }
    await run('window.dispatchEvent(new Event("pagehide"))'); await sleep(100);
    assert(await run('__sound.contexts.every(c=>c.state==="closed")')); assert.equal(errors.length, 0);
    assert(!/\p{Script=Han}/u.test(fs.readFileSync(path.join(__dirname, 'sound-test.html'), 'utf8')));
    pass('Desktop, 320 / 390 px and landscape layouts fit; English-only page; leaving closes audio; no uncaught errors');
  } finally {
    fs.mkdirSync(path.join(__dirname, 'qa'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'qa/sound-test-report.json'), JSON.stringify({ checks, metrics, errors, limitation: 'Headless Web Audio validation; no human listening evaluation or physical mobile device test' }, null, 2));
    await send('Page.close').catch(() => {}); ws.close();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
