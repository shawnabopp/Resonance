// Exercise the actual pure filters in sketch.js with deterministic input sequences.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, 'sketch.js'), 'utf8');
const filters = source.slice(source.indexOf('  class AudioGate'), source.indexOf('  // Serialized into a classic worker'));
const { AudioGate, ExpressionFilter } = vm.runInNewContext(`const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));const approach=(a,b,r,dt)=>a+(b-a)*(1-Math.exp(-r*dt));${filters};({AudioGate,ExpressionFilter});`);
const gate = new AudioGate();
let spikes = 0;
function audio(rms, seconds, sensitivity = 1) { let result; for (let i = 0; i < seconds * 100; i++) { result = gate.update(rms, .01, sensitivity); if (result.spike) spikes++; } return result; }
assert.equal(audio(.01, 3).level, 0); assert.equal(spikes, 0);
audio(.35, 5); assert.equal(spikes, 1, 'sustained loud input must not retrigger');
audio(.01, .2); audio(.4, .2); assert.equal(spikes, 1, 'brief gaps must not rearm');
audio(.01, 1); audio(.4, .1); assert.equal(spikes, 2, 'quiet period can rearm');
audio(.01, .5); audio(.4, .1); assert.equal(spikes, 2, 'cooldown blocks another onset');
gate.reset(); audio(.09, 5); assert.equal(gate.level, 0, 'constant room noise is gated');
gate.reset(); audio(.008, 2); const low = audio(.06, 1, .5).level; const high = audio(.06, 1, 3).level; assert(high > low * 2);
const face = new ExpressionFilter(); let time = 0;
function expression(values, seconds) {
  const categories = values ? Object.entries(values).map(([categoryName, score]) => ({ categoryName, score })) : [];
  let result; for (let i = 0; i < seconds * 20; i++) { time += 50; result = face.update(categories, time, .05); } return result;
}
assert.equal(expression({ jawOpen: 1 }, 3).surprise, 0, 'singing/open mouth alone is not surprise');
assert.equal(expression({ jawOpen: 1, browOuterUpLeft: .9, browOuterUpRight: .9 }, 2).surprise, 0, 'raised brows without wide eyes are not surprise');
const smile = { mouthSmileLeft: .9, mouthSmileRight: .9 };
assert.equal(expression(smile, .2).smile, 0, 'brief changes are suppressed');
assert(expression(smile, 1).smile > .8);
const surprised = { browOuterUpLeft: .9, browOuterUpRight: .9, eyeWideLeft: .8, eyeWideRight: .8, jawOpen: .5 };
assert(expression(surprised, 1.5).surprise > .7);
assert(expression({ mouthFrownLeft: .8, mouthFrownRight: .8, browInnerUp: .8 }, 1.5).sad > .8);
assert.equal(expression(null, .1).sad, 0, 'face loss clears expression output immediately');
expression(null, .6); assert.equal(face.active, null);
for (const name of ['index.html', 'sketch.js', 'style.css']) assert(!/\p{Script=Han}/u.test(fs.readFileSync(require('node:path').join(__dirname, name), 'utf8')), `Chinese text remains in ${name}`);
console.log('PASS: noise calibration, sensitivity, one-shot onset, cooldown, quiet rearm, singing rejection, expression smoothing/delay, face loss, English-only core files.');
