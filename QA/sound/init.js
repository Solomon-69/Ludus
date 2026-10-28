// Runs before the page: a fake AudioContext that counts every tone the app tries to play, and a log of sfx names.
(() => {
  const log = window.__sfxLog = { tones: 0, names: [], game: [], resumes: 0, created: 0 };
  class Param { setValueAtTime() {} exponentialRampToValueAtTime() {} linearRampToValueAtTime() {} setTargetAtTime() {} cancelScheduledValues() {} get value() { return 0; } set value(v) {} }
  class Node { constructor() { this.frequency = new Param(); this.gain = new Param(); this.Q = new Param(); this.detune = new Param(); this.type = 'sine'; } connect(n) { return n || this; } disconnect() {} start() {} stop() {} }
  class FakeCtx {
    constructor() { log.created++; this.state = 'suspended'; this.currentTime = 0; this.destination = new Node(); this.sampleRate = 44100; }
    resume() { log.resumes++; this.state = 'running'; return Promise.resolve(); }
    createOscillator() { log.tones++; return new Node(); }
    createGain() { return new Node(); }
    createBiquadFilter() { return new Node(); }
    createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
    createBufferSource() { log.tones++; const n = new Node(); n.buffer = null; return n; }
  }
  window.AudioContext = FakeCtx; window.webkitAudioContext = FakeCtx;
  window.__ludusSfxSpy = name => { log.names.push(name); if (/\/games\//.test(new Error().stack || '')) log.game.push(name); };   // game: called from a game's own code
})();
