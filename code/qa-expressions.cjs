// Synthetic blendshape sequences test decision logic, NOT human recognition accuracy.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, 'sketch.js'), 'utf8');
const filter = source.slice(source.indexOf('  class ExpressionFilter'), source.indexOf('  // Relationship time'));
const ExpressionFilter = vm.runInNewContext(`const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));const approach=(a,b,r,dt)=>a+(b-a)*(1-Math.exp(-r*dt));${filter};ExpressionFilter`);
const neutral = { browInnerUp: .035, mouthFrownLeft: .025, mouthFrownRight: .03, mouthSmileLeft: .05, mouthSmileRight: .04, browOuterUpLeft: .04, browOuterUpRight: .04, eyeWideLeft: .03, eyeWideRight: .03, jawOpen: .04, browDownLeft: .025, browDownRight: .025 };
const sad = { ...neutral, mouthFrownLeft: .2, mouthFrownRight: .16, browInnerUp: .23 };
const smile = { ...neutral, mouthSmileLeft: .9, mouthSmileRight: .85 };
const surprise = { ...neutral, browOuterUpLeft: .8, browOuterUpRight: .85, eyeWideLeft: .8, eyeWideRight: .8, jawOpen: .6 };
let f, now, checks = [];
function reset() { f = new ExpressionFilter(); now = 0; }
function feed(values, seconds, hz = 20) {
  let out;
  for (let i = 0; i < Math.ceil(seconds * hz); i++) { now += 1000 / hz; out = f.update(values ? Object.entries(values).map(([categoryName, score]) => ({ categoryName, score })) : [], now, 1 / hz); }
  return out;
}
function check(name, fn) { reset(); fn(); checks.push(name); console.log('PASS ' + name); }
check('Moderate asymmetric frown with inner brows enters sad-looking; raw names and animation output are connected', () => {
  assert(feed(sad, 1.5).sad > .6); assert.equal(f.active, 'sad');
  assert.equal(f.diagnostics().raw.mouthFrownRight, .16); assert.equal(f.diagnostics().raw.browInnerUp, .23);
  assert(f.output.sad > f.scores.sad); assert.equal(f.rules.enter.sad, .28);
});
check('Stronger bilateral frown works without requiring raised brows; a single mouth corner does not', () => {
  assert(feed({ ...neutral, mouthFrownLeft: .3, mouthFrownRight: .28 }, 2).sad > .6);
  feed({ ...neutral, mouthFrownLeft: .9, mouthFrownRight: .02 }, 2); assert.equal(f.active, null);
});
check('Neutral, absent smiles, raised inner brows, blinking and lowered gaze alone do not imply sadness', () => {
  for (const values of [neutral, { ...neutral, mouthSmileLeft: 0, mouthSmileRight: 0 }, { ...neutral, browInnerUp: .9 }, { ...neutral, eyeBlinkLeft: 1, eyeBlinkRight: 1, eyeLookDownLeft: 1, eyeLookDownRight: 1 }]) {
    assert.equal(feed(values, 2).sad, 0); assert.equal(f.active, null);
  }
});
check('Smile is preserved and does not lock out a later sustained sad-looking cue', () => {
  assert(feed(smile, 1.5).smile > .9); assert(feed({ ...sad, mouthSmileLeft: .24, mouthSmileRight: .23 }, 1.5).sad > .55);
  assert(feed(smile, 1.5).smile > .9);
  assert(feed({ ...smile, mouthFrownLeft: .25, mouthFrownRight: .24, browInnerUp: .3 }, 2).smile > .9);
});
check('Open-mouth singing, raised brows without wide eyes and speech-like mild frowns are rejected; full surprise works', () => {
  for (const values of [{ ...neutral, jawOpen: .95 }, { ...neutral, jawOpen: .9, browOuterUpLeft: .8, browOuterUpRight: .8 }, { ...sad, jawOpen: .85 }]) {
    const o = feed(values, 2); assert.equal(o.surprise, 0); assert.equal(o.sad, 0);
  }
  assert(feed(surprise, 1.5).surprise > .7); assert.equal(f.active, 'surprise');
});
check('Transient cues and threshold noise do not cause flicker; face loss clears stale expression immediately', () => {
  feed(sad, .25); assert.equal(f.active, null); feed(neutral, 1); assert.equal(f.active, null);
  for (let i = 0; i < 20; i++) feed(i % 2 ? sad : neutral, .1);
  assert.equal(f.active, null); feed(sad, 1.5); feed(null, .05); assert.equal(f.active, null);
  feed(neutral, .1); assert.equal(f.output.sad, 0);
});
check('Elapsed-time smoothing and dwell give comparable results at 10 and 30 Hz', () => {
  const a = feed(sad, 1.5, 10).sad; reset(); const b = feed(sad, 1.5, 30).sad; assert(Math.abs(a - b) < .01);
});
check('Neutral calibration removes a personal resting offset without changing smile or losing a new frown', () => {
  const resting = { ...neutral, mouthFrownLeft: .25, mouthFrownRight: .26, browInnerUp: .15 };
  feed(resting, 1.5); assert.equal(f.active, 'sad'); f.startCalibration(now);
  assert.equal(feed(resting, .5).sad, 0); feed(resting, 2.1);
  assert(f.baseline); assert.equal(f.baseline.mouthFrownLeft, .25); assert.equal(f.active, null);
  assert(feed({ ...resting, mouthFrownLeft: .45, mouthFrownRight: .42, browInnerUp: .38 }, 1.5).sad > .6);
  assert(feed(smile, 1.5).smile > .9);
  const baseline = f.baseline; f.clearTracking(); assert.equal(f.baseline, baseline);
  f.resetCalibration(); assert.equal(f.baseline, null);
});
check('Calibration rejects smiling, movement and missing faces, and can be retried', () => {
  feed(neutral, 1); f.startCalibration(now); feed(smile, 8.5); assert.equal(f.baseline, null); assert.equal(f.calibration, null);
  feed(neutral, .2); f.startCalibration(now); feed(neutral, 1); feed(null, .1); assert.equal(f.calibration, null); assert.equal(f.baseline, null);
  feed(neutral, .2); f.startCalibration(now);
  for (let i = 0; i < 20; i++) feed({ ...neutral, mouthFrownLeft: i % 2 ? .22 : .03 }, .15);
  assert.equal(f.baseline, null); feed(neutral, 2.5); assert(f.baseline);
});
check('Missing and non-finite scores cannot create positive evidence', () => {
  feed({ mouthFrownLeft: NaN, browInnerUp: Infinity }, 2); assert.equal(f.active, null);
  assert.equal(f.diagnostics().raw.mouthFrownRight, null); assert.equal(f.scores.sad, 0);
});
check('Diagnostics separate feature gates, low combined score, competition, candidate dwell and stale data', () => {
  feed(neutral, 1); assert(f.explain('surprise').includes('outer brow mean')); assert(f.explain('surprise').includes('eye-wide mean'));
  // Both feature gates pass, but the old product remains below the entry threshold.
  feed({ ...neutral, browOuterUpLeft: .3, browOuterUpRight: .3, eyeWideLeft: .22, eyeWideRight: .22, jawOpen: .1 }, 1.5);
  assert(f.breakdown.surprise.gates.raisedOuterBrows); assert(f.breakdown.surprise.gates.widenedEyes);
  assert(f.explain('surprise').includes('Smoothed')); assert.equal(f.active, null);
  feed({ ...sad, mouthSmileLeft: .6, mouthSmileRight: .6 }, 1.5);
  assert(f.explain('sad').includes('Other cues reduced evidence'));
  feed(neutral, 1.5); feed(surprise, .2); assert(f.explain('surprise').includes('Candidate;'));
  feed(null, .1); assert(f.explain('surprise').includes('cleared')); assert.equal(Object.keys(f.breakdown).length, 0);
});
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'qa/fixtures/expression-screenshots.json'), 'utf8'));
const human = Object.fromEntries(Object.entries(fixture.frames).map(([key, values]) => [key, Object.fromEntries(fixture.names.map((name, i) => [name, values[i]]))]));
function calibrateHuman() { feed(human.neutral, .3); f.startCalibration(now); feed(human.neutral, 2.5); assert(f.baseline); }
check('Screenshot values replay after neutral calibration: neutral, subtle sad, surprise, smile, speaking', () => {
  calibrateHuman();
  for (const [key, expected] of [['neutral', null], ['sad', 'sad'], ['surprise', 'surprise'], ['smile', 'smile'], ['speaking', null]]) {
    feed(human.neutral, 1.5); const output = feed(human[key], 2);
    assert.equal(f.active, expected, key + ': ' + JSON.stringify(f.diagnostics()));
    if (key === 'sad') assert(output.sad > .6);
    if (key === 'surprise') assert(output.surprise > .5);
  }
});
check('Relative surprise accepts slight jaw opening or a second supported feature route, never jaw alone', () => {
  calibrateHuman(); assert(feed({ ...human.surprise, jawOpen: .02 }, 2).surprise > .5);
  const supported = { ...human.surprise, eyeWideLeft: .022, eyeWideRight: .022 };
  feed(human.neutral, 1.5); assert(feed(supported, 2).surprise > .32); assert(f.relative.routes.supportedEyes); assert(!f.relative.routes.expressiveEyes);
  for (const values of [{ ...human.neutral, jawOpen: .95 }, { ...human.speaking, jawOpen: .95 }, { ...supported, jawOpen: .02 }]) {
    feed(values, 2); assert.equal(f.active, null);
  }
});
check('Subtle sad needs mouth, inner brow and brow shape together; neutral, blink, downward gaze and single features fail', () => {
  calibrateHuman();
  for (const values of [human.neutral,
    { ...human.neutral, browInnerUp: human.sad.browInnerUp },
    { ...human.neutral, mouthFrownLeft: human.sad.mouthFrownLeft, mouthFrownRight: human.sad.mouthFrownRight },
    { ...human.sad, mouthFrownLeft: .002, mouthFrownRight: .002 },
    { ...human.sad, browInnerUp: .03 },
    { ...human.sad, browOuterUpLeft: .096, browOuterUpRight: .049, browDownLeft: .025, browDownRight: .025 },
    { ...human.neutral, eyeBlinkLeft: 1, eyeBlinkRight: 1, eyeLookDownLeft: 1, eyeLookDownRight: 1 }]) {
    feed(values, 2); assert.equal(f.active, null, JSON.stringify(values));
  }
  feed(human.sad, .35); assert.equal(f.active, null); feed(human.neutral, 1); assert.equal(f.active, null);
  assert(feed(human.sad, 2).sad > .6); feed(null, .1); assert.equal(f.active, null); assert.equal(f.relative, null);
  feed(human.neutral, .15); assert.equal(f.active, null);
});
check('Calibrated noise raises effective thresholds; sampled neutral noise cannot turn into a subtle cue', () => {
  feed(human.neutral, .3); f.startCalibration(now);
  for (let i = 0; i < 52; i++) feed({ ...human.neutral, mouthFrownLeft: i % 2 ? .004 : 0, mouthFrownRight: i % 2 ? 0 : .004 }, .05);
  assert(f.baseline); assert(f.noise.mouthFrownLeft > 0); feed(human.sad, 2);
  assert(f.relative.limits.frown > f.rules.relative.frown); assert.equal(f.active, null);
});
check('Screenshot neutral calibration is session-specific; missing brow-shape scores cannot enable relative cues', () => {
  calibrateHuman(); const incomplete = { ...human.sad }; delete incomplete.browDownLeft;
  feed(incomplete, 2); assert(!f.relative.ready); assert.equal(f.active, null);
  f.resetCalibration(); feed(human.sad, 2); assert.equal(f.active, null); assert(f.explain('sad').includes('Calibrate neutral'));
});
fs.writeFileSync(path.join(__dirname, 'qa/expression-filter-report.json'), JSON.stringify({ input: 'Synthetic sequences plus replay of single-frame user screenshot values; not a post-fix human or motion accuracy test', checks }, null, 2));


