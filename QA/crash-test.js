// Crash failsafe: a game that throws in its loop, in input, at start, or freezes gets the recovery card on top with
// Try again / New game / Back to games, and no raw error text. Run with QA/online/run.js QA/crash-test.js
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms)), $ = id => document.getElementById(id), out = [];
  const onTop = id => { const b = $(id); if (!b || b.hidden || !b.offsetParent) return false; const r = b.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === b || b.contains(h)); };
  const card = () => !$('crashSheet').hidden && onTop('crashRetry') && onTop('crashNew') && onTop('crashBack') && !/Error|TypeError|undefined|stack/.test($('crashSheet').innerText);
  const open = async id => { window.ludusOpenGame(id); await wait(1500); };
  // 1. a loop that throws (snake)
  await open('snake');
  const g = Ludus.games.find(x => x.id === 'snake'), orig = g.create;
  // break the running game's frame: wrap requestAnimationFrame callbacks to throw once
  window.ludusCrashTest('loop'); await wait(300);
  out.push(['loop crash shows card', card()]);
  $('crashRetry').click(); await wait(1200);
  out.push(['try again restarts the game', $('crashSheet').hidden && JSON.parse(ludusState()).view === 'game']);
  // 2. a game whose create() throws
  g.create = () => { throw new Error('boom'); };
  $('backBtn').click(); await wait(500); await open('snake');
  out.push(['start crash shows card', card()]);
  g.create = orig;
  $('crashNew').click(); await wait(1200);
  out.push(['new game works', $('crashSheet').hidden && !!document.querySelector('#stage canvas')]);
  // 3. a real throw from a game's input handler
  const g2 = Ludus.games.find(x => x.id === 'g2048'), o2 = g2.create;
  g2.create = (stage, api) => { const inst = o2(stage, api); api.keys(() => { throw new Error('input boom'); }); return inst; };
  $('backBtn').click(); await wait(500); await open('g2048');
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); await wait(300);
  out.push(['input crash shows card', card()]);
  out.push(['pause button does not hide it', ($('pauseBtn').click(), await wait(200), card())]);
  $('crashBack').click(); await wait(600);
  out.push(['back to games', JSON.parse(ludusState()).view === 'home' && $('crashSheet').hidden]);
  g2.create = o2;
  out.push(['error logged locally', JSON.parse(localStorage.getItem('ludus.errors') || '[]').length >= 3]);
  return { pass: out.every(x => x[1]), out };
}
