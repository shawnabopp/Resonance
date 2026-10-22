// Pure transition and echo-guard checks. These do not simulate room acoustics.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, 'sketch.js'), 'utf8');
const policyCode = source.slice(source.indexOf('  class SoundCues'), source.indexOf('  class ExperienceAudio'));
const gateCode = source.slice(source.indexOf('  class AudioGate'), source.indexOf('  class ExpressionFilter'));
const { SoundCues, AudioGate } = vm.runInNewContext(`const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));const approach=(a,b,r,t)=>a+(b-a)*(1-Math.exp(-r*t));${policyCode}${gateCode};({SoundCues,AudioGate})`);
for(const hz of [10,30,60]) {
  const p=new SoundCues(), events={clap:0,retreat:0}, s={facePresent:true,smile:0,handPresent:false,handSpeed:0,sad:0,surprise:0};let now=0;
  function feed(seconds,values={},familiarity=.04){Object.assign(s,values);const cues=[];for(let i=0;i<Math.ceil(seconds*hz);i++){now+=1000/hz;const c=p.update(now,s,familiarity,events);if(c)cues.push(c);}return cues;}
  assert.equal(feed(5).length,0); assert.equal(feed(.4,{smile:.9}).length,0);
  assert.equal(feed(15).filter(c=>c.name==='happy').length,1,'steady smile only once');
  feed(2.2,{smile:0});assert.equal(feed(1.5,{smile:.9}).filter(c=>c.name==='happy').length,1);
  feed(3,{smile:0});assert.equal(feed(20,{handPresent:true}).filter(c=>c.reason==='hand noticed').length,1,'steady hand only once');
  feed(1,{handPresent:false});assert.equal(feed(1,{handPresent:true}).filter(c=>c.reason==='hand noticed').length,0,'short loss does not rearm');
  feed(2.2,{handPresent:false});assert.equal(feed(1,{handPresent:true}).filter(c=>c.reason==='hand noticed').length,1);
  assert.equal(feed(1,{},.15).filter(c=>c.reason==='familiarity').length,1);assert.equal(feed(2,{},.15).length,0);
  events.clap++;events.retreat++;const c=feed(.1,{smile:.9},.4);assert.equal(c[0].name,'afraid','startle beats smile / new stage and coalesces');
  assert.equal(feed(2,{},.4).filter(c=>c.name==='afraid').length,0);
  const baseline=p.phase;p.pause();now+=500000;feed(.1,{smile:0},.4);assert.equal(p.phase,baseline);
}
const g=new AudioGate();
const depthPolicy=new SoundCues(),depthEvents={clap:0,retreat:0,depth:0};
const depthSignals={facePresent:true,smile:0,handPresent:false,handSpeed:0,sad:0,surprise:0};
depthPolicy.update(0,depthSignals,.04,depthEvents);depthEvents.depth++;
assert.equal(depthPolicy.update(100,depthSignals,.04,depthEvents).reason,'sudden approach');
assert.equal(depthPolicy.update(200,depthSignals,.04,depthEvents),null,'one depth event cannot replay');
depthEvents.depth++;depthEvents.clap++;depthEvents.retreat++;
assert.equal(depthPolicy.update(4000,depthSignals,.04,depthEvents).name,'afraid','simultaneous inputs share one cue');
for(let i=0;i<100;i++)g.update(.35,.02,1,true);
assert.equal(g.elapsed,0,'own wake is excluded from initial room-noise calibration');
for(let i=0;i<130;i++)g.update(.006,.02);
let ownSpikes=0,last;
for(let i=0;i<100;i++){last=g.update(.35,.02,1,true);ownSpikes+=+last.spike;}
assert.equal(ownSpikes,0);assert(last.level>.5,'sound ripples remain responsive');
assert.equal(g.update(.35,.02).spike,false,'echo tail does not rearm without quiet');
for(let i=0;i<30;i++)g.update(.006,.02);
assert.equal(g.update(.4,.02).spike,true,'a new loud onset works after quiet');
console.log('PASS: frame-rate-independent cue transitions, sustained-input latches, rearm, familiarity, startle priority, echo calibration hold and quiet rearm.');
