/* Privacy blur: watches the camera on this computer and tells the shell to blur the game when
   (a) a second person is looking at the screen, or (b) the player is gone or looking away.
   A normal screen cannot show different pictures to different people, so this is the closest real thing.
   Every frame is checked here, in memory, and thrown away: nothing is saved or sent anywhere.
   Face finding: the built-in FaceDetector when the web view has one, otherwise MediaPipe's small
   face detector (library, wasm and model fetched once from the pinned, fingerprint-checked files below). */
(function () {
  'use strict';
  // MediaPipe is loaded from this exact version only, and every file is checked against a fixed SHA-384 fingerprint
  // before it runs (a changed or swapped file is refused). Apache-2.0, see THIRD_PARTY.md. Too big (about 10 MB) to ship inside the app.
  const MP_VER = '0.10.14';
  const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VER;
  const MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
  const MP_SRI = {
    'vision_bundle.mjs': 'sha384-pv/a53slpd9r+c7gv5R/Yx+690OjBKfh44t0YEEQi74uhGupAjv0NpiHrzlmhiVn',
    'vision_wasm_internal.js': 'sha384-kqX2jGDkWeDYqzs7HpikHthiB1zh/xFyMJu6Fkp8UUMPwamqZBRwL39vNtSQwS5E',
    'vision_wasm_internal.wasm': 'sha384-5znl2S0CAaFpqRz3rLzstYkWpBwEMzGDbWzlALJ20VPUX6VLjrVqAUdJEHcmXMdc',
    'vision_wasm_nosimd_internal.js': 'sha384-BQunnb2RrWwTlqL/gGpV1KOoZnLcsIb8uWDD21uhLVtQuKG0HsmfmhlDSDjnA1iw',
    'vision_wasm_nosimd_internal.wasm': 'sha384-4TZi4A8vwDwAdUuCp/TZFPzVRWERk0T4QnOxMCMY9qFnzvDnndjdiIHzBZ0xu/oB',
    'blaze_face_short_range.tflite': 'sha384-DK7LKyczaWlQp0NJO4TTv5wARoWlAWz57/exd62cy3KJJNpayeiX3cT7q3iANQSy'
  };
  // fetch a file and return its bytes only if its fingerprint matches
  async function pinned(url, name) {
    if (!(window.crypto && crypto.subtle)) throw new Error('no crypto');
    const res = await fetch(url, { cache: 'force-cache', credentials: 'omit' });
    if (!res.ok) throw new Error('fetch ' + name);
    const buf = await res.arrayBuffer();
    const sum = btoa(String.fromCharCode.apply(null, new Uint8Array(await crypto.subtle.digest('SHA-384', buf))));
    if ('sha384-' + sum !== MP_SRI[name]) throw new Error('fingerprint mismatch ' + name);
    return buf;
  }
  const blobUrl = (buf, type) => URL.createObjectURL(new Blob([buf], { type }));
  const TICK_MS = 250;           // 4 checks a second (each looks at 10 pieces, about 40 ms): light on an 8 GB Mac
  const MIN_FACE = 0.05;         // faces narrower than 5% of the picture are too far away to read the screen
  const FACING = 0.38;           // nose this far off the eye line (in eye widths) = head turned away
  const BLUR_AFTER_MS = 600;     // a problem must last this long before the game blurs (no flicker)
  const CLEAR_AFTER_MS = 450;    // and be gone this long before it is crisp again

  let video = null, stream = null, detector = null, kind = '', timer = 0, busy = false;
  let onChange = () => {}, blurred = false, badSince = 0, goodSince = 0, lastReason = '';
  const diag = { phase: 'off', err: '', faces: -1, ticks: 0 };   // read back by the test hook (no pictures, just counts)

  const supported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  async function makeDetector() {
    if (detector) return detector;
    if ('FaceDetector' in window) {
      try {
        const fd = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 4 });
        await fd.detect(document.createElement('canvas'));   // throws where the API exists but is not wired up
        kind = 'native'; detector = fd; return detector;
      } catch (e) { /* fall through to MediaPipe */ }
    }
    const bundle = await pinned(MP_BASE + '/vision_bundle.mjs', 'vision_bundle.mjs');
    const mp = await import(blobUrl(bundle, 'text/javascript'));
    // MediaPipe picks the SIMD or plain build for this web view; we fetch that same pair, checked, and hand it over as local blobs
    const wanted = await mp.FilesetResolver.forVisionTasks(MP_BASE + '/wasm');
    const variant = /nosimd/.test(String(wanted.wasmLoaderPath)) ? 'vision_wasm_nosimd_internal' : 'vision_wasm_internal';
    const [js, wasm, model] = await Promise.all([
      pinned(MP_BASE + '/wasm/' + variant + '.js', variant + '.js'),
      pinned(MP_BASE + '/wasm/' + variant + '.wasm', variant + '.wasm'),
      pinned(MP_MODEL, 'blaze_face_short_range.tflite')
    ]);
    const files = { wasmLoaderPath: blobUrl(js, 'text/javascript'), wasmBinaryPath: blobUrl(wasm, 'application/wasm') };
    try {
      detector = await mp.FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetBuffer: new Uint8Array(model), delegate: 'CPU' }, runningMode: 'IMAGE', minDetectionConfidence: 0.55
      });
    } finally { URL.revokeObjectURL(files.wasmLoaderPath); URL.revokeObjectURL(files.wasmBinaryPath); }
    kind = 'mediapipe';
    return detector;
  }

  // Faces as { w: width share of the picture, facing: bool }, biggest first.
  async function faces(src = video) {
    const W = src.videoWidth || src.width || 1;
    const out = [];
    if (kind === 'native') {
      const list = await detector.detect(src);
      list.forEach(f => {
        const lm = f.landmarks || [], eyes = lm.filter(l => l.type === 'eye'), nose = lm.find(l => l.type === 'nose');
        out.push({ w: f.boundingBox.width / W, facing: facingFrom(eyes.map(e => pt(e)), nose && pt(nose)) });
      });
    } else {
      mpFaces(src).forEach(f => out.push(f));
    }
    return out.filter(f => f.w >= MIN_FACE).sort((a, b) => b.w - a.w);
  }
  // average brightness 0..255 of a tiny 8x8 copy of the frame (tells a black or frozen picture apart; no picture is kept)
  let lumaCv = null;
  function luma() {
    try {
      lumaCv = lumaCv || Object.assign(document.createElement('canvas'), { width: 8, height: 8 });
      const c = lumaCv.getContext('2d', { willReadFrequently: true }); c.drawImage(video, 0, 0, 8, 8);
      const d = c.getImageData(0, 0, 8, 8).data; let t = 0;
      for (let i = 0; i < d.length; i += 4) t += (d[i] + d[i + 1] + d[i + 2]) / 3;
      return Math.round(t / 64);
    } catch (e) { return -1; }
  }

  // MediaPipe's face finder shrinks the whole picture to 128 x 128, so a face under about 13% of the picture's width
  // (someone sitting back a little, or anyone over your shoulder) was never found: the game stayed blurred with
  // nobody "looking", and onlookers were never seen. So it also looks at nine overlapping half-size pieces
  // (each face twice as big there) and merges what it finds. All in memory on this computer; nothing is kept.
  const GRID = [0, 0.25, 0.5], PIECE = 0.5;
  let cropCv = null;
  function mpFaces(src) {
    const VW = src.videoWidth || src.width || 1, VH = src.videoHeight || src.height || 1;
    cropCv = cropCv || document.createElement('canvas');
    const ctx = cropCv.getContext('2d', { willReadFrequently: true });
    const found = [];
    const look = (fx, fy, fs) => {
      const sx = fx * VW, sy = fy * VH, sw = fs * VW, sh = fs * VH;
      const cw = Math.max(1, Math.round(sw)), ch = Math.max(1, Math.round(sh));
      if (cropCv.width !== cw || cropCv.height !== ch) { cropCv.width = cw; cropCv.height = ch; }
      ctx.drawImage(src, sx, sy, sw, sh, 0, 0, cw, ch);
      (detector.detect(cropCv).detections || []).forEach(d => {
        const b = d.boundingBox, k = d.keypoints || [];   // keypoints: right eye, left eye, nose tip, mouth, ears (0..1 of the piece)
        const box = { x: (sx + b.originX * sw / cw) / VW, y: (sy + b.originY * sh / ch) / VH, w: b.width * sw / cw / VW, h: b.height * sh / ch / VH };
        // a face cut by the piece's edge is only part of one: the full picture or a neighbouring piece sees it whole
        const m = 0.01, cut = fs < 1 && ((box.x <= fx + m && fx > 0) || (box.y <= fy + m && fy > 0) ||
          (box.x + box.w >= fx + fs - m && fx + fs < 1) || (box.y + box.h >= fy + fs - m && fy + fs < 1));
        if (cut) return;
        const p = q => q && { x: (sx + q.x * sw) / VW, y: (sy + q.y * sh) / VH };
        found.push({ box, score: (d.categories && d.categories[0] && d.categories[0].score) || 0, eyes: k[0] && k[1] ? [p(k[0]), p(k[1])] : [], nose: p(k[2]) });
      });
    };
    look(0, 0, 1);
    GRID.forEach(fy => GRID.forEach(fx => look(fx, fy, PIECE)));
    return mergeFaces(found).map(f => ({ w: f.box.w, facing: facingFrom(f.eyes, f.nose) }));
  }
  // the same face seen in several pieces counts once (biggest, surest copy wins)
  function mergeFaces(list) {
    const kept = [];
    list.sort((a, b) => b.box.w - a.box.w || b.score - a.score).forEach(f => {
      const cx = f.box.x + f.box.w / 2, cy = f.box.y + f.box.h / 2;
      const same = kept.some(k => (cx > k.box.x && cx < k.box.x + k.box.w && cy > k.box.y && cy < k.box.y + k.box.h) || overlap(k.box, f.box) > 0.3);
      if (!same) kept.push(f);
    });
    return kept;
  }
  function overlap(a, b) {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const i = ix * iy; return i / (a.w * a.h + b.w * b.h - i || 1);
  }
  function pt(l) { const p = l.locations && l.locations[0]; return p ? { x: p.x, y: p.y } : { x: 0, y: 0 }; }
  function facingFrom(eyes, nose) {
    if (eyes.length < 2 || !nose) return true;   // no landmarks: trust the face box
    const mid = (eyes[0].x + eyes[1].x) / 2, span = Math.abs(eyes[0].x - eyes[1].x) || 1e-6;
    return Math.abs(nose.x - mid) / span < FACING;
  }

  let fails = 0;
  const MAX_FAILS = 25;   // about 10 s of failed checks in a row
  async function tick() {
    if (busy || !video || video.readyState < 2) return;
    busy = true;
    try {
      const list = await faces();
      diag.faces = list.length; diag.ticks++; diag.size = video.videoWidth + 'x' + video.videoHeight;
      if (diag.ticks % 10 === 1) diag.luma = luma();
      const owner = list[0];
      const reason = !owner ? 'away' : !owner.facing ? 'away' : list.slice(1).some(f => f.facing) ? 'watcher' : '';
      decide(reason); fails = 0;
    } catch (e) {
      diag.err = 'tick: ' + (e && e.message || e);
      // one dropped frame is fine; a face finder that keeps failing must not leave the switch on doing nothing
      if (++fails >= MAX_FAILS) { stop(); fails = 0; if (api.onFail) api.onFail('The face finder stopped working'); }
    }
    busy = false;
  }
  function decide(reason) {
    const now = performance.now();
    if (reason) { goodSince = 0; if (!badSince) badSince = now; }
    else { badSince = 0; if (!goodSince) goodSince = now; }
    const want = reason ? (blurred || now - badSince >= (reason === 'watcher' ? BLUR_AFTER_MS / 2 : BLUR_AFTER_MS))
                        : !(goodSince && now - goodSince >= CLEAR_AFTER_MS) && blurred;
    if (want !== blurred || (want && reason && reason !== lastReason)) {
      blurred = want; if (reason) lastReason = reason;
      onChange(blurred, blurred ? lastReason : '');
    }
  }

  // Ask for the camera and load the face finder. Resolves true when it can run, else rejects with a plain message.
  let pending = null;
  function start(cb) {
    onChange = cb || onChange;
    if (stream && timer) return Promise.resolve(true);
    if (!pending) { const p = open().finally(() => { if (pending === p) pending = null; }); pending = p; }
    return pending;
  }
  let fakeStream = null;   // test hook only: a made-up picture (canvas) in place of the camera
  let gen = 0;   // bumped by stop(): a start still loading when stopped lets its camera go at once
  async function open() {
    if (!supported()) throw new Error('No camera access in this window');
    const mine = ++gen;
    let s;
    diag.phase = 'camera'; diag.err = '';
    try {
      s = fakeStream ? fakeStream.clone() : await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user', frameRate: { ideal: 10, max: 15 } }, audio: false });
    } catch (e) {
      diag.phase = 'off'; diag.err = 'camera: ' + (e && e.name) + ' ' + (e && e.message);
      throw new Error(e && e.name === 'NotAllowedError' ? 'Camera access was turned down' : 'No camera found');
    }
    if (mine !== gen) { s.getTracks().forEach(t => t.stop()); return false; }
    stream = s;
    diag.phase = 'detector';
    try { await makeDetector(); }
    catch (e) { diag.err = 'detector: ' + (e && e.message || e); stop(); throw new Error('Face finder could not load (needs the internet once)'); }
    if (mine !== gen || !stream) return false;   // stopped while loading
    video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.srcObject = stream;
    try { await video.play(); } catch (e) { stop(); throw new Error('The camera picture could not start'); }
    if (mine !== gen) return false;
    blurred = false; badSince = goodSince = 0; lastReason = '';
    clearInterval(timer); timer = setInterval(tick, TICK_MS);
    diag.phase = 'running';
    return true;
  }
  function stop() {
    gen++; pending = null; diag.phase = 'off';   // a start still loading lets its camera go by itself (gen) and no longer counts as running
    clearInterval(timer); timer = 0;
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    if (video) { video.srcObject = null; video = null; }
    if (blurred) { blurred = false; onChange(false, ''); }
  }

  const api = window.LudusPrivacy = { onFail: null, start, stop, supported, running: () => !!(stream || pending), engine: () => kind,
    _test: { facingFrom, decide: r => decide(r), mergeFaces, time: () => faces(),
      // test hook: load the face finder and count faces in a given picture (works with the window closed)
      facesIn: async src => { await makeDetector(); return faces(src); }, state: () => blurred, useStream: st => { fakeStream = st || null; },
      status: () => Object.assign({ engine: kind, blurred, reason: blurred ? lastReason : '', native: 'FaceDetector' in window,
        subtle: !!(window.crypto && crypto.subtle), wasm: typeof WebAssembly === 'object', visible: document.visibilityState }, diag) } };
})();
