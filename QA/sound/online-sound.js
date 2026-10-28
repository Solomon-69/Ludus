// Room sounds with no internet (in-memory broker): Create room, a friend joining (soft chime), Join room, copy invite.
// node QA/sound/online-sound.js   (needs QA/online/node_modules: playwright-core)
const L = require('../online/lib.js');
const { broker, wait, check, newPage, flexCreate, flexJoin } = L;
(async () => {
  const browser = await L.launch(), br = await broker.start();
  const spy = p => p.evaluate(() => { window.__heard = []; window.__ludusSfxSpy = n => window.__heard.push(n); });
  const heard = p => p.evaluate(() => window.__heard.splice(0));
  const A = await newPage(browser, br, { name: 'Ann' }), B = await newPage(browser, br, { name: 'Bo' });
  await spy(A); await spy(B);
  const c = await flexCreate(A); await wait(300);
  const a1 = await heard(A); check('Create room plays the room sound (and no join chime for yourself)', a1.includes('room') && !a1.includes('friend'), a1);
  await flexJoin(B, c);
  const a2 = [];   // the host's roster update can lag a little behind the guest's screen
  for (let i = 0; i < 25 && !a2.includes('friend'); i++) { await wait(200); a2.push(...await heard(A)); }
  const b2 = await heard(B);
  check('the host hears a soft chime when a friend joins', a2.includes('friend'), a2);
  check('the guest hears the room sound on Join', b2.includes('room'), b2);
  const cb = await A.$('#lobbyCard button:has-text("Copy invite")');
  if (cb) { await A.context().grantPermissions(['clipboard-read', 'clipboard-write']); await cb.click(); await wait(300); const a3 = await heard(A); check('Copy invite plays the copy sound', a3.includes('copy'), a3); }
  else check('Copy invite button found', false);
  await A.evaluate(() => { Ludus.state.sound = false; }); await B.evaluate(() => { Ludus.state.sound = false; });
  const C = await newPage(browser, br, { name: 'Cy' }); await spy(C); await C.evaluate(() => { Ludus.state.sound = false; });
  await flexJoin(C, c); await wait(800);
  const off = [...await heard(A), ...await heard(C)];
  check('Sound off: no room sounds at all', off.length === 0, off);
  const errs = L.errs([A, B, C]); check('no page errors', errs === 0, [A.errors, B.errors, C.errors]);
  await browser.close(); br.close();
  const ok = L.results.every(Boolean); console.log(ok ? 'ALL PASS' : 'FAILED'); process.exit(ok ? 0 : 1);
})();
