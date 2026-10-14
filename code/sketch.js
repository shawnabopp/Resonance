/* RESONANCE — vanilla port of figma-reference.
 * Signal boundary: DemoInput -> Creature.s. No hardware or network input.
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
    handPresent: false, handX: .5, handY: .5, handOpen: .5, handSpeed: 0, bodyMotion: 0 });
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

  class Creature {
    constructor(canvas, { count = 3400, shape = 'seed', theme = THEMES[2].p, thumbnail = false } = {}) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.n = count; this.thumbnail = thumbnail;
      this.base = generate(shape, count); this.from = this.base; this.morph = 1;
      this.phase = Float32Array.from({ length: count }, () => Math.random() * Math.PI * 2);
      this.size = Float32Array.from({ length: count }, () => .55 + Math.random() ** 3 * 1.3);
      this.brightness = Float32Array.from({ length: count }, () => .4 + Math.random() ** 2 * .6);
      this.theme = rgb(theme); this.color = [...this.theme]; this.s = emptySignals();
      this.fam = .04; this.engaged = false; this.t = 0; this.time = 0; this.rotation = 0;
      this.cx = 0; this.cy = 0; this.radius = 0; this.w = 0; this.h = 0; this.morph = 1;
      this.sm = { smile: 0, sad: 0, surprise: 0, level: 0, open: .5, body: 0, expansion: 1, scale: 1 };
      this.events = { surprise: 20, clap: 20, retreat: 20 }; this.power = { surprise: 1, clap: 1, retreat: 1 };
      this.lastEvent = { surprise: -10, clap: -10, retreat: -10 }; this.eventCounts = { surprise: 0, clap: 0, retreat: 0 };
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
    trigger(kind, power = 1) {
      if (this.time - this.lastEvent[kind] < (kind === 'retreat' ? 2 : 1.5)) return false;
      this.lastEvent[kind] = this.time; this.events[kind] = 0; this.power[kind] = clamp(power);
      this.eventCounts[kind]++;
      if (kind === 'retreat') {
        const x = .5 - this.s.handX, y = .5 - this.s.handY, len = Math.hypot(x, y) || 1;
        this.retreatX = Math.abs(x) + Math.abs(y) < .03 ? -.8 : x / len;
        this.retreatY = Math.abs(x) + Math.abs(y) < .03 ? -.3 : y / len;
      }
      return true;
    }
    reset(familiarity = false) {
      this.s = emptySignals(); this.lastSpike = 0; this.wasSurprised = false;
      if (familiarity) this.fam = .04;
      for (const key of Object.keys(this.events)) { this.events[key] = 20; this.lastEvent[key] = -10; }
    }
    update(dt) {
      const s = this.s, sm = this.sm;
      this.time += dt;
      for (const key of Object.keys(this.events)) this.events[key] += dt;
      for (const key of ['smile', 'sad', 'surprise', 'level']) sm[key] = approach(sm[key], s[key], key === 'level' ? 7 : 4, dt);
      sm.open = approach(sm.open, s.handPresent ? s.handOpen : .5, 4, dt);
      sm.body = approach(sm.body, s.bodyMotion, 3, dt);
      if (s.surprise > .15 && !this.wasSurprised) this.trigger('surprise', s.surprise);
      this.wasSurprised = s.surprise > .15;
      if (s.spike !== this.lastSpike) { this.lastSpike = s.spike; this.trigger('clap'); }
      if (s.handPresent && s.handSpeed > 1.5) this.trigger('retreat');
      const gentle = s.handSpeed < .8 && s.level < .65 && s.bodyMotion < .65 && this.events.clap > 3 && this.events.retreat > 3;
      const engagement = Math.min(1, sm.smile * .7 + sm.sad * .25 + (s.handPresent ? .5 : 0) + sm.level * .8 + sm.body * .4);
      if (this.engaged && gentle) this.fam = clamp(this.fam + dt * engagement * .023, .04, 1);
      const motionFactor = this.reduced.matches ? .35 : 1;
      const speed = 1 - .67 * sm.sad + .55 * sm.smile;
      this.t += dt * speed * motionFactor;
      this.rotation += dt * (.14 + sm.body * 1.2 + sm.level * .16) * speed * motionFactor;
      this.morph = Math.min(1, this.morph + dt * .65);
      const surprise = this.pulse(this.events.surprise, 3.5) * this.power.surprise;
      const clap = this.pulse(this.events.clap, 4.2) * this.power.clap;
      const retreat = this.pulse(this.events.retreat, 2.7) * this.power.retreat;
      const expressionTotal = sm.smile + sm.sad + sm.surprise;
      const warm = [255, 213, 112], blue = [120, 177, 255], purple = [200, 147, 255];
      for (let c = 0; c < 3; c++) {
        const tint = expressionTotal > .001 ? (warm[c] * sm.smile + blue[c] * sm.sad + purple[c] * sm.surprise) / expressionTotal : this.theme[c];
        this.color[c] = approach(this.color[c], lerp(this.theme[c], tint, clamp(expressionTotal * 1.5)), 2.7, dt);
      }
      const open = s.handPresent ? (sm.open - .5) * .7 : 0;
      const expansion = clamp(1 + sm.smile * .23 - sm.sad * .27 + open + sm.level * .1 + surprise * .52 * motionFactor - retreat * .2, .6, 1.75);
      sm.expansion = approach(sm.expansion, expansion, 5, dt);
      sm.scale = approach(sm.scale, 1 + this.fam * .16 + sm.smile * .17, 2.2, dt);
      const W = this.w, H = this.h;
      const radiusFactor = this.thumbnail ? .3 : this.engaged && W < 500 ? .31 : .245;
      const R = Math.min(W, H) * radiusFactor;
      this.radius = R;
      let tx = W / 2, ty = H / 2;
      if (this.engaged) {
        if (s.handPresent) {
          const follow = .28 + this.fam * .48;
          tx += (s.handX - .5) * W * follow;
          ty += (s.handY - .5) * H * follow;
        }
        tx += Math.sin(this.t * 2.4) * R * .12 * sm.smile * motionFactor;
        ty += (sm.sad * .37 - sm.smile * .22) * R;
        ty -= Math.abs(Math.sin(this.t * 3.1)) * R * .1 * sm.smile * motionFactor;
        tx += Math.sin(this.t * 1.75) * R * .55 * sm.body * motionFactor;
        ty += Math.sin(this.t * 2.2) * R * .2 * sm.body * motionFactor;
        tx += this.retreatX * R * .66 * retreat * motionFactor;
        ty += this.retreatY * R * .5 * retreat * motionFactor;
      }
      ty += Math.sin(this.t * .7) * R * .045;
      tx = clamp(tx, W * .27, W * .73); ty = clamp(ty, H * .27, H * .73);
      const followRate = 1.5 + this.fam * 3 + retreat * 4;
      this.cx = approach(this.cx, tx, followRate, dt); this.cy = approach(this.cy, ty, followRate, dt);
      this.visual = { surprise, clap, retreat, motionFactor, speed, R, scale: sm.scale * sm.expansion };
    }
    draw() {
      const { ctx, w: W, h: H, sm, time, t } = this;
      if (!W || !H) return;
      const { R, clap, motionFactor, retreat } = this.visual;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      const [r, g, b] = this.color.map(Math.round), color = `rgb(${r},${g},${b})`;
      const halo = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, R * 1.65);
      halo.addColorStop(0, `rgba(${r},${g},${b},.12)`); halo.addColorStop(.4, `rgba(${r},${g},${b},.025)`); halo.addColorStop(1, 'transparent');
      ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
      const coreR = R * .2, core = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, coreR);
      core.addColorStop(0, `rgba(${r},${g},${b},.25)`); core.addColorStop(1, 'transparent');
      ctx.fillStyle = core; ctx.fillRect(this.cx - coreR, this.cy - coreR, coreR * 2, coreR * 2);
      const tilt = .29 + Math.sin(t * .3) * .1 + sm.body * Math.sin(t * 1.6) * .35 * motionFactor;
      const sway = Math.sin(t * 1.75) * sm.body * .62 * motionFactor;
      const cr = Math.cos(this.rotation), sr = Math.sin(this.rotation), cx = Math.cos(tilt), sx = Math.sin(tilt), cz = Math.cos(sway), sz = Math.sin(sway);
      const mk = this.ease(this.morph); ctx.fillStyle = color;
      let minX = W, maxX = 0, minY = H, maxY = 0;
      for (let i = 0; i < this.n; i++) {
        const j = i * 3, ph = this.phase[i];
        let x = lerp(this.from[j], this.base[j], mk), y = lerp(this.from[j + 1], this.base[j + 1], mk), z = lerp(this.from[j + 2], this.base[j + 2], mk);
        const d = Math.hypot(x, y, z);
        const ripple = sm.level * .23 * Math.sin(d * 12 - t * 7 + ph * .12) * motionFactor;
        const breathing = 1 + .055 * Math.sin(t * 1.5 - d * 2.2);
        const scatter = clap * (.25 + .43 * (1 + Math.sin(ph * 3)) / 2) * motionFactor;
        const m = sm.scale * sm.expansion * breathing * (1 + ripple) + scatter;
        const vib = sm.level * .035 * motionFactor;
        x = x * m + Math.sin(t * 17 + ph) * vib + Math.sin(t * .6 + ph) * .025;
        y = y * m + Math.cos(t * 19 + ph) * vib + Math.cos(t * .5 + ph * 1.3) * .025;
        z *= m;
        const rx = x * cr + z * sr, rz = -x * sr + z * cr;
        const ry = y * cx - rz * sx, depthZ = y * sx + rz * cx;
        const xx = rx * cz - ry * sz, yy = rx * sz + ry * cz;
        const perspective = 3.8 / (3.8 + depthZ);
        let dx = xx * R * perspective, dy = yy * R * perspective;
        // Soft ellipse compression keeps every combination visible without hard edge clipping.
        const safeX = Math.max(8, Math.min(this.cx, W - this.cx) - 9);
        const safeY = Math.max(8, Math.min(this.cy, H - this.cy) - 9);
        const q = Math.hypot(dx / safeX, dy / safeY);
        if (q > .78) { const bounded = .78 + .21 * Math.tanh((q - .78) / .21); dx *= bounded / q; dy *= bounded / q; }
        const px = this.cx + dx, py = this.cy + dy;
        minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        const depth = clamp(.75 - depthZ * .22, .32, 1);
        const alpha = clamp(this.brightness[i] * depth * (.88 + this.fam * .12) * (1 + Math.max(0, .5 - d) * .8));
        const size = this.size[i] * clamp(perspective, .7, 1.4) * (this.thumbnail ? .75 : 1);
        ctx.globalAlpha = alpha; ctx.fillRect(px - size / 2, py - size / 2, size, size);
        if (i % 13 === 0) {
          ctx.globalAlpha = alpha * .075; ctx.beginPath(); ctx.arc(px, py, size * 2.6, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      this.metrics = { color: this.color.map(Math.round), center: [this.cx, this.cy], radius: R,
        expansion: sm.expansion, scale: sm.scale, level: sm.level, speed: this.visual.speed,
        rotation: this.rotation, sway, clap, retreat, surprise: this.visual.surprise,
        familiarity: this.fam, bounds: [minX, minY, maxX, maxY], viewport: [W, H], events: { ...this.eventCounts } };
    }
  }

  const model = { stage: 'welcome', shape: 'seed', theme: 2, expression: null, intensity: .85,
    sound: 0, sustain: false, muted: false, hand: false, openness: .5, body: 0 };
  const creature = new Creature($('#creature'), { count: matchMedia('(max-width: 767px)').matches ? 2300 : 3600 });
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
    $('#hand').textContent = `手势跟随 · ${model.hand ? 'On' : 'Off'}`;
    $('#mute-label').textContent = model.muted ? 'Sound off' : 'Demo sound';
    document.body.classList.toggle('hand-active', model.hand && model.stage === 'demo');
    $('#creature').tabIndex = model.hand && model.stage === 'demo' ? 0 : -1;
    if (!model.hand) $('#hand-marker').hidden = true;
  }
  function resetInputs(familiarity = false) {
    Object.assign(model, { expression: null, intensity: .85, sound: 0, sustain: false, muted: false, hand: false, openness: .5, body: 0 });
    creature.reset(familiarity); pointer = null; lastSoundInput = { value: 0, time: performance.now() }; syncControls();
  }
  function setStage(stage) {
    $$('dialog[open]').forEach(d => d.close());
    model.stage = stage; creature.engaged = stage === 'demo';
    document.body.dataset.stage = stage;
    $('#welcome').hidden = stage !== 'welcome'; $('#prep').hidden = stage !== 'prep';
    $('#session').hidden = stage !== 'demo'; $('#home').hidden = stage === 'welcome';
    if (stage === 'welcome') resetInputs(true);
    window.scrollTo(0, 0); creature.resize();
    requestAnimationFrame(() => {
      if (stage === 'prep') $('#prep-title').focus();
      else if (stage === 'demo') $('#demo-controls').focus({ preventScroll: true });
      else $('#meet').focus({ preventScroll: true });
    });
  }
  $('#meet').addEventListener('click', () => setStage('prep'));
  $('#start').addEventListener('click', () => setStage('demo'));
  $('#home').addEventListener('click', () => setStage('welcome'));
  $$('.dialog-home').forEach(b => b.addEventListener('click', () => setStage('welcome')));
  $('#reset').addEventListener('click', () => { resetInputs(); toast('已恢复中性 · 保留熟悉度'); });
  $('#restart').addEventListener('click', () => { resetInputs(true); $('#help-dialog').close(); toast('从初次见面重新开始'); });
  $$('[data-expression]').forEach(b => b.addEventListener('click', () => {
    model.expression = model.expression === b.dataset.expression ? null : b.dataset.expression; syncControls();
  }));
  $('#expression').addEventListener('input', e => { model.intensity = +e.target.value; syncControls(); });
  $('#sound').addEventListener('input', e => {
    const value = +e.target.value, now = performance.now();
    if (!model.muted && value > .72 && value - lastSoundInput.value > .24 && now - lastSoundInput.time < 450) creature.trigger('clap');
    model.sound = value;
    // Keep a short onset window: several small slider events can form one quick loud rise.
    if (now - lastSoundInput.time > 450) lastSoundInput = { value, time: now };
    syncControls();
  });
  $('#sound').addEventListener('pointerdown', () => { lastSoundInput = { value: model.sound, time: performance.now() }; });
  $('#sound').addEventListener('keydown', () => { lastSoundInput.time = performance.now(); });
  $('#sustain').addEventListener('click', () => { model.sustain = !model.sustain; if (model.sustain && model.sound === 0) model.sound = .45; syncControls(); });
  $('#clap').addEventListener('click', () => {
    if (model.muted) { toast('Demo sound 已静音，请先开启'); return; }
    if (creature.trigger('clap')) toast('Demo · 突然大声，散开后会重聚');
  });
  $('#mute').addEventListener('click', () => { model.muted = !model.muted; syncControls(); });
  $('#hand').addEventListener('click', () => { model.hand = !model.hand; pointer = null; creature.s.handSpeed = 0; syncControls(); });
  $('#openness').addEventListener('input', e => { model.openness = +e.target.value; model.hand = true; syncControls(); });
  $('#retreat').addEventListener('click', () => { model.hand = true; creature.trigger('retreat'); syncControls(); });
  $('#body').addEventListener('input', e => { model.body = +e.target.value; syncControls(); });
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
    if (model.hand) { pointer = null; e.currentTarget.setPointerCapture(e.pointerId); moveHand(e); }
  });
  $('#creature').addEventListener('pointermove', moveHand);
  for (const event of ['pointerleave', 'pointercancel', 'pointerup']) $('#creature').addEventListener(event, () => { pointer = null; $('#hand-marker').hidden = true; });
  $('#creature').addEventListener('keydown', e => {
    if (!model.hand || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    creature.s.handX = clamp(creature.s.handX + (e.key === 'ArrowRight' ? .05 : e.key === 'ArrowLeft' ? -.05 : 0));
    creature.s.handY = clamp(creature.s.handY + (e.key === 'ArrowDown' ? .05 : e.key === 'ArrowUp' ? -.05 : 0));
  });
  $$('[data-dialog]').forEach(button => button.addEventListener('click', () => $(`#${button.dataset.dialog}`).showModal()));
  $$('dialog').forEach(dialog => {
    dialog.querySelector('.close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
  });
  $('#capture').addEventListener('click', () => {
    creature.canvas.toBlob(blob => {
      if (!blob) return;
      const link = document.createElement('a'), url = URL.createObjectURL(blob);
      link.href = url; link.download = `resonance-${Date.now()}.png`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500); toast('已保存这一刻 · PNG');
    }, 'image/png');
  });
  function feedDemo(dt) {
    if (model.stage !== 'demo') return;
    const s = creature.s;
    for (const key of ['smile', 'sad', 'surprise']) s[key] = model.expression === key ? model.intensity : 0;
    s.level = model.muted ? 0 : model.sound * (model.sustain ? .7 + .3 * Math.sin(creature.time * 3) ** 2 : 1);
    s.handPresent = model.hand; s.handOpen = model.openness;
    s.handSpeed *= Math.exp(-dt * 9); s.bodyMotion = model.body;
  }
  function updateStatus() {
    const fam = creature.fam;
    $('#bond-fill').style.width = `${fam * 100}%`; $('#bond-value').textContent = `${Math.round(fam * 100)}%`;
    $('#bond-label').textContent = fam < .15 ? 'Cautious · 还有一点害羞' : fam < .4 ? 'Curious · 开始对你好奇' : fam < .7 ? 'Warming up · 慢慢靠近' : 'Familiar · 已经认得你了';
    const reactions = [];
    if (creature.events.retreat < 2.7) reactions.push('有点吓到了，轻轻退后');
    else if (creature.events.clap < 4.2) reactions.push('散开了，正在慢慢重聚');
    else if (model.expression === 'smile') reactions.push('它带着暖意，轻快地靠近');
    else if (model.expression === 'sad') reactions.push('它慢下来，轻轻下沉、聚拢');
    else if (model.expression === 'surprise') reactions.push('它展开又收回，留下一点紫色');
    if (model.sound > .05 && !model.muted) reactions.push('声音在它身上泛起波纹');
    if (model.hand) reactions.push(model.openness > .65 ? '掌心张开，它也舒展开' : model.openness < .35 ? '掌心收拢，它凝聚起来' : '慢慢移动，它会跟随');
    if (model.body > .1) reactions.push('它随着动作摇摆');
    const text = reactions.length ? reactions.join(' · ') : '慢慢来，它正在认识你。';
    if ($('#reaction').textContent !== text) $('#reaction').textContent = text;
  }
  renderPickers(); syncControls();
  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(.04, Math.max(0, (now - lastTime) / 1000)); lastTime = now;
    if (!document.hidden) {
      feedDemo(dt); creature.update(dt); creature.draw();
      for (const preview of previews) if (preview.canvas.getClientRects().length) { preview.update(dt); preview.draw(); }
      if (now - lastUI > 250) { updateStatus(); lastUI = now; }
    }
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { lastTime = performance.now(); pointer = null; creature.s.handSpeed = 0; });
  requestAnimationFrame(frame);
  // Read-only diagnostic snapshot for browser QA; it cannot inject real inputs.
  Object.defineProperty(window, 'resonanceDemo', { value: Object.freeze({
    snapshot: () => ({ stage: model.stage, shape: model.shape, theme: THEMES[model.theme].name, inputs: { ...model }, ...structuredClone(creature.metrics) }),
  }) });
})();
