// Interface sounds: each action plays its own soft sound, the same sound never stacks up, the first tap wakes the audio,
// and with Sound off nothing plays at all. node QA/harness/run.js QA/sound/ui.js --init QA/sound/init.js
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms)), $ = id => document.getElementById(id), L = window.__sfxLog;
  window.ludusRevealMs = 30;
  const heard = async fn => { L.names.length = 0; await fn(); await wait(80); return [...L.names]; };
  const out = {}, fails = [];
  const expect = (label, got, want) => { out[label] = got.join(' '); if (!got.includes(want)) fails.push(`${label}: wanted ${want}, got [${got.join(' ')}]`); };
  // first tap: the audio wakes up (a context is made and resumed)
  const before = L.resumes;
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  if (!(L.created >= 1 && L.resumes > before)) fails.push('first tap did not wake the audio');
  const chips = () => [...$('filters').querySelectorAll('.chip')];
  expect('tab', await heard(async () => { chips()[1].click(); await wait(60); }), 'tab');
  chips()[0].click(); await wait(80);
  expect('open game', await heard(async () => { document.querySelector('.card').click(); await wait(500); }), 'open');
  expect('pause', await heard(async () => { $('pauseBtn').click(); }), 'sheet');
  expect('resume', await heard(async () => { $('resumeBtn').click(); }), 'unsheet');
  expect('result', await heard(async () => { ludusForceOver(true); await wait(300); }), 'result');
  expect('back', await heard(async () => { $('overQuitBtn').click(); await wait(200); }), 'back');
  expect('settings open', await heard(async () => { $('openSettings').click(); await wait(200); }), 'sheet');
  const sw = [...document.querySelectorAll('#settings .switch')].find(b => b.getAttribute('aria-label') !== 'Sound');
  const on = sw.getAttribute('aria-checked') === 'true';
  expect('toggle', await heard(async () => { sw.click(); }), on ? 'off' : 'on');
  await wait(60); sw.click(); await wait(60);
  expect('settings close', await heard(async () => { $('settingsBack').click(); await wait(200); }), 'back');
  expect('toast', await heard(async () => { ludusToast('Hello'); }), 'toast');
  // rename sheet: opens with a soft sound, Save confirms
  Ludus.state.renameGames = true; ludusOpenGame('g2048'); await wait(300);
  expect('rename open', await heard(async () => { document.querySelector('#gameName .rename-name').click(); await wait(60); }), 'sheet');
  expect('rename save', await heard(async () => { [...document.querySelectorAll('.rename-sheet button')].find(b => b.textContent === 'Save').click(); }), 'save');
  Ludus.state.renameGames = false; $('backBtn').click(); await wait(200);
  expect('panel open', await heard(async () => { ludusOpened(); }), 'panel');
  expect('panel close', await heard(async () => { ludusClosed(); }), 'panelOff');
  // new best on a game's result
  Ludus.state.best.g2048 = 0; ludusOpenGame('g2048'); await wait(300);
  expect('new best', await heard(async () => { ludusTestOver(500); await wait(300); }), 'best');
  $('overQuitBtn').click(); await wait(200);
  // no spam: the same sound 20 times in a row is heard once
  const spam = await heard(async () => { for (let i = 0; i < 20; i++) Ludus.sfx('toast'); });
  if (spam.length !== 1) fails.push('20 toasts in a row played ' + spam.length + ' times');
  const burst = await heard(async () => { ['tap', 'click', 'move', 'merge', 'score', 'eat', 'jump', 'drop', 'line', 'hit'].forEach(n => Ludus.sfx(n)); });
  if (burst.length > 6) fails.push('a burst of 10 different sounds played ' + burst.length);
  // Sound off: the whole tour again, nothing plays
  await wait(700);
  Ludus.state.sound = false;
  const t0 = L.tones;
  const silent = await heard(async () => {
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    chips()[1].click(); await wait(50); chips()[0].click(); await wait(50);
    document.querySelector('.card').click(); await wait(400); $('pauseBtn').click(); $('resumeBtn').click(); ludusForceOver(true); await wait(300);
    $('overQuitBtn').click(); await wait(150); $('openSettings').click(); await wait(150); $('settingsBack').click(); await wait(150);
    ludusOpened(); ludusClosed(); Ludus.sfx('win');
  });
  if (silent.length || L.tones !== t0) fails.push('Sound off still played: ' + silent.join(' ') + ' tones ' + (L.tones - t0));
  Ludus.state.sound = true;
  return { fails, heard: out };
}
