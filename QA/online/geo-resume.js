// Map Hunt resume regressions (1.7 "blurred map, nothing opens"): a real 1.7 save (result screen, no guess), a corrupt
// save, a photo server that fails, and no internet. The pause / welcome card must always be visible and on top.
const L = require('./lib.js'); const { check, newPage, wait, shot } = L; const fs = require('fs'), path = require('path');
const SAVE = JSON.parse(fs.readFileSync(path.join(__dirname, 'geo-save-1.7.json'), 'utf8'));
const G = p => p.evaluate(() => window.ludusDebug.geo && window.ludusDebug.geo());
const st = p => p.evaluate(() => JSON.parse(ludusState()));
const onTop = (p, sel) => p.evaluate(s => { const b = document.querySelector(s); if (!b || !b.offsetParent) return false; const r = b.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === b || b.contains(h)); }, sel);
const real = es => es.filter(e => !/GL Driver|WebGL|GPU stall|ERR_|net::|Failed to load resource/.test(e));
async function open(b, extra, route) {
  const p = await newPage(b, null, { size: { width: 760, height: 500 } });
  if (route) await p.route(route.re, r => route.fn(r));
  await p.evaluate(x => { const S = JSON.parse(localStorage.getItem('ludus.v1')); Object.assign(S, x); localStorage.setItem('ludus.v1', JSON.stringify(S)); }, extra);
  await p.reload(); await wait(400);
  await p.evaluate(() => window.ludusOpenGame('geoguess')); await wait(1500);
  return p;
}
(async () => {
  const b = await L.chromium ? null : null; const br = await require('playwright-core').chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }).catch(() => L.launch());
  // A: his exact 1.7 save (the stuck "blurred map" state): Map Hunt never resumes now, it opens a fresh game
  let p = await open(br, { saves: { geoguess: SAVE }, geoReset: 1 });
  await p.waitForFunction(() => window.ludusDebug.geo && window.ludusDebug.geo().phase === 'setup', null, { timeout: 30000 }).catch(() => {});
  await wait(600); await shot(p, 'resume_A_fresh');
  check('A: stuck 1.7 save opens a fresh game (setup card, no pause, nothing blurred)', (await G(p)).phase === 'setup' && !(await st(p)).paused && await onTop(p, '.geo-go') && !(await p.evaluate(() => !!document.querySelector('.geo.geo-paused'))), [await G(p), await st(p)]);
  check('A: the old Geo save is gone', !(await st(p)).saved.includes('geoguess'));
  await p.click('.geo-go');
  await p.waitForFunction(() => window.ludusDebug.geo().phase === 'play', null, { timeout: 60000 }).catch(() => {});
  check('A: the round plays with the photo showing', (await G(p)).phase === 'play' && await p.evaluate(() => document.querySelector('.geo-load').hidden && !!document.querySelector('.geo-pano canvas')), await G(p));
  check('A: pause shows the pause card, Resume continues', await (async () => { await p.click('#pauseBtn'); await wait(300); const ok = await onTop(p, '#resumeBtn'); await p.click('#resumeBtn'); await wait(300); return ok && !(await p.evaluate(() => !!document.querySelector('.geo.geo-paused'))); })());
  check('A: nothing is saved mid-game', await p.evaluate(() => window.ludusSnapshot()) === null);
  await shot(p, 'resume_A_play');
  check('A: no page errors', real(p.errors).length === 0, real(p.errors)); await p.context().close();
  // B: the update drops a 1.7 save once
  p = await open(br, { saves: { geoguess: SAVE }, geoReset: 0 });
  await p.waitForFunction(() => window.ludusDebug.geo && window.ludusDebug.geo().phase === 'setup', null, { timeout: 30000 }).catch(() => {});
  check('B: first start after the update: 1.7 save dropped, fresh setup card', (await G(p)).phase === 'setup' && !(await st(p)).paused, [await G(p), await st(p)]);
  await p.context().close();
  // C: corrupt save
  p = await open(br, { saves: { geoguess: { v: 1, cfg: { time: 'x' }, places: 5, round: -3, phase: 'zz' } }, geoReset: 1 });
  await wait(2500);
  check('C: corrupt save: fresh setup card, no pause/blur', (await G(p)).phase === 'setup' && !(await st(p)).paused && await onTop(p, '.geo-go'), [await G(p), await st(p)]);
  check('C: no page errors', real(p.errors).length === 0, real(p.errors)); await p.context().close();
  // D: photo server fails during a resumed round
  const playSave = Object.assign({}, SAVE, { phase: 'play', gs: [], round: 0, left: 40 });
  p = await open(br, { saves: { geoguess: playSave }, geoReset: 1 }, { re: /panoramax/, fn: r => /\/api\/?$/.test(r.request().url()) ? r.continue() : r.abort() });
  await p.waitForFunction(() => window.ludusDebug.geo().phase === 'setup', null, { timeout: 30000 }).catch(() => {});
  await p.click('.geo-go').catch(() => {});
  await p.waitForFunction(() => window.ludusDebug.geo().phase === 'offline', null, { timeout: 120000 }).catch(() => {});
  if ((await st(p)).paused) { await p.click('#resumeBtn'); await wait(400); }
  await wait(500); await shot(p, 'resume_D_failing');
  check('D: failing photo server ends on a visible card with Try again', (await G(p)).phase === 'offline' && await onTop(p, '.geo-card .geo-go'), await G(p));
  check('D: not blurred behind it', !(await p.evaluate(() => !!document.querySelector('.geo.geo-paused'))));
  await p.context().close();
  // E: no internet at all
  p = await open(br, { saves: { geoguess: playSave }, geoReset: 1 }, { re: /panoramax|openfreemap/, fn: r => r.abort() });
  await p.click('#resumeBtn').catch(() => {});
  await p.waitForFunction(() => window.ludusDebug.geo().phase === 'offline', null, { timeout: 60000 }).catch(() => {});
  if ((await st(p)).paused) { await p.click('#resumeBtn'); await wait(400); }
  await wait(800);
  check('E: offline: Needs internet card visible with Try again', (await G(p)).phase === 'offline' && await onTop(p, '.geo-card .geo-go'), await G(p));
  await shot(p, 'resume_E_offline'); console.log('E dbg', JSON.stringify(await p.evaluate(() => { const c = document.querySelector('.geo-card'), e = c.querySelector('h2'), b = c.querySelector('.geo-go'), r = b.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { h2: [getComputedStyle(e).color, getComputedStyle(e).opacity, getComputedStyle(e).visibility, getComputedStyle(c).color], hit: [r.left, r.top, h && h.className, h && h.id] }; }))); await p.context().close();
  await br.close(); const f = L.results.filter(x => !x).length; console.log(`${L.results.length - f}/${L.results.length}`); process.exit(f ? 1 : 0);
})().catch(e => { console.error('THREW', e); process.exit(2); });
