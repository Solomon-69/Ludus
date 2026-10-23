// Geo Guess online test: two clients, one room, three rounds against the in-memory relay. Needs internet (Panoramax + map tiles).
// NODE_PATH=<folder with playwright-core> node geo.js [--dark] [--large]
const { chromium } = require('playwright-core');
const L = require('./lib.js');
const { broker, wait, check, newPage, errs, flexCreate, flexJoin, pick, waitPlaying, shot } = L;
const fs = require('fs'), path = require('path');
const dirChrome = path.join(process.env.HOME, 'Library/Caches/ms-playwright'), h = fs.readdirSync(dirChrome).find(x => x.startsWith('chromium_headless_shell'));
const exe = process.env.CHROME || path.join(dirChrome, h, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
const dbg = p => p.evaluate(() => window.ludusDebug.geo());
const phase = (p, ph, ms = 60000) => p.waitForFunction(x => window.ludusDebug.geo && window.ludusDebug.geo() && window.ludusDebug.geo().phase === x, ph, { timeout: ms });
const real = es => es.filter(e => !/GL Driver/.test(e));
(async () => {
  const dark = process.argv.includes('--dark'), size = process.argv.includes('--large') ? { width: 900, height: 640 } : { width: 760, height: 500 };
  const tag = (dark ? 'dark' : 'light') + (size.width === 900 ? '_large' : '');
  const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const br = await broker.start();
  const A = await newPage(browser, br, { name: 'Ann', size, dark }), B = await newPage(browser, br, { name: 'Bo', size, dark });
  const c = await flexCreate(A); await flexJoin(B, c);
  await pick(A, ['Geo Guess'], 1);
  await A.waitForFunction(() => document.querySelectorAll('.seat.on').length === 2, null, { timeout: 9000 });
  await A.click('#lobbyCard button.primary');
  await Promise.all([A, B].map(waitPlaying));
  await Promise.all([A, B].map(p => phase(p, 'setup')));
  await wait(1500);
  const ga = await A.$eval('.geo-card', e => e.innerText), gb = await B.$eval('.geo-card', e => e.innerText);
  check('host sees Start and the pickers', /Start/.test(ga) && /time per round/i.test(ga), ga);
  check('guest sees waiting, no Start', /Waiting for the host/.test(gb) && !/\nStart/.test(gb), gb);
  check('guest chips are disabled', await B.$$eval('.geo-chip', els => els.every(e => e.disabled)));
  await shot(A, `geo_${tag}_setup_host`); await shot(B, `geo_${tag}_setup_guest`);
  await A.click('.geo-chip:text-is("No limit")'); await A.click('.geo-chip:text-is("3")');
  await wait(900);
  const on_ = await B.$$eval('.geo-chip.on', els => els.map(e => e.textContent));
  check('guest sees the host choices live', on_.join() === 'No limit,3', on_);
  await A.click('.geo-go');
  await Promise.all([A, B].map(p => phase(p, 'play')));
  const [da, db] = [await dbg(A), await dbg(B)];
  check('same places and rules on both screens', da.place.id === db.place.id && JSON.stringify(da.order) === JSON.stringify(db.order) && db.cfg.rounds === 3 && db.cfg.time === 0, [da.place, db.place, db.cfg]);
  check('timer hidden with no limit', await A.$eval('.geo-timer', e => e.hidden));
  await wait(800); await shot(A, `geo_${tag}_play_host`);
  const places = [da.place.id];
  const pins = [[[40.4, -3.7], [48.8, 2.3]], [[10, 10], [-30, 140]], [[60, 20], [35, -100]]];
  for (let r = 0; r < 3; r++) {
    if (r > 0) { await Promise.all([A, B].map(p => phase(p, 'play'))); places.push((await dbg(A)).place.id); }
    await A.evaluate(([la, lo]) => ludusGeoTest.pin(la, lo), pins[r][0]);
    await A.click('.geo-guess');
    await phase(A, 'wait');
    if (r === 0) { const w = await A.$eval('.geo-wait', e => e.innerText); check('host waits for Bo', /Waiting for Bo/.test(w), w); await shot(A, `geo_${tag}_wait_host`); }
    await B.evaluate(([la, lo]) => ludusGeoTest.pin(la, lo), pins[r][1]);
    await B.click('.geo-guess');
    await Promise.all([A, B].map(p => phase(p, 'result')));
    const [ra, rb] = await Promise.all([A, B].map(p => p.$eval('.geo-reslist', e => e.innerText.replace(/\s+/g, ' '))));
    check(`round ${r + 1}: both screens list the same two players and scores`, ra === rb && /Ann/.test(ra) && /Bo/.test(ra), [ra, rb]);
    if (r === 0) { await wait(1800); await shot(A, `geo_${tag}_result_host`); await shot(B, `geo_${tag}_result_guest`); }
    await B.click('.geo-next'); await wait(400);
    if (r < 2) check('guest waits for the others after Next', await B.$eval('.geo-next', e => e.disabled));
    await A.click('.geo-next');
  }
  check('three different places', new Set(places).size === 3, places);
  await Promise.all([A, B].map(p => phase(p, 'final')));
  await wait(2500);
  const tbl = p => p.$eval('.geo-final table', e => e.innerText.replace(/\s+/g, ' ').replace(/ \(you\)/g, '')), ttl = p => p.$eval('.geo-final h2', e => e.innerText);
  const fa = await tbl(A), fb = await tbl(B);
  check('winner titles: host "You win", guest "Ann wins"', (await ttl(A)) === 'You win' && (await ttl(B)) === 'Ann wins', [await ttl(A), await ttl(B)]);
  check('final table identical on both', fa === fb, [fa, fb]);
  await shot(A, `geo_${tag}_final_host`); await shot(B, `geo_${tag}_final_guest`);
  console.log('final:', fa);
  check('no page errors', errs([A, B]) === 0 || (real(A.errors).length + real(B.errors).length) === 0, [real(A.errors), real(B.errors)]);
  br.close(); await browser.close();
  process.exit(L.results.every(Boolean) ? 0 : 1);
})().catch(e => { console.error('THREW', e); process.exit(2); });
