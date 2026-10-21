const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const code = fs.readFileSync(path.join(__dirname, 'sketch.js'), 'utf8');
const context = vm.createContext({ performance });
vm.runInContext(`const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));const approach=(a,b,r,dt)=>a+(b-a)*(1-Math.exp(-r*dt));${code.slice(code.indexOf('  class BodyFilter'),code.indexOf('  // Serialized into a classic worker'))};this.Filter=BodyFilter;this.Budget=MotionBudget;`,context);
function fixture({ lean=0, arms='rest', scale=1, phase=0, confidence=.99 }={}, width=640, height=480) {
  const span=height*.27*scale, cx=width*.5+lean*span, cy=height*.43;
  const points=Array.from({length:33},()=>({x:.5,y:.3,z:0,visibility:0,presence:0}));
  const point=(i,x,y)=>points[i]={x:(cx+x*span)/width,y:(cy+y*span)/height,z:0,visibility:confidence,presence:confidence};
  point(11,-.5,0);point(12,.5,0);
  for(const [shoulder,elbow,wrist,sign] of [[11,13,15,-1],[12,14,16,1]]) {
    if(arms==='raised'){point(elbow,sign*.7,-.65);point(wrist,sign*.7,-1.2);}
    else if(arms==='open'){point(elbow,sign*1.1,0);point(wrist,sign*1.6,0);}
    else {point(elbow,sign*.65,.7+phase*.2);point(wrist,sign*.55,1.3+phase*.35);}
  }
  return points;
}
if(require.main===module){
  const Filter=context.Filter;let now=0;const f=new Filter();
  const feed=(options={},count=20,w=640,h=480,step=167)=>{for(let i=0;i<count;i++){now+=step;f.update(fixture(options,w,h),now,w,h);f.tick(now,.167);}};
  feed();assert(f.present);assert(f.motion<.001);assert(f.lift<.001);
  feed({lean:.6});assert(f.sway<-.45);feed({lean:-.6});assert(f.sway>.45);
  feed({arms:'open'});assert(f.spread>.9);assert(f.lift>.6);
  feed({arms:'raised'});assert(f.lift>.9);feed();assert(f.spread<.01);assert(f.lift<.01);
  console.log('PASS: stillness, mirrored sway, bilateral open/raised arms and return');
  for(const scale of [.6,1,1.2]){
    const near=new Filter();for(let i=0;i<20;i++)near.update(fixture({scale,arms:'open'}),i*167,640,480);
    assert(near.spread>.9);assert(Math.abs(near.sway)<.001);assert(near.motion<.001);
  }
  const zoom=new Filter();for(let i=0;i<30;i++)zoom.update(fixture({scale:.7+i*.01}),i*167,640,480);
  assert(zoom.motion<.01);assert(Math.abs(zoom.sway)<.01);
  const tilted=new Filter();let tiltTime=0;
  const depth=scale=>{const p=fixture({scale});p[11].y+=.03*scale;p[12].y-=.03*scale;tilted.update(p,tiltTime+=167,640,480);};
  for(let i=0;i<20;i++)depth(.6);const leanBefore=tilted.sway;
  for(let i=1;i<=8;i++)depth(.6*Math.pow(1.07,i));assert(Math.abs(tilted.sway-leanBefore)<.01);
  const portrait=new Filter();for(let i=0;i<20;i++)portrait.update(fixture({arms:'raised'},480,640),i*167,480,640);assert(portrait.lift>.9);
  console.log('PASS: shoulder-scale normalization, depth change rejection and portrait proportions');
  for(let i=0;i<35;i++){now+=167;f.update(fixture({lean:Math.sin(i*.6)*.4,phase:Math.sin(i*.7)}),now,640,480);}
  assert(f.motion>.2);const moving=f.motion;feed({},1);assert(f.motion>0);
  feed({},40);assert(f.motion<moving*.05);
  const closeUp=fixture();for(const i of [13,14,15,16])closeUp[i].visibility=.1;
  now+=200;f.update(closeUp,now,640,480);now+=600;f.update(closeUp,now,640,480);assert(!f.present);
  for(let i=0;i<25;i++)f.tick(now+i*167,.167);assert(f.motion<.01);
  feed({},2);const old=f.motion;feed({lean:1.4},1);assert(!f.present);assert(f.motion<=old+.001);
  feed({},3);const oneArm=fixture({arms:'raised'});oneArm[16].visibility=.1;
  for(let i=0;i<20;i++){now+=167;f.update(oneArm,now,640,480);}assert(f.lift<.01);
  console.log('PASS: dance energy settles slowly; close-up, missing wrist, loss, reentry and outlier handling');
  const budget=new context.Budget(),a={},b={};assert(budget.acquire(a,performance.now()));assert(!budget.acquire(b,performance.now()));
  budget.release(b);assert.equal(budget.owner,a);budget.release(a);assert(!budget.acquire(b,performance.now()));assert(budget.acquire(b,performance.now()+20));
  console.log('PASS: hand/body budget has one owner, ignores stale release and leaves a scheduling gap');
}
module.exports={fixture};
