// A mouse press on the game that the page never hears end (let go outside the panel) must not leave every button dead.
// Chromium ends the hold by itself on a move with no button, so this only guards the path; it cannot show the WebKit fault.
// Also: a wrong room code clears at once and says so.
const L = require('./lib.js'); const { check, wait } = L;
const CONTROL = !!process.env.CONTROL;
const press = (c, type, x, y, buttons) => c.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
const centre = (p, sel) => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
const inLobby = p => p.evaluate(() => { const s = window.ludusOnline().session; return !!s && !s.started && !document.getElementById('lobbySheet').hidden; });
(async () => {
  const br = await L.broker.start(), browser = await L.launch();
  const A = await L.newPage(browser, br, { name: 'Ann' }), B = await L.newPage(browser, br, { name: 'Bo' });
  const c = await L.flexCreate(A); await L.flexJoin(B, c);
  await L.pick(A, ['Air Hockey'], 3);
  await A.waitForFunction(() => document.querySelectorAll('.seat.on').length === 2, null, { timeout: 9000 });
  await A.click('#lobbyCard button.primary'); await Promise.all([A, B].map(L.waitPlaying)); await wait(700);
  if (CONTROL) await B.evaluate(() => { Element.prototype.releasePointerCapture = () => {}; });
  const cdp = await B.context().newCDPSession(B);
  const [cx, cy] = await centre(B, '#stage canvas');
  await press(cdp, 'mousePressed', cx, cy, 1); await wait(150);
  check('press holds the pointer on the game', await B.evaluate(() => { const v = document.querySelector('#stage canvas'); return v.hasPointerCapture(1); }));
  await Promise.all([A, B].map((p, k) => p.evaluate(w => ludusForceOver(w), k === 0)));
  await L.waitCard(B, 'Round 2');
  await wait(300);
  await press(cdp, 'mouseMoved', 20, 300, 0); await wait(150);   // the button was let go outside the panel: no release ever arrived
  const [lx, ly] = await centre(B, '#leaveBtn');
  await press(cdp, 'mouseMoved', lx, ly, 0); await wait(80);
  console.log('capture before click:', await B.evaluate(() => { const v = document.querySelector('#stage canvas'); return v ? v.hasPointerCapture(1) : 'no canvas'; }));
  await B.evaluate(() => { window.addEventListener('pointerdown', e => { window.__pd = e.target.id || e.target.tagName; }, true); });
  await press(cdp, 'mousePressed', lx, ly, 1); await wait(60); await press(cdp, 'mouseReleased', lx, ly, 0); await wait(1200);
  console.log('capture still held at click:', await B.evaluate(() => { const v = document.querySelector('#stage canvas'); return v ? v.hasPointerCapture(1) : 'no canvas'; }));
  check('after the round the Leave button takes the click', await inLobby(B));
  if (!CONTROL) {
    const P = await L.newPage(browser, br, { name: 'Cy' }); await L.onlineTab(P);
    const st = () => P.evaluate(() => ({ v: document.getElementById('opCode').value, m: document.querySelector('.online-page .lobby-error').textContent, t: document.querySelectorAll('.code-tile.filled').length }));
    await P.fill('#opCode', 'AB'); await P.click('#opJoin'); await wait(150);
    let s = await st(); check('too short: letters gone at once, says so', s.v === '' && s.t === 0 && /not a room code/.test(s.m), s);
    await P.fill('#opCode', 'hi my old pal is on'); await wait(150);
    s = await st(); check('text with no code: cleared at once, says so', s.v === '' && s.t === 0 && /not a room code/.test(s.m), s);
    await P.fill('#opCode', 'K7M2Q'); const t0 = Date.now(); await P.click('#opJoin');
    await P.waitForFunction(() => /not a room code/.test(document.querySelector('.online-page .lobby-error').textContent), null, { timeout: 25000 });
    s = await st(); check('right shape, no such room: cleared, says so (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)', s.v === '' && s.t === 0, s);
    await L.shot(P, 'wrong-code');
    await P.fill('#opCode', c); await P.click('#opJoin'); await P.waitForFunction(() => !document.getElementById('lobbySheet').hidden, null, { timeout: 12000 }).catch(() => {});
    check('a real code still joins afterwards', await P.evaluate(() => { const o = window.ludusOnline(); return !!(o && o.session); }));
  }
  await browser.close(); br.stop && br.stop(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
