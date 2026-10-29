// Sword Duel screenshots: node QA/harness/run.js QA/harness/finalpush-shot.js --size compact|wide --shot out.png [--dark]
async () => { window.ludusDebug = window.ludusDebug || {}; Ludus.state.reduceMotion = true; Ludus.state.saves = {}; window.ludusOpenGame('finalpush'); await new Promise(r => setTimeout(r, 900)); return document.title; }
