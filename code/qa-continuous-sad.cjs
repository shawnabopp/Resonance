// Decision/animation-input tests, NOT post-change human recognition validation.
// User summaries have no ordered frames. Repeating means/last values is synthetic.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, 'sketch.js'), 'utf8');
const code = source.slice(source.indexOf('  class ExpressionFilter'), source.indexOf('  // Relationship time'));
const ExpressionFilter = vm.runInNewContext(`const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));const approach=(a,b,r,dt)=>a+(b-a)*(1-Math.exp(-r*dt));${code};ExpressionFilter`);
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'qa/fixtures/expression-live-summaries.json')));
const values = list => Object.fromEntries(fixture.names.map((key, i) => [key, list[i]]));
const baseline = values(fixture.baseline), noise = values(fixture.noise);
const human = Object.fromEntries(Object.entries(fixture.samples).map(([label, sample]) => [label, values(sample.mean)]));
let f, now, trace, checks = [];
function setup(base = baseline, measuredNoise = noise) { f = new ExpressionFilter(); f.baseline = { ...base }; f.noise = { ...measuredNoise }; now = 0; trace = []; }
function feed(frame, seconds, hz = 20) {
  for (let i = 0; i < Math.ceil(seconds * hz); i++) {
    now += 1000 / hz;
    f.update(frame ? Object.entries(frame).map(([categoryName, score]) => ({ categoryName, score })) : [], now, 1 / hz);
    trace.push({ timeMs: Math.round(now), active: f.active, score: f.scores.sad, response: f.output.sad,
      heldSeconds: f.continuousSad.heldSeconds, route: f.continuousSad.route });
  }
  return f.output;
}
function check(name, run) { setup(); run(); checks.push(name); console.log('PASS ' + name); }
const mean = (b, name) => (b[name + 'Left'] + b[name + 'Right']) / 2;
const deltas = frame => {
  const diff = key => frame[key] - baseline[key];
  return { frown: mean(frame, 'mouthFrown') - mean(baseline, 'mouthFrown'), weakerSide: Math.min(diff('mouthFrownLeft'), diff('mouthFrownRight')),
    inner: diff('browInnerUp'), down: mean(frame, 'browDown') - mean(baseline, 'browDown'),
    outer: mean(frame, 'browOuterUp') - mean(baseline, 'browOuterUp'),
    contrast: diff('browInnerUp') - (mean(frame, 'browOuterUp') - mean(baseline, 'browOuterUp')) };
};
const audit = {
  source: fixture.source,
  neutralMean: human.neutral, sadMean: human.sad,
  sadChangesFromSampledNeutral: Object.fromEntries(fixture.names.map(k => [k, human.sad[k] - human.neutral[k]])),
  sadChangesFromCalibration: deltas(human.sad), neutralChangesFromCalibration: deltas(human.neutral),
  previousRules: { raisedInnerRequired: .018, absoluteMeanFrownRequired: .11, sadEnter: .28, sadDwellMs: 650 },
  conclusion: 'Both mouth-frown ranges are separated in these supplied windows. Inner-brow change is negative, so the previous mandatory raised-inner route scores zero before arbitration or dwell. Baseline and later Neutral also differ. Generalization/pose specificity cannot be inferred from aggregate windows.'
};
let responseTrace;
check('Live data explains zero before competition: mouth changes, inner brow falls, and the neutral baseline has shifted', () => {
  assert(fixture.samples.sad.min[1] > fixture.samples.neutral.max[1]);
  assert(fixture.samples.sad.min[2] > fixture.samples.neutral.max[2]);
  assert(deltas(human.sad).inner < 0); assert(mean(human.sad, 'mouthFrown') < f.rules.frownMean);
  const review = f.reviewNeutral(Object.fromEntries(fixture.names.map(k => [k, { mean: human.neutral[k] }])), baseline);
  assert.equal(review.status, 'shifted'); assert.equal(f.baseline.browInnerUp, baseline.browInnerUp);
  audit.calibrationReview = JSON.parse(JSON.stringify(review));
});
check('Replayed live mean scores give an early graded response, then a sustained lowered-brow state without raised inner brows', () => {
  feed(human.neutral, 2); assert.equal(f.output.sad, 0);
  assert(feed(human.sad, 1.15).sad > .05); assert.equal(f.active, null);
  assert(f.output.sad <= f.rules.continuousSad.maxPreview);
  feed(human.sad, 1.7); assert.equal(f.active, 'sad'); assert(f.output.sad > .5);
  assert(f.continuousSad.fullSettled); assert(!f.relative.routes.relativeSad);
  assert.equal(f.rules.enter.sad, .28); assert.equal(f.rules.dwell.sad, 650);
  responseTrace = [...trace];
});
check('Replayed supplied last frames also separate sad-looking and neutral; this is not replay of original motion', () => {
  feed(values(fixture.samples.neutral.last), 2); assert.equal(f.output.sad, 0);
  feed(values(fixture.samples.sad.last), 3.2); assert.equal(f.active, 'sad'); assert(f.output.sad > .45);
});
check('Weak sustained joint changes stay graded below full state; stronger brow evidence can confirm later', () => {
  setup(human.neutral, {}); // Ideal stationary neutral, not a measured new calibration.
  assert(feed(human.sad, 3).sad > .05); assert(f.output.sad <= .42); assert.equal(f.active, null);
  const preview = f.output.sad;
  const stronger = { ...human.sad, browDownLeft: .074, browDownRight: .059, browOuterUpLeft: .043, browOuterUpRight: .039 };
  assert(feed(stronger, 3).sad > preview + .12); assert.equal(f.active, 'sad');
});
check('Mouth only, brow only, one mouth corner, no smile, blinking and looking down are insufficient', () => {
  const cases = [human.neutral,
    { ...human.neutral, mouthFrownLeft: human.sad.mouthFrownLeft, mouthFrownRight: human.sad.mouthFrownRight },
    { ...human.sad, mouthFrownLeft: human.neutral.mouthFrownLeft, mouthFrownRight: human.neutral.mouthFrownRight },
    { ...human.sad, mouthFrownRight: human.neutral.mouthFrownRight },
    { ...human.neutral, mouthSmileLeft: 0, mouthSmileRight: 0, eyeBlinkLeft: 1, eyeBlinkRight: 1, eyeLookDownLeft: 1, eyeLookDownRight: 1, headPitch: 1 },
    { ...human.sad, browDownLeft: human.neutral.browDownLeft, browDownRight: human.neutral.browDownRight },
    { ...human.sad, browOuterUpLeft: human.neutral.browOuterUpLeft, browOuterUpRight: human.neutral.browOuterUpRight }];
  for (const frame of cases) { setup(human.neutral, {}); feed(frame, 3); assert.equal(f.output.sad, 0, JSON.stringify(frame)); assert.equal(f.active, null); }
});
check('Short repeated cues do not accumulate confirmation; release is smooth and finite', () => {
  for (let i = 0; i < 16; i++) { feed(human.sad, .1); feed(human.neutral, .2); }
  assert.equal(f.active, null); assert(f.output.sad < .015);
  feed(human.sad, 3); const response = f.output.sad; feed(human.neutral, .1);
  assert(f.output.sad > 0 && f.output.sad <= response + .01);
  feed(human.neutral, 2.5); assert.equal(f.output.sad, 0); assert.equal(f.active, null);
});
check('Synthetic values within the supplied neutral ranges never create a cue; ambiguous noise remains rejected', () => {
  for (let i = 0; i < 80; i++) feed(values(fixture.samples.neutral[i % 2 ? 'min' : 'max']), .05);
  assert.equal(f.output.sad, 0);
  setup(baseline, Object.fromEntries(fixture.names.map(k => [k, .04]))); feed(human.sad, 4);
  assert.equal(f.output.sad, 0); assert.equal(f.active, null);
});
check('Singing/open-mouth guard, smile competition and later sad-looking recovery retain their behavior', () => {
  feed({ ...human.sad, jawOpen: .8 }, 3); assert.equal(f.output.sad, 0); assert.equal(f.output.surprise, 0);
  feed({ ...human.sad, mouthSmileLeft: .9, mouthSmileRight: .9 }, 2.5);
  assert(f.output.smile > .9); assert.equal(f.output.sad, 0);
  feed(human.sad, 3.5); assert.equal(f.active, 'sad'); assert(f.output.sad > .5);
});
check('Continuous support uses elapsed time at 4, 12 and 30 Hz, and clears on face loss or stale frames', () => {
  const outputs = [4, 12, 30].map(hz => { setup(); feed(human.sad, 3, hz); assert.equal(f.active, 'sad'); return f.output.sad; });
  assert(Math.max(...outputs) - Math.min(...outputs) < .08, JSON.stringify(outputs));
  feed(null, .05); assert.equal(f.output.sad, 0); assert.equal(f.continuousSad.heldSeconds, 0); assert(f.baseline);
  feed(human.sad, 2); now += 1000; feed(human.sad, .05); assert.equal(f.output.sad, 0); assert.equal(f.active, null);
  const missing = { ...human.sad }; delete missing.browDownRight; feed(missing, 3); assert.equal(f.output.sad, 0);
  feed({ ...human.sad, browOuterUpLeft: NaN, browOuterUpRight: Infinity }, 3);
  assert.equal(f.output.sad, 0); assert.equal(f.raw.browOuterUpLeft, null);
});
check('Starting or aborting calibration cannot revive a stored continuous response', () => {
  feed(human.sad, 3); assert(f.output.sad > .5); f.startCalibration(now);
  assert.equal(f.sadVisual, 0); assert.equal(f.continuousSad.heldSeconds, 0);
  feed({ ...human.neutral, browOuterUpLeft: NaN }, .2); assert.equal(f.calibration, null);
  feed(human.neutral, 1); assert.equal(f.output.sad, 0);
});
const slightFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'qa/fixtures/expression-slight-sad-summaries.json'), 'utf8').replace(/^\uFEFF/, ''));
const slightSample = slightFixture.samples.find(sample => sample.intended === 'sad');
const slightNeutral = slightFixture.samples.find(sample => sample.intended === 'neutral');
const summaryMean = sample => Object.fromEntries(Object.entries(sample.raw).map(([key, value]) => [key, value.mean]));
const slightAudit = { source: 'Additional user-provided slight-sad summary; 12 frames over 2833 ms. Original ordered frames not supplied.',
  originalLogic: slightSample.lastDecision.continuousSad ? 'graded' : 'pre-graded (continuousSad and timeline absent)',
  reportedResponse: slightSample.lastDecision.output.sad,
  changesFromNeutral: Object.fromEntries(fixture.names.map(key => [key, slightSample.raw[key].mean - slightNeutral.raw[key].mean])) };
