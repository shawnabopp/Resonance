// Real local ml5/models with Chrome fake devices; synthetic landmark cases are labelled.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fixture } = require('./qa-hands-filter.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  const tab = await (await fetch('http://127.0.0.1:9227/json/new?about:blank',{method:'PUT'})).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  let id=0; const pending=new Map(), errors=[], checks=[], requests=[];
  ws.addEventListener('message',({data})=>{const d=JSON.parse(data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(d.error):p.resolve(d.result);}if(d.method==='Runtime.exceptionThrown')errors.push(d.params);if(d.method==='Network.requestWillBeSent')requests.push(d.params.request.url);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
  const run=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
  const click=s=>run(`document.querySelector(${JSON.stringify(s)}).click()`);
  const snap=()=>run('resonanceDemo.snapshot()');
  const wait=async expression=>{const start=Date.now();while(Date.now()-start<75000){if(await run(expression))return;if(/hands.frames|signals.handPresent/.test(expression)){const s=await snap();if(s.live.hands.state==='error')throw Error('Hand worker: '+s.live.hands.error);}await sleep(200);}throw Error('Timeout '+expression+' '+JSON.stringify(await snap()));};
  const pass=t=>{checks.push(t);console.log('PASS '+t);};
  const shot=async name=>{const d=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(__dirname,'qa',name+'.png'),Buffer.from(d.data,'base64'));};
  try {
    for(const asset of JSON.parse(fs.readFileSync(path.join(__dirname,'vendor/hand-manifest.json'))).files){
      const r=await fetch('http://127.0.0.1:4173/'+asset.file);assert.equal(r.status,200);
      assert.equal(crypto.createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),asset.sha256);
    }
    pass('Pinned ml5 library and both local model graphs/weights serve with matching SHA-256');
    await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`
      window.__calls=0;window.__models=0;window.__detectors=0;window.__peak=0;window.__mode='real';window.__streams=[];window.__alive=0;window.__maxAlive=0;
      window.__fixture=${fixture.toString()};window.__x=.25;window.__open=true;
      const media=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia=async o=>{__calls++;const s=await media(o);__streams.push(s);return s;};
      const NativeWorker=Worker;
      window.Worker=class extends NativeWorker {
        postMessage(data,...rest){
          if(data.type==='hand-init'){this.__hand=true;__models++;__alive++;__maxAlive=Math.max(__maxAlive,__alive);if(window.__blockHand)data.detector+='-missing';}
          if(data.type==='hand-frame'){this.__detecting=true;__detectors++;__peak=Math.max(__peak,__detectors);}
          if(data.type==='hand-frame'&&__mode==='photo'){
            data.image.close();createImageBitmap(window.__photo).then(image=>super.postMessage({...data,image,width:320,height:Math.round(320*image.height/image.width)},[image]));return;
          }
          super.postMessage(data,...rest);
        }
        terminate(){if(this.__hand){__alive--;this.__hand=false;}if(this.__detecting){__detectors--;this.__detecting=false;}super.terminate();}
        set onmessage(fn){super.onmessage=e=>{
          if(e.data.type!=='hand-result'){fn(e);return;}
          if(this.__detecting){__detectors--;this.__detecting=false;}
          if(__mode==='pending'){window.__release=()=>fn(e);return;}
          if(__mode==='fail'){fn({data:{type:'hand-error',message:'Injected inference failure'}});return;}
          fn({data:{...e.data,hands:['real','photo'].includes(__mode)?e.data.hands:__mode==='absent'?[]:__fixture(__x,__open,e.data.width,e.data.height)}});
        };}
      };
    `});
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:'http://127.0.0.1:4173/'});await wait('!!window.resonanceDemo');
    assert.equal(await run('__calls'),0);assert(!requests.some(u=>u.includes('ml5.min.js')));
    await click('#meet');await click('#start');await wait('resonanceDemo.snapshot().live.hands.frames>=3');
    assert.equal(await run('__calls'),1);assert.equal(await run('__models'),1);assert.equal(await run('__peak'),1);
    assert((await snap()).live.frames>0);assert.equal((await snap()).signals.bodyMotion,0);
    assert(!requests.some(u=>/tfhub|registry.npmjs|unpkg|jsdelivr/.test(u)));
    pass('Actual ml5 HandPose loads and infers alongside Face Landmarker using one fake camera stream; all model requests are local');
    const ticks=await run('new Promise(resolve=>{let ticks=0;const start=performance.now();function frame(now){ticks++;if(now-start>1500)resolve(ticks);else requestAnimationFrame(frame)}requestAnimationFrame(frame)})');
    assert(ticks>30,`Animation frames in 1.5 seconds: ${ticks}`);
    pass('Particle animation continues while real HandPose inference runs in its own Worker');
    await run('window.__photo=new Image();__photo.src="qa/fixtures/hands.jpg";__photo.decode().then(()=>{__mode="photo"})');
    await wait('resonanceDemo.snapshot().signals.handPresent');await sleep(600);
    assert((await snap()).signals.handOpen>.6);
    pass('Real ml5 detector AND landmark inference recognize an open hand in the official TensorFlow test photo (not synthetic landmarks)');
    await click('#mute');await run("__mode='synthetic'");await wait('resonanceDemo.snapshot().signals.handPresent');await sleep(1600);
    const open=await snap();assert(open.signals.handX>.7);assert(open.expansion>1.2);assert(open.center[0]>open.viewport[0]/2+30);
    await run('__open=false');await sleep(1600);const closed=await snap();assert(closed.expansion<.85);
    await run('__x=.75');await sleep(2200);assert((await snap()).center[0]<(await snap()).viewport[0]/2-30);
    pass('Synthetic landmarks drive mirrored following and open/fist expansion through the live pipeline');
    const eventCount=(await snap()).events.retreat;await run('__x=.5;__open=true');await sleep(1200);
    await run('window.__wave=setInterval(()=>{__x=__x===.4?.6:.4},140)');await sleep(4600);await run('clearInterval(__wave)');
    assert.equal((await snap()).events.retreat,eventCount+1);pass('Synthetic continuous waving triggers one retreat and recovery, with no repeated startles');
    await run("__mode='absent'");await sleep(700);const lost=await snap();assert(!lost.signals.handPresent);
    await sleep(2200);assert(Math.abs((await snap()).center[0]-(await snap()).viewport[0]/2)<25);
    await run("__mode='synthetic';__x=.3");await sleep(1000);await click('#toggle-preview');const frames=(await snap()).live.hands.frames;
    await sleep(600);assert((await snap()).live.hands.frames>frames);
    pass('Loss returns to autonomous floating; hiding preview keeps hand inference active');
    await shot('hands-desktop');
    for(const [w,h] of [[390,844],[320,720],[844,390]]){
      await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});await sleep(300);
      assert(await run('document.documentElement.scrollWidth<=innerWidth'));await run('document.querySelector("#retry-hand").parentElement.scrollIntoView({block:"center"})');
      await shot('hands-'+w);
    }
    pass('Live hand instructions fit 390px, 320px and landscape layouts without page overflow');
    await run("__mode='fail'");await wait('resonanceDemo.snapshot().live.hands.state==="error"');
    assert.equal((await snap()).stage,'live');await run("__mode='synthetic'");await click('#retry-hand');await wait('resonanceDemo.snapshot().signals.handPresent');assert.equal(await run('__calls'),1);
    pass('Hand inference failure has an independent retry; face/microphone session stays live');
    await run("__mode='pending'");await wait('typeof __release==="function"');await click('#home');
    assert(await run('__streams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))'));
    await run("__mode='synthetic';__release()");await sleep(300);assert(!(await snap()).signals.handPresent);
    await click('#meet');await click('#start');await wait('resonanceDemo.snapshot().signals.handPresent');
    assert.equal(await run('__calls'),2);assert.equal(await run('__alive'),1);assert.equal(await run('__maxAlive'),1);assert.equal(await run('__peak'),1);
    pass('Home stops devices and the hand worker; pending results cannot leak; reentry has one worker and one inference at a time');
    await click('#exit');assert.equal(await run('__alive'),0);await run('window.__blockHand=true');
    await click('#meet');await click('#start');await wait('resonanceDemo.snapshot().live.hands.state==="error"');
    assert.equal((await snap()).stage,'live');const mediaCalls=await run('__calls');await run('window.__blockHand=false;__mode="real"');await click('#retry-hand');await wait('resonanceDemo.snapshot().live.hands.frames>=2');assert.equal(await run('__calls'),mediaCalls);
    pass('An actual model 404 shows failure; retry loads the real model without another camera request');
    assert.equal(errors.length,0,JSON.stringify(errors));
  } finally {
    await click('#home').catch(()=>{});fs.writeFileSync(path.join(__dirname,'qa/hands-report.json'),JSON.stringify({checks,errors,input:'Chrome fake media; synthetic landmark cases explicitly marked'},null,2));
    await send('Page.close').catch(()=>{});ws.close();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
