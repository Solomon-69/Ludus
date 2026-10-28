// Hammer Climb: no level menu or level pill, the game starts straight on the mountain; standing on the summit rock
// launches the pot into space (camera follows), then the win screen. Run: node QA/harness/run.js QA/climb-sky.js --shot x.png
// window.__SKYAT = 'rocks' (screenshot among the floating rocks) | 'launch' (mid launch, default)
async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  window.ludusDebug = window.ludusDebug || {}; Ludus.state.introDone = true; window.ludusOpenGame('climb'); await w(800);
  // the climb waits for the first move (1.12.23): a key press starts it
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' })); await w(100);
  for (let i = 0; i < 20 && !(Ludus.games.find(x => x.id === 'climb')._peek().time > 0.3); i++) await w(150);
  const g = Ludus.games.find(x => x.id === 'climb'), pk = g._peek();
  const out = { state0: pk.state, levels: 'DIFFS' in g._rules };
  const wd = pk.world, f = wd.deco.floats;
  if (window.__SKYAT === 'rocks') { pk.teleport(f[3][0], f[3][1] + 17); await w(900); out.where = 'rocks'; out.state = g._peek().state; return out; }
  pk.teleport((wd.summit.x0 + wd.summit.x1) / 2, wd.summit.y + 14); await w(700);
  out.wonState = g._peek().state; out.camY0 = g._peek().cam.y;
  await w(+(window.__SKYWAIT || 1300)); out.camY1 = g._peek().cam.y;
  out.lifted = out.camY1 - out.camY0;
  if (!window.__SKYWAIT) { await w(4200); out.overText = (document.querySelector(".overlay:not([hidden]), .over, #over") || {}).textContent || null; }
  return out;
}
