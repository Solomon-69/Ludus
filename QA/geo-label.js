// Geo Guess: no text cut off. The pin bar shows the whole sentence only when it fits, else "Place your pin".
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  window.ludusDebug = window.ludusDebug || {}; window.ludusOpenGame('geoguess'); await wait(1500);
  for (let i = 0; i < 40 && !(window.ludusDebug && ludusDebug.geo && ludusDebug.geo().phase === 'setup'); i++) await wait(500);
  document.querySelector('.geo-go').click();
  for (let i = 0; i < 60 && ludusDebug.geo().phase !== 'play'; i++) await wait(500);
  const b = document.querySelector('.geo-guess'), fits = () => b.scrollWidth <= b.clientWidth + 1;
  const closed = { text: b.textContent, fits: fits() };
  document.querySelector('.geo-mini').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' })); await wait(700);
  const open = { text: b.textContent, fits: fits() };
  return { pass: closed.fits && open.fits, closed, open };
}
