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

  // Pure signal filters are also exercised by the Node acceptance tests.
  class AudioGate {
    constructor() { this.reset(); }
    reset() { this.elapsed = 0; this.samples = []; this.floor = .006; this.baseline = 0; this.level = 0; this.armed = false; this.quiet = 0; this.cooldown = 0; }
    update(rms, dt, sensitivity = 1) {
      rms = clamp(Number.isFinite(rms) ? rms : 0); dt = clamp(dt, 0, .1);
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
      const onset = Math.max(.15 / Math.sqrt(sensitivity), this.floor * 5, this.baseline * 2.8);
      const spike = this.armed && this.cooldown === 0 && rms > onset && rms - this.baseline > .045;
      if (spike) { this.armed = false; this.cooldown = 3; this.quiet = 0; }
      this.baseline = approach(this.baseline, rms, 2.4, dt);
      return { level: this.level, spike, calibrating: false };
    }
  }

  class ExpressionFilter {
    constructor() { this.scores = { smile: 0, sad: 0, surprise: 0 }; this.active = null; this.candidate = null; this.since = 0; this.present = false; }
    update(categories, now, dt) {
      this.present = !!categories?.length;
      const b = Object.fromEntries((categories || []).map(c => [c.categoryName, clamp(c.score)]));
      const val = name => b[name] || 0;
      const pair = name => (val(name + 'Left') + val(name + 'Right')) / 2;
      const smile = clamp((pair('mouthSmile') - .2) / .5);
      // A jaw opening cannot produce surprise without BOTH raised brows and widened eyes.
      const brows = clamp((pair('browOuterUp') - .22) / .45);
      const eyes = clamp((pair('eyeWide') - .15) / .4);
      const surprise = Math.sqrt(brows * eyes) * (.8 + .2 * val('jawOpen')) * (1 - smile * .8);
      const frown = clamp((pair('mouthFrown') - .12) / .4);
      const sad = frown * (.45 + .55 * clamp((val('browInnerUp') - .1) / .45)) * (1 - smile) * (1 - surprise);
      const raw = this.present ? { smile, sad, surprise } : { smile: 0, sad: 0, surprise: 0 };
      for (const key of Object.keys(this.scores)) this.scores[key] = approach(this.scores[key], raw[key], 6, dt);
      const strongest = Object.keys(this.scores).sort((a, b) => this.scores[b] - this.scores[a])[0];
      let next = this.scores[strongest] > .32 ? strongest : null;
      if (this.active && this.scores[this.active] > .18 && (!next || this.scores[next] < this.scores[this.active] + .14)) next = this.active;
      if (!this.present) next = null;
      if (next !== this.candidate) { this.candidate = next; this.since = now; }
      const delay = next === 'sad' ? 500 : next ? 300 : 400;
      if (now - this.since >= delay) this.active = next;
      const result = { smile: 0, sad: 0, surprise: 0 };
      if (this.present && this.active) result[this.active] = this.scores[this.active];
      return result;
    }
  }

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
            const result = task.detectForVideo(data.image, data.time);
            self.postMessage({ type: 'result', categories: result.faceBlendshapes?.[0]?.categories || [], time: data.time });
          } finally { data.image.close(); }
        } else if (data.type === 'close') { task?.close(); self.close(); }
      } catch (error) { self.postMessage({ type: 'error', message: String(error?.message || error) }); }
    };
  }
  const assetBase = new URL('.', document.currentScript.src);
  const localAsset = path => new URL(path, assetBase).href;
  const failure = (name, message) => Object.assign(new Error(message), { name });
  class LiveInput {
    constructor() {
      this.generation = 0; this.stream = null; this.audio = null; this.worker = null; this.active = false;
      this.sensitivity = 1; this.muted = false; this.previewHidden = false; this.gate = new AudioGate();
      this.expression = new ExpressionFilter(); this.frames = 0; this.modelReady = false; this.starting = false;
      this.modelTimer = 0; this.permissionTimer = 0; this.frameTimer = 0; this.cancelLoad = null;
    }
    stop() {
      this.generation++; this.active = false; this.starting = false; this.modelReady = false;
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
        setStage('live'); syncControls();
      } catch (error) {
        if (!current()) return;
        if (phase === 'model' && error.name !== 'AbortError') error = failure('ModelError', 'The face model could not load. Check the connection and model files, then try again.');
        this.fail(error);
      }
    }
    loadModel(id) {
      return new Promise((resolve, reject) => {
        this.workerURL = URL.createObjectURL(new Blob([`(${faceWorker.toString()})()`], { type: 'text/javascript' }));
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
            const signals = this.expression.update(data.categories, data.time, clamp((data.time - this.lastResultTime) / 1000, .01, .2));
            this.lastResultTime = data.time;
            if (this.active && model.stage === 'live' && !document.hidden) Object.assign(creature.s, signals);
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
      // Explicitly zero channels that this phase does not track.
      s.handPresent = false; s.handSpeed = 0; s.bodyMotion = 0;
      if (!this.muted && this.audio?.state === 'running') {
        this.analyser.getFloatTimeDomainData(this.data);
        const rms = Math.sqrt(this.data.reduce((sum, v) => sum + v * v, 0) / this.data.length);
        this.audioState = this.gate.update(rms, dt, this.sensitivity); s.level = this.audioState.level;
        if (this.audioState.spike) s.spike++;
      } else { s.level = 0; }
      if (now - this.resultAt > 1000) { s.smile = s.sad = s.surprise = 0; this.expression.present = false; }
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
      if (!muted) this.audio?.resume().catch(() => {});
    }
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
  const live = new LiveInput();
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
    const muted = model.stage === 'live' ? live.muted : model.muted;
    $('#mute').setAttribute('aria-pressed', String(muted));
    $('#mute-label').textContent = muted ? 'Sound off' : model.stage === 'live' ? 'Microphone' : 'Demo sound';
    document.body.classList.toggle('hand-active', model.hand && model.stage === 'demo');
    $('#creature').tabIndex = model.hand && model.stage === 'demo' ? 0 : -1;
    if (!model.hand) $('#hand-marker').hidden = true;
  }
  function resetInputs(familiarity = false) {
    Object.assign(model, { expression: null, intensity: .85, sound: 0, sustain: false, muted: false, hand: false, openness: .5, body: 0 });
    creature.reset(familiarity); pointer = null; lastSoundInput = { value: 0, time: performance.now() }; syncControls();
  }
  function setStage(stage) {
    if (stage !== 'live' && stage !== 'loading') live.stop();
    $$('dialog[open]').forEach(d => d.close());
    model.stage = stage; creature.engaged = stage === 'demo' || stage === 'live';
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
      if (stage === 'prep') $('#prep-title').focus();
      else if (stage === 'demo') $('#demo-controls').focus({ preventScroll: true });
      else if (stage === 'live') $('#live-controls').focus({ preventScroll: true });
      else if (stage === 'loading' || stage === 'error') $('#connection-title').focus({ preventScroll: true });
      else $('#meet').focus({ preventScroll: true });
    });
  }
  $('#meet').addEventListener('click', () => setStage('prep'));
  $('#start').addEventListener('click', () => live.start());
  $('#retry').addEventListener('click', () => live.start());
  for (const id of ['try-demo', 'fallback-demo']) $(`#${id}`).addEventListener('click', () => { resetInputs(); setStage('demo'); });
  $('#cancel-start').addEventListener('click', () => setStage('prep'));
  $('#exit').addEventListener('click', () => setStage('welcome'));
  $('#sensitivity').addEventListener('input', e => { live.sensitivity = +e.target.value; $('#sensitivity-value').textContent = `${live.sensitivity.toFixed(1)}×`; });
  $('#calibrate').addEventListener('click', () => { live.gate.reset(); toast('Stay quiet for a moment while the microphone settles.'); });
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
  $('#hand').addEventListener('click', () => { model.hand = !model.hand; pointer = null; creature.s.handSpeed = 0; syncControls(); });
  $('#openness').addEventListener('input', e => { model.openness = +e.target.value; model.hand = true; syncControls(); });
  $('#retreat').addEventListener('click', () => { if (model.stage !== 'demo') return; model.hand = true; creature.trigger('retreat'); syncControls(); });
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
    if (model.stage !== 'demo' || !model.hand || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
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
      setTimeout(() => URL.revokeObjectURL(url), 1500); toast('This moment is saved as a PNG.');
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
    $('#bond-label').textContent = fam < .15 ? 'Cautious · Still a little shy' : fam < .4 ? 'Curious · Getting to know you' : fam < .7 ? 'Warming up · Coming closer' : 'Familiar · At ease with you';
    const s = creature.s;
    const expression = model.stage === 'live' ? live.expression.active : model.expression;
    if (model.stage === 'live') {
      $('#face-status').textContent = live.expression.present ? 'Face in view' : 'Look toward the camera';
      $('#expression-status').textContent = live.expression.present ? ({ smile: 'Smile cue', sad: 'Sad-look cue', surprise: 'Surprise cue' }[expression] || 'Neutral') : 'No face detected';
      const suspended = live.audio?.state !== 'running';
      $('#resume-audio').hidden = !suspended || live.muted;
      $('#mic-status').textContent = live.muted ? 'Microphone is off.' : suspended ? 'Microphone paused. Tap Resume microphone.' : live.audioState?.calibrating ? 'Stay quiet for a moment while the microphone settles.' : 'Listening. Gentle sounds make ripples.';
      $('#mic-meter').value = s.level;
    }
    const reactions = [];
    if (creature.events.retreat < 2.7) reactions.push('A little startled. Gently stepping back');
    else if (creature.events.clap < 4.2) reactions.push('Drifting apart, then gathering again');
    else if (expression === 'smile' && s.smile > .1) reactions.push('A warm glow, a little closer');
    else if (expression === 'sad' && s.sad > .1) reactions.push('Slowing down and gathering close');
    else if (expression === 'surprise' && s.surprise > .1) reactions.push('Opening up, then settling into violet');
    if (s.level > .05) reactions.push('Sound ripples through it');
    if (model.stage === 'demo' && model.hand) reactions.push(model.openness > .65 ? 'Opening with your hand' : model.openness < .35 ? 'Gathering with your hand' : 'Move slowly. It will follow');
    if (model.stage === 'demo' && model.body > .1) reactions.push('Swaying with you');
    const text = reactions.length ? reactions.join(' · ') : 'Take your time. It is getting to know you.';
    if ($('#reaction').textContent !== text) $('#reaction').textContent = text;
  }
  renderPickers(); syncControls();
  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(.04, Math.max(0, (now - lastTime) / 1000)); lastTime = now;
    if (!document.hidden) {
      if (model.stage === 'demo') feedDemo(dt);
      else if (model.stage === 'live') live.update(now, dt);
      creature.update(dt); creature.draw();
      for (const preview of previews) if (preview.canvas.getClientRects().length) { preview.update(dt); preview.draw(); }
      if (now - lastUI > 250) { updateStatus(); lastUI = now; }
    }
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => {
    lastTime = performance.now(); pointer = null; creature.s.handSpeed = 0;
    if (live.active) { live.gate.reset(); live.expression = new ExpressionFilter(); creature.s.smile = creature.s.sad = creature.s.surprise = creature.s.level = 0; }
  });
  window.addEventListener('pagehide', () => { live.stop(); if (model.stage === 'live' || model.stage === 'loading') setStage('prep'); });
  requestAnimationFrame(frame);
  // Read-only diagnostic snapshot for browser QA; it cannot inject real inputs.
  Object.defineProperty(window, 'resonanceDemo', { value: Object.freeze({
    snapshot: () => ({ stage: model.stage, shape: model.shape, theme: THEMES[model.theme].name, inputs: { ...model }, signals: { ...creature.s }, ...structuredClone(creature.metrics),
      live: { active: live.active, starting: live.starting, modelReady: live.modelReady, worker: !!live.worker, frames: live.frames, facePresent: live.expression.present, expression: live.expression.active,
        tracks: live.stream?.getTracks().map(t => ({ kind: t.kind, state: t.readyState, enabled: t.enabled })) || [], audio: live.audio?.state || 'closed', previewHidden: live.previewHidden } }),
  }) });
})();
