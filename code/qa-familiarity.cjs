// Deterministic elapsed-time tests of the production relationship logic.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, 'sketch.js'), 'utf8');
const block = source.slice(source.indexOf('  class Familiarity'), source.indexOf('  // Serialized into a classic worker'));
const Familiarity = vm.runInNewContext(`const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));${block};Familiarity`);
const signal = overrides => ({ facePresent: true, presenceSince: 0, presenceUntil: Infinity, smile: 0, sad: 0, level: 0, handPresent: false, handSpeed: 0, bodyMotion: 0, ...overrides });
const approx = (a,b) => assert(Math.abs(a-b)<1e-9, `${a} != ${b}`);
function simulate(fps, seconds, s = signal()) { const f = new Familiarity(); f.update(0,s); for(let i=1;i<=fps*seconds;i++) f.update(i*1000/fps,s); return f; }
for(const fps of [5,15,30,60,144]) { approx(simulate(fps,60).value,.4); approx(simulate(fps,120).value,.76); }
const irregular = new Familiarity(); irregular.update(0,signal()); for(const ms of [70,1140,8549,12009,30333,60518,120000]) irregular.update(ms,signal()); approx(irregular.value,.76);
const sad = simulate(30,60,signal({sad:1})); approx(sad.value,.4);
assert(simulate(30,60,signal({smile:.85})).value > .7);
assert(simulate(30,60,signal({level:.25})).value > .4);
approx(simulate(30,60,signal({level:1,spike:12})).value,.4);
const away = simulate(30,60); const bond = away.value;
away.update(63000,signal({facePresent:false})); approx(away.value,bond); approx(away.rest,0);
away.update(84000,signal({facePresent:false})); approx(away.value,bond); approx(away.rest,1);
away.update(84000,signal({presenceSince:84000})); approx(away.value,bond); approx(away.rest,0);
away.update(85000,signal({presenceSince:84000})); approx(away.value,bond+.006);
const stale = new Familiarity(); stale.update(0,signal({presenceUntil:1000})); stale.update(10000,signal({presenceUntil:1000})); approx(stale.value,.046); approx(stale.absence,9);
stale.update(20000,signal({presenceSince:20000,presenceUntil:21000})); approx(stale.value,.046);
const background = simulate(30,20); const paused = background.value;
background.update(21000,signal(),true,false); background.update(321000,signal(),true,false); background.update(322000,signal({presenceSince:322000})); approx(background.value,paused);
background.update(323000,signal({presenceSince:322000})); approx(background.value,paused+.006);
const inactive = simulate(30,60,signal({facePresent:false})); approx(inactive.value,.04);
inactive.update(120000,signal(),false); approx(inactive.value,.04);
approx(simulate(30,1000).value,1);
console.log('PASS: 5–144 FPS and irregular timing; 60s=40%, 120s=76%; quiet/sad presence; gentle bonus; loud sound preserves bond; absence pause/rest/return; stale results; hidden-tab pause; inactive mode; saturation.');
