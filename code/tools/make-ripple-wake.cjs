// One isolated, softly blooming ripple sound. No recordings or external libraries.
// Run: node code/tools/make-ripple-wake.cjs
const fs = require('node:fs');
const path = require('node:path');
const rate = 48000, duration = 2.7, frames = Math.round(rate * duration);
const channels = [new Float64Array(frames), new Float64Array(frames)];
const tau = Math.PI * 2;
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
let phase = 0, seed = 47291, air = 0, airLow = 0;
const low = [new Float64Array(4), new Float64Array(4)];
const airAlpha = 1 - Math.exp(-tau * 1050 / rate);
const airLowAlpha = 1 - Math.exp(-tau * 240 / rate);
for (let i = 0; i < frames; i++) {
  const t = i / rate;
  const bloom = smooth(t / .48);
  const release = Math.pow(1 - smooth((t - .45) / 2.25), 1.5);
  const tail = smooth((t - .38) / .6);
  const ripplePhase = tau * (1.8 * t - .14 * t * t);
  const ripple = 1 + .16 * tail * Math.sin(ripplePhase) * Math.exp(-.28 * t);
  // A very small pitch bloom; the perceived waves come from timbre and amplitude.
  const pitch = 253 + 13 * smooth(t / .8) - 5 * smooth((t - .85) / 1.85);
  phase += tau * (pitch + .5 * Math.sin(ripplePhase)) / rate;
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  air += airAlpha * ((seed / 4294967296 * 2 - 1) - air);
  airLow += airLowAlpha * (air - airLow);
  for (let ch = 0; ch < 2; ch++) {
    const width = ch ? .09 : -.09;
    const fluid = .07 * Math.sin(ripplePhase + width) * tail;
    const tone = .79 * Math.sin(phase + fluid) +
      (.12 + .035 * tail * Math.sin(ripplePhase - .8)) * Math.sin(phase * 2 + .2 + fluid * 1.5) +
      .022 * Math.sin(phase * 3 + .5 + width * tail);
    const resonantTail = .035 * tail * Math.sin(phase * 1.994 + .3 * Math.sin(ripplePhase + width));
    const airy = .009 * (air - airLow) * tail;
    let sample = (tone + resonantTail + airy) * bloom * release * ripple;
    // Gently close the filter as the ripples recede. Four poles remove bright edges.
    const cutoff = 1450 - 650 * smooth(t / duration) + 80 * tail * Math.sin(ripplePhase);
    const alpha = 1 - Math.exp(-tau * cutoff / rate);
    for (let pole = 0; pole < 4; pole++) { low[ch][pole] += alpha * (sample - low[ch][pole]); sample = low[ch][pole]; }
    channels[ch][i] = sample;
  }
}
const dry = channels.map(c => c.slice());
for (let ch = 0; ch < 2; ch++) {
  for (let i = 0; i < frames; i++) {
    for (const [delay, gain] of [[.043, .055], [.079, .037], [.131, .026], [.179, .015]]) {
      const index = i - Math.round((delay + ch * .003) * rate);
      if (index >= 0) channels[ch][i] += dry[1 - ch][index] * gain;
    }
    channels[ch][i] *= smooth(i / (rate * .025)) * smooth((frames - 1 - i) / (rate * .2));
  }
}
let peak = 0;
for (const ch of channels) for (const sample of ch) peak = Math.max(peak, Math.abs(sample));
const gain = Math.pow(10, -9 / 20) / peak;
const wav = Buffer.alloc(44 + frames * 4);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(frames * 4, 40);
let energy = 0;
for (let i = 0; i < frames; i++) for (let ch = 0; ch < 2; ch++) {
  const sample = channels[ch][i] * gain;
  if (!Number.isFinite(sample) || Math.abs(sample) >= 1) throw Error('Invalid audio sample');
  energy += sample * sample;
  wav.writeInt16LE(Math.round(sample * 32767), 44 + i * 4 + ch * 2);
}
const output = path.join(__dirname, '../assets/audio/resonance-ripple-wake.wav');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, wav);
console.log(JSON.stringify({ file: output, duration, sampleRate: rate, channels: 2, bitDepth: 16,
  peakDbFS: -9, rmsDbFS: +(20 * Math.log10(Math.sqrt(energy / (frames * 2)))).toFixed(2),
  bytes: wav.length, endpointSamples: [wav.readInt16LE(44), wav.readInt16LE(wav.length - 2)] }, null, 2));
