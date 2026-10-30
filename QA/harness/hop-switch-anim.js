// Tapping Monsters/Classic on the Sky Hop start screen slides the thumb (positions differ across frames)
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  Ludus.state.reduceMotion = false; Ludus.state.hopMode = 'classic';
  window.ludusOpenGame('sparkhop'); await wait(900);
  const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0]; const r = c.getBoundingClientRect();
  const k = r.width / 300; // WW is the logical width; box spans centre +/-110 at y 44..80
  const shots = [];
  const grab = () => { const x = c.getContext('2d').getImageData(0, 0, c.width, c.height); return x; };
  const probe = () => { const g = c.getContext('2d'); const sx = c.width / (r.width / (r.width / c.width)) ; return c.toDataURL().length; };
  c.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width * 0.653, clientY: r.top + r.height * 0.135, bubbles: true }));
  const sig = [];
  for (let i = 0; i < 6; i++) { await wait(40); sig.push(c.toDataURL().slice(-400)); }
  const distinct = new Set(sig).size;
  return { distinct, mode: Ludus.state.hopMode };
}
