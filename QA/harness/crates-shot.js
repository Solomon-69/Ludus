// Crate Push screenshots: node QA/harness/run.js QA/harness/crates-shot.js --size compact --shot out.png   (add --init file to pick a level, see crates-shot-*.js)
async () => { window.ludusDebug = window.ludusDebug || {}; Ludus.state.reduceMotion = true; Ludus.state.saves = {}; window.ludusOpenGame('crates'); await new Promise(r => setTimeout(r, 700));
  const q = new URLSearchParams(location.search); window.ludusDebug.cratesJump(+(window.__cb || 0), +(window.__ci || 0)); await new Promise(r => setTimeout(r, 400)); return window.ludusDebug.crates().n; }
