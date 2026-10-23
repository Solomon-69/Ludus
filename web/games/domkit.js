/* Small helpers for the games that are built from page elements instead of a canvas (Meta Spotter, Tongue Twister,
   Mosaic Hunt): load a data file on demand, make elements, add a style sheet once, and a type-ahead answer box.
   Everything is offline: data files sit next to the game under games/<id>/ and load with a plain script tag,
   which works under file:// on Mac and Windows. */
(function () {
  const loaded = {};
  function loadScript(src) {
    return loaded[src] || (loaded[src] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => res();
      s.onerror = () => { delete loaded[src]; s.remove(); rej(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    }));
  }
  // Data files register themselves on window.LudusData[id]; resolves with that value.
  async function loadData(id, file) {
    const box = window.LudusData || {};
    if (box[id]) return box[id];
    await loadScript(file);
    const v = (window.LudusData || {})[id];
    if (!v) throw new Error('Data missing for ' + id);
    return v;
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }
  const css = {};
  function style(id, text) {
    if (css[id] || document.getElementById(id)) { css[id] = true; return; }
    const s = document.createElement('style'); s.id = id; s.textContent = text; document.head.appendChild(s); css[id] = true;
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  // Fisher-Yates with a chosen random source (shared stream online, Math.random otherwise).
  function shuffle(arr, rnd) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor((rnd || Math.random)() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* Type-ahead: an input plus a list of up to `max` matches shown under it. find(query) returns items,
     label(item) / sub(item) give the text, pick(item) is called with the chosen one. Arrow keys move, Enter picks. */
  function typeahead(parent, opts) {
    const wrap = el('div', 'lk-ta');
    const row = el('div', 'lk-ta-row');
    const input = el('input', 'lk-ta-in');
    input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false; input.placeholder = opts.placeholder || 'Type to search';
    input.setAttribute('aria-label', opts.placeholder || 'Your answer');
    const go = el('button', 'lk-btn lk-primary', opts.button || 'Guess');
    row.append(input, go);
    const list = el('div', 'lk-ta-list'); list.setAttribute('role', 'listbox');
    wrap.append(row, list); parent.appendChild(wrap);
    let items = [], sel = -1;
    function render() {
      list.innerHTML = '';
      items.forEach((it, i) => {
        const d = el('button', 'lk-ta-item' + (i === sel ? ' on' : ''));
        d.type = 'button'; d.setAttribute('role', 'option');
        d.appendChild(el('span', '', opts.label(it)));
        const s = opts.sub ? opts.sub(it) : '';
        if (s) d.appendChild(el('small', '', s));
        d.onpointerdown = e => { e.preventDefault(); choose(it); };
        list.appendChild(d);
      });
    }
    function update() { const q = input.value; items = q.trim() ? opts.find(q).slice(0, opts.max || 4) : []; sel = items.length ? 0 : -1; render(); }
    function choose(it) { if (!it) return; input.value = ''; items = []; sel = -1; render(); opts.pick(it); }
    input.addEventListener('input', update);
    input.addEventListener('keydown', e => {
      e.stopPropagation();   // typing never reaches the game's own keys
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!items.length) return; e.preventDefault();
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; render();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (sel >= 0) choose(items[sel]); else if (opts.onEmptyEnter) opts.onEmptyEnter();
      } else if (e.key === 'Escape') { input.blur(); }
    });
    go.onclick = () => { if (sel >= 0) choose(items[sel]); else { const m = input.value.trim() ? opts.find(input.value) : []; if (m.length) choose(m[0]); } };
    return {
      el: wrap, input,
      focus() { try { input.focus({ preventScroll: true }); } catch (e) {} },
      clear() { input.value = ''; items = []; sel = -1; render(); },
      set disabled(v) { input.disabled = !!v; go.disabled = !!v; }
    };
  }

  // Shared look for these games: Ludus tokens only, so light and dark follow the app.
  style('ludus-domkit', `
.lk{position:absolute;isolation:isolate;inset:0;display:flex;flex-direction:column;gap:10px;padding:14px 16px 16px;color:var(--ink);font:13px/1.35 var(--font);overflow:hidden;user-select:none;-webkit-user-select:none}
.lk *{box-sizing:border-box}
.lk [hidden]{display:none!important}
.lk-row{display:flex;align-items:center;gap:8px;min-width:0}
.lk-grow{flex:1;min-width:0}
.lk-chip{min-height:30px;padding:0 12px;border-radius:999px;border:0;background:var(--surface-2);color:var(--ink-2);font:650 12px/1 var(--font-round);cursor:pointer;white-space:nowrap;transition:transform .15s var(--spring),background .15s}
.lk-chip:hover{background:var(--bg-2);color:var(--ink)}
.lk-chip:active{transform:scale(.96)}
.lk-chip.on{background:var(--ink);color:var(--surface)}
.lk-chip:disabled{opacity:.5;cursor:default}
.lk-btn{height:40px;padding:0 16px;border-radius:12px;border:1.5px solid var(--line);background:var(--surface);color:var(--ink);font:700 14px/1 var(--font-round);cursor:pointer;transition:transform .15s var(--spring),background .15s,border-color .15s}
.lk-btn:hover:not(:disabled){border-color:color-mix(in srgb,var(--ink) 22%,transparent)}
.lk-btn:active:not(:disabled){transform:scale(.97)}
.lk-btn:disabled{opacity:.45;cursor:default}
.lk-primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.lk-primary:hover:not(:disabled){border-color:var(--accent);filter:brightness(1.05)}
.lk-label{font:650 11px/1 var(--font);letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.lk-muted{color:var(--ink-2)}
.lk-opt{display:flex;align-items:center;gap:10px;width:100%;min-height:42px;padding:6px 14px;border-radius:12px;border:1.5px solid var(--line);background:var(--surface);color:var(--ink);font:700 15px/1.1 var(--font-round);cursor:pointer;text-align:left;transition:transform .15s var(--spring),background .15s,border-color .15s,color .15s}
.lk-opt .n{font:650 12px/1 var(--font);color:var(--ink-3);width:12px;flex:none}
.lk-opt .t{flex:1;min-width:0;overflow-wrap:anywhere;text-align:center;padding-right:22px}
.lk-opt:hover:not(:disabled){border-color:color-mix(in srgb,var(--ink) 22%,transparent)}
.lk-opt:active:not(:disabled){transform:scale(.98)}
.lk-opt:disabled{cursor:default}
.lk-opt.right{background:var(--good);border-color:var(--good);color:#fff}
.lk-opt.right .n{color:rgba(255,255,255,.8)}
.lk-opt.wrong{background:var(--bad);border-color:var(--bad);color:#fff}
.lk-opt.wrong .n{color:rgba(255,255,255,.8)}
.lk-opt.dim{opacity:.55}
.lk-card{background:var(--surface-2);border-radius:var(--r-md);padding:14px}
.lk-sheet{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;padding:16px;background:color-mix(in srgb,var(--surface) 70%,transparent);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.lk-sheet>.lk-panel{width:100%;max-width:400px;max-height:100%;overflow:auto;background:var(--surface);border-radius:var(--r-lg);box-shadow:var(--shadow-lift);padding:18px;display:flex;flex-direction:column;gap:10px}
.lk-panel h2{margin:0;font:800 20px/1.15 var(--font-round);letter-spacing:-.01em}
.lk-panel p{margin:0}
.lk-chips{display:flex;flex-wrap:wrap;gap:6px}
.lk-ta{position:relative;display:flex;flex-direction:column;gap:6px}
.lk-ta-row{display:flex;gap:8px}
.lk-ta-in{flex:1;min-width:0;height:42px;border-radius:12px;border:1.5px solid var(--line);background:var(--surface);color:var(--ink);padding:0 14px;font:600 15px var(--font);outline:none;user-select:text;-webkit-user-select:text}
.lk-ta-in:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.lk-ta-list{display:flex;flex-direction:column;gap:4px}
.lk-ta-item{display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:34px;padding:5px 12px;border-radius:10px;border:0;background:var(--surface-2);color:var(--ink);font:600 13.5px var(--font);cursor:pointer;text-align:left}
.lk-ta-item small{color:var(--ink-3);font-weight:500;text-align:right}
.lk-ta-item.on,.lk-ta-item:hover{background:var(--accent-soft)}
.lk-hearts{display:flex;gap:3px}
.lk-hearts svg{width:16px;height:16px;transition:transform .25s var(--spring),opacity .25s}
.lk-hearts svg.lost{opacity:.22;transform:scale(.8)}
.lk-scroll{overflow:auto;min-height:0;overscroll-behavior:contain}
.lk-seats{display:flex;gap:6px;flex-wrap:wrap}
.lk-seat{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:999px;background:var(--surface-2);font:650 11.5px/1 var(--font);color:var(--ink-2);white-space:nowrap}
.lk-seat u{width:8px;height:8px;border-radius:50%;flex:none}
.lk-seat b{color:var(--ink);font-variant-numeric:tabular-nums}
.lk-seat.done{box-shadow:inset 0 0 0 1.5px var(--good)}
.lk-bar{height:4px;border-radius:2px;background:var(--surface-2);overflow:hidden}
.lk-bar i{display:block;height:100%;background:var(--accent);border-radius:2px;transform-origin:left;transition:background .2s}
.lk-bar i.low{background:var(--bad)}
.lk-spin{width:26px;height:26px;border-radius:50%;border:3px solid var(--surface-2);border-top-color:var(--accent);animation:lk-spin .8s linear infinite;margin:auto}
@keyframes lk-spin{to{transform:rotate(1turn)}}
.lk-pop{animation:lk-pop .32s var(--spring)}
@keyframes lk-pop{from{transform:scale(.94);opacity:0}to{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){.lk *{animation:none!important;transition:none!important}}
`);

  const HEART = '<svg viewBox="0 0 24 24"><path fill="var(--bad)" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 4.3 2.4h2c.7-1.3 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>';
  function hearts(n, max) { const d = el('div', 'lk-hearts'); for (let i = 0; i < max; i++) { d.insertAdjacentHTML('beforeend', HEART); if (i >= n) d.lastChild.classList.add('lost'); } return d; }
  const SEAT_COLORS = ['#d97757', '#5b8def', '#4f9d69', '#9b6dd6'];

  Ludus.dom = { loadScript, loadData, el, style, esc, norm, shuffle, typeahead, hearts, SEAT_COLORS };
})();
