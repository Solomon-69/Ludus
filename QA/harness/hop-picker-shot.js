// Sky Hop start screen (Classic / Monsters picker): node QA/harness/run.js QA/harness/hop-picker-shot.js --size compact --shot out.png [--dark]
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  Ludus.state.reduceMotion = true; Ludus.state.hopMode = 'monsters';
  window.ludusOpenGame('sparkhop'); await wait(900);
  return 'ok';
}
