/* smoothscroll.js. Smooth wheel scrolling for every scrollable list in Ludus (All games, Settings, the room card...), the same
   feel as the Mac Apps website (Lenis: 1.1 s, ease-out quart). Works offline, no library. A game that uses the wheel itself
   (preventDefault) is left alone; so is anything sideways, pinch zoom, and reduced motion (the setting or the system). If the
   page moves the list itself (back to the top, a redraw) while it glides, the glide stops so the page always wins. */
(function () {
  'use strict';
  const DURATION = 1100;
  const ease = t => 1 - Math.pow(1 - t, 4);
  const LINE = 16;
  const root = document.documentElement;
  const calm = () => root.classList.contains('reduce') || root.classList.contains('instant') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const glides = new Map();   // element -> { from, to, start, wrote }

  // nearest element under the pointer that can still scroll that way
  function scroller(start, dy) {
    for (let el = start; el && el !== document.body && el !== root; el = el.parentElement) {
      if (!(el instanceof HTMLElement)) continue;
      const oy = getComputedStyle(el).overflowY;
      if (oy !== 'auto' && oy !== 'scroll') continue;
      const max = el.scrollHeight - el.clientHeight;
      if (max < 1) continue;
      const g = glides.get(el), at = g ? g.to : el.scrollTop;
      if ((dy > 0 && at < max - 0.5) || (dy < 0 && at > 0.5)) return el;
    }
    return null;
  }
  function frame(now) {
    glides.forEach((g, el) => {
      if (Math.abs(el.scrollTop - g.wrote) > 1.5) { glides.delete(el); return; }   // moved by the page: stop gliding
      const t = Math.min(1, (now - g.start) / DURATION);
      const y = g.from + (g.to - g.from) * ease(t);
      el.scrollTop = y; g.wrote = el.scrollTop;
      if (t >= 1) glides.delete(el);
    });
    if (glides.size) requestAnimationFrame(frame);
  }
  document.addEventListener('wheel', e => {
    if (e.defaultPrevented || e.ctrlKey || calm()) return;
    let dy = e.deltaY * (e.deltaMode === 1 ? LINE : e.deltaMode === 2 ? window.innerHeight : 1);
    if (!dy || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const el = scroller(e.target, dy); if (!el) return;
    e.preventDefault();
    const max = el.scrollHeight - el.clientHeight, g = glides.get(el);
    const to = Math.max(0, Math.min(max, (g ? g.to : el.scrollTop) + dy));
    const idle = !glides.size;
    glides.set(el, { from: el.scrollTop, to, start: performance.now(), wrote: el.scrollTop });
    if (idle) requestAnimationFrame(frame);
  }, { passive: false });
  window.ludusSmoothScroll = { active: () => glides.size };   // test hook
})();
