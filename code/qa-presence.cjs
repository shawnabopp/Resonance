// Browser integration test. Face coordinates are explicitly synthetic here;
// real model loading and device lifecycle are covered by qa-live.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  const tab = await (await fetch('http://127.0.0.1:9227/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r, { once:true }));
  let id=0; const pending=new Map(), errors=[], checks=[];
  ws.addEventListener('message', ({data}) => { const d=JSON.parse(data); if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(d.error):p.resolve(d.result);} if(d.method==='Runtime.exceptionThrown') errors.push(d.params); });
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
  const run=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
  const click=s=>run(`document.querySelector(${JSON.stringify(s)}).click()`);
  const snap=()=>run('resonanceDemo.snapshot()');
  const pass=t=>{checks.push(t);console.log('PASS '+t);};
  try {
    await send('Runtime.enable');await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`
      window.__faceInView=true;window.__testHidden=false;
      Object.defineProperty(document,'hidden',{get:()=>window.__testHidden});
      const OriginalWorker=Worker;
      window.Worker=class extends OriginalWorker {
        set onmessage(fn){super.onmessage=e=>{if(e.data.type==='result')fn({data:{...e.data,categories:[],face:window.__faceInView?{x:.75,y:.5}:null}});else fn(e);};}
      };
    `});
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:'http://127.0.0.1:4173/'});await sleep(700);
    await click('#meet');await click('#start');
    for(let i=0;i<180;i++){if((await snap()).stage==='live')break;await sleep(250);}
    assert.equal((await snap()).stage,'live');await click('#mute');
    // Cold ml5 loading/shader compilation is not observed companionship time.
    // Start the timed growth assertion only after both real pipelines are producing frames.
    for(let i=0;i<300;i++){const s=await snap();if(s.signals.facePresent && s.live.hands.frames>=3 && s.live.body.frames>=2)break;await sleep(250);}
    assert((await snap()).live.hands.frames>=3);
    const initial=await snap();await sleep(2500);const quiet=await snap();
    assert(quiet.familiarity>initial.familiarity+.01, JSON.stringify({initial,quiet}));assert.equal(quiet.signals.smile,0);assert.equal(quiet.signals.sad,0);assert.equal(quiet.signals.level,0);
    assert(quiet.center[0]>quiet.viewport[0]/2+10);pass('Live neutral landmarks grow the bond without expression scores or audio, and invite gentle following');
    await run('window.__faceInView=false');await sleep(250);const gone=await snap();await sleep(1800);const brief=await snap();
    assert(Math.abs(brief.familiarity-gone.familiarity)<.001);assert(brief.rest<.01);pass('Short face loss pauses growth without losing progress or immediately resting');
    await sleep(8500);const resting=await snap();assert(resting.rest>.08);assert.equal(resting.familiarity,brief.familiarity);
    const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(__dirname,'qa/presence-rest.png'),Buffer.from(shot.data,'base64'));
    await run('window.__faceInView=true');await sleep(1700);const returned=await snap();assert(returned.familiarity>resting.familiarity);assert(returned.rest<resting.rest);
    pass('Long absence eases into rest; returning wakes the creature and resumes the same bond');
    await run('window.__testHidden=true;document.dispatchEvent(new Event("visibilitychange"))');const beforeHidden=await snap();await sleep(1500);
    assert.equal((await snap()).familiarity,beforeHidden.familiarity);
    await run('window.__testHidden=false;document.dispatchEvent(new Event("visibilitychange"))');await sleep(600);
    assert((await snap()).familiarity-beforeHidden.familiarity<.005);pass('Background visibility pauses accumulation and returning does not catch up hidden time');
    await click('#home');await click('#meet');await click('#try-demo');const demo=await snap();await sleep(2000);assert((await snap()).familiarity>demo.familiarity+.009);
    await click('#clap');const startled=await snap();await sleep(500);assert((await snap()).familiarity>=startled.familiarity);
    await click('#demo-presence');await sleep(100);const demoAway=await snap();await sleep(700);assert.equal((await snap()).familiarity,demoAway.familiarity);
    await click('#demo-presence');await click('#reset');await run('document.querySelector("#face-position").value=.9;document.querySelector("#face-position").dispatchEvent(new Event("input"))');await sleep(1200);
    assert((await snap()).center[0]>(await snap()).viewport[0]/2+15);pass('Demo quiet presence, absence toggle, face position and loud startle preserve the same rules');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(300);
    assert(await run('document.documentElement.scrollWidth<=innerWidth'));const mobile=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(__dirname,'qa/presence-mobile.png'),Buffer.from(mobile.data,'base64'));
    assert.equal(errors.length,0);pass('Presence controls fit mobile; no uncaught browser errors');
  } finally {
    await click('#home').catch(()=>{});
    fs.writeFileSync(path.join(__dirname,'qa/presence-report.json'),JSON.stringify({checks,errors,faceInput:'Synthetic coordinates injected only by this test'},null,2));
    await send('Page.close').catch(()=>{});ws.close();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
