// Synthetic keypoints exercise production geometry. Not human recognition accuracy.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, 'sketch.js'), 'utf8');
const classes = source.slice(source.indexOf('  class HandFilter'), source.indexOf('  // Upper-body geometry'));
const { HandFilter, HandSculpture } = vm.runInNewContext(`const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));const approach=(a,b,r,t)=>a+(b-a)*(1-Math.exp(-r*t));${classes};({HandFilter,HandSculpture})`);
function shapeFixture(gesture = 'open', options = {}) {
  const { width = 320, height = 240, x = .5, y = .54, scale = 1, roll = 0, finger = 1, wiggle = 0 } = options;
  const p = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  p[0] = { x: 0, y: .65 }; p[5] = { x: -.40, y: -.25 }; p[9] = { x: 0, y: -.35 };
  p[13] = { x: .34, y: -.23 }; p[17] = { x: .62, y: -.05 };
  const thumb = gesture === 'open' ? [[-.43,.35],[-.70,.12],[-.95,-.04],[-1.15,-.20]] : [[-.43,.35],[-.23,-.12],[.12,-.17],[.30,-.02]];
  thumb.forEach(([x,y], i) => { p[i + 1] = { x, y }; });
  for (let f = 1; f < 5; f++) {
    const base = f * 4 + 1, b = p[base];
    const up = gesture === 'open' || gesture === 'v' && f <= 2 || gesture === 'point' && f === finger;
    const spread = gesture === 'v' ? f === 1 ? -.28 : .30 : 0;
    p[base + 1] = { x: b.x + spread * .32, y: b.y - (up ? .42 : .30) };
    p[base + 2] = { x: b.x + spread * .70, y: b.y + (up ? -.90 : .04) };
    p[base + 3] = { x: b.x + spread, y: b.y + (up ? -1.30 : .22) };
  }
  const tip = [4,8,12,16,20][finger]; p[tip].x += wiggle; p[tip].y += wiggle * .7;
  const unit = Math.min(width, height) * .13 * scale, cs = Math.cos(roll), sn = Math.sin(roll);
  return [{ confidence: .98, handedness: 'Right', keypoints: p.map(v => ({ x: x * width + unit * (v.x * cs - v.y * sn), y: y * height + unit * (v.x * sn + v.y * cs) })) }];
}
function main() {
  const checks = [], pass = text => { checks.push(text); console.log('PASS ' + text); };
  for (const hz of [4,8,12,30]) {
    const f = new HandFilter(); let now = 0;
    for (const gesture of ['open','fist','v','point','open']) {
      for (let i = 0; i < Math.ceil(hz * 1.1); i++) f.update(shapeFixture(gesture), now += 1000 / hz, 320, 240);
      assert.equal(f.art.pose.gesture, gesture, `${hz}Hz ${gesture}`);
    }
  }
  pass('Four poses and repeated transitions stabilize at 4/8/12/30 Hz using elapsed-time dwell');
  let f = new HandFilter(), now = 0;
  for (let i = 0; i < 16; i++) f.update(shapeFixture(), now += 125, 320, 240);
  let peak = 0, palmSpeed = 0, waves = 0;
  for (let i = 0; i < 32; i++) {
    waves += +f.update(shapeFixture('open', { finger: 1, wiggle: Math.sin(i * .65) * .30 }), now += 125, 320, 240);
    peak = Math.max(peak, f.art.energy[1]); palmSpeed = Math.max(palmSpeed, f.speed);
  }
  assert(peak > .25); assert(palmSpeed < 1e-10); assert.equal(waves, 0);
  assert(f.art.energy.filter((_, i) => i !== 1).every(e => e < .01));
  pass('Stationary palm + moving index produces localized finger energy, without palm speed or a wave startle');
  f = new HandFilter(); now = 0; peak = 0;
  for (let i = 0; i < 40; i++) {
    f.update(shapeFixture('open', { x: .25 + i * .01, roll: i * .025, scale: 1 + i * .004 }), now += 125, 320, 240);
    peak = Math.max(peak, ...f.art.energy);
  }
  assert(peak < .001); assert(f.speed > 0);
  pass('Rigid translation, rotation and distance changes are separated from finger articulation');
  const portrait = new HandFilter();
  for (let i = 1; i <= 12; i++) portrait.update(shapeFixture('point', { width:240, height:320, x:.3 }), i * 125, 240, 320);
  assert.equal(portrait.art.pose.gesture, 'point'); assert(portrait.x > .68);
  assert(portrait.art.pose.points[8].x > 0);
  pass('Portrait source dimensions and mirrored point direction remain consistent');
  const cloud = new HandSculpture(2000);
  for (let i = 0; i < 120; i++) cloud.update(portrait.art.pose, 1 / 60);
  assert(cloud.blend > .43 && cloud.blend < .49); assert(Math.max(...cloud.coords) < 2.8); assert(Math.min(...cloud.coords) > -2.8);
  assert(Array.from(cloud.coords).filter((_, i) => i % 3 === 2).some(z => Math.abs(z) > .25));
  const before = cloud.blend; cloud.update(null, 1 / 60); assert(cloud.blend > before * .95);
  for (let i = 0; i < 360; i++) cloud.update(null, 1 / 60);
  assert(cloud.blend < .001); assert(cloud.energy.every(e => e < .001));
  pass('Weak attraction uses broad 3D clouds; loss releases the gesture tendency gradually to the selected base');
  const lastTime = 1500; portrait.update([], lastTime + 800, 240, 320); assert(!portrait.present); assert.equal(portrait.art.pose, null);
  portrait.update(shapeFixture('point', { width:240,height:320 }), lastTime + 925, 240, 320);
  assert(portrait.art.energy.every(e => e === 0)); assert.equal(portrait.art.gesture, null);
  pass('Tracking loss clears old gesture/velocity; reacquisition starts with no stored finger impulse');
  fs.writeFileSync(path.join(__dirname, 'qa/hand-shapes-filter-report.json'), JSON.stringify({ checks, limitation: 'Synthetic 2D hand landmarks, not physical-camera recognition accuracy.' }, null, 2));
}
if (require.main === module) main();
module.exports = { shapeFixture };
