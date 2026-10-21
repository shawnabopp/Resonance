const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, 'sketch.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(`const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));const approach=(a,b,r,dt)=>a+(b-a)*(1-Math.exp(-r*dt));${source.slice(source.indexOf('  class HandFilter'), source.indexOf('  // Serialized into a classic worker'))};this.Filter=HandFilter;`, context);
function fixture(x = .5, open = true, width = 320, height = 240) {
  const points = Array.from({length:21}, () => ({x:x*width,y:.6*height}));
  points[0] = {x:x*width,y:.7*height};
  for (const [n,i] of [5,9,13,17].entries()) {
    const fx = (x+(n-1.5)*.035)*width;
    points[i] = {x:fx,y:.51*height};
    points[i+1] = {x:fx,y:.4*height};
    points[i+2] = {x:fx,y:(open?.3:.47)*height};
    points[i+3] = {x:fx,y:(open?.23:.62)*height};
  }
  return [{confidence:.95,keypoints:points}];
}
if (require.main === module) {
  let now=0;const f=new context.Filter();
  const feed=(x=.5,open=true,frames=1,w=320,h=240)=>{let waves=0;for(let n=0;n<frames;n++){now+=125;waves+=f.update(fixture(x,open,w,h),now,w,h)?1:0;}return waves;};
  assert.equal(feed(.25,true,20),0);assert(f.present);assert(f.x>.74);assert(f.open>.9);
  feed(.25,false,20);assert(f.open<.1);
  feed(.3,true,10,240,320);assert(Math.abs(f.x-.7)<.01);assert(f.open>.9);
  console.log('PASS: palm openness and fist gathering; mirrored x; portrait/landscape source dimensions');
  feed(.5,true,10);let waves=0;
  for(let i=0;i<50;i++)waves+=feed(i%2?.6:.4);
  assert.equal(waves,1);feed(.5,true,10);
  waves=0;for(let i=0;i<10;i++)waves+=feed(i%2?.6:.4);
  assert.equal(waves,1);console.log('PASS: sustained fast waving triggers once, 3s cooldown and slow rearm');
  const before=f.x;now+=125;f.update([],now,320,240);assert(f.present);
  now+=600;f.update([],now,320,240);assert(!f.present);assert.equal(f.x,before);
  assert.equal(feed(.8,true),0);assert(!f.present);feed(.8,true,10);assert(f.present);
  assert.equal(feed(.15,true),0);assert(f.speed===0);
  now+=125;f.update([{...fixture()[0],confidence:.1}],now,320,240);
  assert.equal(feed(.15,true),0);
  console.log('PASS: brief dropout tolerance, prolonged loss, no acquisition/teleport startle');
  const slow = new context.Filter();
  for(let i=1;i<=8;i++)slow.update(fixture(.35),i*650,320,240);
  assert(slow.present);assert(Math.abs(slow.x-.65)<.01);assert(slow.open>.9);
  console.log('PASS: slow-device intervals still acquire a stable hand');
}
module.exports = { fixture };
