// Geometric/time-series tests; not a physical camera accuracy test.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, 'sketch.js'), 'utf8');
const code = source.slice(source.indexOf('  function faceApproachMeasure'), source.indexOf('  // HandPose pixels'));
const { ApproachFilter, faceApproachMeasure, handApproachMeasure } = vm.runInNewContext(`const approach=(a,b,r,t)=>a+(b-a)*(1-Math.exp(-r*t));${code};({ApproachFilter,faceApproachMeasure,handApproachMeasure})`);
const { fixture } = require('./qa-hands-filter.cjs');
const checks = []; let f, now;
const measure = (scale = 1) => ({ width: .15 * scale, height: .20 * scale, x: .5, y: .5, frameAspect: 4 / 3, identity: 'face' });
function setup() { f = new ApproachFilter(); now = 0; }
function feed(seconds, get = () => measure(), hz = 12) { let events = 0; for (let i = 0; i < Math.ceil(seconds * hz); i++) { now += 1000 / hz; events += +f.update(get((i + 1) / hz), now); } return events; }
function check(name, fn) { setup(); fn(); checks.push(name); console.log('PASS ' + name); }
check('Steady acquisition, slow approach and small size jitter never startle', () => {
  feed(1); assert(f.armed); assert.equal(feed(4, t => measure(Math.exp(t * .15))), 0);
  setup(); assert.equal(feed(5, t => measure(1 + Math.sin(t * 12) * .018)), 0);
});
check('Fast coherent growth triggers once at 2.5, 4, 8, 12 and 20 Hz', () => {
  for (const hz of [2.5, 4, 8, 12, 20]) { setup(); feed(1, () => measure(), hz); assert.equal(feed(hz < 4 ? 1.1 : .65, t => measure(Math.exp(t * (hz < 4 ? .9 : 1.4))), hz), 1, String(hz)); }
});
check('Continued approach cannot rearm after cooldown; quiet recovery allows a new event', () => {
  feed(1, () => ({ ...measure(), width: .028, height: .032 }));
  assert.equal(feed(4.1, t => ({ ...measure(), width: .028 * Math.exp(t * .75), height: .032 * Math.exp(t * .75) })), 1);
  assert.equal(f.count, 1); assert(!f.armed);
  feed(1.5); assert(f.armed); assert.equal(feed(.65, t => measure(Math.exp(t * 1.4))), 1);
});
check('Dropout, stale recovery, one-frame scale jumps, identity and aspect changes establish new anchors', () => {
  feed(1); f.update(null, now += 100); assert.equal(feed(.5, () => measure(1.8)), 0); assert(!f.armed);
  feed(1); now += 1000; assert.equal(f.update(measure(2.1), now), false); assert(!f.armed);
  for (const ratio of [1.4, 1.8]) { setup(); feed(1); assert.equal(feed(1, () => measure(ratio)), 0); }
  setup(); feed(1); assert.equal(feed(.4, t => ({ ...measure(Math.exp(t * 1.4)), identity: 'different' })), 0);
  setup(); feed(1); assert.equal(feed(.4, t => ({ ...measure(Math.exp(t * 1.4)), frameAspect: 3 / 4 })), 0);
});
check('One-axis size changes, translation and face expressions are not depth evidence', () => {
  feed(1); assert.equal(feed(.7, t => ({ ...measure(), width: .15 * Math.exp(t * 1.4) })), 0);
  setup(); feed(1); assert.equal(feed(2, t => ({ ...measure(), x: .5 + .1 * Math.sin(t * 7) })), 0);
});
check('Hand spans ignore finger tips and 3D size, and reject low-confidence or clipped palms', () => {
  const open = fixture(), closed = fixture(.5, false);
  const a = handApproachMeasure(open, 320, 240), b = handApproachMeasure(closed, 320, 240);
  assert(a && b); assert.equal(a.width, b.width); assert.equal(a.height, b.height);
  open[0].keypoints3D = open[0].keypoints.map(p => ({ ...p, z: 900 })); assert.equal(handApproachMeasure(open, 320, 240).width, a.width);
  open[0].confidence = .1; assert.equal(handApproachMeasure(open, 320, 240), null);
  closed[0].keypoints[0].x = 1; assert.equal(handApproachMeasure(closed, 320, 240), null);
});
check('Face spans preserve scale across resolutions and remain usable near image edges', () => {
  const p = Array.from({ length: 468 }, () => ({ x: .5, y: .5 }));
  p[234] = { x: .4, y: .5 }; p[454] = { x: .6, y: .5 }; p[10] = { x: .5, y: .3 }; p[152] = { x: .5, y: .7 };
  const a = faceApproachMeasure(p, 640, 480), b = faceApproachMeasure(p, 320, 240);
  assert.equal(a.width, b.width); assert.equal(a.height, b.height); assert(Math.abs(a.height - .3) < 1e-8);
  p[152].y = .99; assert(faceApproachMeasure(p, 640, 480));
  p[152].y = 1.1; assert.equal(faceApproachMeasure(p, 640, 480), null);
});
check('A short lunge needs two raw increments, not two threshold crossings; debug explains missing gates', () => {
  feed(1, () => measure(), 4);
  assert.equal(f.update(measure(1.10), now += 250), false);
  assert.equal(f.update(measure(1.35), now += 250), true);
  assert.equal(f.count, 1); assert(f.lastDetection.checks.coherentSamples);
  assert.equal(f.lastDetection.checks.growth, true);
  feed(2, () => measure(1.35), 4); assert(f.armed);
  f.update(measure(1.36), now += 250); assert.equal(f.snapshot().checks.speed, false);
});
if (require.main === module) fs.writeFileSync(path.join(__dirname, 'qa/approach-filter-report.json'), JSON.stringify({ checks, limitation: 'Synthetic geometry and elapsed-time inputs. No physical camera/user performance validation.' }, null, 2));
module.exports = { ApproachFilter };
