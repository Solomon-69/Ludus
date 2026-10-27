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
  const TICK_MS = 200;           // 5 checks a second: light on an 8 GB Mac
  const MIN_FACE = 0.05;         // faces narrower than 5% of the picture are too far away to read the screen
  const FACING = 0.38;           // nose this far off the eye line (in eye widths) = head turned away
  const BLUR_AFTER_MS = 600;     // a problem must last this long before the game blurs (no flicker)
  const CLEAR_AFTER_MS = 450;    // and be gone this long before it is crisp again

  let video = null, stream = null, detector = null, kind = '', timer = 0, busy = false;
  let onChange = () => {}, blurred = false, badSince = 0, goodSince = 0, lastReason = '';

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
        baseOptions: { modelAssetBuffer: new Uint8Array(model), delegate: 'CPU' }, runningMode: 'VIDEO', minDetectionConfidence: 0.55
      });
    } finally { URL.revokeObjectURL(files.wasmLoaderPath); URL.revokeObjectURL(files.wasmBinaryPath); }
    kind = 'mediapipe';
    return detector;
  }

  // Faces as { w: width share of the picture, facing: bool }, biggest first.
  async function faces() {
    const W = video.videoWidth || 1;
    const out = [];
    if (kind === 'native') {
      const list = await detector.detect(video);
      list.forEach(f => {
        const lm = f.landmarks || [], eyes = lm.filter(l => l.type === 'eye'), nose = lm.find(l => l.type === 'nose');
        out.push({ w: f.boundingBox.width / W, facing: facingFrom(eyes.map(e => pt(e)), nose && pt(nose)) });
      });
    } else {
      const r = detector.detectForVideo(video, performance.now());
      (r.detections || []).forEach(d => {
        const k = d.keypoints || [];   // right eye, left eye, nose tip, mouth, right ear, left ear (0..1)
        out.push({ w: d.boundingBox.width / W, facing: facingFrom(k[0] && k[1] ? [k[0], k[1]] : [], k[2]) });
      });
    }
    return out.filter(f => f.w >= MIN_FACE).sort((a, b) => b.w - a.w);
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
      const owner = list[0];
      const reason = !owner ? 'away' : !owner.facing ? 'away' : list.slice(1).some(f => f.facing) ? 'watcher' : '';
      decide(reason); fails = 0;
    } catch (e) {
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
  let gen = 0;   // bumped by stop(): a start still loading when stopped lets its camera go at once
  async function open() {
    if (!supported()) throw new Error('No camera access in this window');
    const mine = ++gen;
    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user', frameRate: { ideal: 10, max: 15 } }, audio: false });
    } catch (e) {
      throw new Error(e && e.name === 'NotAllowedError' ? 'Camera access was turned down' : 'No camera found');
    }
    if (mine !== gen) { s.getTracks().forEach(t => t.stop()); return false; }
    stream = s;
    try { await makeDetector(); }
    catch (e) { stop(); throw new Error('Face finder could not load (needs the internet once)'); }
    if (mine !== gen || !stream) return false;   // stopped while loading
    video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.srcObject = stream;
    try { await video.play(); } catch (e) { stop(); throw new Error('The camera picture could not start'); }
    if (mine !== gen) return false;
    blurred = false; badSince = goodSince = 0; lastReason = '';
    clearInterval(timer); timer = setInterval(tick, TICK_MS);
    return true;
  }
  function stop() {
    gen++; pending = null;   // a start still loading lets its camera go by itself (gen) and no longer counts as running
    clearInterval(timer); timer = 0;
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    if (video) { video.srcObject = null; video = null; }
    if (blurred) { blurred = false; onChange(false, ''); }
  }

  const api = window.LudusPrivacy = { onFail: null, start, stop, supported, running: () => !!(stream || pending), engine: () => kind,
    _test: { facingFrom, decide: r => decide(r), state: () => blurred } };
})();
