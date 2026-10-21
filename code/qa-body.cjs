// Real Pose Landmarker + official photo, then explicitly synthetic motion sequences.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fixture } = require('./qa-body-filter.cjs');
const { fixture: handFixture } = require('./qa-hands-filter.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  const tab=await(await fetch('http://127.0.0.1:9227/json/new?about:blank',{method:'PUT'})).json();
  const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  let id=0;const pending=new Map(),errors=[],checks=[];
  ws.addEventListener('message',({data})=>{const d=JSON.parse(data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(d.error):p.resolve(d.result);}if(d.method==='Runtime.exceptionThrown')errors.push(d.params);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
  const run=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
  const click=s=>run(`document.querySelector(${JSON.stringify(s)}).click()`),snap=()=>run('resonanceDemo.snapshot()');
  const wait=async expression=>{const start=Date.now();while(Date.now()-start<65000){if(await run(expression))return;if(/body.frames|signals.bodyPresent/.test(expression)){const s=await snap();if(s.live.body.state==='error')throw Error(s.live.body.error);}await sleep(150);}throw Error('Timeout '+expression+' '+JSON.stringify(await snap()));};
  const pass=t=>{checks.push(t);console.log('PASS '+t);};
  const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(__dirname,'qa',name+'.png'),Buffer.from(r.data,'base64'));};
  try{
    for(const asset of JSON.parse(fs.readFileSync(path.join(__dirname,'vendor/body-manifest.json'))).files){const r=await fetch('http://127.0.0.1:4173/'+asset.file);assert.equal(r.status,200);assert.equal(crypto.createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),asset.sha256);}
    pass('Official lite model and QA photo are local, complete and match SHA-256');
    await send('Runtime.enable');await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`
      window.__calls=0;window.__streams=[];window.__alive=0;window.__maxAlive=0;window.__busy=0;window.__peak=0;
      window.__mode='real';window.__lean=0;window.__arms='rest';window.__dance=false;window.__scale=1;window.__hidden=false;window.__face=false;window.__hand=false;
      window.__fixture=${fixture.toString()};window.__handFixture=${handFixture.toString()};
      Object.defineProperty(document,'hidden',{get:()=>__hidden});
      const media=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia=async options=>{__calls++;const s=await media(options);__streams.push(s);return s;};
      const NativeWorker=Worker;
      window.Worker=class extends NativeWorker{
        constructor(...args){super(...args);__alive++;__maxAlive=Math.max(__maxAlive,__alive);this.__alive=true;}
        postMessage(data,...rest){
          if(data.type==='body-init'&&window.__broken)data.model+='-missing';
          if(data.type==='body-init'&&window.__holdInit){window.__releaseInit=()=>super.postMessage(data,...rest);return;}
          if(['body-frame','hand-frame'].includes(data.type)){if(this.__busy)throw Error('Duplicate inference');this.__busy=true;__busy++;__peak=Math.max(__peak,__busy);}
          if(data.type==='body-frame'&&__mode==='photo'){
            data.image.close();createImageBitmap(__photo).then(image=>super.postMessage({...data,image,width:384,height:Math.round(384*image.height/image.width)},[image]));return;
          }
          super.postMessage(data,...rest);
        }
        terminate(){if(this.__alive){__alive--;this.__alive=false;}if(this.__busy){__busy--;this.__busy=false;}super.terminate();}
        set onmessage(fn){super.onmessage=e=>{
          if(['body-result','hand-result','body-error','hand-error'].includes(e.data.type)&&this.__busy){__busy--;this.__busy=false;}
          if(e.data.type==='result'&&__face){fn({data:{...e.data,face:{x:.5,y:.5},categories:[{categoryName:'mouthSmileLeft',score:.95},{categoryName:'mouthSmileRight',score:.95}]}});return;}
          if(e.data.type==='hand-result'&&__hand){fn({data:{...e.data,hands:__handFixture(.22,false,e.data.width,e.data.height)}});return;}
          if(e.data.type!=='body-result'){fn(e);return;}
          if(__mode==='pending'){window.__release=()=>fn(e);return;}
          if(__mode==='fail'){fn({data:{type:'body-error',message:'Injected failure'}});return;}
          const p=performance.now()/1000;
          const landmarks=['real','photo'].includes(__mode)?e.data.landmarks:__mode==='absent'?[]:__fixture({lean:__dance?Math.sin(p*4)*.6:__lean,arms:__arms,scale:__scale,phase:__dance?Math.sin(p*5):0},e.data.width,e.data.height);
          fn({data:{...e.data,landmarks}});
        };}
      };
    `});
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:'http://127.0.0.1:4173/'});await wait('!!window.resonanceDemo');
    await click('#meet');await click('#try-demo');assert.equal(await run('__calls'),0);assert.equal(await run('__alive'),0);
    await click('#home');await click('#meet');await run('window.__holdInit=true');await click('#start');await click('#start');
    await wait('typeof __releaseInit==="function"');const loading=await snap();await sleep(600);assert((await snap()).live.hands.frames>loading.live.hands.frames);assert((await snap()).live.frames>loading.live.frames);
    await run('__holdInit=false;__releaseInit()');await wait('resonanceDemo.snapshot().live.body.frames>=3');
    pass('Slow body loading does not reserve the hand inference slot or pause face tracking');
    assert.equal(await run('__calls'),1);assert.equal(await run('__alive'),3);assert.equal(await run('__peak'),1);
    assert((await snap()).live.frames>3);assert((await snap()).live.hands.frames>1);await click('#mute');
    pass('Face, hand and body models infer from one stream; hand/body never overlap or queue duplicate work; Demo requests no devices');
    const ticks=await run('new Promise(resolve=>{let n=0;const start=performance.now();function tick(now){n++;if(now-start>1500)resolve(n);else requestAnimationFrame(tick)}requestAnimationFrame(tick)})');assert(ticks>30);
    pass('Particle animation continues while three real models are active');
    await run('window.__photo=new Image();__photo.src="qa/fixtures/pose.jpg";__photo.decode().then(()=>{__mode="photo"})');await wait('resonanceDemo.snapshot().signals.bodyPresent');
    pass('Actual Pose Landmarker recognizes shoulders, elbows and wrists in the official pose photo');
    await run('__mode="absent"');await sleep(1300);await run('__mode="synthetic"');await sleep(1500);
    const neutral=await snap(),events={...neutral.events};await run('__lean=.7');await sleep(2000);const left=await snap();
    for(let step=1;step<=8;step++){await run('__lean='+(.7-step*.175));await sleep(150);}await sleep(1800);const right=await snap();assert(left.center[0]<neutral.center[0]-20);assert(right.center[0]>neutral.center[0]+20,JSON.stringify({neutral:neutral.center,left:left.center,right:right.center,body:right.body}));
    await run('__lean=0;__arms="open"');await sleep(2200);const open=await snap();assert(open.expansion>neutral.expansion+.18);assert(open.center[1]<neutral.center[1]-20);
    await run('__arms="raised"');await sleep(1800);assert((await snap()).body.lift>.8);
    await run('__arms="rest"');await sleep(2800);const lowered=await snap();assert(lowered.body.lift<.12);assert(lowered.expansion<open.expansion-.1);
    assert.deepEqual(lowered.events,events);pass('Synthetic sway is mirrored; open/raised arms float and expand; lowering settles without a startle');
    await run('__dance=true');await sleep(3200);const dancing=await snap();assert(dancing.body.motion>.2);
    await run('__dance=false');await sleep(200);assert((await snap()).body.motion>.08);await sleep(4200);assert((await snap()).body.motion<dancing.body.motion*.25);
    pass('Synthetic sustained movement increases flow/rotation and decays gradually after stopping');
    await run('__arms="open";__hand=true;__face=true');await sleep(2800);const combined=await snap();
    assert(combined.signals.handPresent&&combined.signals.bodyPresent&&combined.signals.smile>.5);assert(combined.center[0]>combined.viewport[0]/2+30);assert(combined.expansion<open.expansion+.1);
    assert(combined.bounds[0]>=0&&combined.bounds[2]<=combined.viewport[0]);
    pass('Body offsets coexist with hand-led following/gathering and facial colour; particles stay bounded');
    await click('#toggle-preview');const frameCount=(await snap()).live.body.frames;await sleep(700);assert((await snap()).live.body.frames>frameCount);
    await run('__mode="absent";__hand=false');await sleep(3600);const gone=await snap();assert(!gone.signals.bodyPresent);assert(gone.body.lift<.03);assert(gone.signals.smile>.5);assert(gone.live.active);
    pass('Hidden preview keeps tracking; missing upper body settles while face and microphone remain active');
    await run('__mode="synthetic";__arms="open"');await wait('resonanceDemo.snapshot().signals.bodyPresent');
    await run('__hidden=true;document.dispatchEvent(new Event("visibilitychange"))');await sleep(300);const hiddenFrames=(await snap()).live.body.frames;await sleep(900);assert.equal((await snap()).live.body.frames,hiddenFrames);
    await run('__hidden=false;document.dispatchEvent(new Event("visibilitychange"))');await wait('resonanceDemo.snapshot().signals.bodyPresent');pass('Background tabs stop submitting pose frames and resume without stale results');
    await run('document.querySelector("#body-status").scrollIntoView({block:"center"})');await shot('body-desktop');
    for(const [width,height] of [[390,844],[320,720],[844,390]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true});await sleep(300);
      assert(await run('document.documentElement.scrollWidth<=innerWidth'));assert(await run('getComputedStyle(document.querySelector(".body-phone-hint")).display!=="none"'));
      await run('document.querySelector("#body-status").scrollIntoView({block:"center"})');await shot('body-'+width);
    }pass('English body instructions fit narrow mobile and landscape; phone-specific guidance is visible');
    await run('__mode="fail"');await wait('resonanceDemo.snapshot().live.body.state==="error"');const failure=await snap();await sleep(400);assert((await snap()).live.frames>failure.live.frames);assert((await snap()).live.hands.frames>failure.live.hands.frames);
    await run('__mode="synthetic"');await click('#retry-body');await wait('resonanceDemo.snapshot().signals.bodyPresent');assert.equal(await run('__calls'),1);
    pass('Body failure releases its shared slot; face/hand continue and Retry reconnects without new permissions');
    await run('__mode="pending"');await wait('typeof __release==="function"');await click('#home');assert.equal(await run('__alive'),0);assert(await run('__streams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))'));
    await run('__release();__mode="synthetic"');await sleep(250);assert(!(await snap()).signals.bodyPresent);
    await click('#meet');await click('#start');await wait('resonanceDemo.snapshot().signals.bodyPresent');assert.equal(await run('__calls'),2);assert.equal(await run('__maxAlive'),3);assert.equal(await run('__peak'),1);
    pass('Home terminates every worker/track; late results are ignored; reentry has no duplicate tasks');
    await click('#exit');await run('__broken=true;__mode="real"');await click('#meet');await click('#start');await wait('resonanceDemo.snapshot().live.body.state==="error"');assert.equal((await snap()).stage,'live');
    await run('__broken=false');await click('#retry-body');await wait('resonanceDemo.snapshot().live.body.frames>=2');assert.equal(await run('__calls'),3);pass('Actual missing model file gives a non-blocking error and retries successfully');
    await click('#home');await click('#meet');await click('#try-demo');
    await run('for(const [id,value] of [["body",1],["body-lean",.7],["body-arms",1]]){const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event("input"))}');await sleep(1600);
    assert((await snap()).body.lift>.9);await click('#reset');await sleep(2400);assert((await snap()).body.lift<.01);assert.equal(await run('__alive'),0);
    pass('Demo body controls exercise the same renderer; Reset clears inputs without loading models');assert.equal(errors.length,0,JSON.stringify(errors));
  }finally{await click('#home').catch(()=>{});fs.writeFileSync(path.join(__dirname,'qa/body-report.json'),JSON.stringify({checks,errors,input:'Chrome virtual media; official pose photo for real recognition; synthetic sequences for behavioural assertions'},null,2));await send('Page.close').catch(()=>{});ws.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