check('Additional slight-sad attachment is an old-logic sample; current logic supplies a graded response without forcing full state', () => {
  assert(!slightSample.lastDecision.continuousSad); assert(!slightSample.timeline);
  assert.equal(slightSample.lastDecision.reason, 'Not enough frown evidence');
  setup(slightSample.lastDecision.baseline, slightSample.lastDecision.noise);
  feed(summaryMean(slightNeutral), 2); assert.equal(f.output.sad, 0);
  feed(summaryMean(slightSample), slightSample.durationMs / 1000);
  assert(f.output.sad > .05 && f.output.sad <= .42); assert.equal(f.active, null);
  slightAudit.currentLogicWithSuppliedCalibration = JSON.parse(JSON.stringify(f.diagnostics()));
  setup(summaryMean(slightNeutral), {}); // Idealized recalibration; new human calibration noise is unknown.
  feed(summaryMean(slightNeutral), 2); assert.equal(f.output.sad, 0);
  feed(summaryMean(slightSample), 3); assert(f.output.sad > .05 && f.output.sad <= .42); assert.equal(f.active, null);
  slightAudit.currentLogicWithIdealizedNeutral = { response: f.output.sad, active: f.active, route: f.continuousSad.route };
});
fs.writeFileSync(path.join(__dirname, 'qa/continuous-sad-report.json'), JSON.stringify({ input: fixture.source,
  limitation: 'Decision tests using repeated supplied aggregates/last frames and synthetic perturbations. No post-change real camera accuracy or real head-motion test.', audit, slightAudit, checks, responseTrace }, null, 2));
