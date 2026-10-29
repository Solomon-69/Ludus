// Chess screen for a screenshot: node QA/harness/run.js QA/harness/chess-shot.js --size compact --shot out.png [--dark]
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  window.ludusDebug = window.ludusDebug || {};
  Ludus.state.reduceMotion = true; Ludus.state.chessTime = 5; Ludus.state.chessLevel = 1; Ludus.state.chessNextSide = 1;
  window.ludusOpenGame('chess'); await wait(900);
  window.ludusDebug.chessMove('e2e4'); await wait(900);
  return window.ludusDebug.chess().tc;
}
