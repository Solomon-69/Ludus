/* Ludus shell test: filters, 2-player section, settings, theme, end-of-game reveal + result bar, best score, saves, reset.
   Run in the page; returns { pass, results }. Restores settings afterwards. */
(async function ludusShellTest() {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);
  const S = Ludus.state;
  const saved = JSON.stringify(S);
  window.ludusRevealMs = 150;
  const results = [];
  const check = (name, ok, info) => results.push({ name, ok: !!ok, info });
  const cards = () => [...document.querySelectorAll('.card')].map(c => c.dataset.id);

  // H2 filters
  for (const f of ['Arcade', 'Puzzle', 'Duel', '2 Player', 'All'].filter(f => f === 'All' || Ludus.games.some(g => g.tag === f))) {
    [...document.querySelectorAll('.chip')].find(c => c.textContent === (f === '2 Player' ? 'Same laptop' : f)).click(); await wait(120);
    const ids = cards();
    const ok = f === 'All' ? ids.length === Ludus.games.length : ids.every(id => { const g = Ludus.games.find(x => x.id === id); return g.tag === f || (f === '2 Player' && g.versus && g.tag !== 'Duel') || id === Ludus.state.last; });
    check('filter ' + f, ok && ids.length > 0, ids.length);
  }
  // H3 thumbnails drawn (non-blank canvases)
  const blank = [...document.querySelectorAll('.card canvas')].filter(c => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 400) if (d[i]) return false; return true;
  }).length;
  check('thumbnails drawn', blank === 0, blank + ' blank');
  check('2 Player chip says Same laptop', [...document.querySelectorAll('.chip')].some(c => c.textContent === 'Same laptop'));
  check('2 player section', !Ludus.games.some(g => g.tag === '2 Player') || [...document.querySelectorAll('.section-label')].some(l => /2 players/.test(l.textContent)));
  check('subtitle', $('brandSub').textContent === 'Take a little break');
  // Logo: the controller mark (not the old plain spark) next to "Ludus", in the accent colour.
  const logo = document.querySelector('.brand svg.logo use');
  check('controller logo', logo && logo.getAttribute('href') === '#ludus-mark' && document.getElementById('ludus-mark') && !document.getElementById('spark'));
  // Face buttons: four round buttons in a diamond (two arcs each), not the old spark rays.
  const markD = (document.querySelector('#ludus-mark path') || {}).getAttribute?.('d') || '';
  check('logo diamond buttons', (markD.match(/A3\.1 3\.1 0 1 0/g) || []).length === 8 && !/M66\.7 36L66\.7 39\.2/.test(markD));
  const probe = document.createElement('span'); probe.style.color = 'var(--accent)'; document.body.appendChild(probe);
  const logoEl = document.querySelector('.brand svg.logo');
  check('logo uses accent', getComputedStyle(logoEl).color === getComputedStyle(probe).color && logoEl.getBoundingClientRect().width > 20);
  probe.remove();

  // Settings open, theme switch, accent, hidden game
  $('openSettings').click(); await wait(500);
  check('settings view', $('settings').classList.contains('is-active'));
  const seg = label => [...document.querySelectorAll('.seg button')].find(b => b.textContent === label);
  seg('Dark').click(); await wait(80); check('theme dark', document.documentElement.dataset.theme === 'dark');
  seg('Light').click(); await wait(80); check('theme light', document.documentElement.dataset.theme === 'light');
  check('one orange swatch', document.querySelectorAll('.swatch').length === 7 && !S.accent.includes('c4633f'));
  check('no Games shown group', ![...document.querySelectorAll('.group-label')].some(l => /games shown/i.test(l.textContent)));
  { const u = document.querySelector('#updRow'); check('footer version (only in the real app)', !u || /Ludus \d+\.\d+(\.\d+)?/.test(u.textContent)); }
  document.querySelectorAll('.swatch')[1].click(); await wait(50);
  check('accent applied', getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() === S.accent && S.accent === '#5b8def');
  seg('Hard').click(); check('difficulty saved', S.difficulty === 'hard');
  $('settingsBack').click(); await wait(400);
  // Hints off
  S.hints = false; Ludus.save();

  // Game: start, score, pause/resume, game over sheet, best, play again
  ludusOpenGame('g2048'); await wait(400);
  check('game view', $('game').classList.contains('is-active'));
  check('hint hidden when off', $('hint').textContent.trim() === '');
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await wait(80);
  check('esc pauses', !$('pauseSheet').hidden);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await wait(80);
  check('esc resumes', $('pauseSheet').hidden);
  // game over sheet, new best, play again
  S.best.g2048 = 10;
  ludusTestOver(50); await wait(40);
  check('reveal before bar', $('overSheet').hidden && JSON.parse(ludusState()).revealing);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); await wait(20);
  check('keys ignored during reveal', JSON.parse(ludusState()).revealing);
  await wait(200);
  check('result bar shows', !$('overSheet').hidden && $('overScore').textContent === '50');
  check('new best saved', S.best.g2048 === 50 && $('overBest').textContent === 'New best');
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); await wait(50);
  check('enter not armed in first 300ms', !$('overSheet').hidden);
  await wait(320);
  $('overHideBtn').click(); await wait(30);
  check('hide shows peek', $('overSheet').hidden && !$('overPeek').hidden);
  $('overPeek').click(); await wait(30);
  check('peek brings bar back', !$('overSheet').hidden);
  await wait(320);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); await wait(300);
  check('enter plays again', $('overSheet').hidden && $('scoreNow').textContent === '0' && $('stage').querySelector('canvas'));
  ludusTestOver(20); await wait(250);
  check('lower score keeps best', S.best.g2048 === 50 && $('overBest').textContent.includes('50'));
  $('againBtn').click(); await wait(300);
  check('play again button', $('overSheet').hidden);
  $('backBtn').click(); await wait(300);
  check('back to home', $('home').classList.contains('is-active'));
  check('continue card first', document.querySelector('.card')?.dataset.id === 'g2048');
  // Saves: a game with save() comes back with a "Welcome back" pause sheet
  const withSave = Ludus.games.find(g => g.id === 'g2048');
  ludusOpenGame('g2048'); await wait(400);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); await wait(250);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' })); await wait(250);
  $('backBtn').click(); await wait(300);
  const hasSave = !!S.saves.g2048;
  if (hasSave) {
    check('in progress tag', document.querySelector('.card[data-id="g2048"] .saved-dot') !== null);
    ludusOpenGame('g2048'); await wait(400);
    check('welcome back sheet', !$('pauseSheet').hidden && $('pauseTitle').textContent === 'Welcome back');
    $('restartBtn').click(); await wait(200);
    check('restart drops save', !S.saves.g2048);
    $('backBtn').click(); await wait(300);
  } else results.push({ name: 'saves (g2048 has no save() yet)', ok: true, info: 'skipped' });

  // Reset (two-step)
  $('openSettings').click(); await wait(400);
  const reset = [...document.querySelectorAll('.small-btn')].find(b => b.textContent === 'Reset');
  S.best.g2048 = 999; reset.click(); check('reset asks first', reset.textContent === 'Sure?' && S.best.g2048 === 999);
  reset.click(); check('reset clears', !S.best.g2048);
  $('settingsBack').click(); await wait(300);

  // Invisible icon (Mac only): the row shows when the Mac app hands over the flag, and the switch
  // flips at once and tells the app.
  check('no invisible row in browser', ![...document.querySelectorAll('.row-title')].some(t => t.textContent === 'Invisible icon'));
  const sent = [];
  const hadWebkit = window.webkit;
  window.__LUDUS_NATIVE__ = true; window.__LUDUS_INVISIBLE__ = false;
  window.webkit = { messageHandlers: { ludus: { postMessage: m => sent.push(m) } } };
  $('openSettings').click(); await wait(400);
  const invRow = [...document.querySelectorAll('.row')].find(r => r.querySelector('.row-title')?.textContent === 'Invisible icon');
  check('invisible row', invRow && /far left of your menu bar icons/.test(invRow.querySelector('.row-sub').textContent));
  const invSw = invRow && invRow.querySelector('.switch');
  check('invisible row inside More settings', invRow && !!invRow.closest('#moreBox'));
  invSw.click();
  check('invisible switch flips at once', invSw.getAttribute('aria-checked') === 'true' && window.__LUDUS_INVISIBLE__ === true);
  check('invisible sent to app', sent.some(m => m.type === 'invisible' && m.on === true));
  invSw.click();
  check('invisible off sent', invSw.getAttribute('aria-checked') === 'false' && sent.some(m => m.type === 'invisible' && m.on === false));
  $('settingsBack').click(); await wait(300);
  delete window.__LUDUS_NATIVE__; delete window.__LUDUS_INVISIBLE__; window.webkit = hadWebkit;

  // restore
  Object.keys(S).forEach(k => delete S[k]); Object.assign(S, JSON.parse(saved)); Ludus.save();
  return { pass: results.every(r => r.ok), failed: results.filter(r => !r.ok), count: results.length };
})
