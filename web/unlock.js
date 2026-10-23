/* Ludus unlock-in: the Apple wake/unlock feel for a set of elements. Each one rises from slightly smaller with a
   springy settle, fading and going from blurred to sharp, staggered in reading order. Transforms, opacity and a short
   blur only; honours reduced motion. Standalone (no dependencies), meant to be copied into other apps' welcome screens.
   LudusUnlock(elements, { stagger: 25, scale: 0.86, blur: 6, stiffness: 260, damping: 20, duration: 620, sweep: container }) */
(function () {
  function springSamples(k, c, n) {   // unit-mass spring from 0 to 1, sampled n+1 times over its settling time
    const w = Math.sqrt(k), z = c / (2 * w), wd = w * Math.sqrt(Math.max(1e-6, 1 - z * z)), out = [];
    for (let i = 0; i <= n; i++) { const t = i / n * 0.62; out.push(i === n ? 1 : 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t))); }
    return out;
  }
  window.LudusUnlock = function (els, o) {
    o = o || {};
    els = Array.from(els || []).filter(Boolean);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduce');
    if (reduce || !els.length || !els[0].animate) return 0;
    const stagger = Math.min(o.stagger || 25, 280 / Math.max(1, els.length - 1)), dur = o.duration || 620;   // total stays under 900 ms
    const s0 = o.scale || 0.86, blur = o.blur === undefined ? 6 : o.blur, N = 22;
    const sp = springSamples(o.stiffness || 260, o.damping || 20, N);
    const frames = sp.map((p, i) => ({
      offset: i / N, opacity: Math.min(1, (i / N) * 4.5),
      transform: `scale(${(s0 + (1 - s0) * p).toFixed(4)})`, filter: `blur(${(blur * Math.max(0, 1 - p * 1.15)).toFixed(2)}px)`,
    }));
    els.forEach((el, i) => el.animate(frames, { duration: dur, delay: i * stagger, fill: 'backwards', easing: 'linear' }));
    if (o.sweep) {   // a gentle light sweep across the container, once
      const host = o.sweep, sw = document.createElement('div');
      sw.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5';
      const band = document.createElement('div');
      band.style.cssText = 'position:absolute;top:-20%;bottom:-20%;width:45%;left:0;background:linear-gradient(100deg,transparent,rgba(255,255,255,.28),transparent);mix-blend-mode:soft-light';
      sw.appendChild(band); if (getComputedStyle(host).position === 'static') host.style.position = 'relative'; host.appendChild(sw);
      const a = band.animate([{ transform: 'translateX(-60%)', opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: 'translateX(260%)', opacity: 0 }], { duration: 760, delay: 80, easing: 'ease-in-out' });
      a.onfinish = () => sw.remove();
    }
    return els.length * stagger + dur;
  };
})();
