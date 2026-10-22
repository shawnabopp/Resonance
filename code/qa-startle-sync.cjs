// Production cooldown/pending-cue logic with mocked audio availability.
// Actual WAV playback is checked separately by qa-playback/qa-approach-browser.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, 'sketch.js'), 'utf8');
const code = source.slice(source.indexOf('  class SoundCues'), source.indexOf('  const model ='));
let now = 0; const events = [];
const { Creature, ExperienceAudio } = vm.runInNewContext(`const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));const document={hidden:false};const model={stage:'demo'};${code};({Creature,ExperienceAudio})`,
  { performance: { now: () => now }, sounds: { startle: event => events.push(event) } });
const creature = Object.create(Creature.prototype);
Object.assign(creature, { time: 10, lastStartleAt: -Infinity, startleSequence: 0, lastEvent: { clap: -10, retreat: -10, depth: -10, surprise: -10 },
  eventCounts: { clap: 0, retreat: 0, depth: 0, surprise: 0 }, events: {}, power: {}, s: { handX: .5, handY: .5 } });
assert(creature.trigger('clap')); now = 1000; assert.equal(creature.trigger('retreat'), false);
now = 2000; assert.equal(creature.trigger('depth'), false); assert(creature.trigger('surprise'));
now = 3250; assert(creature.trigger('depth', 1, 'face')); now = 3300; assert.equal(creature.trigger('clap'), false);
assert.equal(events.length, 2); assert.equal(events[1].source, 'face'); assert.equal(events[1].id, 2);
console.log('PASS Wall-clock cooldown accepts one event for audio and animation; purple Surprise is independent');
const signal = { level: .9 }; // Speech must never suppress Afraid.
function setup() {
  now = 0; const audio = new ExperienceAudio(); audio.active = true; audio.context = { state: 'running', currentTime: 0 };
  let available = false, successes = 0, attempts = 0;
  audio.policy.update = () => ({ name: 'afraid', reason: 'duplicate polled event' });
  audio.request = (name, reason, id) => { assert.equal(name, 'afraid'); assert.equal(id, 1); attempts++;
    audio.lastRequestError = 'Audio still loading'; if (available) { successes++; return true; } return false; };
  audio.startle({ id: 1, at: now, source: 'face', reason: 'sudden approach' });
  return { audio, allow: () => { available = true; }, successes: () => successes, attempts: () => attempts };
}
let test = setup(); assert(test.audio.pendingAfraid); assert.equal(test.audio.afraidPlayback.detail, 'Audio still loading');
test.allow(); now = 200; test.audio.update(now, signal, .04, {}); test.audio.startle({ id: 1 });
now = 250; test.audio.update(now, signal, .04, {});
assert.equal(test.successes(), 1); assert.equal(test.audio.pendingAfraid, null);
console.log('PASS A fresh event retries briefly through loading/resume even during speech; duplicate IDs and polling cannot replay it');
test = setup(); test.allow(); now = 400; test.audio.update(now, signal, .04, {});
assert.equal(test.successes(), 0); assert.equal(test.audio.pendingAfraid, null);
for (const cancel of ['pause', 'stop', 'off']) {
  test = setup();
  if (cancel === 'off') test.audio.setEffects(false); else test.audio[cancel]();
  test.allow(); test.audio.update(150, signal, .04, {}); assert.equal(test.successes(), 0); assert.equal(test.audio.pendingAfraid, null);
}
console.log('PASS Expiry, Home, background pause and Sound Effects Off discard pending Afraid without delayed replay');
