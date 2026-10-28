// Concentric corners on every screen (no network): node QA/harness/run.js QA/harness/corners.js --init QA/harness/corners-lib.js [--size large] [--dark]
// Home (All with a Continue card, every tab, search), the Online page with a Last party, settings, every game's header and
// pause sheet, the game over bar, a sheet (rename). Lobby rooms are in corners-lobby.js (needs the local broker).
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms)), $ = id => document.getElementById(id), out = [];
  document.documentElement.classList.add('reduce');   // settle at once
  const S = Ludus.state; S.reduceMotion = true; S.last = 'dots'; S.plays = { dots: 3, pong: 1 }; S.best = { dots: 2 };
  S.party = { role: 'host', code: 'AB3CD', mine: true, live: false, names: ['Ann', 'Bo', 'Cy'], games: ['dots', 'pong'], at: Date.now() };
  window.ludusSetSystemDark(matchMedia('(prefers-color-scheme: dark)').matches); await wait(400);
  const tab = async t => { [...document.querySelectorAll('#filters .chip')].find(c => c.textContent.trim() === t).click(); await wait(350); };
  for (const t of [...document.querySelectorAll('#filters .chip')].map(c => c.textContent.trim())) { await tab(t); out.push(...__cornerScan('home/' + t)); }
  await tab('All');
  const q = document.querySelector('.search input, #search'); if (q) { q.value = 'dots'; q.dispatchEvent(new Event('input', { bubbles: true })); await wait(350); out.push(...__cornerScan('search')); q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); await wait(200); }
  window.ludusOpenSettings(); await wait(450); out.push(...__cornerScan('settings'));
  document.querySelectorAll('#settings .more-head').forEach(h => h.click()); await wait(450); out.push(...__cornerScan('settings/open'));
  $('settingsBack') ? $('settingsBack').click() : document.querySelector('#settings .icon-btn, #settings button').click(); await wait(300);
  for (const g of Ludus.games) {
    ludusOpenGame(g.id); await wait(350); out.push(...__cornerScan('game/' + g.id));
    if (g === Ludus.games[0] || g.id === 'dots') { $('pauseBtn').click(); await wait(250); out.push(...__cornerScan('pause/' + g.id)); $('resumeBtn').click(); await wait(80); }
    $('backBtn').click(); await wait(150);
  }
  return { pairs: window.__cornerPairs, problems: [...new Set(out)], warnings: [...new Set(window.__cornerWarn || [])].slice(0, 20) };
}
