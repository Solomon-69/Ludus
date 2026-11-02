// Map Hunt + Clue Spotter online: the guest sees the setup choices and can suggest one; the host sees the guest's name on it.
const L = require('./lib.js'); const { check, wait } = L;
const GAMES = [
  { name: 'Map Hunt', slug: 'geo', chip: '.geo-chip', badge: '.geo-sug', pick: 'No move', size: { width: 720, height: 560 } },
  { name: 'Clue Spotter', slug: 'clue', chip: '.lk-chip', badge: '.lk-sug', pick: 'Europe', size: { width: 400, height: 600 } },
];
(async () => {
  const br = await L.broker.start(), browser = await L.launch();
  for (const g of GAMES) for (const dark of [false, true]) {
    const tag = g.slug + (dark ? '-dark' : '-light'), errs = [];
    const { pages: [A, B] } = await L.party(browser, br, g.name, 2, { dark, size: g.size });
    [A, B].forEach(p => p.on('pageerror', e => errs.push(String(e))));
    const chipSel = `${g.chip}:has-text("${g.pick}")`;
    await B.waitForSelector(chipSel, { timeout: 30000 }); await A.waitForSelector(chipSel, { timeout: 30000 }); await wait(600);
    check(tag + ': guest chips are tappable', await B.$eval(chipSel, b => !b.disabled));
    check(tag + ': no "host is choosing" text', !/host is choosing/i.test(await B.evaluate(() => document.body.innerText)));
    await L.shot(B, tag + '-guest-menu');
    await B.click(chipSel); await wait(1200);
    const mine = await B.$eval(chipSel, b => (b.querySelector('[class$="-sug"]') || {}).textContent || '');
    check(tag + ': guest sees Your pick', mine === 'Your pick', mine);
    const theirs = await A.$eval(chipSel, b => (b.querySelector('[class$="-sug"]') || {}).textContent || '');
    check(tag + ': host sees Bo on the chip', theirs === 'Bo', theirs);
    const on = await A.$eval(chipSel, b => b.classList.contains('on'));
    check(tag + ': suggestion does not change the host choice', !on);
    await L.shot(B, tag + '-guest-sent'); await L.shot(A, tag + '-host-sees');
    check(tag + ': no page errors', !errs.length, errs);
    await A.context().close(); await B.context().close();
  }
  await browser.close(); br.stop && br.stop();
  process.exit(L.results.every(Boolean) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
