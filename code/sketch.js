/* RESONANCE — vanilla port of figma-reference.
 * Signal boundary: exclusive Demo or Live input -> Creature.s.
 * Shape distributions and additive particle rendering derive from creature.ts.
 */
'use strict';
(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const approach = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
  const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const THEMES = [
    { name: 'Red', ui: '#B86B6B', p: '#E58A8A' },
    { name: 'Yellow', ui: '#C5AD68', p: '#E8CE82' },
    { name: 'Green', ui: '#819B83', p: '#A2D3AB' },
    { name: 'Blue', ui: '#7895B5', p: '#94BFE8' },
    { name: 'Purple', ui: '#9985B2', p: '#BBA0E0' },
    { name: 'Pink', ui: '#C18FA5', p: '#E9ACC9' },
    { name: 'White', ui: '#E4E4DE', p: '#F5F5EF' },
    { name: 'Orange', ui: '#C18B65', p: '#E9AD7E' },
  ];
  const SHAPES = [
    { id: 'seed', name: 'Seed', note: 'Compact and quiet' },
    { id: 'cloud', name: 'Cloud', note: 'Soft and drifting' },
    { id: 'bloom', name: 'Bloom', note: 'Open and curious' },
  ];
  const emptySignals = () => ({ smile: 0, sad: 0, surprise: 0, level: 0, spike: 0,
    facePresent: false, faceX: .5, faceY: .5, presenceSince: 0, presenceUntil: 0,
    handPresent: false, handX: .5, handY: .5, handOpen: .5, handSpeed: 0, handPose: null,
    bodyPresent: false, bodyMotion: 0, bodySway: 0, bodyLift: 0, bodySpread: 0 });
  const expressionSamples = { pending: null, records: [] };
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(.00001, Math.random()))) * Math.cos(Math.random() * Math.PI * 2);
  function direction() {
    const z = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    return [r * Math.cos(a), z, r * Math.sin(a)];
  }
  function generate(shape, n) {
    const pts = new Float32Array(n * 3);
    const lumps = Array.from({ length: 5 }, (_, i) => {
      const a = i / 5 * Math.PI * 2 + .4;
      return [Math.cos(a) * .45, (Math.random() - .5) * .35, Math.sin(a) * .45];
    });
    for (let i = 0; i < n; i++) {
      let x, y, z;
      const r = Math.random();
      if (shape === 'seed') {
        if (r < .78) {
          const d = direction(), rad = Math.pow(Math.random(), 1.9) * .95;
          [x, y, z] = [d[0] * rad, d[1] * rad * 1.12, d[2] * rad];
        } else {
          const a = Math.random() * Math.PI * 2, rr = .95 + gauss() * .05;
          x = Math.cos(a) * rr; z = Math.sin(a) * rr; y = gauss() * .03 + Math.sin(a * 2) * .08;
          const yy = y * Math.cos(.45) - z * Math.sin(.45);
          z = y * Math.sin(.45) + z * Math.cos(.45); y = yy;
        }
      } else if (shape === 'cloud') {
        if (r < .2) {
          const d = direction(), rad = Math.pow(Math.random(), 1.5) * .35;
          [x, y, z] = d.map(v => v * rad);
        } else {
          const l = lumps[i % 5];
          x = l[0] + gauss() * .26; y = l[1] * .8 + gauss() * .2; z = l[2] + gauss() * .26;
        }
      } else {
        if (r < .22) {
          const d = direction(), rad = Math.pow(Math.random(), 1.6) * .28;
          [x, y, z] = d.map(v => v * rad);
        } else {
          const s = Math.pow(Math.random(), .8), a = (i % 6) / 6 * Math.PI * 2;
          const w = Math.sin(s * Math.PI) * .32 * (Math.random() - .5) * 2, len = .2 + s * .85;
          x = len * Math.cos(a) - w * Math.sin(a); z = len * Math.sin(a) + w * Math.cos(a);
          y = -s * s * .45 + gauss() * .025 + .15;
        }
      }
      // Bound rare Gaussian outliers without changing the original distributions.
      const norm = Math.max(1, Math.hypot(x, y, z) / 1.16);
      pts.set([x / norm, y / norm, z / norm], i * 3);
    }
    return pts;
  }

  // Pure signal filters are also exercised by the Node acceptance tests.
  class AudioGate {
    constructor() { this.reset(); }
    reset() { this.elapsed = 0; this.samples = []; this.floor = .006; this.baseline = 0; this.level = 0; this.armed = false; this.quiet = 0; this.cooldown = 0; }
    update(rms, dt, sensitivity = 1, ownPlayback = false) {
      rms = clamp(Number.isFinite(rms) ? rms : 0); dt = clamp(dt, 0, .1);
      // Do not learn the creature's own wake-up sound as room noise.
      if (ownPlayback && this.elapsed < 1.3) return { level: 0, spike: false, calibrating: true };
      this.elapsed += dt; this.cooldown = Math.max(0, this.cooldown - dt);
      if (this.elapsed < 1.3) {
        this.samples.push(rms); this.baseline = rms;
        const sorted = [...this.samples].sort((a, b) => a - b);
        this.floor = clamp(sorted[Math.floor(sorted.length * .2)] || .003, .003, .15);
        return { level: 0, spike: false, calibrating: true };
      }
      const gate = Math.max(.009, this.floor * 1.8 + .003) / Math.sqrt(sensitivity);
      if (rms < gate) this.floor = approach(this.floor, Math.max(.003, rms), .15, dt);
      const target = clamp((rms - gate) * 7 * sensitivity);
      this.level = approach(this.level, target, target > this.level ? 9 : 4, dt);
      const quietThreshold = Math.max(.035, this.floor * 2.4);
      this.quiet = rms < quietThreshold ? this.quiet + dt : 0;
      if (this.quiet > .4 && this.cooldown === 0) this.armed = true;
      // Keep volume/ripples responsive, but require new quiet after output + echo tail.
      if (ownPlayback) { this.armed = false; this.quiet = 0; }
      const onset = Math.max(.15 / Math.sqrt(sensitivity), this.floor * 5, this.baseline * 2.8);
      const spike = this.armed && this.cooldown === 0 && rms > onset && rms - this.baseline > .045;
      if (spike) { this.armed = false; this.cooldown = 3; this.quiet = 0; }
      this.baseline = approach(this.baseline, rms, 2.4, dt);
      return { level: this.level, spike, calibrating: false };
    }
  }

  class ExpressionFilter {
    constructor() {
      this.rules = { enter: { smile: .32, sad: .28, surprise: .32 }, exit: .18, margin: .08,
        dwell: { smile: 300, sad: 650, surprise: 400, neutral: 400 }, smoothing: 6,
        frownMean: .11, frownBoth: .055, innerBrow: .13, strongFrown: .24, strongBoth: .1,
        openJaw: .45, speechFrown: .2, speechBrow: .23,
        outerBrowFloor: .22, outerBrowRange: .45, eyeWideFloor: .15, eyeWideRange: .4,
        continuousSad: { noiseMultiplier: 1.5, mouthFloor: .0015, sideFloor: .00075, innerFloor: .008,
          downFloor: .0025, contrastFloor: .012, settledMouthFloor: .006, settledSideFloor: .004, outerFallFloor: .0035,
          warmup: .35, fadeIn: .8, fullAfter: 1.4, maxPreview: .42, visualGain: 1.7, featureSmoothing: 5 },
        relative: { frown: .004, frownSide: .003, innerSad: .018, browDown: .01, browContrast: .035,
          outer: .025, eye: .012, outerSide: .012, eyeSide: .007,
          innerSurprise: .045, supportedOuter: .018, supportedEye: .008, jaw: .12, noiseMultiplier: 4 } };
      this.names = ['browInnerUp', 'mouthFrownLeft', 'mouthFrownRight', 'mouthSmileLeft', 'mouthSmileRight',
        'browOuterUpLeft', 'browOuterUpRight', 'eyeWideLeft', 'eyeWideRight', 'jawOpen', 'browDownLeft', 'browDownRight'];
      this.baseline = null; this.noise = {}; this.groupNoise = {}; this.calibration = null; this.calibrationMessage = 'For subtle expressions, calibrate a relaxed face with your mouth closed for two seconds.';
      this.clearTracking();
    }
    clearTracking() {
      this.scores = { smile: 0, sad: 0, surprise: 0 }; this.output = { ...this.scores };
      this.raw = {}; this.adjusted = {}; this.active = this.candidate = null; this.since = this.time = 0; this.present = false;
      this.reason = 'No face scores'; this.breakdown = {}; this.relative = null;
      this.resetSadResponse();
      if (this.calibration) { this.calibration = null; this.calibrationMessage = 'Calibration interrupted. Keep your face in view and try again.'; }
    }
    resetSadResponse() {
      this.sadVisual = 0;
      this.continuousSad = { heldSeconds: 0, evidence: 0, previewEvidence: 0, route: 'none', fullSettled: false,
        features: { mouth: 0, side: 0, inner: 0, down: 0, contrast: 0, outerFall: 0 }, groups: {}, floors: {} };
    }
    startCalibration(now) {
      if (!this.present) return;
      this.resetSadResponse();
      this.scores = { smile: 0, sad: 0, surprise: 0 }; this.output = { ...this.scores };
      this.active = this.candidate = null; this.since = now;
      this.calibration = { start: now, samples: [], first: 0, last: 0 };
      this.calibrationMessage = 'Relax your face, close your mouth and hold still for two seconds.';
    }
    resetCalibration() { this.baseline = null; this.noise = {}; this.groupNoise = {}; this.clearTracking(); this.calibrationMessage = 'Neutral calibration cleared. Subtle cues need a new calibration.'; }
    reviewNeutral(sample, sampleBaseline) {
      if (!sample) return { status: 'waiting', message: 'Capture a Neutral sample to compare it with calibration.' };
      if (!this.baseline) return { status: 'uncalibrated', message: 'Calibrate neutral before checking subtle cues.' };
      if (!sampleBaseline || this.names.some(k => sampleBaseline[k] !== this.baseline[k])) return { status: 'changed', message: 'Calibration changed. Capture a new Neutral sample.' };
      const changes = Object.fromEntries(this.names.map(k => [k, Number.isFinite(sample[k]?.mean) ? sample[k].mean - this.baseline[k] : null]));
      const shifted = this.names.filter(k => changes[k] !== null && Math.abs(changes[k]) > Math.max(.008, 4 * (this.noise[k] || 0)));
      return { status: shifted.length >= 2 ? 'shifted' : 'consistent', changes, shifted,
        message: shifted.length >= 2 ? 'Neutral differs from calibration. Relax your face and recalibrate, then capture both samples again. No baseline is changed automatically.' : 'Neutral is close to calibration within the current noise limits.' };
    }
    calibrate(b, now) {
      const c = this.calibration;
      if (!c) return;
      if (now - c.start > 8000) { this.calibration = null; this.calibrationMessage = 'Could not get a steady neutral sample. Relax your face and try again.'; return; }
      const keys = this.names;
      const moving = Math.max(b.mouthSmileLeft, b.mouthSmileRight) > .25 || b.jawOpen > .3 ||
        Math.max(b.mouthFrownLeft, b.mouthFrownRight) > .5 || b.browInnerUp > .65 ||
        Math.max(b.eyeWideLeft, b.eyeWideRight) > .35;
      if (moving || (c.last && now - c.last > 350)) { c.samples = []; c.first = 0; }
      c.last = now;
      if (moving) { this.calibrationMessage = 'Relax your mouth and brows. Waiting for a steady neutral face…'; return; }
      if (!c.samples.length) c.first = now;
      c.samples.push(b);
      if (keys.some(k => Math.max(...c.samples.map(s => s[k])) - Math.min(...c.samples.map(s => s[k])) > .1)) {
        c.samples = [b]; c.first = now;
      }
      this.calibrationMessage = 'Hold your neutral expression…';
      if (now - c.first >= 2000 && c.samples.length >= 12) {
        this.baseline = Object.fromEntries(keys.map(k => {
          const values = c.samples.map(s => s[k]).sort((a, b) => a - b);
          return [k, values[Math.floor(values.length / 2)]];
        }));
        this.noise = Object.fromEntries(keys.map(k => {
          const deviations = c.samples.map(s => Math.abs(s[k] - this.baseline[k])).sort((a, b) => a - b);
          const values = c.samples.map(s => s[k]).sort((a, b) => a - b);
          // A quantized two-level signal can have zero MAD despite noticeable variation.
          const spread = (values[Math.floor((values.length - 1) * .9)] - values[Math.floor((values.length - 1) * .1)]) / 2;
          return [k, Math.max(deviations[Math.floor(deviations.length / 2)], spread)];
        }));
        // Measure paired signals directly; left/right noise need not move together.
        const mean = (s, name) => (s[name + 'Left'] + s[name + 'Right']) / 2;
        const metrics = { mouth: s => mean(s, 'mouthFrown'), down: s => mean(s, 'browDown'),
          outer: s => mean(s, 'browOuterUp'), contrast: s => s.browInnerUp - mean(s, 'browOuterUp') };
        this.groupNoise = Object.fromEntries(Object.entries(metrics).map(([key, get]) => {
          const values = c.samples.map(get).sort((a, b) => a - b), median = values[Math.floor(values.length / 2)];
          const deviations = values.map(v => Math.abs(v - median)).sort((a, b) => a - b);
          return [key, Math.max(deviations[Math.floor(values.length / 2)], (values[Math.floor((values.length - 1) * .9)] - values[Math.floor((values.length - 1) * .1)]) / 2)];
        }));
        this.calibration = null; this.clearTracking();
        this.calibrationMessage = 'Neutral calibrated for this session. Smile detection is unchanged.';
      }
    }
    update(categories, now, dt) {
      if (this.time && now - this.time > 500) this.clearTracking();
      const frameStep = this.time ? clamp((now - this.time) / 1000, 0, .5) : clamp(dt, 0, .2);
      this.present = !!categories?.length;
      if (!this.present) { this.clearTracking(); return { ...this.output }; }
      const b = Object.fromEntries(categories.filter(c => Number.isFinite(c.score)).map(c => [c.categoryName, clamp(c.score)]));
      this.raw = Object.fromEntries(this.names.map(k => [k, b[k] ?? null]));
      // Missing entries remain visible as missing in diagnostics, but never count as evidence.
      const val = name => b[name] || 0;
      const pair = name => (val(name + 'Left') + val(name + 'Right')) / 2;
      if (this.calibration && this.names.some(k => !Number.isFinite(b[k]))) {
        this.calibration = null; this.calibrationMessage = 'Some face scores are missing. Wait for tracking to recover, then try again.';
      }
      this.calibrate(Object.fromEntries(this.names.map(k => [k, val(k)])), now);
      this.raw = Object.fromEntries(this.names.map(k => [k, b[k] ?? null]));
      this.present = true; this.time = now;
      if (this.calibration) { this.active = this.candidate = null; this.scores = { smile: 0, sad: 0, surprise: 0 }; this.output = { ...this.scores }; this.reason = 'Calibrating neutral'; return { ...this.output }; }
      const smile = clamp((pair('mouthSmile') - .2) / .5);
      // A jaw opening cannot produce surprise without BOTH raised brows and widened eyes.
      const strongPair = name => Math.max(0, pair(name) - ((this.baseline?.[name + 'Left'] || 0) + (this.baseline?.[name + 'Right'] || 0)) / 2);
      const brows = clamp((strongPair('browOuterUp') - this.rules.outerBrowFloor) / this.rules.outerBrowRange);
      const eyes = clamp((strongPair('eyeWide') - this.rules.eyeWideFloor) / this.rules.eyeWideRange);
      const absoluteSurprise = Math.sqrt(brows * eyes) * (.8 + .2 * val('jawOpen'));
      const adjusted = name => Math.max(0, val(name) - (this.baseline?.[name] || 0));
      const left = adjusted('mouthFrownLeft'), right = adjusted('mouthFrownRight'), inner = adjusted('browInnerUp');
      const mean = (left + right) / 2, both = Math.min(left, right), r = this.rules;
      // Signed changes preserve brow shape; no adaptive baseline drifts into an expression.
      const delta = name => val(name) - (this.baseline?.[name] || 0);
      const dp = name => (delta(name + 'Left') + delta(name + 'Right')) / 2;
      const np = name => Math.max(this.noise[name + 'Left'] || 0, this.noise[name + 'Right'] || 0);
      const q = r.relative, threshold = (floor, noise) => Math.max(floor, q.noiseMultiplier * (noise || 0));
      const limits = { frown: threshold(q.frown, np('mouthFrown')), frownSide: threshold(q.frownSide, np('mouthFrown')),
        innerSad: threshold(q.innerSad, this.noise.browInnerUp), browDown: threshold(q.browDown, np('browDown')),
        browContrast: threshold(q.browContrast, (this.noise.browInnerUp || 0) + np('browOuterUp')),
        outer: threshold(q.outer, np('browOuterUp')), eye: threshold(q.eye, np('eyeWide')),
        outerSide: threshold(q.outerSide, np('browOuterUp')), eyeSide: threshold(q.eyeSide, np('eyeWide')),
        innerSurprise: threshold(q.innerSurprise, this.noise.browInnerUp), supportedOuter: threshold(q.supportedOuter, np('browOuterUp')),
        supportedEye: threshold(q.supportedEye, np('eyeWide')), jaw: threshold(q.jaw, this.noise.jawOpen) };
      const relativeReady = !!this.baseline && this.names.every(k => this.raw[k] !== null);
      const outer = dp('browOuterUp'), eye = dp('eyeWide'), down = dp('browDown'), innerChange = delta('browInnerUp');
      const outerBoth = Math.min(delta('browOuterUpLeft'), delta('browOuterUpRight'));
      const eyeBoth = Math.min(delta('eyeWideLeft'), delta('eyeWideRight'));
      const contrast = innerChange - outer;
      const expressiveEyes = relativeReady && outer >= limits.outer && outerBoth >= limits.outerSide && eye >= limits.eye && eyeBoth >= limits.eyeSide;
      const supportedEyes = relativeReady && innerChange >= limits.innerSurprise && outer >= limits.supportedOuter && outerBoth >= limits.outerSide &&
        eye >= limits.supportedEye && eyeBoth >= limits.eyeSide && delta('jawOpen') >= limits.jaw;
      const relativeSurprise = expressiveEyes || supportedEyes ? clamp(.45 * clamp(outer / .09) + .45 * clamp(eye / .04) + .1 * clamp(innerChange / .1)) : 0;
      // Select a valid evidence route before arbitration; neutral has no priority.
      const surpriseBase = Math.max(absoluteSurprise, relativeSurprise);
      const surprise = surpriseBase * (1 - smile * .8);
      const relativeSad = relativeReady && dp('mouthFrown') >= limits.frown && Math.min(delta('mouthFrownLeft'), delta('mouthFrownRight')) >= limits.frownSide &&
        innerChange >= limits.innerSad && (down >= limits.browDown || contrast >= limits.browContrast) && val('jawOpen') < .25 && delta('jawOpen') < .1;
      const relativeSadScore = relativeSad ? clamp(.35 * clamp(dp('mouthFrown') / .018) + .4 * clamp(innerChange / .06) +
        .25 * Math.max(clamp(down / .04), clamp(contrast / .08))) : 0;
      // A graded, calibrated response precedes a full state. Inner-brow rise is one
      // route, not a requirement for every sad-looking brow shape.
      const soft = this.continuousSad, sr = r.continuousSad, step = frameStep;
      const softEligible = relativeReady && val('jawOpen') < .25 && delta('jawOpen') < .1 && smile < r.enter.smile && surprise < r.enter.surprise;
      const groupNoise = (key, fallback) => this.groupNoise[key] ?? fallback;
      const softFloor = (floor, noise) => Math.max(floor, sr.noiseMultiplier * (noise || 0));
      const floors = { mouth: softFloor(sr.mouthFloor, groupNoise('mouth', np('mouthFrown'))), side: softFloor(sr.sideFloor, np('mouthFrown')),
        inner: softFloor(sr.innerFloor, this.noise.browInnerUp), down: softFloor(sr.downFloor, groupNoise('down', np('browDown'))),
        contrast: softFloor(sr.contrastFloor, groupNoise('contrast', (this.noise.browInnerUp || 0) + np('browOuterUp'))),
        settledMouth: softFloor(sr.settledMouthFloor, groupNoise('mouth', np('mouthFrown'))), settledSide: softFloor(sr.settledSideFloor, np('mouthFrown')),
        outerFall: softFloor(sr.outerFallFloor, groupNoise('outer', np('browOuterUp'))) };
      const features = { mouth: dp('mouthFrown'), side: Math.min(delta('mouthFrownLeft'), delta('mouthFrownRight')),
        inner: innerChange, down, contrast, outerFall: -outer };
      for (const key of Object.keys(features)) soft.features[key] = approach(soft.features[key], softEligible ? features[key] : 0, sr.featureSmoothing, step);
      const ramp = (key, floor, goal) => clamp((soft.features[key] - floor) / (Math.max(goal, floor + .004) - floor));
      const mouth = Math.min(ramp('mouth', floors.mouth, .008), ramp('side', floors.side, .006));
      const raised = ramp('inner', floors.inner, .035), lowered = ramp('down', floors.down, .02);
      const shaped = Math.max(lowered, ramp('contrast', floors.contrast, .06));
      const settledMouth = Math.min(ramp('mouth', floors.settledMouth, .024), ramp('side', floors.settledSide, .018));
      const outerFall = ramp('outerFall', floors.outerFall, .025), settledShape = Math.sqrt(lowered * outerFall);
      // Coverage goes smoothly to zero if any required anatomical group is absent.
      const joint = (values, weights) => Math.min(1, ...values.map(v => v / .2)) * values.reduce((sum, v, i) => sum + v * weights[i], 0);
      const raisedScore = softEligible ? .45 * joint([mouth, raised, shaped], [.35, .35, .3]) : 0;
      const settledScore = softEligible ? .45 * joint([settledMouth, settledShape], [.55, .45]) : 0;
      const softScore = Math.max(raisedScore, settledScore);
      const freshRaised = features.mouth > floors.mouth && features.side > floors.side && features.inner > floors.inner && (features.down > floors.down || features.contrast > floors.contrast);
      const freshSettled = features.mouth > floors.settledMouth && features.side > floors.settledSide && features.down > floors.down && features.outerFall > floors.outerFall;
      const freshJoint = softEligible && (freshRaised || freshSettled);
      soft.heldSeconds = freshJoint && softScore > .025 ? Math.min(3, soft.heldSeconds + step) : Math.max(0, soft.heldSeconds - step * 3);
      const progress = clamp((soft.heldSeconds - sr.warmup) / sr.fadeIn), fade = progress * progress * (3 - 2 * progress);
      const fullSettled = softEligible && freshSettled && settledMouth >= .6 && settledShape >= .35 && settledScore >= r.enter.sad && soft.heldSeconds >= sr.fullAfter;
      const previewEvidence = Math.min(r.enter.sad - .01, softScore) * fade;
      Object.assign(soft, { evidence: softScore, previewEvidence, fullSettled, freshJoint, floors,
        route: softScore <= .025 ? 'none' : raisedScore >= settledScore ? 'raised inner brow + mouth + brow shape' : 'bilateral mouth + lowered / settled brows',
        groups: { mouth, raisedInner: raised, browShape: shaped, settledMouth, loweredBrows: lowered, outerFall, settledShape }, eligible: softEligible });
      this.adjusted = { frownMean: mean, frownBoth: both, innerBrow: inner, outerBrowChange: outer, eyeWideChange: eye,
        browDownChange: down, browContrast: contrast, jawChange: delta('jawOpen') };
      const combined = mean >= r.frownMean && both >= r.frownBoth && inner >= r.innerBrow;
      const strong = mean >= r.strongFrown && both >= r.strongBoth;
      const speechSafe = val('jawOpen') < r.openJaw || (combined && mean >= r.speechFrown && inner >= r.speechBrow);
      const evidence = ((combined || strong) && speechSafe) || relativeSad || fullSettled;
      // Alternative evidence routes, not a product of several weak coefficients.
      // Neither absent smiles, head pose nor eye closure supplies sad-looking evidence.
      const sadBase = Math.max((combined || strong) && speechSafe ? clamp(.7 * clamp((mean - .05) / .32) + .3 * clamp((inner - .07) / .38)) : 0,
        relativeSadScore, fullSettled ? settledScore : 0, previewEvidence);
      const sad = sadBase * (1 - smile) * (1 - surprise);
      this.reason = relativeSad ? 'Relative inner brow + mouth + brow shape' : fullSettled ? 'Sustained mouth + lowered / settled brows' : previewEvidence > .005 ? 'Gradual sad-looking response: ' + soft.route : !speechSafe ? 'Open-mouth guard' : combined ? 'Frown + inner brow' : strong ? 'Stronger bilateral frown' : 'Not enough joint mouth and brow evidence';
      if (evidence && (smile > .32 || surprise > .32)) this.reason += ' · competing smile / surprise';
      const raw = { smile, sad, surprise };
      this.breakdown = {
        smile: { evidence: smile, beforeCompetition: smile, gates: {}, missing: ['mouthSmileLeft', 'mouthSmileRight'].filter(k => this.raw[k] === null) },
        sad: { evidence: sad, beforeCompetition: sadBase,
          gates: { combinedFrown: combined, strongBilateralFrown: strong, openMouthSafe: speechSafe, relativeSad, settledBrows: fullSettled, gradualSad: previewEvidence > .005 },
          missing: ['mouthFrownLeft', 'mouthFrownRight', 'browInnerUp'].filter(k => this.raw[k] === null),
          smileMultiplier: 1 - smile, surpriseMultiplier: 1 - surprise },
        surprise: { evidence: surprise, beforeCompetition: surpriseBase,
          gates: { raisedOuterBrows: brows > 0, widenedEyes: eyes > 0, expressiveEyes, supportedEyes },
          missing: ['browOuterUpLeft', 'browOuterUpRight', 'eyeWideLeft', 'eyeWideRight', 'jawOpen'].filter(k => this.raw[k] === null),
          outerBrowMean: strongPair('browOuterUp'), eyeWideMean: strongPair('eyeWide'), scaledBrows: brows, scaledEyes: eyes, smileMultiplier: 1 - smile * .8 },
      };
      this.relative = { ready: relativeReady, limits, deltas: { frown: dp('mouthFrown'), frownSide: Math.min(delta('mouthFrownLeft'), delta('mouthFrownRight')),
        inner: innerChange, outer, outerBoth, eye, eyeBoth, down, contrast, jaw: delta('jawOpen') }, routes: { expressiveEyes, supportedEyes, relativeSad } };
      for (const key of Object.keys(this.scores)) this.scores[key] = approach(this.scores[key], raw[key], r.smoothing, clamp(dt, 0, .2));
      const eligible = Object.keys(this.scores).filter(k => this.scores[k] >= r.enter[k]).sort((a, b) => this.scores[b] - this.scores[a]);
      let next = eligible[0] || null;
      if (this.active && this.scores[this.active] > r.exit && (!next || this.scores[next] < this.scores[this.active] + r.margin)) next = this.active;
      if (next !== this.candidate) { this.candidate = next; this.since = now; }
      const delay = r.dwell[next || 'neutral'];
      if (now - this.since >= delay) this.active = next;
      const result = { smile: 0, sad: 0, surprise: 0 };
      if (this.active) result[this.active] = this.scores[this.active];
      // A neutral categorical label does not suppress a valid, gradual visual cue.
      const preview = softEligible && soft.heldSeconds > sr.warmup ? Math.min(sr.maxPreview, this.scores.sad * sr.visualGain) : 0;
      const target = this.active === 'sad' ? clamp(this.scores.sad * sr.visualGain) : preview;
      this.sadVisual = approach(this.sadVisual, target, 5, step);
      if (!target && this.sadVisual < .002) this.sadVisual = 0;
      result.sad = this.sadVisual;
      this.output = result;
      return { ...result };
    }
    explain(key) {
      if (!this.present) return 'No fresh face scores. Expression output cleared.';
      if (this.calibration) return 'Neutral calibration in progress.';
      const b = this.breakdown[key];
      if (!b) return 'Waiting for a fresh frame.';
      const notes = [];
      if (b.missing.length) notes.push(`Missing: ${b.missing.join(', ')}`);
      if (key === 'surprise') {
        if (b.gates.expressiveEyes || b.gates.supportedEyes) notes.push(b.gates.expressiveEyes ? 'Relative brows + widened eyes passed; jaw optional' : 'Relative inner / outer brows + eyes + jaw passed');
        else {
          if (!b.gates.raisedOuterBrows) notes.push(`Stronger route: outer brow mean ${b.outerBrowMean.toFixed(3)} (baseline adjusted) must exceed ${this.rules.outerBrowFloor}`);
          if (!b.gates.widenedEyes) notes.push(`Stronger route: eye-wide mean ${b.eyeWideMean.toFixed(3)} (baseline adjusted) must exceed ${this.rules.eyeWideFloor}`);
        }
      }
      if (key === 'sad') {
        const soft = this.continuousSad;
        notes.push(`Continuous response ${this.output.sad.toFixed(3)}; joint evidence ${soft.evidence.toFixed(3)}, held ${soft.heldSeconds.toFixed(2)} s; route: ${soft.route}`);
        if (soft.fullSettled) notes.push('Sustained bilateral mouth + lowered / settled brows passed; inner-brow rise is optional on this route');
        else if (soft.previewEvidence > .005) notes.push('Weak joint evidence is already reaching the animation; full state is not yet confirmed');
        if (b.gates.relativeSad) notes.push('Relative mouth + inner brow + brow shape passed');
        else if (!b.gates.combinedFrown && !b.gates.strongBilateralFrown) notes.push('Original stronger-frown routes are not active; calibrated gradual routes are checked separately');
        if (!b.gates.openMouthSafe && !b.gates.relativeSad) notes.push('Open-mouth guard blocked this cue');
      }
      if (key !== 'smile' && !this.relative?.ready) notes.push(this.baseline ? 'Relative route needs all fresh blendshape scores' : 'Calibrate neutral to enable subtle relative cues');
      if (this.relative?.ready && key !== 'smile') {
        const { deltas: d, limits: l } = this.relative;
        const check = (name, value, min) => `${name} ${value.toFixed(3)} ${value >= min ? '≥' : '<'} ${min.toFixed(3)}`;
        if (key === 'sad' && !b.gates.relativeSad) notes.push(`Raised-inner-brow route: ${check('mouth mean', d.frown, l.frown)}, ${check('weaker mouth side', d.frownSide, l.frownSide)}, ${check('inner brow', d.inner, l.innerSad)}; brow shape needs ${check('brow down', d.down, l.browDown)} OR ${check('inner–outer contrast', d.contrast, l.browContrast)}; jaw raw < 0.25 and change < 0.1`);
        if (key === 'surprise' && !b.gates.expressiveEyes && !b.gates.supportedEyes) notes.push(`Relative route A: ${check('outer brow', d.outer, l.outer)}, ${check('eyes', d.eye, l.eye)}. Route B: ${check('inner brow', d.inner, l.innerSurprise)}, ${check('outer brow', d.outer, l.supportedOuter)}, ${check('eyes', d.eye, l.supportedEye)}, ${check('jaw', d.jaw, l.jaw)}. Both routes require ${check('weaker outer side', d.outerBoth, l.outerSide)} and ${check('weaker eye side', d.eyeBoth, l.eyeSide)}`);
      }
      if (b.beforeCompetition - b.evidence > .01) notes.push(`Other cues reduced evidence ${b.beforeCompetition.toFixed(3)} → ${b.evidence.toFixed(3)}`);
      const score = this.scores[key], entering = this.rules.enter[key];
      if (this.active === key) notes.push(this.candidate === key ? `Active; held above exit threshold ${this.rules.exit}` : 'Active but fading; waiting to release or switch');
      else if (score < entering) notes.push(`Smoothed ${score.toFixed(3)} < enter ${entering}`);
      else if (this.candidate !== key) notes.push(`Eligible, but ${this.candidate || 'neutral'} currently wins competition / hold margin ${this.rules.margin}`);
      else notes.push(`Candidate; ${Math.round(Math.max(0, this.rules.dwell[key] - (this.time - this.since)))} ms more to confirm`);
      return notes.join('. ') + '.';
    }
    diagnostics() {
      return { raw: { ...this.raw }, adjusted: { ...this.adjusted }, scores: { ...this.scores }, output: { ...this.output },
        active: this.active, candidate: this.candidate, heldMs: Math.max(0, this.time - this.since), reason: this.reason,
        breakdown: Object.fromEntries(Object.entries(this.breakdown).map(([k, b]) => [k, { ...b, gates: { ...b.gates }, missing: [...b.missing] }])),
        reasons: Object.fromEntries(['smile', 'sad', 'surprise'].map(k => [k, this.explain(k)])),
        relative: this.relative && { ...this.relative, deltas: { ...this.relative.deltas }, limits: { ...this.relative.limits }, routes: { ...this.relative.routes } }, noise: { ...this.noise },
        continuousSad: { ...this.continuousSad, features: { ...this.continuousSad.features }, groups: { ...this.continuousSad.groups }, floors: { ...this.continuousSad.floors } }, groupNoise: { ...this.groupNoise },
        thresholds: this.rules, baseline: this.baseline && { ...this.baseline }, calibrating: !!this.calibration, calibrationMessage: this.calibrationMessage };
    }
  }

  // Relationship time is separate from the capped animation step and startle events.
  class Familiarity {
    constructor() { this.value = .04; this.absence = 0; this.rest = 0; this.last = null; }
    pause() { this.last = null; }
    reset() { this.value = .04; this.absence = 0; this.rest = 0; this.pause(); }
    update(now, s, active = true, visible = true) {
      if (!active || !visible) { this.pause(); return; }
      const previous = this.last ?? now;
      const seconds = Math.max(0, now - previous) / 1000;
      this.last = now;
      // Credit only the observed presence interval, never a stale frame or a gap before arrival.
      const presentSeconds = s.facePresent ? Math.max(0, Math.min(now, s.presenceUntil) - Math.max(previous, s.presenceSince)) / 1000 : 0;
      const gentle = s.level < .65 && s.handSpeed < .8 && s.bodyMotion < .65;
      const bonus = gentle ? Math.min(1, s.smile * .7 + s.level * .8 + (s.handPresent ? .5 : 0) + s.bodyMotion * .4) : 0;
      this.value = clamp(this.value + presentSeconds * (.006 + bonus * .017), .04, 1);
      const present = s.facePresent && now <= s.presenceUntil;
      if (present) this.absence = 0;
      else this.absence += Math.max(0, seconds - presentSeconds);
      this.rest = clamp((this.absence - 8) / 16);
    }
  }

  // Stable spans, not a face/hand bounding box that changes when a mouth or fingers open.
  function faceApproachMeasure(points, width, height) {
    const ids = [234, 454, 10, 152];
    if (!width || !height || ids.some(i => !points?.[i] || !Number.isFinite(points[i].x) || !Number.isFinite(points[i].y) ||
        points[i].x < 0 || points[i].x > 1 || points[i].y < 0 || points[i].y > 1)) return null;
    const distance = (a, b) => Math.hypot((points[a].x - points[b].x) * width, (points[a].y - points[b].y) * height) / Math.max(width, height);
    return { width: distance(234, 454), height: distance(10, 152), x: 1 - (points[234].x + points[454].x) / 2,
      y: (points[10].y + points[152].y) / 2, frameAspect: width / height, identity: 'face' };
  }
  function handApproachMeasure(hands, width, height) {
    const hand = hands?.[0], p = hand?.keypoints, ids = [0, 5, 9, 13, 17];
    if (!width || !height || !p || p.length !== 21 || (hand.confidence ?? 0) < .65 ||
        ids.some(i => !Number.isFinite(p[i]?.x) || !Number.isFinite(p[i]?.y) || p[i].x < width * .03 || p[i].x > width * .97 || p[i].y < height * .03 || p[i].y > height * .97)) return null;
    const distance = (a, b) => Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y) / Math.max(width, height);
    return { width: distance(5, 17), height: distance(0, 9), x: 1 - ids.reduce((sum, i) => sum + p[i].x, 0) / (ids.length * width),
      y: ids.reduce((sum, i) => sum + p[i].y, 0) / (ids.length * height), frameAspect: width / height, identity: String(hand.handedness || 'hand') };
  }
  class ApproachFilter {
    constructor() { this.reset(); }
    reset() { this.count = this.updates = this.lastClock = 0; this.trace = []; this.lastDetection = null; this.lose(); }
    lose(reason = 'No usable size measurement') {
      this.last = null; this.history = []; this.armed = false; this.quiet = 0; this.votes = 0; this.started = 0;
      this.growth = this.rate = this.size = this.rawSize = 0; this.status = reason; this.checks = {};
    }
    update(m, now) {
      this.lastClock = now; this.updates++;
      if (!m || ![m.width, m.height, m.x, m.y, m.frameAspect].every(Number.isFinite) ||
          Math.min(m.width, m.height) < .025 || Math.max(m.width, m.height) > 1.05) { this.lose(m ? 'Invalid or too small size measurement' : 'No face/palm size: missing or clipped landmarks'); return false; }
      this.thresholds = m.identity === 'face' ? { growth: .16, rate: .55, span: .055, samples: 2 } : { growth: .20, rate: .65, span: .09, samples: 2 };
      const size = Math.sqrt(m.width * m.height), raw = { ...m, size, time: now };
      this.rawSize = size;
      const previous = this.last, dt = previous ? (now - previous.time) / 1000 : 0;
      this.intervalMs = dt * 1000;
      if (previous && dt <= 0) return false;
      const discontinuity = !previous || dt > 1.2 || m.identity !== previous.identity || Math.abs(m.frameAspect / previous.frameAspect - 1) > .02 ||
        Math.abs(Math.log(size / previous.size)) > .5 || Math.abs(Math.log((m.width / m.height) / (previous.width / previous.height))) > .25 ||
        Math.hypot(m.x - previous.x, m.y - previous.y) > Math.max(.18, size * 1.2);
      if (discontinuity) {
        this.lose(previous ? 'Size/pose discontinuity: establishing a new anchor' : 'First measurement: hold steady to arm');
        this.started = now; this.last = { ...raw, sw: Math.log(m.width), sh: Math.log(m.height) }; this.size = this.rawSize = size;
        this.history.push({ time: now, w: this.last.sw, h: this.last.sh, rising: false }); return false;
      }
      const sw = approach(previous.sw, Math.log(m.width), 10, dt), sh = approach(previous.sh, Math.log(m.height), 10, dt);
      const instantaneous = ((sw + sh) - (previous.sw + previous.sh)) / (2 * dt);
      this.last = { ...raw, sw, sh }; this.size = Math.exp((sw + sh) / 2);
      // Count raw coherent increments inside the window, not two consecutive
      // threshold crossings. One abrupt tracking jump followed by stillness fails.
      const rising = Math.min(Math.log(m.width / previous.width), Math.log(m.height / previous.height)) > .007;
      this.history.push({ time: now, w: sw, h: sh, rising });
      const windowMs = Math.max(550, Math.min(1050, dt * 2200));
      while (this.history.length > 2 && this.history[0].time < now - windowMs) this.history.shift();
      const anchor = this.history[0], seconds = (now - anchor.time) / 1000;
      const dw = sw - anchor.w, dh = sh - anchor.h;
      this.growth = Math.exp((dw + dh) / 2) - 1; this.rate = seconds > 0 ? (dw + dh) / (2 * seconds) : 0;
      this.quiet = Math.abs(instantaneous) < .3 && Math.abs(this.rate) < .3 ? this.quiet + dt : 0;
      if (now - this.started >= 600 && this.quiet >= .45) this.armed = true;
      this.votes = this.history.slice(1).filter(item => item.rising).length;
      const t = this.thresholds;
      this.checks = { armed: this.armed, window: seconds >= .14 && seconds <= 1.2,
        growth: this.growth >= t.growth, speed: this.rate >= t.rate,
        bothSpans: Math.exp(dw) - 1 >= t.span && Math.exp(dh) - 1 >= t.span,
        freshGrowth: rising && instantaneous > .25, coherentSamples: this.votes >= t.samples };
      this.status = !this.armed ? 'Hold steady to rearm' : 'Waiting for: ' + Object.entries(this.checks).filter(([, pass]) => !pass).map(([key]) => key).join(', ');
      this.trace.push({ at: now, rawSize: size, size: this.size, growth: this.growth, rate: this.rate, armed: this.armed, coherentSamples: this.votes, checks: { ...this.checks } });
      if (this.trace.length > 30) this.trace.shift();
      if (Object.values(this.checks).every(Boolean)) {
        this.lastDetection = this.trace[this.trace.length - 1];
        this.count++; this.armed = false; this.quiet = 0; this.votes = 0; this.history = [{ time: now, w: sw, h: sh, rising: false }];
        this.status = 'Sudden approach detected: sent to shared startle handler'; return true;
      }
      return false;
    }
    tick(now) { this.lastClock = now; if (this.last && now - this.last.time > 1200) this.lose('Size updates stale for over 1.2 s'); }
    snapshot() { return { status: this.status, armed: this.armed, size: this.size, rawSize: this.rawSize,
      spans: this.last ? [this.last.width, this.last.height] : null, ageMs: this.last ? Math.max(0, this.lastClock - this.last.time) : null,
      intervalMs: this.intervalMs, growth: this.growth, rate: this.rate, count: this.count, updates: this.updates,
      coherentSamples: this.votes, quietMs: this.quiet * 1000, thresholds: this.thresholds || null, checks: { ...this.checks }, lastDetection: this.lastDetection }; }
  }

  // HandPose pixels -> mirrored, normalized coordinates. No frame-rate assumptions.
  class HandFilter {
    constructor() { this.x = .5; this.y = .5; this.open = .5; this.speed = 0; this.last = null; this.seen = 0; this.present = false; this.quiet = 0; this.fast = 0; this.armed = false; this.nextWave = 0; this.art = new HandArticulation(); }
    lose() { this.present = false; this.last = null; this.speed = 0; this.quiet = this.fast = 0; this.armed = false; this.art.lose(); }
    update(hands, now, width, height) {
      const hand = hands?.[0], points = hand?.keypoints;
      if (!width || !height || !points || points.length !== 21 || (hand.confidence ?? 0) < (this.present ? .5 : .65) ||
          points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < -width * .1 || p.x > width * 1.1 || p.y < -height * .1 || p.y > height * 1.1)) {
        this.last = null; this.fast = 0; this.art.pause(now);
        if (now - this.seen > 450) this.lose();
        return false;
      }
      const palm = [0, 5, 9, 13, 17];
      const x = clamp(1 - palm.reduce((sum, i) => sum + points[i].x, 0) / (5 * width));
      const y = clamp(palm.reduce((sum, i) => sum + points[i].y, 0) / (5 * height));
      const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
      const p = hand.keypoints3D?.length === 21 && hand.keypoints3D.every(v => [v.x, v.y, v.z].every(Number.isFinite)) ? hand.keypoints3D : points;
      const palmSize = distance(p[0], p[9]);
      if (palmSize < 1e-5 || distance(points[0], points[9]) < Math.min(width, height) * .025) { this.lose(); return false; }
      const extensions = [5, 9, 13, 17].map(i => {
        const a = distance(p[i], p[i + 1]), b = distance(p[i + 1], p[i + 3]);
        const straight = clamp((distance(p[i], p[i + 3]) / Math.max(1e-5, a + b) - .55) / .4);
        const extended = clamp((distance(p[0], p[i + 3]) / Math.max(palmSize * .5, distance(p[0], p[i])) - 1.05) / .85);
        return extended * (.35 + .65 * straight);
      });
      const openness = extensions.reduce((sum, value) => sum + value, 0) / 4;
      this.art.update(points, p, extensions, now, String(hand.handedness || 'hand'));
      const previous = this.last;
      this.last = { x, y, time: now }; this.seen = now;
      if (!previous || now - previous.time > 1200) { this.fast = 0; this.speed = 0; return false; }
      const dt = clamp((now - previous.time) / 1000, .016, 1.2);
      const jump = Math.hypot(x - previous.x, y - previous.y);
      // An isolated teleport establishes a new anchor; it must not become a wave.
      if (jump > .38) { this.fast = 0; this.speed = 0; this.armed = false; this.quiet = 0; this.art.lose(); return false; }
      this.present = true;
      this.x = approach(this.x, x, 8, dt); this.y = approach(this.y, y, 8, dt);
      if (Math.abs(openness - this.open) > .035) this.open = approach(this.open, openness, 5, dt);
      const speed = Math.hypot((x - previous.x) * width, (y - previous.y) * height) / Math.max(width, height) / dt;
      this.speed = approach(this.speed, speed < .06 ? 0 : speed, 10, dt);
      this.quiet = speed < .55 ? this.quiet + dt : 0;
      if (this.quiet >= .5 && now >= this.nextWave) this.armed = true;
      this.fast = speed > 1.25 ? this.fast + 1 : 0;
      if (this.fast >= 2 && this.armed && now >= this.nextWave) {
        this.nextWave = now + 3000; this.armed = false; this.quiet = 0; return true;
      }
      return false;
    }
  }

  // Separate articulation from translation, camera scale, and rigid palm rotation.
  // Pixel coordinates are mirrored only for the visible shape, not the motion test.
  class HandArticulation {
    constructor() { this.lose(); }
    lose() {
      this.last = null; this.candidate = this.gesture = null; this.since = 0; this.frames = 0; this.identity = null;
      this.energy = [0, 0, 0, 0, 0]; this.pose = null;
    }
    pause(now) { this.last = null; this.candidate = null; this.since = now; this.frames = 0; }
    update(points, metric, four, now, identity) {
      if (this.identity && identity !== this.identity) this.lose();
      this.identity = identity;
      const ids = [0, 5, 9, 13, 17], tips = [4, 8, 12, 16, 20];
      const center = ids.reduce((v, i) => ({ x: v.x + points[i].x / 5, y: v.y + points[i].y / 5 }), { x: 0, y: 0 });
      const dx = points[9].x - points[0].x, dy = points[9].y - points[0].y, scale = Math.hypot(dx, dy);
      if (scale < 1e-5) { this.lose(); return; }
      const ux = dx / scale, uy = dy / scale;
      const local = points.map(p => ({ x: ((p.x - center.x) * uy - (p.y - center.y) * ux) / scale,
        y: ((p.x - center.x) * ux + (p.y - center.y) * uy) / scale }));
      const dist = (a, b) => Math.hypot(metric[a].x - metric[b].x, metric[a].y - metric[b].y, (metric[a].z || 0) - (metric[b].z || 0));
      const thumb = clamp((dist(4, 17) / Math.max(1e-5, dist(0, 9)) - .65) / .85);
      const extension = [thumb, ...four];
      const previous = this.last, dt = previous ? (now - previous.time) / 1000 : 0;
      if (previous && dt > 0 && dt < 1.2) {
        for (let f = 0; f < 5; f++) {
          const tip = tips[f], base = f === 0 ? 1 : 1 + f * 4;
          const ax = local[tip].x - local[base].x, ay = local[tip].y - local[base].y;
          const bx = previous.local[tip].x - previous.local[base].x, by = previous.local[tip].y - previous.local[base].y;
          const velocity = Math.hypot(ax - bx, ay - by) / dt;
          const bending = Math.abs(extension[f] - previous.extension[f]) / dt;
          // Keypoint noise is not a finger wave. Bound isolated landmark glitches.
          const strength = clamp((Math.min(velocity, 4) * .65 + Math.min(bending, 4) * .45 - .16) / 1.8);
          this.energy[f] = approach(this.energy[f], strength, strength > this.energy[f] ? 7 : 2.5, dt);
        }
      } else this.energy.fill(0);
      this.last = { time: now, local, extension };
      const raised = four.map(e => e > .62), folded = four.map(e => e < .38);
      let candidate = null;
      if (raised.every(Boolean)) candidate = 'open';
      else if (folded.every(Boolean)) candidate = 'fist';
      else if (raised[0] && raised[1] && folded[2] && folded[3] &&
          Math.hypot(local[8].x - local[12].x, local[8].y - local[12].y) > .18) candidate = 'v';
      else if (raised.filter(Boolean).length === 1 && four.every((e, i) => raised[i] || folded[i])) candidate = 'point';
      if (candidate !== this.candidate) { this.candidate = candidate; this.since = now; this.frames = 1; }
      else this.frames++;
      if (candidate && now - this.since >= 500 && this.frames >= 3) this.gesture = candidate;
      // Keep an established outline during brief finger play; release uncertain poses.
      if (!candidate && now - this.since > 1100) this.gesture = null;
      const shape = points.map(p => ({ x: clamp(-(p.x - center.x) / scale * .46, -1.45, 1.45),
        y: clamp((p.y - center.y) / scale * .46, -1.45, 1.45) }));
      this.pose = { points: shape, extension, energy: [...this.energy], gesture: this.gesture, candidate,
        heldMs: now - this.since, pointFinger: raised.findIndex(Boolean) + 1 };
    }
  }

  // Broad drifting lobes suggest a gesture without tracing joints or fingertips.
  // Most particles retain their autonomous cloud positions at all times.
  class HandSculpture {
    constructor(count) {
      this.count = count; this.coords = new Float32Array(count * 3); this.blend = 0; this.pose = null;
      this.energy = [0, 0, 0, 0, 0]; this.tips = Array.from({ length: 5 }, () => ({ x: 0, y: 0 }));
      this.seeds = Float32Array.from({ length: count * 6 }, (_, i) => {
        const value = Math.sin((i + 1) * 127.1) * 43758.5453; return value - Math.floor(value);
      });
      this.ready = false; this.flowTime = 0;
    }
    clear() { this.blend = 0; this.pose = null; this.energy.fill(0); this.ready = false; this.flowTime = 0; }
    update(pose, dt) {
      if (pose) this.pose = pose;
      this.flowTime += dt;
      this.blend = approach(this.blend, pose?.gesture ? .48 : 0, pose?.gesture ? 1.3 : 1.1, dt);
      for (let f = 0; f < 5; f++) {
        const value = pose?.energy[f] || 0;
        this.energy[f] = approach(this.energy[f], value, value > this.energy[f] ? 8 : 2.5, dt);
      }
      const p = this.pose?.points;
      if (!p) return;
      if (!pose && this.blend < .001 && this.energy.every(e => e < .001)) { this.pose = null; this.ready = false; return; }
      for (let f = 0; f < 5; f++) {
        const target = p[[4, 8, 12, 16, 20][f]];
        this.tips[f].x = approach(this.tips[f].x, target.x, 7, dt);
        this.tips[f].y = approach(this.tips[f].y, target.y, 7, dt);
      }
      const gesture = this.pose.gesture, finger = this.pose.pointFinger;
      const mean = (a, b) => ({ x: (p[a].x + p[b].x) / 2, y: (p[a].y + p[b].y) / 2 });
      // An open hand has three overlapping tendencies, never five finger tubes.
      const directions = gesture === 'fist' ? [] : gesture === 'v' ? [p[8], p[12]] : gesture === 'point' ? [p[[4, 8, 12, 16, 20][finger]]] : [p[4], mean(8, 12), mean(16, 20)];
      const smoothing = 1 - Math.exp(-2.3 * dt);
      for (let i = 0; i < this.count; i++) {
        const k = i * 6, j = i * 3, a = this.seeds[k], b = this.seeds[k + 1], c = this.seeds[k + 2], d = this.seeds[k + 3];
        const e = this.seeds[k + 4], f = this.seeds[k + 5];
        const spread = gesture === 'fist' ? .62 : gesture === 'v' ? .60 : .90;
        let x = (c + e - 1) * spread, y = (d + f - 1) * spread;
        if (a >= .42 && directions.length) {
          const direction = directions[Math.min(directions.length - 1, Math.floor(b * directions.length))];
          const length = Math.hypot(direction.x, direction.y) || 1, reach = gesture === 'v' ? .45 + c * 1.5 : .28 + c * 1.14;
          x += direction.x / length * reach; y += direction.y / length * reach;
        }
        // Wide soft volumes and slow wandering prevent dense bones, edges or tips.
        x += Math.sin(this.flowTime * .65 + a * Math.PI * 2) * .11;
        y += Math.cos(this.flowTime * .53 + b * Math.PI * 2) * .11;
        const z = (b + e - 1) * .72 + Math.sin(this.flowTime * .43 + d * Math.PI * 2) * .09;
        this.coords[j] = this.ready ? this.coords[j] + (x - this.coords[j]) * smoothing : x;
        this.coords[j + 1] = this.ready ? this.coords[j + 1] + (y - this.coords[j + 1]) * smoothing : y;
        this.coords[j + 2] = this.ready ? this.coords[j + 2] + (z - this.coords[j + 2]) * smoothing : z;
      }
      this.ready = true;
    }
  }

  // Upper-body geometry in pixel units, normalized by shoulder width (not camera distance).
  class BodyFilter {
    constructor() { this.present = false; this.seen = 0; this.last = null; this.anchor = null; this.sway = this.lift = this.spread = this.motion = 0; }
    lose() { this.present = false; this.last = null; this.anchor = null; }
    update(landmarks, now, width, height) {
      const threshold = this.present ? .5 : .65;
      const valid = i => landmarks?.[i] && Number.isFinite(landmarks[i].x) && Number.isFinite(landmarks[i].y) &&
        landmarks[i].x >= 0 && landmarks[i].x <= 1 && landmarks[i].y >= 0 && landmarks[i].y <= 1 &&
        landmarks[i].visibility >= threshold && (landmarks[i].presence ?? 1) >= threshold;
      const ids = [11, 12, 13, 14, 15, 16], visible = ids.filter(valid);
      // Shoulder-only guesses in a face close-up must not animate an unseen body.
      if (!width || !height || !valid(11) || !valid(12) || visible.length < 4) {
        this.last = null;
        if (now - this.seen > 450) this.lose();
        return;
      }
      const p = Object.fromEntries(visible.map(i => [i, { x: landmarks[i].x * width, y: landmarks[i].y * height }]));
      const scale = Math.hypot(p[11].x - p[12].x, p[11].y - p[12].y);
      if (scale < Math.min(width, height) * .075) { this.lose(); return; }
      const center = { x: (p[11].x + p[12].x) / 2, y: (p[11].y + p[12].y) / 2 };
      const local = Object.fromEntries(visible.map(i => [i, { x: (p[i].x - center.x) / scale, y: (p[i].y - center.y) / scale }]));
      const previous = this.last;
      this.last = { center, scale, local, time: now }; this.seen = now;
      if (!previous || now - previous.time > 1300) { this.anchor = center.x; return; }
      const dt = clamp((now - previous.time) / 1000, .016, 1.3), meanScale = (scale + previous.scale) / 2;
      const travel = Math.hypot(center.x - previous.center.x, center.y - previous.center.y) / meanScale;
      const zoom = Math.abs(Math.log(scale / previous.scale));
      if (travel > 1.2 || zoom > .45) { this.lose(); return; }
      this.present = true;
      // Re-anchor on a depth change, retaining the current sway rather than inventing motion.
      const tilt = (p[11].y - p[12].y) / scale * .35;
      if (zoom > .04) this.anchor = center.x + (this.sway - tilt) * scale / .9;
      let sway = clamp(-(center.x - this.anchor) / scale * .9 + tilt, -1, 1);
      if (Math.abs(sway) < .035) sway = 0;
      const arms = [[11, 13, 15], [12, 14, 16]].map(([s, e, w]) => {
        if (!p[e] || !p[w]) return { lift: 0, spread: 0 };
        return { lift: clamp((p[s].y - p[w].y) / scale - .05),
          spread: clamp((Math.abs(p[w].x - center.x) / scale - .65) / .75) };
      });
      const spread = Math.min(arms[0].spread, arms[1].spread), raised = Math.min(arms[0].lift, arms[1].lift);
      const shared = visible.filter(i => previous.local[i]);
      const articulation = shared.reduce((sum, i) => sum + Math.hypot(local[i].x - previous.local[i].x, local[i].y - previous.local[i].y), 0) / shared.length / dt;
      const energy = clamp(((zoom > .04 ? 0 : travel / dt) * .8 + articulation * .65 - .12) / 2);
      this.sway = approach(this.sway, sway, 5, dt);
      this.lift = approach(this.lift, Math.max(raised, spread * .7), 3, dt);
      this.spread = approach(this.spread, Math.max(spread, raised * .85), 3, dt);
      this.motion = approach(this.motion, energy, energy > this.motion ? 4 : 1.1, dt);
    }
    tick(now, dt) {
      if (now - this.seen > 1100) this.lose();
      if (!this.present) for (const key of ['sway', 'lift', 'spread', 'motion']) this[key] = approach(this[key], 0, 1.6, dt);
    }
  }

  // One shared slot for hand/body work; the face worker remains independently responsive.
  // No queued frames: a busy slot simply skips this video frame.
  class MotionBudget {
    constructor() { this.owner = null; this.after = 0; }
    acquire(owner, now) { if (this.owner || now < this.after) return false; this.owner = owner; return true; }
    release(owner) { if (this.owner === owner) { this.owner = null; this.after = performance.now() + 8; } }
  }
  const motionBudget = new MotionBudget();

  // Serialized into a classic worker: the official WASM loader needs importScripts.
  // All URLs are absolute, same-origin paths computed from sketch.js, never a CDN.
  function faceWorker() {
    let task;
    self.onmessage = async ({ data }) => {
      try {
        if (data.type === 'init') {
          const { FilesetResolver, FaceLandmarker } = await import(data.library);
          const files = await FilesetResolver.forVisionTasks(data.wasm);
          task = await FaceLandmarker.createFromOptions(files, {
            baseOptions: { modelAssetPath: data.model, delegate: 'CPU' }, runningMode: 'VIDEO', numFaces: 1,
            outputFaceBlendshapes: true, outputFacialTransformationMatrixes: false,
            minFaceDetectionConfidence: .55, minFacePresenceConfidence: .55, minTrackingConfidence: .55,
          });
          self.postMessage({ type: 'ready' });
        } else if (data.type === 'frame') {
          try {
            const width = data.image.width, height = data.image.height;
            const result = task.detectForVideo(data.image, data.time);
            const face = result.faceLandmarks?.[0];
            self.postMessage({ type: 'result', categories: result.faceBlendshapes?.[0]?.categories || [],
              face: face ? { x: 1 - face[1].x, y: face[1].y, approach: faceApproachMeasure(face, width, height) } : null, width, height, time: data.time });
          } finally { data.image.close(); }
        } else if (data.type === 'close') { task?.close(); self.close(); }
      } catch (error) { self.postMessage({ type: 'error', message: String(error?.message || error) }); }
    };
  }
  function handWorker() {
    let task, canvas, context;
    self.onmessage = async ({ data }) => {
      try {
        if (data.type === 'hand-init') {
          importScripts(data.library);
          self.tf = self.ml5.tf;
          if (self.tf.version.tfjs !== '4.22.0') throw new Error('Hand runtime version mismatch');
          // ml5 bundles native ES2017 classes; the ES5 backend cannot extend them.
          importScripts(data.wasm + 'tf-backend-wasm.es2017.js');
          self.tf.wasm.setWasmPaths(data.wasm); self.tf.wasm.setThreadsCount(1);
          const warn = console.warn; let backendWarning = '';
          console.warn = (...args) => { backendWarning = args.map(String).join(' '); warn(...args); };
          let backendReady;
          try { backendReady = await self.tf.setBackend('wasm'); } finally { console.warn = warn; }
          if (!backendReady) throw new Error(backendWarning || 'Hand WASM backend unavailable');
          await self.tf.ready();
          task = await self.ml5.handPose({ runtime: 'tfjs', maxHands: 1, modelType: 'lite', flipped: false,
            detectorModelUrl: data.detector, landmarkModelUrl: data.landmark });
          await task.ready;
          canvas = new OffscreenCanvas(1, 1); context = canvas.getContext('2d', { willReadFrequently: true });
          self.postMessage({ type: 'hand-ready' });
        } else if (data.type === 'hand-frame') {
          const started = performance.now();
          try {
            canvas.width = data.width; canvas.height = data.height;
            context.drawImage(data.image, 0, 0, data.width, data.height);
            // ImageData is an official ml5 input and needs no DOM/p5 shims in a Worker.
            const hands = await task.detect(context.getImageData(0, 0, data.width, data.height));
            self.postMessage({ type: 'hand-result', hands, time: data.time, width: data.width, height: data.height, duration: performance.now() - started });
          } finally { data.image.close(); }
        }
      } catch (error) { self.postMessage({ type: 'hand-error', message: String(error?.message || error) }); }
    };
  }
  function bodyWorker() {
    let task, canvas, context;
    self.onmessage = async ({ data }) => {
      try {
        if (data.type === 'body-init') {
          const { FilesetResolver, PoseLandmarker } = await import(data.library);
          task = await PoseLandmarker.createFromOptions(await FilesetResolver.forVisionTasks(data.wasm), {
            baseOptions: { modelAssetPath: data.model, delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1,
            minPoseDetectionConfidence: .6, minPosePresenceConfidence: .6, minTrackingConfidence: .6,
            outputSegmentationMasks: false,
          });
          canvas = new OffscreenCanvas(1, 1); context = canvas.getContext('2d');
          self.postMessage({ type: 'body-ready' });
        } else if (data.type === 'body-frame') {
          const started = performance.now();
          try {
            canvas.width = data.width; canvas.height = data.height;
            context.drawImage(data.image, 0, 0, data.width, data.height);
            const result = task.detectForVideo(canvas, data.time);
            self.postMessage({ type: 'body-result', landmarks: result.landmarks?.[0] || [], time: data.time,
              width: data.width, height: data.height, duration: performance.now() - started });
          } finally { data.image.close(); }
        }
      } catch (error) { self.postMessage({ type: 'body-error', message: String(error?.message || error) }); }
    };
  }
  const assetBase = new URL('.', document.currentScript.src);
  const localAsset = path => new URL(path, assetBase).href;
  const failure = (name, message) => Object.assign(new Error(message), { name });
  class HandInput {
    constructor() {
      this.filter = new HandFilter(); this.state = 'idle'; this.active = false; this.generation = 0;
      this.frames = 0; this.interval = 125; this.lastFrame = 0; this.busy = false;
      this.approach = new ApproachFilter();
    }
    start() {
      if (this.state === 'loading' || this.state === 'ready') return;
      this.stop();
      const id = ++this.generation; this.active = true; this.state = 'loading'; this.filter.lose();
      this.timer = setTimeout(() => { if (id === this.generation) this.fail('Hand model loading timed out'); }, 60000);
      try {
        this.workerURL = URL.createObjectURL(new Blob([`(${handWorker.toString()})()`], { type: 'text/javascript' }));
        this.worker = new Worker(this.workerURL);
        this.worker.onerror = () => { if (id === this.generation) this.fail('Hand worker failed'); };
        this.worker.onmessage = ({ data }) => {
          if (id !== this.generation || !this.active) return;
          if (data.type === 'hand-ready') { clearTimeout(this.timer); this.state = 'ready'; this.lastFrame = 0; }
          else if (data.type === 'hand-error') this.fail(data.message);
          else if (data.type === 'hand-result') {
            motionBudget.release(this);
            clearTimeout(this.frameTimer); this.busy = false; this.frames++;
            const now = performance.now();
            this.lastDuration = data.duration;
            this.interval = clamp(approach(this.interval, Math.max(125, data.duration * 1.5), 2, .125), 125, 500);
            this.nextFrame = now + Math.min(500, this.interval * .5);
            if (!document.hidden && data.time >= live.presenceInvalidBefore && now - data.time < 1500) {
              const wave = this.filter.update(data.hands, data.time, data.width, data.height);
              if (now - data.time < 750 && this.approach.update(handApproachMeasure(data.hands, data.width, data.height), data.time)) {
                creature.trigger('depth', 1, 'hand');
              }
              if (wave) creature.trigger('retreat');
            }
          }
        };
        this.worker.postMessage({ type: 'hand-init', library: localAsset('vendor/ml5-1.4.0/ml5.min.js'),
            detector: localAsset('models/handpose-detector/model.json'), landmark: localAsset('models/handpose-landmark/model.json'), wasm: localAsset('vendor/tfjs-wasm-4.22.0/') });
      } catch (error) { this.fail(String(error)); }
    }
    fail(message) { this.stop(); this.state = 'error'; this.error = message; }
    stop() {
      this.generation++; this.active = false; this.state = 'idle'; clearTimeout(this.timer); clearTimeout(this.frameTimer);
      this.worker?.terminate(); this.worker = null;
      motionBudget.release(this);
      if (this.workerURL) URL.revokeObjectURL(this.workerURL); this.workerURL = null;
      this.filter.lose(); this.frames = 0; this.busy = false; this.videoTime = -1; this.nextFrame = 0; this.error = null;
      this.approach.reset();
    }
    update(video, now, s) {
      const f = this.filter;
      this.approach.tick(now);
      if (now - f.seen > Math.max(650, this.interval * 2.5, (this.lastDuration || 0) * 2.5)) f.lose();
      s.handPresent = this.active && this.state === 'ready' && f.present;
      s.handX = f.x; s.handY = f.y; s.handOpen = f.open; s.handSpeed = s.handPresent ? f.speed : 0;
      s.handPose = s.handPresent ? f.art.pose : null;
      if (!this.active || this.state !== 'ready' || this.busy || now < this.nextFrame || now - this.lastFrame < this.interval || video.readyState < 2 || video.currentTime === this.videoTime) return;
      if (!motionBudget.acquire(this, now)) return;
      this.lastFrame = now; this.videoTime = video.currentTime; this.busy = true;
      // Preserve the source aspect ratio, then map x/videoWidth and y/videoHeight to the canvas.
      const scale = Math.min(1, 320 / Math.max(video.videoWidth, video.videoHeight));
      const id = this.generation, width = Math.round(video.videoWidth * scale), height = Math.round(video.videoHeight * scale);
      this.frameTimer = setTimeout(() => { if (id === this.generation) this.fail('Hand inference timed out'); }, 15000);
      createImageBitmap(video).then(image => {
        if (id !== this.generation || !this.active) { image.close(); return; }
        this.worker.postMessage({ type: 'hand-frame', image, time: now, width, height }, [image]);
      }).catch(() => { if (id === this.generation) this.fail('Camera frame unavailable'); });
    }
  }
  class BodyInput {
    constructor() { this.filter = new BodyFilter(); this.state = 'idle'; this.generation = 0; this.frames = 0; this.interval = 167; }
    start() {
      if (this.state === 'loading' || this.state === 'ready') return;
      // Loading must not reserve the inference slot: slow downloads cannot pause hands.
      this.stop();
      const id = this.generation; this.state = 'loading';
      this.timer = setTimeout(() => { if (id === this.generation) this.fail('Body model loading timed out'); }, 45000);
      try {
        this.workerURL = URL.createObjectURL(new Blob([`(${bodyWorker.toString()})()`], { type: 'text/javascript' }));
        this.worker = new Worker(this.workerURL);
        this.worker.onerror = () => { if (id === this.generation) this.fail('Body worker failed'); };
        this.worker.onmessage = ({ data }) => {
          if (id !== this.generation) return;
          if (data.type === 'body-ready') { clearTimeout(this.timer); motionBudget.release(this); this.state = 'ready'; }
          else if (data.type === 'body-error') this.fail(data.message);
          else if (data.type === 'body-result') {
            clearTimeout(this.frameTimer); motionBudget.release(this); this.busy = false; this.frames++;
            const now = performance.now();
            this.interval = clamp(approach(this.interval, Math.max(167, data.duration * 2), 2, .167), 167, 700);
            this.nextFrame = now + this.interval * .5;
            if (!document.hidden && data.time >= live.presenceInvalidBefore && now - data.time < 1000) this.filter.update(data.landmarks, data.time, data.width, data.height);
          }
        };
        this.worker.postMessage({ type: 'body-init', library: localAsset('vendor/mediapipe-0.10.14/vision_bundle.mjs'),
          wasm: localAsset('vendor/mediapipe-0.10.14/wasm'), model: localAsset('models/pose_landmarker_lite.task') });
      } catch (error) { this.fail(String(error)); }
    }
    fail(message) { this.stop(); this.state = 'error'; this.error = message; }
    stop() {
      this.generation++; clearTimeout(this.timer); clearTimeout(this.frameTimer); this.worker?.terminate(); this.worker = null;
      if (this.workerURL) URL.revokeObjectURL(this.workerURL); this.workerURL = null;
      motionBudget.release(this); this.state = 'idle'; this.error = null; this.frames = 0; this.busy = false;
      this.lastFrame = this.nextFrame = 0; this.videoTime = -1; this.filter = new BodyFilter();
    }
    update(video, now, dt, s) {
      if (this.state === 'waiting' && live.hands.state !== 'loading') this.start();
      this.filter.tick(now, dt);
      const f = this.filter;
      Object.assign(s, { bodyPresent: this.state === 'ready' && f.present, bodySway: f.sway, bodyLift: f.lift, bodySpread: f.spread, bodyMotion: f.motion });
      if (this.state !== 'ready' || this.busy || now < this.nextFrame || now - this.lastFrame < this.interval || video.readyState < 2 || video.currentTime === this.videoTime) return;
      if (!motionBudget.acquire(this, now)) return;
      this.busy = true; this.lastFrame = now; this.videoTime = video.currentTime;
      const id = this.generation, scale = Math.min(1, 384 / Math.max(video.videoWidth, video.videoHeight));
      const width = Math.round(video.videoWidth * scale), height = Math.round(video.videoHeight * scale);
      this.frameTimer = setTimeout(() => { if (id === this.generation) this.fail('Body inference timed out'); }, 12000);
      createImageBitmap(video).then(image => {
        if (id !== this.generation || this.state !== 'ready') { image.close(); return; }
        this.worker.postMessage({ type: 'body-frame', image, time: now, width, height }, [image]);
      }).catch(() => { if (id === this.generation) this.fail('Camera frame unavailable'); });
    }
  }
  class LiveInput {
    constructor() {
      this.generation = 0; this.stream = null; this.audio = null; this.worker = null; this.active = false;
      this.sensitivity = 1; this.muted = false; this.previewHidden = false; this.gate = new AudioGate();
      this.expression = new ExpressionFilter(); this.frames = 0; this.modelReady = false; this.starting = false;
      this.modelTimer = 0; this.permissionTimer = 0; this.frameTimer = 0; this.cancelLoad = null;
      this.presenceInvalidBefore = 0; this.hands = new HandInput(); this.body = new BodyInput();
      this.faceApproach = new ApproachFilter();
    }
    stop() {
      this.generation++; this.active = false; this.starting = false; this.modelReady = false;
      expressionSamples.pending = null; expressionSamples.records = [];
      $('#expression-sample-data').value = ''; $('#expression-sample-report').hidden = true;
      $('#expression-sample-status').textContent = 'Samples stay in this tab. No images or audio are recorded. Home clears them.';
      this.hands.stop();
      this.faceApproach.reset(); this.approachFrame = null;
      $('#approach-report').value = ''; $('#approach-report').hidden = true; $('#approach-readings').textContent = '';
      $('#approach-test-status').textContent = 'Test Afraid uses the same retreat and adjusted sound. Keep Sound Effects on.';
      this.body.stop();
      clearTimeout(this.modelTimer); clearTimeout(this.permissionTimer); clearTimeout(this.frameTimer);
      this.cancelLoad?.(); this.cancelLoad = null;
      this.worker?.terminate(); this.worker = null;
      if (this.workerURL) URL.revokeObjectURL(this.workerURL); this.workerURL = null;
      this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
      this.source?.disconnect(); this.analyser?.disconnect(); this.source = this.analyser = null;
      if (this.audio) this.audio.close().catch(() => {}); this.audio = null;
      const video = $('#camera'); video.pause(); video.srcObject = null;
      this.busy = false; this.resultAt = 0; this.lastFrame = 0; this.lastVideo = -1;
      this.expression = new ExpressionFilter(); this.gate.reset(); this.frames = 0;
      if (typeof creature !== 'undefined') creature.reset();
    }
    async start() {
      if (this.starting || this.active) return;
      this.stop(); const id = this.generation;
      const current = () => id === this.generation;
      this.starting = true; this.muted = false; this.previewHidden = false;
      resetInputs(); setStage('loading');
      sounds.prepareGesture();
      $('#connection-title').textContent = 'Getting ready';
      $('#connection-message').textContent = 'Allow your camera and microphone to begin.';
      $('#retry').hidden = true;
      let phase = 'permission';
      try {
        if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) throw failure('UnsupportedError', 'Use HTTPS or localhost in a browser with camera and microphone support.');
        if (!window.Worker || !window.createImageBitmap || !window.OffscreenCanvas) throw failure('UnsupportedError', 'This browser cannot run face tracking. Try a recent Chrome, Edge or Safari browser, or use Demo.');
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) throw failure('UnsupportedError', 'Audio analysis is not supported in this browser. Try another browser or use Demo.');
        this.audio = new Audio(); this.audio.resume().catch(() => {});
        this.permissionTimer = setTimeout(() => {
          if (current()) $('#connection-message').textContent = 'Still waiting for device access. Check your browser’s permission prompt, or choose Demo.';
        }, 15000);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
        });
        if (!current()) { stream.getTracks().forEach(t => t.stop()); return; }
        clearTimeout(this.permissionTimer); this.stream = stream;
        stream.getTracks().forEach(track => track.addEventListener('ended', () => {
          if (current()) this.fail(failure('NotReadableError', 'A device disconnected. Reconnect it and try again.'));
        }));
        phase = 'camera';
        $('#connection-message').textContent = 'Starting the camera…';
        const video = $('#camera'); video.srcObject = stream;
        let videoTimer;
        try { await Promise.race([video.play(), new Promise((_, reject) => { videoTimer = setTimeout(() => reject(failure('CameraError', 'The camera did not start. Check that it is available, then try again.')), 12000); })]); }
        finally { clearTimeout(videoTimer); }
        if (!current()) return;
        this.source = this.audio.createMediaStreamSource(stream); this.analyser = this.audio.createAnalyser();
        this.analyser.fftSize = 1024; this.data = new Float32Array(this.analyser.fftSize); this.source.connect(this.analyser);
        // No connection to the audio destination: there is no microphone feedback.
        phase = 'model';
        $('#connection-message').textContent = 'Loading the face model on this device. The first start may take a moment…';
        await this.loadModel(id);
        if (!current()) return;
        this.gate.reset(); this.expression = new ExpressionFilter(); this.active = true; this.starting = false;
        this.modelReady = true; this.resultAt = performance.now(); this.lastResultTime = this.resultAt;
        $('#camera').classList.remove('preview-hidden'); $('#preview-placeholder').hidden = true;
        $('#toggle-preview').textContent = 'Hide preview'; $('#toggle-preview').setAttribute('aria-pressed', 'false');
        $('#model-status').textContent = 'Face Landmarker is ready. Processing stays on this device.';
        setStage('live'); syncControls(); this.hands.start(); this.body.state = 'waiting';
      } catch (error) {
        if (!current()) return;
        if (phase === 'model' && error.name !== 'AbortError') error = failure('ModelError', 'The face model could not load. Check the connection and model files, then try again.');
        this.fail(error);
      }
    }
    loadModel(id) {
      return new Promise((resolve, reject) => {
        this.workerURL = URL.createObjectURL(new Blob([`${faceApproachMeasure.toString()};(${faceWorker.toString()})()`], { type: 'text/javascript' }));
        this.worker = new Worker(this.workerURL);
        this.cancelLoad = () => reject(failure('AbortError', 'Cancelled'));
        this.modelTimer = setTimeout(() => reject(failure('ModelError', 'Model loading timed out')), 45000);
        this.worker.onerror = () => {
          if (id !== this.generation) return;
          if (this.starting) reject(failure('ModelError', 'Worker could not load'));
          else this.fail(failure('ModelError', 'Face tracking stopped. Try again to reconnect.'));
        };
        this.worker.onmessage = ({ data }) => {
          if (id !== this.generation) return;
          if (data.type === 'ready') { clearTimeout(this.modelTimer); this.cancelLoad = null; resolve(); }
          else if (data.type === 'result') {
            clearTimeout(this.frameTimer); this.busy = false; this.resultAt = performance.now(); this.frames++;
            this.approachFrame = { receivedAt: this.resultAt, capturedAt: data.time, latencyMs: this.resultAt - data.time,
              width: data.width, height: data.height,
              faceDetected: !!data.face, geometry: !!data.face?.approach,
              state: document.hidden ? 'Page hidden' : data.time < this.presenceInvalidBefore ? 'Old result from before resume' : this.resultAt - data.time > 1000 ? 'Result too old (over 1000 ms)' : !data.face ? 'No face detected' : !data.face.approach ? 'Face detected, but size landmarks are missing or outside the image' : 'Fresh face size received' };
            if (this.active && model.stage === 'live' && !document.hidden && data.time >= this.presenceInvalidBefore && this.resultAt - data.time <= 1000) {
              const signals = this.expression.update(data.face ? data.categories : [], data.time, clamp((data.time - this.lastResultTime) / 1000, .01, .2));
              this.lastResultTime = data.time;
              const s = creature.s;
              if (data.face && (!s.facePresent || data.time > s.presenceUntil)) s.presenceSince = data.time;
              Object.assign(s, signals, { facePresent: !!data.face, presenceUntil: data.time + 1000 });
              if (data.face) { s.faceX = clamp(data.face.x); s.faceY = clamp(data.face.y); }
              if (this.faceApproach.update(data.face?.approach || null, data.time)) creature.trigger('depth', 1, 'face');
            }
          } else if (data.type === 'error') {
            if (this.starting) reject(failure('ModelError', data.message));
            else this.fail(failure('ModelError', 'Face tracking stopped. Try again to reconnect.'));
          }
        };
        this.worker.postMessage({ type: 'init', library: localAsset('vendor/mediapipe-0.10.14/vision_bundle.mjs'),
          wasm: localAsset('vendor/mediapipe-0.10.14/wasm'), model: localAsset('models/face_landmarker.task') });
      });
    }
    fail(error) {
      const messages = {
        NotAllowedError: 'Camera or microphone access was blocked. Allow both in your browser’s site settings, then try again.',
        SecurityError: 'Device access is blocked by this browser or page. Open the site directly over HTTPS and try again.',
        NotFoundError: 'No camera or microphone was found. Connect both devices, then try again.',
        OverconstrainedError: 'The camera or microphone could not use these settings. Try a different device or browser.',
        NotReadableError: 'A camera or microphone is unavailable or disconnected. Close other apps using it, then try again.',
      };
      const message = messages[error.name] || (['UnsupportedError', 'ModelError', 'CameraError'].includes(error.name) ? error.message : 'The interaction could not start. Check your devices and try again.');
      setStage('error'); $('#connection-title').textContent = 'Could not connect';
      $('#connection-message').textContent = message; $('#retry').hidden = false;
      $('#connection-title').focus({ preventScroll: true });
    }
    update(now, dt) {
      if (!this.active || model.stage !== 'live') return;
      const s = creature.s;
      this.faceApproach.tick(now);
      this.hands.update($('#camera'), now, s);
      this.body.update($('#camera'), now, dt, s);
      if (!this.muted && this.audio?.state === 'running') {
        this.analyser.getFloatTimeDomainData(this.data);
        const rms = Math.sqrt(this.data.reduce((sum, v) => sum + v * v, 0) / this.data.length);
        this.audioState = this.gate.update(rms, dt, this.sensitivity, sounds.guardMicrophone(now)); s.level = this.audioState.level;
        if (this.audioState.spike) s.spike++;
      } else { s.level = 0; }
      if (now - this.lastResultTime > 1000) { s.smile = s.sad = s.surprise = 0; this.expression.clearTracking(); }
      const video = $('#camera');
      if (!this.busy && now - this.lastFrame >= 80 && video.readyState >= 2 && video.currentTime !== this.lastVideo) {
        this.lastFrame = now; this.lastVideo = video.currentTime; this.busy = true;
        const id = this.generation;
        this.frameTimer = setTimeout(() => { if (id === this.generation) this.fail(failure('ModelError', 'Face tracking stopped responding. Try again to reconnect.')); }, 12000);
        createImageBitmap(video).then(image => {
          if (id !== this.generation || !this.active) { image.close(); return; }
          this.worker.postMessage({ type: 'frame', image, time: now }, [image]);
        }).catch(() => { if (id === this.generation) this.fail(failure('CameraError', 'The camera image is unavailable. Try again to reconnect.')); });
      }
    }
    setMuted(muted) {
      this.muted = muted; this.stream?.getAudioTracks().forEach(track => { track.enabled = !muted; });
      this.gate.reset(); creature.s.level = 0;
      sounds.guardForCalibration();
      if (!muted) this.audio?.resume().catch(() => {});
    }
  }

  // Playback policy uses observed transitions and real elapsed time, not frame counts.
  class SoundCues {
    constructor() { this.reset(); }
    reset() {
      this.last = null; this.smileTime = 0; this.neutralTime = 0; this.smileLatched = false;
      this.handTime = 0; this.handAway = 2; this.handLatched = false; this.phase = 0;
      this.approachLevel = .04; this.events = { clap: 0, retreat: 0, depth: 0 };
    }
    pause() { this.last = null; this.smileTime = this.handTime = 0; }
    update(now, s, familiarity, events) {
      const dt = this.last === null ? 0 : Math.min(.2, Math.max(0, (now - this.last) / 1000)); this.last = now;
      const depthStartled = (events.depth || 0) > this.events.depth;
      const startled = events.clap > this.events.clap || events.retreat > this.events.retreat || depthStartled;
      this.events = { clap: events.clap, retreat: events.retreat, depth: events.depth || 0 };
      const phase = familiarity >= .7 ? 3 : familiarity >= .4 ? 2 : familiarity >= .15 ? 1 : 0;
      const newPhase = phase > this.phase; this.phase = Math.max(this.phase, phase);
      this.smileTime = s.facePresent && s.smile > .2 ? this.smileTime + dt : 0;
      this.neutralTime = s.smile < .1 ? this.neutralTime + dt : 0;
      if (this.neutralTime >= 2) this.smileLatched = false;
      const newSmile = this.smileTime >= 1 && !this.smileLatched;
      if (newSmile) this.smileLatched = true;
      this.handAway = s.handPresent ? 0 : this.handAway + dt;
      if (this.handAway >= 2) this.handLatched = false;
      this.handTime = s.handPresent && s.handSpeed < .8 ? this.handTime + dt : 0;
      const newHand = this.handTime >= .65 && !this.handLatched;
      if (newHand) this.handLatched = true;
      const approaching = s.facePresent && familiarity >= this.approachLevel + .12;
      if (approaching) this.approachLevel = familiarity;
      if (startled) return { name: 'afraid', reason: depthStartled ? 'sudden approach' : 'retreat' };
      if (newSmile || newPhase) return { name: 'happy', reason: newSmile ? 'smile' : 'familiarity' };
      if ((newHand || approaching) && s.sad < .2 && s.surprise < .2) return { name: 'curious', reason: newHand ? 'hand noticed' : 'approaching' };
      return null;
    }
  }

  class ExperienceAudio {
    constructor() {
      this.context = null; this.music = null; this.musicNode = null; this.musicGain = null;
      this.musicTarget = null; this.musicEpoch = 0;
      this.musicLevels = { normal: .10, effect: .035 };
      this.buffers = new Map(); this.loading = null; this.generation = 0; this.active = false;
      this.effectsEnabled = true; this.musicEnabled = true; this.voice = null; this.retiring = new Set();
      try { this.musicEnabled = localStorage.getItem('resonance.music') !== 'off'; } catch {}
      this.policy = new SoundCues(); this.lastPlayed = {}; this.history = []; this.counts = { wake: 0, curious: 0, happy: 0, afraid: 0 };
      this.guardUntil = 0; this.lastAny = -Infinity; this.ready = false; this.blocked = false; this.errors = [];
      this.pendingAfraid = null;
      this.afraidPlayback = null;
    }
    ensureContext() {
      if (!this.context || this.context.state === 'closed') {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) { this.errors = ['Playback is unavailable in this browser.']; return; }
        try { this.context = new Audio({ latencyHint: 'interactive' }); }
        catch (error) { this.errors = [`AudioContext: ${error.name || 'AudioError'}: ${error.message || error}`]; return; }
        const ctx = this.context;
        ctx.addEventListener('statechange', () => {
          if (this.context === ctx && ctx.state === 'running') { this.blocked = false; this.musicTarget = null; this.updateMusic(); }
        });
      }
      return this.context;
    }
    resumeContext(ctx) {
      ctx.resume().then(() => { if (this.context === ctx) { this.blocked = ctx.state !== 'running'; this.resumeError = null; this.updateMusic(); } }).catch(error => { if (this.context === ctx) { this.blocked = true; this.resumeError = `${error.name}: ${error.message}`; } });
    }
    prepareMusic() {
      if (!this.musicEnabled || document.hidden) return;
      const ctx = this.ensureContext(); if (!ctx) return;
      this.resumeContext(ctx); this.startMusicGesture();
    }
    prepareGesture() {
      const ctx = this.ensureContext(); if (!ctx) return;
      const id = this.generation;
      this.resumeContext(ctx);
      if (this.musicEnabled) this.startMusicGesture();
      if (!this.loading || (this.ready && this.errors.length)) {
        this.ready = false;
        this.abort = new AbortController(); this.errors = [];
        this.loading = Promise.allSettled(['wake', 'curious', 'happy', 'afraid'].map(async name => {
          if (this.buffers.has(name)) return;
          const file = name === 'wake' || name === 'afraid' ? name + '-adjusted' : name;
          const response = await fetch(localAsset('sounds/' + file + '.wav'), { signal: this.abort.signal });
          if (!response.ok) throw Error(`${file}.wav: HTTP ${response.status}`);
          const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
          if (id === this.generation) this.buffers.set(name, buffer);
        })).then(results => {
          if (id !== this.generation) return;
          const names = ['Wake', 'Curious', 'Happy', 'Afraid'];
          this.errors = results.flatMap((r, i) => r.status === 'rejected' ? [names[i] + ': ' + String(r.reason?.message || r.reason)] : []);
          this.ready = true;
        });
      }
    }
    startMusicGesture() {
      if (!this.context || !this.musicEnabled) return;
      if (!this.music) {
        const element = new Audio(); element.loop = true; element.preload = 'auto';
        element.src = localAsset('sounds/waterfall.mp3');
        this.music = element; this.musicGain = this.context.createGain(); this.musicGain.gain.value = 0;
        this.musicTarget = null;
        this.musicNode = this.context.createMediaElementSource(element); this.musicNode.connect(this.musicGain).connect(this.context.destination);
        element.addEventListener('error', () => { if (this.music === element) this.musicError = true; });
      }
      const element = this.music, epoch = this.musicEpoch;
      if (element.error) element.load();
      // Reuse the same element and playback position across every site screen.
      if (element.paused) element.play().then(() => {
        if (this.music === element && epoch === this.musicEpoch) { this.musicBlocked = false; this.musicError = false; }
      }).catch(error => {
        if (this.music === element && epoch === this.musicEpoch) {
          this.musicBlocked = error.name === 'NotAllowedError';
          if (error.name !== 'NotAllowedError' && error.name !== 'AbortError') this.musicError = true;
        }
      });
    }
    begin() {
      if (this.active) return;
      this.active = true; this.policy.reset(); this.lastPlayed = {}; this.lastAny = -Infinity; this.pendingAfraid = null;
      this.policy.events = { clap: creature.eventCounts.clap, retreat: creature.eventCounts.retreat, depth: creature.eventCounts.depth }; this.lastName = null;
      this.counts = { wake: 0, curious: 0, happy: 0, afraid: 0 }; this.history = []; this.wakePending = true;
      const id = this.generation;
      Promise.resolve(this.loading).then(() => {
        if (id !== this.generation || !this.active || document.hidden || !this.wakePending) return;
        this.wakePending = false; creature.awaken(); this.request('wake', 'session start');
      });
    }
    guardMicrophone(now) { return now < this.guardUntil; }
    setMusicLevel(target, seconds = .4) {
      const ctx = this.context, gain = this.musicGain?.gain;
      if (!gain || ctx?.state !== 'running' || target === this.musicTarget) return;
      const now = ctx.currentTime;
      if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(now);
      else { const value = gain.value; gain.cancelScheduledValues(now); gain.setValueAtTime(value, now); }
      gain.setTargetAtTime(target, now, seconds);
      this.musicTarget = target;
    }
    updateMusic() {
      if (document.hidden) return;
      // Independent of interaction state, microphone level, and calibration.
      const target = !this.musicEnabled || !this.music || this.music.paused ? 0 : this.voice ? this.musicLevels.effect : this.musicLevels.normal;
      this.setMusicLevel(target, target < (this.musicTarget ?? 0) ? .07 : .4);
    }
    guardForCalibration() {
      this.guardUntil = Math.max(this.guardUntil, performance.now() + 250);
    }
    releaseVoice(immediate = false) {
      if (!this.voice) return;
      const v = this.voice; this.voice = null; this.retiring.add(v);
      const now = v.context.currentTime;
      v.gain.gain.cancelScheduledValues(now); v.gain.gain.setValueAtTime(v.gain.gain.value, now);
      v.gain.gain.linearRampToValueAtTime(0, now + (immediate ? .002 : .02));
      try { v.source.stop(now + (immediate ? .003 : .025)); } catch {}
      v.ends = now + (immediate ? .003 : .025); this.guardUntil = performance.now() + 450;
    }
    startle(event) {
      // The animation handler has already accepted this event and its cooldown.
      // Audio uses its ID to deduplicate, never a second timer.
      if (this.afraidPlayback?.eventId === event.id) return;
      this.afraidPlayback = { eventId: event.id, at: event.at, source: event.source, status: 'Waiting', detail: '' };
      this.pendingAfraid = { event, expires: performance.now() + 350 };
      this.flushAfraid(performance.now());
    }
    flushAfraid(now) {
      const pending = this.pendingAfraid;
      if (!pending) return;
      if (now > pending.expires) { this.afraidPlayback.status = 'Not played'; this.pendingAfraid = null; return; }
      const played = this.request('afraid', pending.event.reason, pending.event.id);
      if (played) { this.pendingAfraid = null; return; }
      this.afraidPlayback.detail = this.lastRequestError;
      const terminal = !this.active || !this.effectsEnabled || document.hidden || this.ready && !this.buffers.has('afraid');
      this.afraidPlayback.status = terminal || now > pending.expires ? 'Not played' : 'Waiting';
      if (terminal || now > pending.expires) this.pendingAfraid = null;
    }
    request(name, reason, eventId = null) {
      const now = performance.now(), ctx = this.context;
      const reject = message => { this.lastRequestError = message; return false; };
      if (!this.active) return reject('Interaction audio is inactive. Start an interaction first.');
      if (!this.effectsEnabled) return reject('Sound Effects is off.');
      if (document.hidden) return reject('Page is hidden.');
      if (!ctx || ctx.state !== 'running') return reject(`AudioContext is ${ctx?.state || 'unavailable'}. ${this.resumeError || this.errors.join(' ') || 'Click Test Afraid to unlock playback.'}`);
      if (!this.buffers.has(name)) return reject(this.errors.find(e => e.startsWith(name[0].toUpperCase() + name.slice(1) + ':')) || `${name} audio is still loading or has not decoded.`);
      if (name === 'afraid' && eventId === null) return reject('Afraid requires an accepted startle event.');
      const cooldown = { wake: Infinity, curious: 16000, happy: 11000, afraid: 0 }[name];
      if (this.lastPlayed[name] !== undefined && now - this.lastPlayed[name] < cooldown) return reject('Sound cue cooldown.');
      if (name !== 'afraid' && (this.voice || this.retiring.size || now - this.lastAny < (this.lastName === 'wake' ? 600 : 4000))) return reject('Another sound or cue spacing is active.');
      try {
      if (name === 'afraid') this.releaseVoice();
      const source = ctx.createBufferSource(), gain = ctx.createGain(); source.buffer = this.buffers.get(name);
      // Files contain the approved 30% preview levels; a further soft output trim.
      gain.gain.value = .65; source.connect(gain).connect(ctx.destination);
      const priorEnd = Math.max(ctx.currentTime, ...Array.from(this.retiring, v => v.ends));
      const start = Math.max(ctx.currentTime + .008, priorEnd + .005);
      const v = { name, source, gain, context: ctx, ends: start + source.buffer.duration };
      source.onended = () => { source.disconnect(); gain.disconnect(); this.retiring.delete(v); if (this.voice === v) this.voice = null;
        if (name === 'afraid' && this.afraidPlayback?.eventId === eventId) this.afraidPlayback.status = 'Playback ended'; };
      try { source.start(start); } catch (error) { source.disconnect(); gain.disconnect(); throw error; }
      this.voice = v; this.lastPlayed[name] = now; this.lastAny = now; this.counts[name]++;
      this.lastName = name;
      this.guardUntil = now + (v.ends - ctx.currentTime) * 1000 + 450;
      this.history.push({ name, reason, eventId, at: now, duration: source.buffer.duration, delay: start - ctx.currentTime });
      if (this.history.length > 40) this.history.shift();
      this.lastRequestError = null;
      if (name === 'afraid' && this.afraidPlayback?.eventId === eventId) Object.assign(this.afraidPlayback,
        { status: 'Playback scheduled', detail: `sounds/afraid-adjusted.wav · ${source.buffer.duration.toFixed(3)} s · AudioContext running`, delayMs: (start - ctx.currentTime) * 1000 });
      return true;
      } catch (error) {
        if (this.voice?.name === name) { try { this.voice.source.disconnect(); this.voice.gain.disconnect(); } catch {} this.voice = null; }
        return reject(`${error.name || 'AudioError'}: ${error.message || error}`);
      }
    }
    update(now, s, familiarity, events) {
      this.updateMusic();
      if (!this.active || document.hidden) return;
      const cue = this.policy.update(now, s, familiarity, events);
      const calibrating = model.stage === 'live' && !live.muted && live.gate.elapsed < 1.3;
      const speaking = s.level > .1;
      // Afraid was submitted directly with the animation event, not polled again.
      this.flushAfraid(now);
      // Do not queue belated replies while the user is speaking/singing or a sound plays.
      if (cue && cue.name !== 'afraid' && !this.pendingAfraid && !speaking && !calibrating) {
        const played = this.request(cue.name, cue.reason);
        // A hand/smile that arrives during the very short wake keeps its current cue.
        if (!played && this.voice?.name === 'wake') {
          if (cue.reason === 'smile') this.policy.smileLatched = false;
          if (cue.reason === 'hand noticed') this.policy.handLatched = false;
        }
      }
      const ctx = this.context;
      if (!ctx || ctx.state !== 'running') return;
      if (this.voice && this.voice.name !== 'afraid') this.voice.gain.gain.setTargetAtTime(speaking ? .14 : .65, ctx.currentTime, .07);
    }
    pause() {
      if (this.pendingAfraid && this.afraidPlayback) Object.assign(this.afraidPlayback, { status: 'Cancelled', detail: 'Page paused before playback.' });
      this.policy.pause(); this.releaseVoice(); this.pendingAfraid = null;
      this.music?.pause();
      if (this.musicGain && this.context?.state !== 'closed') {
        this.musicGain.gain.cancelScheduledValues(this.context.currentTime); this.musicGain.gain.value = 0; this.musicTarget = null;
      }
    }
    resume() {
      if (!this.active) { this.prepareMusic(); return; }
      this.prepareGesture();
      if (this.wakePending) { this.wakePending = false; creature.awaken(); }
    }
    setEffects(enabled) { this.effectsEnabled = enabled; if (!enabled) {
      if (this.pendingAfraid && this.afraidPlayback) Object.assign(this.afraidPlayback, { status: 'Cancelled', detail: 'Sound Effects was switched off.' });
      this.pendingAfraid = null; this.releaseVoice();
    } else this.prepareGesture(); }
    setMusic(enabled) {
      this.musicEnabled = enabled; this.musicEpoch++;
      try { localStorage.setItem('resonance.music', enabled ? 'on' : 'off'); } catch {}
      if (enabled) { this.prepareMusic(); }
      else {
        this.musicBlocked = false;
        this.music?.pause();
        if (this.musicGain) { this.musicGain.gain.cancelScheduledValues(this.context.currentTime); this.musicGain.gain.value = 0; this.musicTarget = null; }
      }
    }
    stop() {
      this.afraidPlayback = null;
      this.active = false; this.generation++; this.wakePending = false; this.pendingAfraid = null; this.abort?.abort(); this.abort = null;
      this.releaseVoice(true);
      for (const v of this.retiring) { try { v.source.stop(); } catch {} v.source.disconnect(); v.gain.disconnect(); }
      this.retiring.clear();
      this.loading = null; this.ready = false; this.errors = [];
      this.guardUntil = 0; this.policy.reset(); this.updateMusic();
    }
    dispose() {
      this.stop(); this.musicEpoch++;
      if (this.music) { this.music.pause(); this.music.removeAttribute('src'); this.music.load(); }
      this.musicNode?.disconnect(); this.musicGain?.disconnect();
      this.music = this.musicNode = this.musicGain = null; this.musicTarget = null;
      const ctx = this.context; this.context = null; ctx?.close().catch(() => {});
    }
    snapshot() { return { active: this.active, context: this.context?.state || 'closed', musicEnabled: this.musicEnabled,
      effectsEnabled: this.effectsEnabled, current: this.voice?.name || null, retiring: this.retiring.size, ready: this.ready,
      musicPlaying: !!this.music && !this.music.paused, musicTracks: this.music ? 1 : 0, musicGain: this.musicGain?.gain.value || 0,
      musicDefault: this.musicLevels.normal, musicTarget: this.musicTarget, musicPosition: this.music?.currentTime || 0,
      effectGain: this.voice?.gain.gain.value || 0, blocked: !!(this.blocked || this.musicBlocked),
      echoGuard: this.guardMicrophone(performance.now()), afraid: this.afraidPlayback ? { ...this.afraidPlayback } : null,
      counts: { ...this.counts }, history: this.history.map(e => ({ ...e })), errors: [...this.errors] }; }
  }

  class Creature {
    constructor(canvas, { count = 3400, shape = 'seed', theme = THEMES[2].p, thumbnail = false } = {}) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.n = count; this.thumbnail = thumbnail;
      this.base = generate(shape, count); this.from = this.base; this.morph = 1;
      this.handSculpture = new HandSculpture(count);
      this.phase = Float32Array.from({ length: count }, () => Math.random() * Math.PI * 2);
      this.size = Float32Array.from({ length: count }, () => .55 + Math.random() ** 3 * 1.3);
      this.brightness = Float32Array.from({ length: count }, () => .4 + Math.random() ** 2 * .6);
      this.theme = rgb(theme); this.color = [...this.theme]; this.s = emptySignals();
      this.relationship = new Familiarity(); this.fam = .04; this.engaged = false; this.t = 0; this.time = 0; this.rotation = 0;
      this.cx = 0; this.cy = 0; this.radius = 0; this.w = 0; this.h = 0; this.morph = 1;
      this.wakeAge = 10;
      this.sm = { smile: 0, sad: 0, surprise: 0, level: 0, open: .5, hand: 0, body: 0, bodySway: 0, bodyLift: 0, bodySpread: 0, expansion: 1, scale: 1, closeness: .04, rest: 0 };
      this.events = { surprise: 20, clap: 20, retreat: 20, depth: 20 }; this.power = { surprise: 1, clap: 1, retreat: 1, depth: 1 };
      this.lastEvent = { surprise: -10, clap: -10, retreat: -10, depth: -10 }; this.eventCounts = { surprise: 0, clap: 0, retreat: 0, depth: 0 };
      this.lastStartleAt = -Infinity; this.startleSequence = 0; this.lastStartleEvent = this.startleAttempt = null;
      this.lastSpike = 0; this.wasSurprised = false; this.retreatX = -.7; this.retreatY = -.3;
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
      this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas); this.resize();
    }
    resize() {
      const r = this.canvas.getBoundingClientRect();
      this.dpr = Math.min(devicePixelRatio || 1, 2); this.w = r.width; this.h = r.height;
      this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
      this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
      this.cx = this.w / 2; this.cy = this.h / 2;
    }
    setShape(shape) {
      this.from = Float32Array.from(this.base, (v, i) => lerp(this.from[i], v, this.ease(this.morph)));
      this.base = generate(shape, this.n); this.morph = 0;
    }
    setTheme(theme) { this.theme = rgb(theme); }
    ease(t) { return t * t * (3 - 2 * t); }
    pulse(age, duration) {
      if (age >= duration) return 0;
      // Fast but continuous attack, long, non-oscillating recovery.
      return age < .3 ? Math.sin(age / .3 * Math.PI / 2) : ((duration - age) / (duration - .3)) ** 2;
    }
    trigger(kind, power = 1, source = kind === 'clap' ? 'loud sound' : kind === 'retreat' ? 'quick movement' : 'approach') {
      const now = performance.now();
      if (kind !== 'surprise') {
        const remaining = Math.max(0, 3200 - (now - this.lastStartleAt));
        this.startleAttempt = { source, at: now, accepted: remaining === 0, reason: remaining ? `Shared cooldown: ${(remaining / 1000).toFixed(1)} s remaining` : 'Accepted' };
        if (remaining) return false;
        this.lastStartleAt = now;
      } else if (this.time - this.lastEvent[kind] < 1.5) return false;
      this.lastEvent[kind] = this.time; this.events[kind] = 0; this.power[kind] = clamp(power);
      this.eventCounts[kind]++;
      if (kind !== 'surprise') {
        if (kind === 'depth') this.depthSource = source;
        this.lastStartleEvent = { id: ++this.startleSequence, kind, source, at: now, reason: kind === 'depth' ? 'sudden approach' : source };
        sounds.startle(this.lastStartleEvent);
      }
      if (kind === 'retreat') {
        const x = .5 - this.s.handX, y = .5 - this.s.handY, len = Math.hypot(x, y) || 1;
        this.retreatX = Math.abs(x) + Math.abs(y) < .03 ? -.8 : x / len;
        this.retreatY = Math.abs(x) + Math.abs(y) < .03 ? -.3 : y / len;
      }
      return true;
    }
    awaken() { this.wakeAge = 0; }
    reset(familiarity = false) {
      this.wakeAge = 10;
      this.lastStartleAt = -Infinity; this.lastStartleEvent = this.startleAttempt = null; this.depthSource = null;
      this.s = emptySignals(); this.lastSpike = 0; this.wasSurprised = false;
      this.handSculpture.clear();
      this.relationship.pause();
      if (familiarity) { this.relationship.reset(); this.fam = .04; }
      for (const key of Object.keys(this.events)) { this.events[key] = 20; this.lastEvent[key] = -10; }
    }
    update(dt, now = performance.now()) {
      const s = this.s, sm = this.sm;
      this.handSculpture.update(s.handPresent ? s.handPose : null, dt);
      this.wakeAge = Math.min(10, this.wakeAge + dt);
      this.time += dt;
      for (const key of Object.keys(this.events)) this.events[key] += dt;
      for (const key of ['smile', 'sad', 'surprise', 'level']) sm[key] = approach(sm[key], s[key], key === 'level' ? 7 : 4, dt);
      sm.open = approach(sm.open, s.handPresent ? s.handOpen : .5, 4, dt);
      sm.hand = approach(sm.hand, s.handPresent ? 1 : 0, s.handPresent ? 3 : 1.7, dt);
      sm.body = approach(sm.body, s.bodyMotion, s.bodyMotion > sm.body ? 3 : 1.3, dt);
      for (const key of ['bodySway', 'bodyLift', 'bodySpread']) sm[key] = approach(sm[key], s[key], 2.8, dt);
      if (s.surprise > .15 && !this.wasSurprised) this.trigger('surprise', s.surprise);
      this.wasSurprised = s.surprise > .15;
      if (s.spike !== this.lastSpike) { this.lastSpike = s.spike; this.trigger('clap'); }
      if (model.stage === 'demo' && s.handPresent && s.handSpeed > 1.5) this.trigger('retreat');
      this.relationship.update(now, s, this.engaged, !document.hidden);
      this.fam = this.relationship.value;
      sm.closeness = approach(sm.closeness, this.fam, 1.2, dt);
      // A visible hand wakes movement even if the face is outside the camera frame.
      // Relationship growth still requires face presence; these remain separate signals.
      sm.rest = approach(sm.rest, this.engaged && !s.handPresent && !s.bodyPresent ? this.relationship.rest : 0, 1.2, dt);
      const closeness = sm.closeness, awake = 1 - sm.rest;
      const motionFactor = this.reduced.matches ? .35 : 1;
      const speed = (1 - .67 * sm.sad + .55 * sm.smile) * (1 - sm.rest * .7) * (1 + closeness * .12) * (1 + sm.body * .4);
      this.t += dt * speed * motionFactor;
      this.rotation += dt * (.14 + sm.body * 1.2 + sm.level * .16) * speed * motionFactor;
      this.morph = Math.min(1, this.morph + dt * .65);
      const surprise = this.pulse(this.events.surprise, 3.5) * this.power.surprise;
      const clap = this.pulse(this.events.clap, 4.2) * this.power.clap;
      const retreat = this.pulse(this.events.retreat, 2.7) * this.power.retreat;
      const depth = this.pulse(this.events.depth, 4) * this.power.depth;
      const expressionTotal = sm.smile + sm.sad + sm.surprise;
      const warm = [255, 213, 112], blue = [120, 177, 255], purple = [200, 147, 255];
      for (let c = 0; c < 3; c++) {
        const tint = expressionTotal > .001 ? (warm[c] * sm.smile + blue[c] * sm.sad + purple[c] * sm.surprise) / expressionTotal : this.theme[c];
        this.color[c] = approach(this.color[c], lerp(this.theme[c], tint, clamp(expressionTotal * 1.5)), 2.7, dt);
      }
      const rawOpen = (sm.open - .5) * .7 * sm.hand;
      const open = s.handPose ? Math.max(rawOpen, rawOpen * .32) : rawOpen;
      // A closed hand keeps its gathering effect even when both arms are open.
      const bodyExpansion = sm.bodySpread * .28 * (1 - sm.hand * (1 - sm.open) * .8);
      const waking = this.engaged ? 1 - Math.exp(-this.wakeAge * 5) : 1;
      const naturalExpansion = 1 + sm.smile * .23 - sm.sad * .27 + open + bodyExpansion + sm.level * .1 + surprise * .52 * motionFactor - retreat * .2;
      // Depth retreat owns shape/position briefly, even with a fully open hand.
      const expansion = clamp(lerp(naturalExpansion, .72, depth), .6, 1.75) * (.82 + .18 * waking);
      sm.expansion = approach(sm.expansion, expansion, 5, dt);
      sm.scale = approach(sm.scale, lerp(1 + closeness * .3 + sm.smile * .17 - sm.rest * .16, .68, depth), depth > .1 ? 8 : 2.2, dt);
      const W = this.w, H = this.h;
      const radiusFactor = this.thumbnail ? .3 : this.engaged && W < 500 ? .31 : .245;
      const R = Math.min(W, H) * radiusFactor;
      this.radius = R;
      let tx = W / 2, ty = H / 2;
      if (this.engaged) {
        if (s.facePresent && now <= s.presenceUntil) {
          const willingness = (.08 + closeness * .32) * awake;
          tx += (s.faceX - .5) * W * willingness;
          ty += (s.faceY - .5) * H * willingness * .65;
        }
        if (sm.hand > .001) {
          const follow = (.28 + closeness * .48) * awake * sm.hand;
          tx += (s.handX - .5) * W * follow;
          ty += (s.handY - .5) * H * follow;
        }
        tx += Math.sin(this.t * 2.4) * R * .12 * sm.smile * motionFactor;
        ty += (sm.sad * .37 - sm.smile * .22) * R;
        ty -= Math.abs(Math.sin(this.t * 3.1)) * R * .1 * sm.smile * motionFactor;
        // Body motion is a bounded offset around the hand's target, never a second target.
        tx += sm.bodySway * R * .55 * (1 - sm.hand * .65) * motionFactor;
        ty += (Math.sin(this.t * 2.2) * .09 * sm.body - sm.bodyLift * .43) * R * motionFactor;
        tx += this.retreatX * R * .66 * retreat * motionFactor;
        ty += this.retreatY * R * .5 * retreat * motionFactor;
        ty += R * (sm.rest * .15 - closeness * .14 * awake);
        tx += Math.sin(this.t * .85) * R * .045 * closeness * awake * motionFactor;
      }
      ty += Math.sin(this.t * .7) * R * .045;
      tx = lerp(tx, W / 2, depth); ty = lerp(ty, H / 2, depth);
      tx = clamp(tx, W * .27, W * .73); ty = clamp(ty, H * .27, H * .73);
      const followRate = (1.5 + closeness * 3) * (1 - sm.rest * .6) + retreat * 4 + depth * 5;
      this.cx = approach(this.cx, tx, followRate, dt); this.cy = approach(this.cy, ty, followRate, dt);
      this.visual = { surprise, clap, retreat, depth, motionFactor, speed, R, scale: sm.scale * sm.expansion, followRate };
    }
    draw() {
      const { ctx, w: W, h: H, sm, time, t } = this;
      if (!W || !H) return;
      const { R, clap, motionFactor, retreat, depth } = this.visual;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      const [r, g, b] = this.color.map(Math.round), color = `rgb(${r},${g},${b})`;
      const halo = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, R * 1.65 * (1 - depth * .28));
      halo.addColorStop(0, `rgba(${r},${g},${b},.12)`); halo.addColorStop(.4, `rgba(${r},${g},${b},.025)`); halo.addColorStop(1, 'transparent');
      ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
      const coreR = R * .2 * (1 - depth * .28), core = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, coreR);
      core.addColorStop(0, `rgba(${r},${g},${b},.25)`); core.addColorStop(1, 'transparent');
      ctx.fillStyle = core; ctx.fillRect(this.cx - coreR, this.cy - coreR, coreR * 2, coreR * 2);
      const tilt = .29 + Math.sin(t * .3) * .1 + sm.body * Math.sin(t * 1.6) * .35 * motionFactor;
      const sway = (sm.bodySway * .5 + Math.sin(t * 1.75) * sm.body * .12) * motionFactor;
      const cr = Math.cos(this.rotation), sr = Math.sin(this.rotation), cx = Math.cos(tilt), sx = Math.sin(tilt), cz = Math.cos(sway), sz = Math.sin(sway);
      const mk = this.ease(this.morph); ctx.fillStyle = color;
      let minX = W, maxX = 0, minY = H, maxY = 0;
      let fingerRippleMaxPx = 0;
      for (let i = 0; i < this.n; i++) {
        const j = i * 3, ph = this.phase[i];
        let x = lerp(this.from[j], this.base[j], mk), y = lerp(this.from[j + 1], this.base[j + 1], mk), z = lerp(this.from[j + 2], this.base[j + 2], mk);
        const d = Math.hypot(x, y, z);
        const ripple = sm.level * .23 * Math.sin(d * 12 - t * 7 + ph * .12) * motionFactor;
        const breathing = 1 + .055 * Math.sin(t * 1.5 - d * 2.2);
        const scatter = clap * (.25 + .43 * (1 + Math.sin(ph * 3)) / 2) * motionFactor * (1 - depth * .9);
        const m = sm.scale * sm.expansion * breathing * (1 + ripple) + scatter;
        const vib = sm.level * .035 * motionFactor;
        x = x * m + Math.sin(t * 17 + ph) * vib + Math.sin(t * .6 + ph) * .025;
        y = y * m + Math.cos(t * 19 + ph) * vib + Math.cos(t * .5 + ph * 1.3) * .025;
        z *= m;
        const rx = x * cr + z * sr, rz = -x * sr + z * cr;
        const ry = y * cx - rz * sx, depthZ = y * sx + rz * cx;
        let xx = rx * cz - ry * sz, yy = rx * sz + ry * cz, zz = depthZ;
        const hand = this.handSculpture, handMix = hand.blend * (1 - depth) * (i % 100 < 32 ? 1 : 0);
        if (handMix > .001) {
          // Screen-facing targets preserve the mirrored pointing direction.
          // The unassigned cloud keeps the creature's autonomous 3D flow.
          xx = lerp(xx, hand.coords[j] * m, handMix);
          yy = lerp(yy, hand.coords[j + 1] * m, handMix);
          zz = lerp(zz, hand.coords[j + 2] * m, handMix);
        }
        let waveX = 0, waveY = 0;
        for (let f = 0; f < 5; f++) {
          if (hand.energy[f] < .008) continue;
          const fx = xx - hand.tips[f].x * m, fy = yy - hand.tips[f].y * m;
          const distance = Math.hypot(fx, fy), wave = .105 * hand.energy[f] * Math.sin(time * 5 - distance * 8) / (1 + distance * distance * 3);
          waveX += fx / Math.max(.12, distance) * wave; waveY += fy / Math.max(.12, distance) * wave;
        }
        const limit = Math.max(1, Math.hypot(waveX, waveY) / .14);
        fingerRippleMaxPx = Math.max(fingerRippleMaxPx, Math.hypot(waveX, waveY) / limit * R * motionFactor * (1 - depth));
        xx += waveX / limit * motionFactor * (1 - depth); yy += waveY / limit * motionFactor * (1 - depth);
        const perspective = 3.8 / (3.8 + zz);
        let dx = xx * R * perspective, dy = yy * R * perspective;
        // Soft ellipse compression keeps every combination visible without hard edge clipping.
        const safeX = Math.max(8, Math.min(this.cx, W - this.cx) - 9);
        const safeY = Math.max(8, Math.min(this.cy, H - this.cy) - 9);
        const q = Math.hypot(dx / safeX, dy / safeY);
        if (q > .78) { const bounded = .78 + .21 * Math.tanh((q - .78) / .21); dx *= bounded / q; dy *= bounded / q; }
        const px = this.cx + dx, py = this.cy + dy;
        minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        const depthLight = clamp(.75 - depthZ * .22, .32, 1);
        const alpha = clamp(this.brightness[i] * depthLight * (.88 + sm.closeness * .12) * (1 - sm.rest * .22) * (1 + Math.max(0, .5 - d) * .8));
        const size = this.size[i] * clamp(perspective, .7, 1.4) * (this.thumbnail ? .75 : 1) * (1 - depth * .12);
        ctx.globalAlpha = alpha; ctx.fillRect(px - size / 2, py - size / 2, size, size);
        if (i % 13 === 0) {
          ctx.globalAlpha = alpha * .075; ctx.beginPath(); ctx.arc(px, py, size * 2.6, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      this.metrics = { color: this.color.map(Math.round), center: [this.cx, this.cy], radius: R,
        expansion: sm.expansion, scale: sm.scale, level: sm.level, speed: this.visual.speed, wakeAge: this.wakeAge,
        rotation: this.rotation, sway, clap, retreat, depth, depthSource: this.depthSource, surprise: this.visual.surprise,
        body: { sway: sm.bodySway, lift: sm.bodyLift, spread: sm.bodySpread, motion: sm.body },
        handShape: { gesture: this.s.handPose?.gesture || null, candidate: this.s.handPose?.candidate || null,
          heldMs: this.s.handPose?.heldMs || 0, blend: this.handSculpture.blend, energy: [...this.handSculpture.energy],
          rippleMaxPx: fingerRippleMaxPx,
          contourParticles: Math.round(this.n * .32), driftingParticles: Math.round(this.n * .68) },
        familiarity: this.fam, rest: sm.rest, absenceSeconds: this.relationship.absence, followRate: this.visual.followRate,
        bounds: [minX, minY, maxX, maxY], viewport: [W, H], events: { ...this.eventCounts } };
    }
  }

  const model = { stage: 'welcome', shape: 'seed', theme: 2, expression: null, intensity: .85,
    sound: 0, sustain: false, muted: false, hand: false, openness: .5, body: 0, bodyLean: 0, arms: 0, present: true, faceX: .5 };
  const creature = new Creature($('#creature'), { count: matchMedia('(max-width: 767px)').matches ? 2300 : 3600 });
  const live = new LiveInput();
  const sounds = new ExperienceAudio();
  const previews = [];
  let toastTimer, lastUI = 0, lastSoundInput = { value: 0, time: 0 }, pointer = null;
  function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true, 2400); }
  function renderPickers() {
    $$('[data-shape-picker]').forEach(container => SHAPES.forEach(shape => {
      const button = document.createElement('button'); button.className = 'shape-card'; button.dataset.shape = shape.id;
      button.setAttribute('aria-pressed', String(shape.id === model.shape));
      button.innerHTML = `<canvas aria-hidden="true"></canvas><b>${shape.name}</b><small>${shape.note}</small>`;
      container.append(button);
      const preview = new Creature(button.querySelector('canvas'), { count: 440, shape: shape.id, thumbnail: true });
      previews.push(preview);
      button.addEventListener('click', () => {
        model.shape = shape.id; creature.setShape(shape.id);
        $$('[data-shape]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.shape === shape.id)));
      });
    }));
    $$('[data-theme-picker]').forEach(container => THEMES.forEach((theme, index) => {
      const button = document.createElement('button'); button.className = 'theme-swatch'; button.dataset.theme = index;
      button.setAttribute('aria-label', theme.name); button.title = theme.name;
      button.setAttribute('aria-pressed', String(index === model.theme)); button.style.setProperty('--swatch', theme.ui);
      button.innerHTML = '<span></span>'; container.append(button);
      button.addEventListener('click', () => {
        model.theme = index; document.documentElement.style.setProperty('--accent', theme.ui);
        document.documentElement.style.setProperty('--particle', theme.p);
        const deep = index === 2 ? '#304B3D' : `rgb(${rgb(theme.ui).map(v => Math.round(v * .4)).join(',')})`;
        document.documentElement.style.setProperty('--deep', deep); creature.setTheme(theme.p);
        previews.forEach(p => p.setTheme(theme.p));
        $$('[data-theme]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.theme === index)));
      });
    }));
  }
  function syncControls() {
    $$('[data-expression]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.expression === model.expression)));
    for (const [id, key] of [['expression', 'intensity'], ['sound', 'sound'], ['openness', 'openness'], ['body', 'body']]) {
      $(`#${id}`).value = model[key]; $(`#${id}-value`).textContent = `${Math.round(model[key] * 100)}%`;
    }
    for (const [id, key] of [['sustain', 'sustain'], ['hand', 'hand'], ['mute', 'muted']]) $(`#${id}`).setAttribute('aria-pressed', String(model[key]));
    $('#hand').textContent = `Follow hand · ${model.hand ? 'On' : 'Off'}`;
    $('#demo-presence').textContent = model.present ? 'Face in view · On' : 'Face in view · Off';
    $('#demo-presence').setAttribute('aria-pressed', String(model.present));
    $('#face-position').value = model.faceX;
    $('#body-lean').value = model.bodyLean; $('#body-arms').value = model.arms;
    const muted = model.stage === 'live' ? live.muted : model.muted;
    $('#mute').setAttribute('aria-pressed', String(muted));
    $('#mute-label').textContent = model.stage === 'live' ? (muted ? 'Mic off' : 'Microphone') : (muted ? 'Input off' : 'Demo input');
    $('#mute').setAttribute('aria-label', model.stage === 'live' ? (muted ? 'Turn microphone on' : 'Turn microphone off') : (muted ? 'Turn Demo sound input on' : 'Turn Demo sound input off'));
    document.body.classList.toggle('hand-active', model.hand && model.stage === 'demo');
    $('#creature').tabIndex = model.hand && model.stage === 'demo' ? 0 : -1;
    if (!model.hand) $('#hand-marker').hidden = true;
  }
  function resetInputs(familiarity = false) {
    Object.assign(model, { expression: null, intensity: .85, sound: 0, sustain: false, muted: false, hand: false, openness: .5, body: 0, bodyLean: 0, arms: 0, present: true, faceX: .5 });
    creature.reset(familiarity); pointer = null; lastSoundInput = { value: 0, time: performance.now() }; syncControls();
    if (familiarity && sounds.active) { sounds.policy.reset(); sounds.policy.events = { clap: creature.eventCounts.clap, retreat: creature.eventCounts.retreat, depth: creature.eventCounts.depth }; }
  }
  function setStage(stage) {
    const previous = model.stage;
    if (stage !== 'live') hideHelpNudge();
    if (stage !== 'live' && stage !== 'loading') live.stop();
    if (!['live', 'demo', 'loading'].includes(stage)) sounds.stop();
    $$('dialog[open]').forEach(d => d.close());
    model.stage = stage; creature.engaged = stage === 'demo' || stage === 'live';
    if (creature.engaged && stage !== previous) sounds.begin();
    document.body.dataset.stage = stage;
    document.body.classList.toggle('in-session', creature.engaged);
    $('#welcome').hidden = stage !== 'welcome'; $('#prep').hidden = stage !== 'prep';
    $('#session').hidden = !creature.engaged; $('#home').hidden = stage === 'welcome';
    $('#connection').hidden = stage !== 'loading' && stage !== 'error';
    $('#demo-controls').hidden = stage !== 'demo'; $('#live-controls').hidden = stage !== 'live';
    $('#mode-badge').textContent = stage === 'live' ? 'LIVE · CAMERA + MICROPHONE' : 'DEMO · SIMULATED INPUTS';
    $('.skip-link').href = stage === 'live' ? '#live-controls' : '#demo-controls';
    $('.skip-link').textContent = stage === 'live' ? 'Skip to live controls' : 'Skip to Demo controls';
    if (stage === 'welcome') resetInputs(true);
    clearTimeout(toastTimer); $('#toast').hidden = true; syncControls();
    window.scrollTo(0, 0); creature.resize();
    requestAnimationFrame(() => {
      if (model.stage !== stage) return;
      if (stage === 'prep') $('#prep-title').focus();
      else if (stage === 'demo') $('#demo-controls').focus({ preventScroll: true });
      else if (stage === 'live') { $('#live-controls').focus({ preventScroll: true }); showHelpNudge(); }
      else if (stage === 'loading' || stage === 'error') $('#connection-title').focus({ preventScroll: true });
      else $('#meet').focus({ preventScroll: true });
    });
  }
  $('#meet').addEventListener('click', () => setStage('prep'));
  $('#start').addEventListener('click', () => live.start());
  $('#retry').addEventListener('click', () => live.start());
  $('#demo-presence').addEventListener('click', () => {
    if (model.stage !== 'demo') return;
    model.present = !model.present; syncControls();
  });
  $('#face-position').addEventListener('input', e => { model.faceX = +e.target.value; });
  for (const id of ['try-demo', 'fallback-demo']) $(`#${id}`).addEventListener('click', () => { sounds.prepareGesture(); resetInputs(); setStage('demo'); });
  $('#cancel-start').addEventListener('click', () => setStage('prep'));
  $('#exit').addEventListener('click', () => setStage('welcome'));
  $('#sensitivity').addEventListener('input', e => { live.sensitivity = +e.target.value; $('#sensitivity-value').textContent = `${live.sensitivity.toFixed(1)}×`; });
  $('#calibrate').addEventListener('click', () => { sounds.guardForCalibration(); live.gate.reset(); toast('Stay quiet for a moment while the microphone settles.'); });
  $$('[data-music]').forEach(button => button.addEventListener('click', () => { sounds.setMusic(!sounds.musicEnabled); syncPlaybackControls(); }));
  $$('[data-retry-music]').forEach(button => button.addEventListener('click', () => sounds.prepareMusic()));
  // Autoplay can be blocked. A real click/touch/key retries without overriding Off.
  const unlockMusic = event => {
    if (event.target.closest?.('[data-music]') || !sounds.musicEnabled || sounds.musicError) return;
    if (!sounds.context || sounds.context.state !== 'running' || !sounds.music || sounds.music.paused || sounds.musicBlocked) sounds.prepareMusic();
  };
  for (const event of ['pointerup', 'touchend', 'click', 'keydown']) document.addEventListener(event, unlockMusic, { passive: true });
  $$('[data-effects]').forEach(button => button.addEventListener('click', () => { sounds.setEffects(!sounds.effectsEnabled); syncPlaybackControls(); }));
  $$('[data-resume-playback]').forEach(button => button.addEventListener('click', () => sounds.resume()));
  $('#resume-audio').addEventListener('click', () => { live.audio?.resume().catch(() => toast('Could not resume the microphone. End the interaction and try again.')); });
  $('#toggle-preview').addEventListener('click', () => {
    live.previewHidden = !live.previewHidden;
    $('#camera').classList.toggle('preview-hidden', live.previewHidden);
    $('#preview-placeholder').hidden = !live.previewHidden;
    $('#toggle-preview').textContent = live.previewHidden ? 'Show preview' : 'Hide preview';
    $('#toggle-preview').setAttribute('aria-pressed', String(live.previewHidden));
  });
  $('#home').addEventListener('click', () => setStage('welcome'));
  $$('.dialog-home').forEach(b => b.addEventListener('click', () => setStage('welcome')));
  $('#reset').addEventListener('click', () => { if (model.stage === 'demo') resetInputs(); toast('Inputs reset. Familiarity stays.'); });
  $('#restart').addEventListener('click', () => { resetInputs(true); $('#help-dialog').close(); toast('A fresh start. Take your time.'); });
  $$('[data-expression]').forEach(b => b.addEventListener('click', () => {
    model.expression = model.expression === b.dataset.expression ? null : b.dataset.expression; syncControls();
  }));
  $('#expression').addEventListener('input', e => { model.intensity = +e.target.value; syncControls(); });
  $('#sound').addEventListener('input', e => {
    const value = +e.target.value, now = performance.now();
    if (model.stage === 'demo' && !model.muted && value > .72 && value - lastSoundInput.value > .24 && now - lastSoundInput.time < 450) creature.trigger('clap');
    model.sound = value;
    // Keep a short onset window: several small slider events can form one quick loud rise.
    if (now - lastSoundInput.time > 450) lastSoundInput = { value, time: now };
    syncControls();
  });
  $('#sound').addEventListener('pointerdown', () => { lastSoundInput = { value: model.sound, time: performance.now() }; });
  $('#sound').addEventListener('keydown', () => { lastSoundInput.time = performance.now(); });
  $('#sustain').addEventListener('click', () => { model.sustain = !model.sustain; if (model.sustain && model.sound === 0) model.sound = .45; syncControls(); });
  $('#clap').addEventListener('click', () => {
    if (model.stage !== 'demo') return;
    if (model.muted) { toast('Demo sound is off. Turn it on first.'); return; }
    if (creature.trigger('clap')) toast('Demo · A loud sound. It will gather again.');
  });
  $('#mute').addEventListener('click', () => { if (model.stage === 'live') live.setMuted(!live.muted); else model.muted = !model.muted; syncControls(); });
  $('#retry-hand').addEventListener('click', () => { if (model.stage === 'live') live.hands.start(); });
  $('#retry-body').addEventListener('click', () => { if (model.stage === 'live') live.body.start(); });
  $('#hand').addEventListener('click', () => { if (model.stage !== 'demo') return; model.hand = !model.hand; pointer = null; creature.s.handSpeed = 0; syncControls(); });
  $('#openness').addEventListener('input', e => { model.openness = +e.target.value; model.hand = true; syncControls(); });
  $('#retreat').addEventListener('click', () => { if (model.stage !== 'demo') return; model.hand = true; creature.trigger('retreat'); syncControls(); });
  $('#approach').addEventListener('click', () => { if (model.stage === 'demo') creature.trigger('depth', 1, 'Demo'); });
  $('#test-afraid').addEventListener('click', () => {
    if (model.stage !== 'live') return;
    sounds.prepareGesture();
    const accepted = creature.trigger('depth', 1, 'Test Afraid');
    $('#approach-test-status').textContent = accepted ? 'Test event accepted. Watch the retreat and check audio status below.' : creature.startleAttempt.reason + '. Wait, then try again.';
    updateApproachDebug();
  });
  $('#copy-approach').addEventListener('click', async () => {
    updateApproachDebug();
    const report = $('#approach-report'); report.hidden = false; report.select();
    try { await navigator.clipboard.writeText(report.value); $('#approach-test-status').textContent = 'Diagnostics copied. No camera images or microphone recordings are included.'; }
    catch { $('#approach-test-status').textContent = 'Select and copy the diagnostic report below.'; }
  });
  $('#body').addEventListener('input', e => { model.body = +e.target.value; syncControls(); });
  $('#body-lean').addEventListener('input', e => { model.bodyLean = +e.target.value; });
  $('#body-arms').addEventListener('input', e => { model.arms = +e.target.value; });
  function moveHand(e) {
    if (!model.hand || model.stage !== 'demo') return;
    const r = $('#creature').getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width), y = clamp((e.clientY - r.top) / r.height), now = performance.now();
    // A fresh entry establishes position; it must not look like a fast movement from (0,0).
    const speed = pointer && now - pointer.time < 250 ? Math.hypot(x - pointer.x, y - pointer.y) / Math.max(.016, (now - pointer.time) / 1000) : 0;
    creature.s.handSpeed = lerp(creature.s.handSpeed, speed, .65);
    creature.s.handX = x; creature.s.handY = y; pointer = { x, y, time: now };
    const marker = $('#hand-marker'); marker.hidden = false; marker.style.left = `${x * 100}%`; marker.style.top = `${y * 100}%`;
  }
  $('#creature').addEventListener('pointerdown', e => {
    if (model.stage === 'demo' && model.hand) { pointer = null; e.currentTarget.setPointerCapture(e.pointerId); moveHand(e); }
  });
  $('#creature').addEventListener('pointermove', moveHand);
  for (const event of ['pointerleave', 'pointercancel', 'pointerup']) $('#creature').addEventListener(event, () => { pointer = null; $('#hand-marker').hidden = true; });
  $('#creature').addEventListener('keydown', e => {
    if (model.stage !== 'demo' || !model.hand || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    creature.s.handX = clamp(creature.s.handX + (e.key === 'ArrowRight' ? .05 : e.key === 'ArrowLeft' ? -.05 : 0));
    creature.s.handY = clamp(creature.s.handY + (e.key === 'ArrowDown' ? .05 : e.key === 'ArrowUp' ? -.05 : 0));
  });
  const helpDialog = $('#help-dialog'), helpButton = $('#help-button'), helpNudge = $('#help-nudge');
  let helpHintSeen = false, helpHintTimer;
  try { helpHintSeen = sessionStorage.getItem('resonance.helpHintSeen') === 'yes'; } catch {}
  function hideHelpNudge() {
    clearTimeout(helpHintTimer); helpNudge.hidden = true;
    helpButton.removeAttribute('aria-describedby');
  }
  function showHelpNudge() {
    if (helpHintSeen || model.stage !== 'live' || helpDialog.open) return;
    helpHintSeen = true;
    try { sessionStorage.setItem('resonance.helpHintSeen', 'yes'); } catch {}
    helpNudge.hidden = false; helpButton.setAttribute('aria-describedby', 'help-nudge');
    placeHelpUI(); helpHintTimer = setTimeout(hideHelpNudge, 6000);
  }
  function placeHelpUI() {
    const anchor = helpButton.getBoundingClientRect();
    if (helpDialog.open) {
      if (matchMedia('(max-width:767px), (max-width:1000px) and (pointer:coarse)').matches) {
        helpDialog.style.removeProperty('left'); helpDialog.style.removeProperty('top');
      } else {
        const r = helpDialog.getBoundingClientRect();
        helpDialog.style.left = `${clamp(anchor.right - r.width, 16, Math.max(16, innerWidth - r.width - 16))}px`;
        helpDialog.style.top = `${clamp(anchor.top - r.height - 12, 16, Math.max(16, innerHeight - r.height - 16))}px`;
      }
    }
    if (!helpNudge.hidden) {
      const r = helpNudge.getBoundingClientRect(), x = clamp(anchor.right - r.width, 16, Math.max(16, innerWidth - r.width - 16));
      helpNudge.style.left = `${x}px`; helpNudge.style.top = `${Math.max(12, anchor.top - r.height - 14)}px`;
      helpNudge.style.setProperty('--hint-arrow', `${clamp(anchor.left + anchor.width / 2 - x - 4, 12, r.width - 20)}px`);
    }
  }
  function openHelp() {
    if (!creature.engaged || helpDialog.open) return;
    hideHelpNudge();
    const demo = model.stage === 'demo';
    $('#help-mode').textContent = demo ? 'DEMO · SIMULATED INPUTS' : 'LIVE INTERACTION';
    const tips = demo ? {
      expressions: 'Use the Demo expression controls to change its colour and mood.',
      hands: 'Use Follow hand and the Open / close slider to guide and shape it.',
      voice: 'Use the Demo sound controls to create movement and waves.',
      presence: 'Keep Demo presence on to explore how familiarity grows.'
    } : {
      expressions: 'Smile or change your expression to influence its colour and mood.',
      hands: 'Move your hand and wiggle your fingers. Watch it follow, ripple and gently echo your gestures.',
      voice: 'Speak or sing to create movement and waves.',
      presence: 'Your presence helps it become more familiar with you.'
    };
    for (const [key, text] of Object.entries(tips)) $(`[data-help="${key}"]`).textContent = text;
    // Opening help never changes the stage, capture tasks, particle loop or audio.
    helpButton.focus({ preventScroll: true });
    helpDialog.showModal(); helpDialog.querySelector('.help-scroll').scrollTop = 0;
    helpButton.setAttribute('aria-expanded', 'true'); placeHelpUI();
    helpDialog.querySelector('.close').focus({ preventScroll: true });
  }
  helpDialog.addEventListener('close', () => {
    helpButton.setAttribute('aria-expanded', 'false');
    if (creature.engaged && helpButton.getClientRects().length) helpButton.focus({ preventScroll: true });
  });
  helpDialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const nodes = [...helpDialog.querySelectorAll('button:not(:disabled),[tabindex="0"]')].filter(node => node.getClientRects().length);
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  window.addEventListener('resize', placeHelpUI, { passive: true });
  window.visualViewport?.addEventListener('resize', placeHelpUI, { passive: true });
  $$('[data-dialog]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.dialog === 'help-dialog') openHelp();
    else $(`#${button.dataset.dialog}`).showModal();
  }));
  $$('dialog').forEach(dialog => {
    dialog.querySelector('.close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
  });
  $('#capture').addEventListener('click', () => {
    creature.canvas.toBlob(blob => {
      if (!blob) return;
      const link = document.createElement('a'), url = URL.createObjectURL(blob);
      link.href = url; link.download = `resonance-${Date.now()}.png`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500); toast('This moment is saved as a PNG.');
    }, 'image/png');
  });
  function feedDemo(dt) {
    if (model.stage !== 'demo') return;
    const s = creature.s;
    const now = performance.now();
    if (model.present && !s.facePresent) s.presenceSince = now;
    s.facePresent = model.present; s.presenceUntil = now + 1000; s.faceX = model.faceX; s.faceY = .5;
    for (const key of ['smile', 'sad', 'surprise']) s[key] = model.present && model.expression === key ? model.intensity : 0;
    s.level = model.muted ? 0 : model.sound * (model.sustain ? .7 + .3 * Math.sin(creature.time * 3) ** 2 : 1);
    s.handPresent = model.hand; s.handOpen = model.openness;
    s.handSpeed *= Math.exp(-dt * 9); s.bodyMotion = model.body;
    s.bodyPresent = model.body > 0 || model.arms > 0 || Math.abs(model.bodyLean) > .01;
    s.bodySway = clamp(model.bodyLean + Math.sin(creature.t * 1.75) * model.body, -1, 1);
    s.bodyLift = model.arms; s.bodySpread = model.arms;
  }
  const expressionRows = new Map(live.expression.names.map(name => {
    const row = document.createElement('tr'), label = document.createElement('th'), value = document.createElement('td');
    label.scope = 'row'; label.textContent = name; value.textContent = '—';
    row.append(label, value); $('#expression-raw').append(row); return [name, value];
  }));
  function expressionAnimation() {
    return { target: Object.fromEntries(['smile', 'sad', 'surprise'].map(k => [k, creature.s[k]])),
      rendered: Object.fromEntries(['smile', 'sad', 'surprise'].map(k => [k, creature.sm[k]])),
      color: creature.color.map(Math.round), speed: creature.visual.speed, expansion: creature.sm.expansion,
      center: [creature.cx, creature.cy], radius: creature.visual.R,
      otherInputs: { sound: creature.s.level, hand: creature.s.handPresent, body: creature.s.bodyPresent } };
  }
  function sampleExpressions() {
    const c = expressionSamples.pending, f = live.expression;
    $('#sample-expression').disabled = !live.active || !f.present || !!f.calibration || !!c;
    if (!c) return;
    const status = $('#expression-sample-status');
    if (!f.present || f.calibration || document.hidden) {
      expressionSamples.pending = null; status.textContent = 'Sample interrupted. Keep your face visible, finish calibration and try again.'; return;
    }
    if (f.time >= c.start && f.time !== c.last) {
      c.frames.push({ time: f.time, debug: f.diagnostics(), animation: expressionAnimation() }); c.last = f.time;
    }
    const remaining = 3000 - (performance.now() - c.start);
    status.textContent = `Sampling ${c.label}… ${Math.max(0, Math.ceil(remaining / 1000))} seconds left.`;
    if (remaining > 0) return;
    expressionSamples.pending = null;
    $('#sample-expression').disabled = false;
    if (c.frames.length < 6 || c.frames.at(-1).time - c.frames[0].time < 2000) {
      status.textContent = 'Not enough fresh frames. Wait for tracking to settle, then try again.'; return;
    }
    const round = v => Math.round(v * 10000) / 10000;
    const raw = Object.fromEntries(f.names.map(k => {
      const values = c.frames.map(s => s.debug.raw[k]).filter(Number.isFinite);
      return [k, values.length ? { mean: round(values.reduce((a, b) => a + b, 0) / values.length), min: round(Math.min(...values)), max: round(Math.max(...values)), count: values.length } : null];
    }));
    const last = c.frames.at(-1);
    const record = { intended: c.label, frames: c.frames.length, durationMs: Math.round(last.time - c.frames[0].time), raw,
      finalCounts: c.frames.reduce((counts, s) => { const key = s.debug.active || 'neutral'; counts[key] = (counts[key] || 0) + 1; return counts; }, {}),
      timeline: c.frames.map(s => ({ timeMs: Math.round(s.time - c.frames[0].time), raw: s.debug.raw, active: s.debug.active, candidate: s.debug.candidate,
        sadEvidence: s.debug.scores.sad, sadResponse: s.debug.output.sad, route: s.debug.continuousSad.route, heldSeconds: s.debug.continuousSad.heldSeconds })),
      lastDecision: last.debug, animation: last.animation };
    expressionSamples.records = expressionSamples.records.filter(s => s.intended !== c.label).concat(record);
    const neutral = expressionSamples.records.find(s => s.intended === 'neutral');
    const samples = expressionSamples.records.map(s => ({ ...s, changeFromNeutral: neutral ? Object.fromEntries(f.names.map(k => [k,
      s.raw[k] && neutral.raw[k] ? round(s.raw[k].mean - neutral.raw[k].mean) : null])) : null }));
    $('#expression-sample-data').value = JSON.stringify({ note: 'Live score samples, not a recognition accuracy claim. Intended expressions are user labels. Changes from a sampled Neutral label are diagnostic only. The classifier uses the separate Calibrate neutral baseline and noise limits included in each decision.',
      calibrationReview: f.reviewNeutral(neutral?.raw, neutral?.lastDecision.baseline), samples }, null, 2);
    $('#expression-sample-report').hidden = false;
    status.textContent = `Saved ${c.label}. ${samples.length} of 5 labels sampled. Choose another label or copy the samples before leaving Live.`;
  }
  $('#sample-expression').addEventListener('click', () => {
    if (!live.active || !live.expression.present || live.expression.calibration || expressionSamples.pending) return;
    expressionSamples.pending = { label: $('#expression-sample-label').value, start: performance.now(), last: 0, frames: [] };
    sampleExpressions();
  });
  $('#copy-expression-samples').addEventListener('click', async () => {
    const field = $('#expression-sample-data');
    if (!field.value) return;
    try { await navigator.clipboard.writeText(field.value); $('#expression-sample-status').textContent = 'Samples copied. Paste them into your message.'; }
    catch { field.focus(); field.select(); $('#expression-sample-status').textContent = 'Select and copy the sample text below, then paste it into your message.'; }
  });
  function updateExpressionDebug() {
    sampleExpressions();
    if (!$('#expression-debug').open) return;
    const f = live.expression, d = f.diagnostics(), r = d.thresholds;
    const number = v => Number.isFinite(v) ? v.toFixed(3) : '—';
    const label = key => ({ sad: 'Sad-looking cue', smile: 'Smile cue', surprise: 'Surprise cue' }[key] || 'Neutral');
    for (const [name, cell] of expressionRows) cell.textContent = number(d.raw[name]);
    $('#expression-decision').textContent = `Final: ${f.present ? label(d.active) : 'No face scores'}. Candidate: ${label(d.candidate)} (${Math.round(d.heldMs)} ms). Sad evidence: ${d.reason}.`;
    $('#expression-adjusted').textContent = `After neutral baseline: frown mean ${number(d.adjusted.frownMean)}, weaker side ${number(d.adjusted.frownBoth)}, inner brow ${number(d.adjusted.innerBrow)}. Signed changes: outer brow ${number(d.adjusted.outerBrowChange)}, wide eyes ${number(d.adjusted.eyeWideChange)}, brow down ${number(d.adjusted.browDownChange)}, inner–outer contrast ${number(d.adjusted.browContrast)}, jaw ${number(d.adjusted.jawChange)}. ${d.baseline ? 'Relative routes enabled when scores are complete.' : 'Calibrate neutral to enable subtle relative cues.'}`;
    $('#expression-filtered').textContent = `Smoothed evidence: smile ${number(d.scores.smile)}, sad-looking ${number(d.scores.sad)}, surprise ${number(d.scores.surprise)}. Sad-look animation strength ${number(d.output.sad)} can rise before a full state (not confidence).`;
    const soft = d.continuousSad, sr = r.continuousSad;
    $('#expression-continuous').textContent = `Gradual sad-look: ${soft.route}. Joint evidence ${number(soft.evidence)}; fresh joint features ${soft.freshJoint ? 'yes' : 'no'}; held ${soft.heldSeconds.toFixed(2)} s. Preview starts after ${sr.warmup} s, grows over ${sr.fadeIn} s, capped at ${sr.maxPreview}. Lowered-brow full route needs ${sr.fullAfter} s plus state confirmation. Groups: ${Object.entries(soft.groups).map(([key, value]) => `${key} ${number(value)}`).join('; ') || 'waiting'}.`;
    $('#expression-continuous-floors').textContent = `Gradual feature floors (relative to calibration): ${Object.entries(soft.floors).map(([key, value]) => `${key} > ${number(value)}`).join('; ') || 'waiting'}. Both routes need bilateral mouth changes and brow changes; no smile absence, head pose or eye closure is used as evidence.`;
    for (const key of ['surprise', 'sad', 'smile']) $(`#expression-${key}-reason`).textContent = `${label(key)}: ${d.reasons[key]}`;
    const animation = expressionAnimation();
    $('#expression-animation').textContent = `Animation delivery (smile / sad / surprise): target ${Object.values(animation.target).map(number).join(' / ')}; rendered ${Object.values(animation.rendered).map(number).join(' / ')}. RGB ${animation.color.join(', ')}; flow ${number(animation.speed)}; expansion ${number(animation.expansion)}. Other inputs can also affect movement.`;
    $('#expression-thresholds').textContent = `Stronger sad routes: frown mean ≥ ${r.frownMean}, both sides ≥ ${r.frownBoth}, inner brow ≥ ${r.innerBrow}; OR mean ≥ ${r.strongFrown}, both ≥ ${r.strongBoth}. If jaw ≥ ${r.openJaw}, require mean ≥ ${r.speechFrown} and brow ≥ ${r.speechBrow}. Enter: sad ${r.enter.sad}, smile ${r.enter.smile}, surprise ${r.enter.surprise}; hold > ${r.exit}; switch margin ${r.margin}. Confirm: sad ${r.dwell.sad} ms, smile ${r.dwell.smile} ms, surprise ${r.dwell.surprise} ms, neutral ${r.dwell.neutral} ms. Smoothing: ${Math.round(1000 / r.smoothing)} ms time constant. Neutral is the fallback, not a competing score.`;
    $('#expression-thresholds').textContent += ` Original relative-route thresholds are at least ${r.relative.noiseMultiplier} times neutral noise. Gradual routes use separate ${sr.noiseMultiplier}× noise floors and sustained joint support. Sad needs mouth + raised inner brow + brow shape, OR bilateral mouth + lowered brows + outer-brow settling. Surprise uses brows + eyes with an optional jaw; jaw alone never qualifies.`;
    $('#expression-relative-thresholds').textContent = d.relative?.ready ? `Effective change thresholds: ${Object.entries(d.relative.limits).map(([k, v]) => `${k} ≥ ${number(v)}`).join('; ')}. Passed relative routes: ${Object.entries(d.relative.routes).filter(([, passed]) => passed).map(([k]) => k).join(', ') || 'none'}.` : 'Relative thresholds: waiting for neutral calibration and complete face scores.';
    $('#calibrate-expression').disabled = !f.present || d.calibrating;
    $('#reset-expression-calibration').disabled = !d.baseline && !d.calibrating;
    const status = $('#expression-calibration-status');
    if (status.textContent !== d.calibrationMessage) status.textContent = d.calibrationMessage;
    const neutralSample = expressionSamples.records.find(sample => sample.intended === 'neutral');
    $('#expression-calibration-review').textContent = f.reviewNeutral(neutralSample?.raw, neutralSample?.lastDecision.baseline).message;
    $('#expression-baseline').textContent = d.baseline ? `Neutral baseline: ${f.names.map(k => `${k} ${number(d.baseline[k])}`).join('; ')}.` : 'Neutral baseline: none. Calibrate before testing subtle expressions.';
  }
  $('#expression-debug').addEventListener('toggle', updateExpressionDebug);
  $('#calibrate-expression').addEventListener('click', () => { if (live.active) live.expression.startCalibration(performance.now()); updateExpressionDebug(); });
  $('#reset-expression-calibration').addEventListener('click', () => { live.expression.resetCalibration(); updateExpressionDebug(); });
  function syncPlaybackControls() {
    for (const button of $$('[data-music]')) { button.setAttribute('aria-pressed', String(sounds.musicEnabled)); button.textContent = `Music · ${sounds.musicEnabled ? 'On' : 'Off'}`; button.setAttribute('aria-label', sounds.musicEnabled ? 'Turn background music off' : 'Turn background music on'); }
    for (const button of $$('[data-effects]')) { button.setAttribute('aria-pressed', String(sounds.effectsEnabled)); button.textContent = `Sound Effects · ${sounds.effectsEnabled ? 'On' : 'Off'}`; }
    const musicWaiting = sounds.musicEnabled && (sounds.musicBlocked || sounds.context?.state === 'suspended');
    const blocked = (sounds.active && sounds.blocked) || musicWaiting || (sounds.active && sounds.context?.state === 'suspended');
    for (const label of $$('[data-music-status]')) {
      label.hidden = !sounds.musicEnabled || (!sounds.musicError && !musicWaiting);
      label.textContent = sounds.musicError ? 'Music could not load. Try again.' : 'Tap or click anywhere to start music.';
    }
    $$('[data-retry-music]').forEach(button => { button.hidden = !sounds.musicEnabled || !sounds.musicError; });
    $$('[data-resume-playback]').forEach(button => { button.hidden = !blocked && !sounds.errors.length && !sounds.musicError; });
    const baseMessage = model.stage === 'demo' ? 'Music continues across screens. Demo cues use the same sound responses.' : 'Music continues across screens and while you speak. Interaction effects soften while you speak.';
    const message = sounds.errors.length ? sounds.errors.join(' ') + ' Tap Resume sound to retry.' : sounds.musicError ? 'Music could not load. Tap Resume sound to retry.' : blocked ? 'Playback is paused. Tap Resume sound to continue.' : !sounds.ready && sounds.active ? 'Preparing sound…' : baseMessage;
    for (const label of $$('[data-playback-status]')) if (label.textContent !== message) label.textContent = message;
  }
  function approachDiagnostics() {
    return { note: 'Live size measurements and browser playback status; no camera images or audio recordings. Test Afraid is a manual event, not a camera approach.',
      stage: model.stage, pageHidden: document.hidden, facePresent: !!creature.s.facePresent && performance.now() <= creature.s.presenceUntil,
      faceFrame: live.approachFrame ? { ...live.approachFrame, receivedAgeMs: performance.now() - live.approachFrame.receivedAt } : null,
      face: live.faceApproach.snapshot(), palm: live.hands.approach.snapshot(), recentFaceSizes: live.faceApproach.trace,
      cooldownMs: Math.max(0, 3200 - (performance.now() - creature.lastStartleAt)),
      lastEvent: creature.lastStartleEvent, lastAttempt: creature.startleAttempt,
      audio: { context: sounds.context?.state || 'unavailable', effectsEnabled: sounds.effectsEnabled,
        decoded: sounds.buffers.has('afraid'), playback: sounds.afraidPlayback, errors: sounds.errors, resumeError: sounds.resumeError || null },
      animation: { depth: creature.visual?.depth || 0, scale: creature.sm.scale, expansion: creature.sm.expansion } };
  }
  function updateApproachDebug() {
    if (!$('#approach-debug').open) return;
    const d = approachDiagnostics(), v = d.face, f = d.faceFrame, t = v.thresholds || { growth: .16, rate: .55, span: .055, samples: 2 };
    const age = value => value === null || value === undefined ? 'n/a' : `${Math.round(value)} ms`;
    $('#approach-readings').textContent = [
      `Face detected: ${d.facePresent ? 'Yes' : 'No'} | Size available: ${f?.geometry ? 'Yes' : 'No'}`,
      `Frame: ${f?.width || '?'} × ${f?.height || '?'} | Results: ${live.frames} | Size updates: ${v.updates}`,
      `Latest result: ${f?.state || 'No result received'} | Received ${age(f?.receivedAgeMs)} ago`,
      `Inference age: ${age(f?.latencyMs)} | Sample interval: ${age(v.intervalMs)}`,
      `Face size: ${v.size.toFixed(3)} (raw ${v.rawSize.toFixed(3)}); width / height: ${v.spans?.map(n => n.toFixed(3)).join(' / ') || 'n/a'}`,
      `Growth: ${(v.growth * 100).toFixed(1)}% | Speed: ${v.rate.toFixed(3)} log-size/s`,
      `Thresholds: growth ≥ ${(t.growth * 100).toFixed(0)}%, speed ≥ ${t.rate.toFixed(2)}/s, both spans ≥ ${(t.span * 100).toFixed(1)}%, ${t.samples} coherent increments`,
      `Armed: ${v.armed ? 'Yes' : 'No'} | Stillness: ${Math.round(v.quietMs)} / 450 ms | Coherent increments: ${v.coherentSamples}`,
      `Detection: ${v.status}`,
      `Checks: ${Object.entries(v.checks).map(([k, pass]) => `${k} ${pass ? 'PASS' : 'WAIT'}`).join('; ') || 'Waiting for usable measurements'}`,
      `Shared cooldown: ${d.cooldownMs ? (d.cooldownMs / 1000).toFixed(1) + ' s' : 'Ready'}`,
      `Last attempt: ${d.lastAttempt ? `${d.lastAttempt.source}: ${d.lastAttempt.reason}` : 'None'}`,
      `Last event: ${d.lastEvent ? `#${d.lastEvent.id} ${d.lastEvent.kind} / ${d.lastEvent.source}, ${age(performance.now() - d.lastEvent.at)} ago` : 'None'}`,
      `Audio: ${d.audio.context} | Sound Effects ${d.audio.effectsEnabled ? 'On' : 'Off'} | Afraid decoded: ${d.audio.decoded ? 'Yes' : 'No'}`,
      `Afraid: ${d.audio.playback ? `#${d.audio.playback.eventId} ${d.audio.playback.status}. ${d.audio.playback.detail}` : 'No accepted event yet'}`,
      ...d.audio.errors,
      `Retreat: ${d.animation.depth.toFixed(2)} | Scale: ${d.animation.scale.toFixed(2)} | Expansion: ${d.animation.expansion.toFixed(2)}`,
      `Palm: ${d.palm.status} (optional; never required for a face approach)`
    ].join('\n');
    $('#approach-report').value = JSON.stringify(d, null, 2);
  }
  function updateStatus() {
    syncPlaybackControls();
    const fam = creature.fam;
    $('#bond-fill').style.width = `${fam * 100}%`; $('#bond-value').textContent = `${Math.round(fam * 100)}%`;
    $('#bond-label').textContent = fam < .15 ? 'Cautious · Still a little shy' : fam < .4 ? 'Curious · Getting to know you' : fam < .7 ? 'Warming up · Coming closer' : 'Familiar · At ease with you';
    const s = creature.s;
    const present = s.facePresent && performance.now() <= s.presenceUntil;
    const presenceText = present ? 'Your company builds familiarity.' : s.bodyPresent ? 'Moving with you. Your bond stays.' : s.handPresent ? 'Following your hand. Your bond stays.' : creature.relationship.absence >= 8 ? 'Resting. Your bond is still here.' : 'Waiting for you. Your bond stays.';
    for (const label of $$('.presence-note')) if (label.textContent !== presenceText) label.textContent = presenceText;
    const expression = model.stage === 'live' ? live.expression.active : model.expression;
    if (model.stage === 'live') {
      const handState = live.hands.state;
      $('#hand-status').textContent = handState === 'loading' ? 'Loading HandPose on this device…' : handState === 'error' ? 'Hand tracking is unavailable. Check the model files and try again. Face and sound still work.' : s.handPresent ? (s.handOpen > .65 ? 'Open hand · Expanding' : s.handOpen < .35 ? 'Closed hand · Gathering' : 'Hand in view · Following') : 'HandPose is ready. Bring one hand into view.';
      const gestureNames = { open: 'Open palm', fist: 'Fist', v: 'V sign', point: 'Pointing finger' }, pose = s.handPose;
      const shapeText = !s.handPresent ? 'Bring one hand into view. The creature returns to its natural shape when tracking is lost.' :
        pose?.gesture ? `${gestureNames[pose.gesture]} · Shaping. Wiggle your fingers to make ripples.` :
        pose?.candidate ? `${gestureNames[pose.candidate]} · Hold for a moment to shape it.` : 'Move your fingers to make ripples. Hold an open palm, fist, V sign, or one pointing finger.';
      if ($('#hand-shape-status').textContent !== shapeText) $('#hand-shape-status').textContent = shapeText;
      $('#retry-hand').hidden = handState !== 'error';
      const bodyState = live.body.state;
      const bodyText = ['waiting', 'loading'].includes(bodyState) ? 'Loading body tracking on this device…' : bodyState === 'error' ? 'Body tracking is unavailable. Other interactions still work. Try again.' : s.bodyPresent ? 'Upper body in view. Move at your own pace.' : 'Body tracking is ready. Bring your shoulders and arms into view.';
      if ($('#body-status').textContent !== bodyText) $('#body-status').textContent = bodyText;
      $('#retry-body').hidden = bodyState !== 'error';
      $('#face-status').textContent = present ? 'Face in view' : 'Look toward the camera';
      $('#expression-status').textContent = live.expression.present ? ({ smile: 'Smile cue', sad: 'Sad-look cue', surprise: 'Surprise cue' }[expression] || (s.sad > .03 ? 'Gradual sad-look response' : 'Neutral')) : 'No face detected';
      updateExpressionDebug();
      const suspended = live.audio?.state !== 'running';
      $('#resume-audio').hidden = !suspended || live.muted;
      $('#mic-status').textContent = live.muted ? 'Microphone is off.' : suspended ? 'Microphone paused. Tap Resume microphone.' : live.audioState?.calibrating ? 'Stay quiet for a moment while the microphone settles.' : 'Listening. Gentle sounds make ripples.';
      $('#mic-meter').value = s.level;
      updateApproachDebug();
    }
    const reactions = [];
    if (creature.events.depth < 4) reactions.push('A little startled. Tucking in, then opening again');
    else if (creature.events.retreat < 2.7) reactions.push('A little startled. Gently stepping back');
    else if (creature.events.clap < 4.2) reactions.push('Drifting apart, then gathering again');
    else if (expression === 'smile' && s.smile > .1) reactions.push('A warm glow, a little closer');
    else if (expression === 'sad' && s.sad > .1) reactions.push('Slowing down and gathering close');
    else if (s.sad > .05 && !expression) reactions.push('A cooler glow, gently slowing down');
    else if (expression === 'surprise' && s.surprise > .1) reactions.push('Opening up, then settling into violet');
    if (s.level > .05) reactions.push('Sound ripples through it');
    if (s.handPresent) reactions.push(s.handOpen > .65 ? 'Opening with your hand' : s.handOpen < .35 ? 'Gathering with your hand' : 'Move slowly. It will follow');
    if (s.bodyLift > .25) reactions.push('Floating up with your arms');
    else if (s.bodyMotion > .1 || Math.abs(s.bodySway) > .1) reactions.push('Swaying with you');
    const text = !present && !s.handPresent && !s.bodyPresent && creature.relationship.absence >= 8 ? 'Resting quietly. Come back whenever you like.' : reactions.length ? reactions.join(' · ') : present ? 'Just being here brings you closer.' : 'Take your time. Your bond stays.';
    if ($('#reaction').textContent !== text) $('#reaction').textContent = text;
  }
  renderPickers(); syncControls(); sounds.prepareMusic(); syncPlaybackControls();
  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(.04, Math.max(0, (now - lastTime) / 1000)); lastTime = now;
    if (!document.hidden) {
      if (model.stage === 'demo') feedDemo(dt);
      else if (model.stage === 'live') live.update(now, dt);
      creature.update(dt, now); sounds.update(now, creature.s, creature.fam, creature.eventCounts); creature.draw();
      for (const preview of previews) if (preview.canvas.getClientRects().length) { preview.update(dt); preview.draw(); }
      if (now - lastUI > 250) { updateStatus(); lastUI = now; }
    }
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => {
    lastTime = performance.now(); pointer = null; creature.s.handSpeed = 0;
    if (expressionSamples.pending) {
      expressionSamples.pending = null; $('#expression-sample-status').textContent = 'Sampling paused by a tab switch. Please start a new sample.';
    }
    creature.relationship.pause();
    if (document.hidden) sounds.pause(); else sounds.resume();
    if (live.active) {
      live.presenceInvalidBefore = lastTime;
      live.hands.filter.lose(); creature.s.handPresent = false;
      live.faceApproach.lose(); live.hands.approach.lose();
      live.body.filter = new BodyFilter();
      Object.assign(creature.s, { bodyPresent: false, bodySway: 0, bodyLift: 0, bodySpread: 0, bodyMotion: 0 });
      live.gate.reset(); live.expression.clearTracking(); creature.s.facePresent = false;
      creature.s.smile = creature.s.sad = creature.s.surprise = creature.s.level = 0;
    }
  });
  window.addEventListener('pagehide', () => { live.stop(); if (model.stage === 'live' || model.stage === 'loading') setStage('prep'); sounds.dispose(); });
  window.addEventListener('pageshow', event => { if (event.persisted) sounds.prepareMusic(); });
  requestAnimationFrame(frame);
  // Read-only diagnostic snapshot for browser QA; it cannot inject real inputs.
  Object.defineProperty(window, 'resonanceDemo', { value: Object.freeze({
    snapshot: () => ({ stage: model.stage, shape: model.shape, theme: THEMES[model.theme].name, inputs: { ...model }, signals: { ...creature.s }, ...structuredClone(creature.metrics),
      events: { ...creature.eventCounts }, depthSource: creature.depthSource,
      startle: { event: creature.lastStartleEvent, attempt: creature.startleAttempt, cooldownMs: Math.max(0, 3200 - (performance.now() - creature.lastStartleAt)) }, playback: sounds.snapshot(),
      live: { active: live.active, starting: live.starting, modelReady: live.modelReady, worker: !!live.worker, frames: live.frames, facePresent: live.expression.present, expression: live.expression.active, expressionDebug: live.expression.diagnostics(),
        approach: { face: live.faceApproach.snapshot(), hand: live.hands.approach.snapshot() },
        hands: { state: live.hands.state, active: live.hands.active, worker: !!live.hands.worker, error: live.hands.error, busy: live.hands.busy, frames: live.hands.frames, interval: live.hands.interval },
        body: { state: live.body.state, worker: !!live.body.worker, error: live.body.error, busy: live.body.busy, frames: live.body.frames, interval: live.body.interval },
        tracks: live.stream?.getTracks().map(t => ({ kind: t.kind, state: t.readyState, enabled: t.enabled })) || [], audio: live.audio?.state || 'closed', previewHidden: live.previewHidden } }),
  }) });
})();
