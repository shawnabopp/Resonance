// Actual exported WAVs, media loop and live models in Chrome with fake devices.
// Raw microphone values and face cues are synthetic; no loudspeaker/acoustic claim.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  const checks=[],errors=[];const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'sounds/approved-manifest.json')));
  for(const file of manifest.files){const bytes=fs.readFileSync(path.join(__dirname,file.file));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256);}
  const tab=await(await fetch('http://127.0.0.1:9227/json/new?about:blank',{method:'PUT'})).json();
  const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  let id=0;const pending=new Map();ws.addEventListener('message',({data})=>{const d=JSON.parse(data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(d.error):p.resolve(d.result);}if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
  const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
  const click=s=>run(`document.querySelector(${JSON.stringify(s)}).click()`),snap=()=>run('resonanceDemo.snapshot()');
  const wait=async(predicate,ms=15000)=>{const start=Date.now();while(Date.now()-start<ms){if(await predicate())return;await sleep(70);}throw Error('Timed out: '+JSON.stringify(await snap()));};
  const pass=t=>{checks.push(t);console.log('PASS '+t);};
  const shot=async name=>{const d=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(__dirname,'qa',name+'.png'),Buffer.from(d.data,'base64'));};
  try{
    await send('Page.enable');await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`
      window.__audioTest={contexts:[],sources:[],music:[],streams:[],mediaOptions:[]};window.__rms=null;window.__smile=false;window.__failWake=false;
      const NativeAudio=AudioContext;window.AudioContext=class extends NativeAudio{
        constructor(...args){super(...args);__audioTest.contexts.push(this);}
        createMediaElementSource(element){const node=super.createMediaElementSource(element),r={element,context:this,gain:null};__audioTest.music.push(r);const connect=node.connect.bind(node);node.connect=target=>{r.gain=target.gain;return connect(target);};return node;}
        createBufferSource(){const source=super.createBufferSource(),r={start:null,end:null};__audioTest.sources.push(r);const start=source.start.bind(source),stop=source.stop.bind(source);source.start=(when=0)=>{r.start=when;r.end=when+source.buffer.duration;return start(when);};source.stop=(when=0)=>{r.end=when;return stop(when);};return source;}
      };
      const media=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async options=>{__audioTest.mediaOptions.push(options);const stream=await media(options);__audioTest.streams.push(stream);return stream;};
      const getData=AnalyserNode.prototype.getFloatTimeDomainData;AnalyserNode.prototype.getFloatTimeDomainData=function(data){getData.call(this,data);if(__rms!==null)data.fill(__rms);};
      const NativeWorker=Worker;window.Worker=class extends NativeWorker{set onmessage(fn){super.onmessage=e=>{if(e.data.type==='result'&&'categories'in e.data)fn({data:{...e.data,face:{x:.5,y:.5},categories:__smile?[{categoryName:'mouthSmileLeft',score:.9},{categoryName:'mouthSmileRight',score:.9}]:[]}});else fn(e);};}};
      const nativeFetch=fetch;window.fetch=(input,options)=>__failWake&&String(input).includes('wake-adjusted.wav')?Promise.resolve(new Response('missing',{status:404})):nativeFetch(input,options);
    `});
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:'http://127.0.0.1:4173/'});await wait(()=>run('!!window.resonanceDemo'));
    assert.equal(await run('__audioTest.contexts.length'),0);assert.equal(await run('performance.getEntriesByType("resource").filter(e=>e.name.includes("/sounds/")).length'),0);
    await click('#meet');assert.equal(await run('__audioTest.contexts.length'),0);
    await click('#try-demo');await wait(async()=> (await snap()).playback.counts.wake===1);
    const initial=await snap();assert(initial.wakeAge<.2);assert.equal(initial.playback.history[0].duration,.6139791666666666);
    await wait(async()=> (await snap()).playback.current===null);await wait(async()=> (await snap()).playback.musicPlaying);
    assert.equal((await snap()).playback.musicTracks,1);assert.equal((await snap()).playback.musicDefault,.10);
    await wait(async()=> (await snap()).playback.musicGain>.095);
    assert((await snap()).playback.musicGain<=.10001);assert(await run('__audioTest.music.at(-1).element.loop'));
    assert(await run('__audioTest.music.at(-1).element.src.endsWith("/sounds/waterfall.mp3")'));
    pass('No audio before Start; Wake plays once; the original waterfall.mp3 loops as a single track and gently rises to 10%');
    await click('#hand');await wait(async()=> (await snap()).playback.current==='curious');
    await sleep(220);assert((await snap()).playback.musicGain<.045);
    const curiousAt=(await snap()).playback.history.at(-1).at;await click('#clap');await wait(async()=> (await snap()).playback.current==='afraid');
    const afraid=await snap();assert.equal(afraid.playback.counts.afraid,1);assert(afraid.events.clap>=1);assert(afraid.playback.history.at(-1).at-curiousAt<1800);
    await click('#clap');await sleep(700);assert.equal((await snap()).playback.counts.afraid,1);
    await sleep(1000);await click('#retreat');await sleep(250);assert.equal((await snap()).playback.counts.afraid,1);
    await sleep(2400);await click('[data-expression="smile"]');await wait(async()=> (await snap()).playback.current==='happy');
    assert.equal((await snap()).playback.history.at(-1).duration,1.8);await sleep(3500);
    assert.equal((await snap()).playback.counts.happy,1);assert.equal((await snap()).playback.counts.curious,1);
    await wait(async()=> (await snap()).playback.musicGain>.095);
    const planned=await run('__audioTest.sources.filter(s=>s.start!==null)');for(let i=1;i<planned.length;i++)assert(planned[i].start>=planned[i-1].end,'Effects overlapped: '+JSON.stringify(planned));
    pass('Hand noticing, stable smile and retreat use their corresponding effects; Afraid preempts Curious; held inputs and quick repeats do not stack or retrigger');
    await click('#demo-controls [data-effects]');const beforeOff=(await snap()).playback.counts.afraid;await click('#clap');await sleep(150);assert.equal((await snap()).playback.counts.afraid,beforeOff);assert((await snap()).playback.musicPlaying);
    await click('#demo-controls [data-music]');assert.equal((await snap()).playback.musicPlaying,false);
    await click('#demo-controls [data-effects]');await sleep(1800);await click('#retreat');await wait(async()=> (await snap()).playback.counts.afraid>beforeOff);
    await click('#home');assert.equal((await snap()).playback.context,'closed');assert.equal((await snap()).playback.musicTracks,0);await sleep(60);
    assert(await run('__audioTest.contexts.every(c=>c.state==="closed")'));
    await click('#meet');await click('#try-demo');await wait(async()=> (await snap()).playback.counts.wake===1);await sleep(850);
    assert.equal((await snap()).playback.counts.afraid,0);assert.equal((await snap()).playback.musicTracks,0);
    await click('#demo-controls [data-music]');await wait(async()=> (await snap()).playback.musicGain>.095);
    await click('#home');assert.equal((await snap()).playback.departingMusic,1);
    const fadeStart=await run('__audioTest.music.at(-1).gain.value');await sleep(170);
    const fadeMiddle=await run('__audioTest.music.at(-1).gain.value');assert(fadeMiddle>0&&fadeMiddle<fadeStart,JSON.stringify({fadeStart,fadeMiddle}));
    assert(await run('!__audioTest.music.at(-1).element.paused'));
    await sleep(330);assert.equal((await snap()).playback.departingMusic,0);
    assert(await run('__audioTest.music.every(m=>m.element.paused&&m.context.state==="closed")'));
    await click('#meet');await click('#try-demo');await wait(async()=> (await snap()).playback.musicGain>.095);
    await click('#home');assert.equal((await snap()).playback.departingMusic,1);
    await click('#meet');await click('#try-demo');await wait(async()=> (await snap()).playback.musicPlaying);
    assert(await run('__audioTest.music.filter(m=>!m.element.paused).length===1'));
    assert(await run('__audioTest.music.slice(0,-1).every(m=>m.element.paused&&m.context.state==="closed")'));
    await sleep(600);assert((await snap()).playback.musicPlaying); // Old exit timer cannot stop this session.
    await click('#home');await sleep(600);
    assert.equal((await snap()).playback.context,'closed');assert(await run('__audioTest.contexts.every(c=>c.state==="closed")'));
    pass('Effects duck Music and it smoothly recovers; independent switches work; Home fades before stopping; rapid re-entry has one track and no stale cleanup timer');
    // A fresh page avoids the in-memory decoded file cache for a real load-error check.
    await send('Page.reload');await wait(()=>run('!!window.resonanceDemo'));await run('__failWake=true');await click('#meet');await click('#try-demo');
    await wait(async()=> (await snap()).playback.errors.length>0);assert.equal((await snap()).stage,'demo');assert.equal((await snap()).playback.counts.wake,0);
    await sleep(300);assert(await run('!document.querySelector("#demo-controls [data-resume-playback]").hidden'));
    await run('__failWake=false');await click('#demo-controls [data-resume-playback]');await wait(async()=> (await snap()).playback.errors.length===0);
    await click('#clap');await wait(async()=> (await snap()).playback.current==='afraid');await click('#home');
    pass('A missing effect does not block the experience; English retry reloads failed assets without a delayed Wake');
    await click('#meet');await click('#start');await wait(async()=> (await snap()).stage==='live',65000);await wait(async()=> (await snap()).playback.counts.wake===1);
    const liveStart=await snap();assert.equal(liveStart.live.tracks.length,2);assert(liveStart.playback.echoGuard);
    await run('__rms=.35');await sleep(450);assert.equal((await snap()).signals.spike,0);assert((await snap()).playback.musicPlaying);assert((await snap()).playback.musicGain>.001);
    await run('__rms=.006');await sleep(2600);await wait(async()=> (await snap()).playback.musicGain>.095,20000);
    await click('#calibrate');await sleep(200);assert.equal((await snap()).playback.musicTarget,.10);assert((await snap()).playback.musicGain>.095);assert((await snap()).playback.musicPlaying);
    await sleep(2600); // Finish calibration and its quiet rearm before a fresh loud onset.
    assert(await run('__audioTest.mediaOptions.at(-1).audio.echoCancellation===true'));
    await run('__rms=.4');await wait(async()=> (await snap()).playback.counts.afraid===1);await sleep(4000);
    assert.equal((await snap()).playback.counts.afraid,1);assert((await snap()).live.frames>liveStart.live.frames);assert((await snap()).signals.level>.5);
    assert((await snap()).playback.musicPlaying);assert.equal((await snap()).playback.musicTarget,.10);assert((await snap()).playback.musicGain>.095);
    pass('Mic calibration and sustained loud input leave Music playing at 10%; Wake feedback protection and one-shot loud onset still work');
    await run('__rms=.006');await sleep(4500);await run('__smile=true');await wait(async()=> (await snap()).playback.current==='happy');
    await run('__rms=.08');await sleep(350);const talking=await snap();assert(talking.playback.effectGain<.3);assert.equal(talking.playback.musicTarget,.035);assert(talking.playback.musicGain>.03);assert(talking.playback.musicPlaying);
    await click('#live-controls [data-effects]');await sleep(60);const muted=await snap();assert.equal(muted.playback.effectsEnabled,false);assert.equal(muted.playback.current,null);
    assert(muted.live.tracks.find(t=>t.kind==='audio').enabled);assert(muted.signals.level>.1);
    await wait(async()=> (await snap()).playback.musicGain>.095);assert.equal((await snap()).playback.musicTarget,.10);assert((await snap()).playback.musicPlaying);
    await click('#live-controls [data-music]');assert.equal((await snap()).playback.musicPlaying,false);
    pass('Injected smile triggers Happy with unchanged speech attenuation; Music ducks only for the effect and returns to 10% during ongoing voice; independent switches preserve microphone input');
    await shot('playback-desktop');
    for(const [width,height]of [[320,740],[390,844],[844,390]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await run('document.querySelector("#live-controls [data-music]").scrollIntoView({block:"center"})');await sleep(100);
      assert(await run('document.documentElement.scrollWidth<=innerWidth'));
      assert(await run('[...document.querySelectorAll("#live-controls .playback-controls .button-row button")].every(b=>{const r=b.getBoundingClientRect(),p=b.closest("aside").getBoundingClientRect();return r.height>=44&&r.left>=p.left&&r.right<=p.right&&r.top>=p.top&&r.bottom<=p.bottom})'));
      if(width===390)await shot('playback-mobile');
    }
    await click('#exit');await sleep(100);assert.equal((await snap()).playback.context,'closed');assert.equal((await snap()).live.tracks.length,0);
    assert(await run('__audioTest.streams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))'));assert(await run('__audioTest.contexts.every(c=>c.state==="closed")'));
    assert.equal(errors.length,0);pass('Desktop and 320/390/landscape controls fit; End interaction closes playback and capture, with no uncaught page errors');
  }finally{await click('#home').catch(()=>{});fs.writeFileSync(path.join(__dirname,'qa/playback-report.json'),JSON.stringify({checks,errors,limitations:'Chrome fake devices and injected RMS/face values; real output assets and models. No human listening, physical phone, Safari, or loudspeaker/acoustic echo test.'},null,2));await send('Page.close').catch(()=>{});ws.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
