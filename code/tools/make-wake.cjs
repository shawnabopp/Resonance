// Offline sound design for one quiet, wordless creature wake-up.
// Run: node code/tools/make-wake.cjs
const fs = require('node:fs');
const path = require('node:path');
const rate = 48000, duration = 1.5, frames = Math.round(rate * duration);
const left = new Float64Array(frames), right = new Float64Array(frames);
const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const tau = 2 * Math.PI;
let phase = 0;
for (let i = 0; i < frames; i++) {
  const t = i / rate;
  // A single continuous rise, with a slow breath-like opening and soft release.
  const frequency = 326 + 43 * ease(t / 1.03) + 1.15 * Math.sin(tau * 2.15 * t) * ease(t / .3);
  phase += tau * frequency / rate;
  const bodyEnvelope = ease(t / .19) * (1 - ease((t - .44) / .86));
  const breath = 1 + .025 * Math.sin(tau * 3.1 * t + .5);
  const roundPhase = phase + .08 * Math.sin(phase * 2) * (1 - ease(t / 1.2));
  const body = bodyEnvelope * breath * (
    .76 * Math.sin(roundPhase) +
    .14 * Math.sin(phase * 2 + .3) +
    .035 * Math.sin(phase * 3 + .7)
  );
  // A faint, diffuse upper-partial tail, with no strikes or discrete notes.
  const shimmerEnvelope = .045 * ease((t - .30) / .43) * Math.pow(1 - ease((t - .65) / .85), 1.4);
  let shimmerL = 0, shimmerR = 0;
  const ratios = [2.012, 2.978, 4.036, 5.017];
  for (let k = 0; k < ratios.length; k++) {
    const weight = 1 / (k + 1);
    const drift = .16 * Math.sin(tau * (.7 + k * .17) * t + k);
    const glow = .72 + .28 * Math.sin(tau * (2.8 + k * .31) * t + k * 1.4);
    shimmerL += weight * glow * Math.sin(phase * ratios[k] + k * .9 + drift);
    shimmerR += weight * glow * Math.sin(phase * ratios[k] + k * .9 + drift + .18 * (k + 1));
  }
  left[i] = body + shimmerEnvelope * shimmerL;
  right[i] = body + shimmerEnvelope * shimmerR;
}
// Very quiet early reflections soften the tail without turning it into a bell.
const dryL = left.slice(), dryR = right.slice();
for (let i = 0; i < frames; i++) {
  for (const [seconds, gain] of [[.047, .055], [.083, .037], [.137, .022]]) {
    const j = i - Math.round(seconds * rate);
    if (j >= 0) { left[i] += dryR[j] * gain; right[i] += dryL[j] * gain; }
  }
  const edge = ease(i / (rate * .012)) * ease((frames - 1 - i) / (rate * .08));
  left[i] *= edge; right[i] *= edge;
}
let peak = 0;
for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
const gain = Math.pow(10, -8 / 20) / peak;
const wav = Buffer.alloc(44 + frames * 4);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(frames * 4, 40);
let squares = 0;
for (let i = 0; i < frames; i++) {
  for (const [channel, samples] of [[0, left], [1, right]]) {
    const value = samples[i] * gain;
    if (!Number.isFinite(value) || Math.abs(value) >= 1) throw Error('Invalid audio sample');
    squares += value * value;
    wav.writeInt16LE(Math.round(value * 32767), 44 + i * 4 + channel * 2);
  }
}
const output = path.join(__dirname, '../assets/audio/resonance-wake.wav');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, wav);
console.log(JSON.stringify({ file: output, duration, sampleRate: rate, channels: 2, bitDepth: 16,
  peakDbFS: -8, rmsDbFS: +(20 * Math.log10(Math.sqrt(squares / (frames * 2)))).toFixed(2),
  bytes: wav.length, endpointSamples: [wav.readInt16LE(44), wav.readInt16LE(wav.length - 2)] }, null, 2));
