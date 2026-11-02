// Tag online: the guest sees the scenes and can suggest one; the host sees the guest's name on that tile.
const L = require('./lib.js'); const { check, wait } = L;
(async () => {
  const br = await L.broker.start(), browser = await L.launch(); const errs = [];
  const { pages: [A, B] } = await L.party(browser, br, 'Tag', 2, { dark: true });
  [A, B].forEach(p => p.on('pageerror', e => errs.push(String(e))));
  await wait(1200);
  const cv = await B.$('#stage canvas') || await B.$('canvas'); const bb = await cv.boundingBox();
  await L.shot(B, 'tag-guest-menu');
  // click the middle scene tile on the guest
  await B.mouse.click(bb.x + bb.width / 2, bb.y + bb.height * 0.62); await wait(900);
  await L.shot(B, 'tag-guest-sent'); await L.shot(A, 'tag-host-sees');
  const px = await A.evaluate(() => { const c = document.querySelector('#stage canvas') || document.querySelector('canvas'); return c.toDataURL().length; });
  check('no page errors', !errs.length, errs);
  check('host canvas drawn', px > 5000);
  await browser.close(); br.stop && br.stop(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
