// Sky Hop worlds (1.12.70): node hop-worlds.js <out dir>
// Plays every mode in both themes with a small bot, proves the rules still hold (bounce height, wind, lightning, pick-ups), and saves a picture of each moment.
const L = require('./lib.js'), fs = require('fs'), path = require('path');
const { wait, check, newPage, errs } = L;
const OUT = process.argv[2] || 'shots/worlds'; fs.mkdirSync(OUT, { recursive: true });
const MODES = ['classic', 'monsters', 'boost', 'moon', 'storm', 'night'];
const peek = pg => pg.evaluate(() => { const v = Ludus.games.find(g => g.id === 'sparkhop')._peek(); return { y: v.p.y, vy: v.p.vy, vx: v.p.vx, state: v.state, mode: v.mode, height: v.height, wind: v.wind, gust: !!v.gust, flash: v.flash, shake: v.shake, fx: v.fx, power: !!v.power, coil: v.coil, bubble: v.bubble, zapAt: v.zapAt, clock: v.clock, rocks: v.rocks.length }; });
const BOT = () => {   // holds the key that leads to the next platform up; restarts nothing
  const g = Ludus.games.find(x => x.id === 'sparkhop'), key = (t, k) => document.dispatchEvent(new KeyboardEvent(t, { key: k, bubbles: true }));
  let dir = 0;
  window.__bot = setInterval(() => {
    const v = g._peek(); if (v.state !== 'play') return;
    const above = v.plats.filter(q => q.y < v.p.y + (v.p.vy > 0 ? 40 : -20) && q.type !== 'break' && q.broken < 0).sort((a, b) => b.y - a.y)[0];
    if (!above) return;
    const dx = above.x - v.p.x, want = Math.abs(dx) < 8 ? 0 : Math.sign(dx);
    if (want !== dir) { if (dir) key('keyup', dir < 0 ? 'ArrowLeft' : 'ArrowRight'); if (want) key('keydown', want < 0 ? 'ArrowLeft' : 'ArrowRight'); dir = want; }
  }, 30);
};
const shot = (pg, name) => pg.screenshot({ path: path.join(OUT, name + '.png') });
const cue = (pg, fn, a) => pg.evaluate(([f, x]) => Ludus.games.find(g => g.id === 'sparkhop')._cue[f](x), [fn, a]);
(async () => {
  const browser = await L.launch();
  try {
    for (const dark of [false, true]) {
      const t = dark ? 'dark' : 'light';
      for (let m = 0; m < MODES.length; m++) {
        const mode = MODES[m], pg = await newPage(browser, null, { size: { width: 430, height: 780 }, dark });
        await pg.evaluate(() => { window.__ludusTestMuted = true; Ludus.state.reduceMotion = false; Ludus.state.sound = false; window.ludusOpenGame('sparkhop'); });
        await wait(900);
        await cue(pg, 'pick', mode);
        await wait(600);
        check(`${t} ${mode}: picked`, (await peek(pg)).mode === mode);
        await shot(pg, `${mode}-${t}-start`);
        await pg.keyboard.press('ArrowLeft'); await pg.evaluate(BOT);
        let top = 0, y0 = (await peek(pg)).y, minY = y0, first = true, seen = { gust: false };
        for (let i = 0; i < 90; i++) {
          await wait(100); const v = await peek(pg);
          if (v.state !== 'play') break;
          if (first) { minY = Math.min(minY, v.y); if (v.vy > 0 && v.y > minY + 4) { first = false; top = y0 - minY; } }
          if (v.gust) seen.gust = true;
          if (mode === 'storm' && i === 30) { await cue(pg, 'warn'); await wait(250); await shot(pg, `${mode}-${t}-warn`); }
          if (mode === 'storm' && i === 34) { const b = await peek(pg); await cue(pg, 'strike'); await wait(70); await shot(pg, `${mode}-${t}-bolt`); const a = await peek(pg); check(`${t} storm: a close strike zaps the ball`, a.zapAt > 0, JSON.stringify([b.vx, a.vx, a.flash])); check(`${t} storm: strike is not a fall`, a.state === 'play'); }
          if (mode === 'boost' && i === 22) { await cue(pg, 'give', 'jet'); await wait(350); await shot(pg, `${mode}-${t}-jet`); check(`${t} boost: jet on`, (await peek(pg)).power); }
          if (mode === 'boost' && i === 60) { await cue(pg, 'give', 'bubble'); await cue(pg, 'give', 'coil'); await wait(200); await shot(pg, `${mode}-${t}-coil`); }
          if (i === 45 && mode !== 'boost' && mode !== 'storm') await shot(pg, `${mode}-${t}-play`);
        }
        const v = await peek(pg);
        check(`${t} ${mode}: first bounce reaches the platforms (${top.toFixed(0)})`, top > 140, top);
        check(`${t} ${mode}: bot climbed (${v.height} m)`, v.height >= 10, v.height);
        if (mode === 'storm') check(`${t} storm: wind blows (${v.wind.toFixed(0)})`, Math.abs(v.wind) > 1);
        await shot(pg, `${mode}-${t}-end`);
        await pg.evaluate(() => clearInterval(window.__bot));
        check(`${t} ${mode}: no page errors`, errs([pg]) === 0, pg.errors);
        await pg.context().close();
      }
    }
  } catch (e) { check('test ran to the end', false, String(e.stack || e).slice(0, 600)); }
  await browser.close();
  console.log(`\n${L.results.filter(Boolean).length}/${L.results.length} passed`);
  process.exit(L.results.every(Boolean) ? 0 : 1);
})();
