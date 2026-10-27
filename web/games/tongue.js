/* Tongue Twister: read a sentence and name the language. Six guesses; each wrong guess shows how close it was:
   family, branch, script, speakers (arrow up or down) and distance with a compass arrow toward the answer.
   Solo: three lives, fewer guesses score more. Pass and play: 2 to 4 people take turns guessing the same sentence,
   whoever names it scores. Data: games/tongue/data.js (sentences from the Unicode UDHR collection, families and map
   points from Glottolog); world map tiles in games/tongue/tiles (© OpenStreetMap contributors). */
(function () {
  const K = Ludus.dom;
  const DATA = 'games/tongue/data.js', TILES = 'games/tongue/tiles/';
  const MAX = 6, LIVES = 3, PASS_ROUNDS = 5;
  const POOLS = [['big', 'Well-known'], ['all', 'Every language'], ['rare', 'Smaller ones']];
  const REGIONS = ['', 'Europe', 'Asia', 'Africa', 'Americas', 'Oceania'];
  const RTL = new Set(['Arabic', 'Hebrew', 'Syriac', 'Thaana', 'Nko', 'Adlam']);
  const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  const POINTS = [60, 50, 40, 30, 20, 10];

  // ---------- rules (pure, testable) ----------
  function distKm(a, b) { const R = 6371, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lon - a.lon) * r; const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
  function bearing(a, b) { const r = Math.PI / 180, y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r), x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r); return (Math.atan2(y, x) / r + 360) % 360; }
  const arrow = b => ARROWS[Math.round(b / 45) % 8];
  const fmtN = n => n == null ? '?' : n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n);
  function filterPool(L, pool, region) { return L.filter(l => (!region || l.region === region) && (pool === 'all' || (pool === 'big' ? (l.speakers || 0) >= 1e7 : (l.speakers || 0) < 1e7))); }
  // How a guess compares with the answer, cell by cell: 'hit', 'near' or ''.
  function compare(g, a) {
    const same = g === a, d = same ? 0 : distKm(g, a), sa = a.speakers, sg = g.speakers;
    return {
      family: g.family === a.family ? 'hit' : '',
      branch: g.branch && g.branch === a.branch ? 'hit' : '',
      script: g.script === a.script ? 'hit' : '',
      speakers: same ? 'hit' : (sa && sg && sa / sg < 2 && sg / sa < 2 ? 'near' : ''),
      spArrow: same || !sa || !sg ? '' : (sa > sg ? '↑' : '↓'),
      dist: same ? 'hit' : d < 1000 ? 'near' : '', km: Math.round(d), dir: same ? '' : arrow(bearing(g, a))
    };
  }
  const pointsFor = n => POINTS[Math.max(0, Math.min(MAX, n) - 1)] || 0;
  function match(L, q, exclude) {
    const nq = K.norm(q); if (!nq) return [];
    return L.filter(l => !exclude.includes(l) && (K.norm(l.name).startsWith(nq) || (l.aka || []).some(a => K.norm(a).startsWith(nq)) || K.norm(l.name).includes(' ' + nq)));
  }

  K.style('ludus-tongue', `
.tt .tt-top{flex-wrap:wrap;row-gap:6px}
.tt .tt-status{justify-content:space-between;font:650 12px/1 var(--font);color:var(--ink-2);min-height:18px}
.tt .tt-status b{color:var(--ink)}
.tt-main{position:relative;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:10px}
.tt-left{display:flex;flex-direction:column;gap:8px;flex:none;min-height:0}
.tt-right{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;position:relative}
.tt.side .tt-main{flex-direction:row}
.tt.side .tt-left{flex:1 1 0;min-width:0}
.tt.side .tt-right{flex:1.1 1 0;min-width:0}
.tt-card{background:var(--surface-2);border-radius:var(--r-md);padding:12px 14px;display:flex;flex-direction:column;gap:8px;min-height:0}
.tt-sample{margin:0;font:500 16.5px/1.5 var(--font);color:var(--ink);overflow:auto;max-height:118px;overflow-wrap:anywhere;user-select:text;-webkit-user-select:text;overscroll-behavior:contain}
.tt.side .tt-sample{max-height:none;flex:1 1 auto}
.tt.side .tt-card{flex:1 1 auto}
.tt-sample[dir=rtl]{text-align:right}
.tt-hints{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.tt-hint{display:inline-flex;align-items:center;gap:4px;min-height:22px;padding:2px 8px;border-radius:999px;border:1px dashed color-mix(in srgb,var(--ink) 18%,transparent);color:var(--ink-2);font:600 11px/1.2 var(--font)}
.tt-hint b{color:var(--ink)}
.tt-link{border:0;background:none;padding:2px 4px;color:var(--accent);font:650 11.5px/1.2 var(--font);cursor:pointer}
.tt-link:hover{text-decoration:underline}
.tt-link:disabled{opacity:.4;cursor:default;text-decoration:none}
.tt .lk-ta-list{position:absolute;left:0;right:0;top:48px;z-index:6;padding:4px;border-radius:12px;background:var(--surface);box-shadow:var(--shadow-lift)}
.tt .lk-ta-list:empty{display:none}
.tt.side .lk-ta-list{top:auto;bottom:48px}
.tt-rows{flex:1 1 auto;display:flex;flex-direction:column;gap:6px;padding-bottom:2px}
.tt-row{display:flex;flex-direction:column;gap:4px;padding:7px 8px;border-radius:11px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line)}
.tt-row.win{box-shadow:inset 0 0 0 2px var(--good)}
.tt-row .l1{display:flex;align-items:center;gap:6px;min-width:0}
.tt-row .nm{flex:1;min-width:0;font:750 13.5px/1.2 var(--font-round);overflow-wrap:anywhere}
.tt-row .who{width:8px;height:8px;border-radius:50%;flex:none}
.tt-row .l2{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}
.tt-row .l1 .tt-cell{flex:none}
.tt-cell{display:flex;align-items:center;justify-content:center;gap:3px;min-height:24px;padding:3px 6px;border-radius:7px;background:var(--surface-2);color:var(--ink-2);font:650 11px/1.15 var(--font);text-align:center;overflow-wrap:anywhere}
.tt-cell.hit{background:var(--good);color:#fff}
.tt-cell.near{background:#d4a017;color:#1d1b18}
.tt-cell .ar{font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700}
.tt-empty{flex:1;display:flex;align-items:center;justify-content:center;text-align:center;color:var(--ink-3);font:600 12px/1.4 var(--font);padding:12px}
.tt-legend{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:0 8px 4px;color:var(--ink-3);font:650 10px/1.2 var(--font);letter-spacing:.04em;text-transform:uppercase;text-align:center}
.tt-end{position:absolute;inset:0;z-index:4;display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:max-content;align-content:start;gap:8px;padding:12px;border-radius:var(--r-md);background:var(--surface);box-shadow:inset 0 0 0 1px var(--line),var(--shadow);overflow:auto}
.tt-end h3{margin:0;font:800 18px/1.2 var(--font-round)}
.tt-end h3 em{font-style:normal;color:var(--good)}
.tt-facts{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin:0;font-size:12.5px}
.tt-facts dt{color:var(--ink-3)}.tt-facts dd{margin:0;font-weight:650;overflow-wrap:anywhere}
.tt-map{width:100%;aspect-ratio:2/1;border-radius:10px;display:block;flex:none;background:#aad3df}
.tt-attr{font-size:10px;color:var(--ink-3);margin-top:-4px}
.tt-end .lk-row{justify-content:flex-end}
.tt.side .tt-end{grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);column-gap:16px}
.tt.side .tt-end h3,.tt.side .tt-end .lk-row{grid-column:1/-1}
.tt.side .tt-end .tt-map{grid-column:2;grid-row:2/span 2}
.tt.side .tt-end .tt-attr{grid-column:2}
.tt-turn{display:inline-flex;align-items:center;gap:6px;font:750 12px/1 var(--font-round);color:var(--ink)}
.tt-turn u{width:9px;height:9px;border-radius:50%}
`);

  Ludus.register({
    id: 'tongue', name: 'Tongue Twister', aka: 'guess the language, languages, words, linguistics', tag: 'Puzzle', tint: '#2f5d62',
    hint: 'Type a language, <kbd>↑</kbd><kbd>↓</kbd> to choose, <kbd>Enter</kbd> to guess · six guesses · <kbd>Esc</kbd> pauses',
    _rules: { compare, pointsFor, filterPool, match, distKm, bearing, fmtN },
    art(ctx, w, h) {
      const u = Math.min(h / 78, w / 236);
      const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#36707a'); g.addColorStop(1, '#24525a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const bubble = (x, y, bw, bh, fill, tailLeft) => {
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; Ludus.draw.roundRect(ctx, x + 1.5 * u, y + 2.5 * u, bw, bh, 9 * u); ctx.fill();
        ctx.fillStyle = fill; Ludus.draw.roundRect(ctx, x, y, bw, bh, 9 * u); ctx.fill();
        ctx.beginPath(); const tx = tailLeft ? x + 14 * u : x + bw - 14 * u;
        ctx.moveTo(tx - 5 * u, y + bh - 1); ctx.lineTo(tx + (tailLeft ? -4 : 4) * u, y + bh + 9 * u); ctx.lineTo(tx + 6 * u, y + bh - 1); ctx.closePath(); ctx.fill();
      };
      // Both bubbles are sized from their own words and centred together, so nothing is cut off at any card shape.
      const fs = 16 * u, padX = 12 * u, bh = 30 * u, gap = 14 * u;
      const f1 = `700 ${fs}px -apple-system, "Segoe UI", system-ui, sans-serif`, f2 = `700 ${fs}px "Hiragino Sans", "Yu Gothic", "Noto Sans CJK JP", system-ui, sans-serif`;
      ctx.font = f1; const t1 = ctx.measureText('Hola').width; ctx.font = f2; const t2 = ctx.measureText('こんにちは').width;
      let b1 = t1 + padX * 2, b2 = t2 + padX * 2, total = b1 + gap + b2, k = Math.min(1, (w * 0.9) / total);
      const gh = bh + 20 * u;                       // staggered pair: second bubble sits lower
      ctx.save(); ctx.translate(w / 2, h / 2 - 2 * u); ctx.scale(k, k); ctx.translate(-total / 2, -gh / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      bubble(0, 0, b1, bh, '#fffdf8', true);
      ctx.fillStyle = '#2f5d62'; ctx.font = f1; ctx.fillText('Hola', b1 / 2, bh / 2 + 0.5 * u);
      bubble(b1 + gap, 14 * u, b2, bh, '#f2c94c', false);
      ctx.fillStyle = '#3a2f12'; ctx.font = f2; ctx.fillText('こんにちは', b1 + gap + b2 / 2, 14 * u + bh / 2 + 0.5 * u);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `800 ${20 * u}px ui-rounded, -apple-system, system-ui, sans-serif`; ctx.fillText('?', b1 + gap / 2, bh + 6 * u);
      ctx.restore();
    },
    create(stage, api) {
      const el = K.el;
      let LANGS = null, destroyed = false;
      const S = api.settings;
      const s0 = S.tongue && typeof S.tongue === 'object' ? S.tongue : {};
      let pool = POOLS.some(p => p[0] === s0.pool) ? s0.pool : 'big';
      let region = REGIONS.includes(s0.region) ? s0.region : '';
      let players = [1, 2, 3, 4].includes(s0.players) ? s0.players : 1;
      const remember = () => { S.tongue = { pool, region, players }; Ludus.save(); };

      // ----- DOM -----
      const root = el('div', 'lk tt'); stage.appendChild(root);
      const top = el('div', 'lk-row tt-top'); root.appendChild(top);
      const poolChip = el('button', 'lk-chip'), regionChip = el('button', 'lk-chip'), playChip = el('button', 'lk-chip');
      top.append(poolChip, regionChip, el('span', 'lk-grow'), playChip);
      [poolChip, regionChip, playChip].forEach(b => { b.type = 'button'; b.addEventListener('click', () => b.blur()); });
      const status = el('div', 'lk-row tt-status'); root.appendChild(status);
      const stLeft = el('span', 'lk-grow'), stRight = el('div', 'lk-row'); status.append(stLeft, stRight);
      const main = el('div', 'tt-main'); root.appendChild(main);
      const left = el('div', 'tt-left'), right = el('div', 'tt-right'); main.append(left, right);
      const card = el('div', 'tt-card'); left.appendChild(card);
      const sample = el('p', 'tt-sample'); card.appendChild(sample);
      const hintsRow = el('div', 'tt-hints'); card.appendChild(hintsRow);
      const guessWrap = el('div'); guessWrap.style.position = 'relative'; left.appendChild(guessWrap);
      const ta = K.typeahead(guessWrap, {
        placeholder: 'Type a language, e.g. Swahili', button: 'Guess', max: 4,
        find: q => LANGS ? match(LANGS, q, guesses.map(g => LANGS[g.i])) : [],
        label: l => l.name, sub: l => (l.aka && l.aka[0]) || '', pick: l => guess(l)
      });
      const rowsBox = el('div', 'lk-scroll tt-rows'); right.appendChild(rowsBox);
      const sheet = el('div', 'lk-sheet'); sheet.hidden = true; root.appendChild(sheet);
      const fitSide = () => { const r = stage.getBoundingClientRect(); root.classList.toggle('side', r.width > r.height * 1.25); };
      const ro = new ResizeObserver(() => { fitSide(); if (done) drawMap(); }); ro.observe(stage); fitSide();

      // ----- state -----
      let ans = null, sIdx = 0, guesses = [], done = false, won = false, round = 0, recent = [];
      let lives = LIVES, score = 0, streak = 0, wins = 0;
      let turn = 0, starter = 0, scores = [0, 0, 0, 0], phase = 'boot';
      const pass = () => players > 1;
      const seatName = s => 'Player ' + (s + 1);

      function chips() {
        poolChip.textContent = (POOLS.find(p => p[0] === pool) || POOLS[0])[1];
        regionChip.textContent = region || 'Whole world';
        playChip.textContent = players === 1 ? 'Solo' : `${players} players`;
      }
      // Changing the rules starts a fresh game (a run's score only counts under one set of rules).
      poolChip.onclick = () => { pool = POOLS[(POOLS.findIndex(p => p[0] === pool) + 1) % POOLS.length][0]; remember(); chips(); api.sfx('click'); newGame(); };
      regionChip.onclick = () => { region = REGIONS[(REGIONS.indexOf(region) + 1) % REGIONS.length]; remember(); chips(); api.sfx('click'); newGame(); };
      playChip.onclick = () => { players = players % 4 + 1; remember(); chips(); api.sfx('click'); newGame(); };

      function hud() {
        stRight.innerHTML = '';
        const leftN = MAX - guesses.length;
        if (pass()) {
          stLeft.innerHTML = `Round <b>${round}</b> of ${PASS_ROUNDS}` + (done ? '' : ` · ${leftN} guess${leftN === 1 ? '' : 'es'} left`);
          const row = el('div', 'lk-seats');
          for (let s = 0; s < players; s++) {
            const p = el('span', 'lk-seat' + (!done && s === turn ? ' done' : '')), d = el('u'); d.style.background = K.SEAT_COLORS[s];
            p.append(d, el('span', '', 'P' + (s + 1)), el('b', '', scores[s])); row.appendChild(p);
          }
          stRight.appendChild(row);
        } else {
          stLeft.innerHTML = `Round <b>${round}</b>` + (done ? '' : ` · ${leftN} guess${leftN === 1 ? '' : 'es'} left`);
          stRight.appendChild(K.hearts(lives, LIVES));
        }
        ta.input.placeholder = pass() && !done ? `${seatName(turn)}: type a language` : 'Type a language, e.g. Swahili';
      }
      function showSample() {
        sample.textContent = ans.samples[sIdx] || '';
        sample.dir = RTL.has(ans.script) ? 'rtl' : 'ltr';
        sample.scrollTop = 0;
      }
      function hints() {
        hintsRow.innerHTML = '';
        const wrong = guesses.filter(g => LANGS[g.i] !== ans).length;
        const add = (k, v) => { const h = el('span', 'tt-hint'); h.append(document.createTextNode(k + ': '), el('b', '', v)); hintsRow.appendChild(h); };
        add('Script', ans.script);
        if (wrong >= 3 || done) add('Region', ans.region);
        if (wrong >= 5 || done) add('Family', ans.family);
        if (!done) {
          const more = el('button', 'tt-link', 'Another sentence'); more.type = 'button'; more.hidden = ans.samples.length < 2;
          more.onclick = () => { sIdx = (sIdx + 1) % ans.samples.length; showSample(); api.sfx('click'); };
          const give = el('button', 'tt-link', 'Give up'); give.type = 'button';
          give.onclick = () => { if (!done) { api.sfx('click'); finishRound(false, -1); } };
          hintsRow.append(more, give);
        }
      }
      function cell(cls, text, arrowCh) {
        const c = el('span', 'tt-cell ' + cls); c.appendChild(document.createTextNode(text));
        if (arrowCh) c.appendChild(el('span', 'ar', arrowCh));
        return c;
      }
      function renderRows() {
        rowsBox.innerHTML = '';
        if (!guesses.length) {
          rowsBox.appendChild(el('div', 'tt-empty', pass() ? `${seatName(turn)} starts. Each wrong guess shows how close it was: family, branch, script, speakers and distance.` : 'Each wrong guess shows how close it was: family, branch, script, speakers and distance.'));
          return;
        }
        const lg = el('div', 'tt-legend'); lg.append(el('span', '', 'Family'), el('span', '', 'Branch'), el('span', '', 'Script')); rowsBox.appendChild(lg);
        guesses.slice().reverse().forEach(g => {
          const l = LANGS[g.i], c = compare(l, ans);
          const r = el('div', 'tt-row' + (l === ans ? ' win' : ''));
          const l1 = el('div', 'l1');
          if (pass()) { const d = el('u', 'who'); d.style.background = K.SEAT_COLORS[g.by] || 'var(--ink-3)'; l1.appendChild(d); }
          l1.appendChild(el('span', 'nm', l.name));
          l1.append(cell(c.speakers, fmtN(l.speakers), c.spArrow), cell(c.dist, l === ans ? '0 km' : c.km.toLocaleString() + ' km', c.dir));
          const l2 = el('div', 'l2');
          l2.append(cell(c.family, l.family), cell(c.branch, l.branch || '—'), cell(c.script, l.script));
          r.append(l1, l2); rowsBox.appendChild(r);
        });
        rowsBox.scrollTop = 0;
      }

      function pickLanguage() {
        let p = filterPool(LANGS, pool, region); if (!p.length) p = LANGS;
        let c = p.filter(l => !recent.includes(l.i)); if (!c.length) c = p;
        const a = c[Math.floor(Math.random() * c.length)];
        recent.push(a.i); if (recent.length > Math.min(30, Math.floor(p.length / 2))) recent.shift();
        return a;
      }
      function startRound(a, keep) {
        ans = a; done = false; won = false; phase = 'play';
        if (!keep) { guesses = []; sIdx = Math.floor(Math.random() * ans.samples.length); round++; }
        const old = main.querySelector('.tt-end'); if (old) old.remove();
        guessWrap.hidden = false; ta.clear(); ta.disabled = false;
        showSample(); hints(); renderRows(); hud(); ta.focus();
      }
      function newGame() {
        if (!LANGS) return;
        sheet.hidden = true;
        round = 0; lives = LIVES; score = 0; streak = 0; wins = 0; scores = [0, 0, 0, 0]; starter = 0; turn = 0;
        api.score(0);
        startRound(pickLanguage());
      }
      function guess(l) {
        if (done || !l || !LANGS || guesses.some(g => LANGS[g.i] === l)) return;
        guesses.push({ i: LANGS.indexOf(l), by: turn });
        ta.clear();
        if (l === ans) { finishRound(true, turn); return; }
        api.sfx('move');
        if (guesses.length >= MAX) { finishRound(false, -1); return; }
        if (pass()) turn = (turn + 1) % players;
        hints(); renderRows(); hud(); ta.focus();
      }
      function finishRound(win, who) {
        done = true; won = win; phase = 'end';
        const pts = win ? pointsFor(guesses.length) : 0;
        if (pass()) { if (win) scores[who] += pts; }
        else if (win) { score += pts; streak++; wins++; api.score(score); }
        else { lives--; streak = 0; }
        api.sfx(win ? 'score' : 'over');
        ta.disabled = true; guessWrap.hidden = true;
        hints(); renderRows(); hud(); showEnd(win, who, pts);
      }
      function showEnd(win, who, pts) {
        const box = el('div', 'tt-end lk-pop');
        const h = el('h3');
        if (win) { const em = el('em', '', pass() ? `${seatName(who)} got it!` : 'Yes!'); h.append(em, document.createTextNode(` ${ans.name} in ${guesses.length}. +${pts}`)); }
        else h.textContent = `It was ${ans.name}.`;
        box.appendChild(h);
        const f = el('dl', 'tt-facts');
        const add = (k, v) => { f.append(el('dt', '', k), el('dd', '', v)); };
        if (ans.aka && ans.aka.length) add('Also called', ans.aka.join(', '));
        add('Family', ans.family + (ans.branch ? ' · ' + ans.branch : ''));
        add('Script', ans.script); add('Speakers', ans.speakers ? ans.speakers.toLocaleString() : 'unknown'); add('Region', ans.region);
        box.appendChild(f);
        const cv = el('canvas', 'tt-map'); cv.setAttribute('aria-label', 'Where the language is spoken'); box.appendChild(cv);
        box.appendChild(el('div', 'tt-attr', 'Map © OpenStreetMap contributors'));
        const row = el('div', 'lk-row');
        const last = pass() ? round >= PASS_ROUNDS : lives <= 0;
        const nx = el('button', 'lk-btn lk-primary', last ? 'See result' : 'Next language');
        nx.onclick = () => { api.sfx('click'); next(); };
        row.appendChild(nx); box.appendChild(row);
        main.appendChild(box);
        drawMap();
        try { nx.focus({ preventScroll: true }); } catch (e) {}
      }
      function next() {
        if (!done || phase === 'over') return;
        if (pass()) {
          if (round >= PASS_ROUNDS) return gameOver();
          starter = (starter + 1) % players; turn = starter;
        } else if (lives <= 0) return gameOver();
        startRound(pickLanguage());
      }
      function gameOver() {
        phase = 'over';
        if (pass()) {
          const top = Math.max(...scores.slice(0, players)), win = [];
          for (let s = 0; s < players; s++) if (scores[s] === top) win.push(s);
          api.over({ score: top, won: true, friends: true, title: top === 0 ? 'Nobody scored' : win.length > 1 ? 'A tie' : `${seatName(win[0])} wins`, message: scores.slice(0, players).map((v, s) => `P${s + 1} ${v}`).join(' · ') });
        } else api.over({ score, title: 'Out of lives', message: `${wins} language${wins === 1 ? '' : 's'} named` });
      }

      // ----- little world map -----
      const tiles = [];
      for (let j = 0; j < 4; j++) { tiles.push([]); for (let i = 0; i < 4; i++) { const im = new Image(); im.onload = () => { if (done) drawMap(); }; im.onerror = () => {}; im.src = `${TILES}${i}_${j}.webp`; tiles[j].push(im); } }
      function merc(lat, lon) { const s = Math.sin(lat * Math.PI / 180); return [(lon + 180) / 360 * 1024, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 1024]; }
      function drawMap() {
        const c = main.querySelector('.tt-map'); if (!c || !ans) return;
        const r = c.getBoundingClientRect(); if (!r.width) return;
        const dpr = Math.min(3, window.devicePixelRatio || 1), W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
        if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
        const g = c.getContext('2d'); const [ax, ay] = merc(ans.lat, ans.lon);
        const sc = Math.max(W / 1024, H / 1024, W / 420), w = W / sc, h = H / sc;
        const x0 = Math.min(1024 - w, Math.max(0, ax - w / 2)), y0 = Math.min(1024 - h, Math.max(0, ay - h / 2));
        g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#aad3df'; g.fillRect(0, 0, W, H);
        g.setTransform(sc, 0, 0, sc, -x0 * sc, -y0 * sc);
        tiles.forEach((row, j) => row.forEach((im, i) => { if (im.complete && im.naturalWidth) g.drawImage(im, i * 256, j * 256, 256, 256); }));
        const px = 1 / sc * dpr;
        for (const q of guesses) {
          const l = LANGS[q.i]; if (l === ans) continue;
          const [x, y] = merc(l.lat, l.lon);
          g.strokeStyle = 'rgba(40,40,40,.6)'; g.setLineDash([4 * px, 4 * px]); g.lineWidth = 1.2 * px; g.beginPath(); g.moveTo(x, y); g.lineTo(ax, ay); g.stroke(); g.setLineDash([]);
          g.fillStyle = pass() ? (K.SEAT_COLORS[q.by] || '#6a645a') : '#6a645a'; g.beginPath(); g.arc(x, y, 3.5 * px, 0, 7); g.fill();
        }
        g.fillStyle = '#d13b3b'; g.strokeStyle = '#fff'; g.lineWidth = 2 * px; g.beginPath(); g.arc(ax, ay, 6 * px, 0, 7); g.fill(); g.stroke();
      }

      // ----- keys -----
      api.keys(e => {
        if (phase === 'end' && (e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); next(); return; }
        if (phase === 'play' && document.activeElement !== ta.input && e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey) {
          e.preventDefault(); ta.focus(); ta.input.value += e.key; ta.input.dispatchEvent(new Event('input'));   // start typing anywhere
        }
      });

      // ----- save and restore -----
      function snapshot() {
        if (destroyed || !LANGS || !ans || phase === 'over' || phase === 'boot') return null;
        if (!pass() && phase === 'end' && lives <= 0) return null;
        if (pass() && phase === 'end' && round >= PASS_ROUNDS) return null;
        return { v: 1, pool, region, players, ans: ans.i, s: sIdx, g: guesses.map(g => [g.i, g.by]), done, won, round, lives, score, streak, wins, turn, starter, scores: scores.slice(), recent: recent.slice(-30) };
      }
      function restore(s) {
        try {
          if (!s || s.v !== 1 || !Number.isInteger(s.ans) || !LANGS[s.ans] || ![1, 2, 3, 4].includes(s.players)) return false;
          if (!Array.isArray(s.g) || s.g.length > MAX || !s.g.every(x => Array.isArray(x) && Number.isInteger(x[0]) && LANGS[x[0]] && Number.isInteger(x[1]) && x[1] >= 0 && x[1] < s.players)) return false;
          const a = LANGS[s.ans];
          if (s.g.some((x, k) => LANGS[x[0]] === a && k !== s.g.length - 1)) return false;
          if (POOLS.some(p => p[0] === s.pool)) pool = s.pool; if (REGIONS.includes(s.region)) region = s.region; players = s.players;
          round = Math.max(1, s.round | 0); lives = Math.max(0, Math.min(LIVES, s.lives | 0)); score = Math.max(0, s.score | 0);
          streak = Math.max(0, s.streak | 0); wins = Math.max(0, s.wins | 0);
          turn = Math.min(players - 1, Math.max(0, s.turn | 0)); starter = Math.min(players - 1, Math.max(0, s.starter | 0));
          scores = [0, 1, 2, 3].map(k => Math.max(0, (Array.isArray(s.scores) && s.scores[k]) | 0));
          recent = Array.isArray(s.recent) ? s.recent.filter(i => Number.isInteger(i) && LANGS[i]).slice(-30) : [];
          sIdx = Number.isInteger(s.s) && a.samples[s.s] ? s.s : 0;
          guesses = s.g.map(x => ({ i: x[0], by: x[1] }));
          chips(); api.score(pass() ? 0 : score);
          startRound(a, true);
          if (s.done) {
            const win = !!s.won && guesses.length && LANGS[guesses[guesses.length - 1].i] === a;
            done = true; won = win; phase = 'end'; ta.disabled = true; guessWrap.hidden = true;
            hints(); renderRows(); hud(); showEnd(win, win ? guesses[guesses.length - 1].by : -1, win ? pointsFor(guesses.length) : 0);
          }
          if (lives <= 0 && !s.done && !pass()) lives = 1;
          return true;
        } catch (e) { return false; }
      }

      // ----- boot -----
      async function boot() {
        phase = 'boot'; sheet.innerHTML = '<div class="lk-spin"></div>'; sheet.hidden = false;
        try {
          const data = await K.loadData('tongue', DATA);
          if (destroyed) return;
          if (!Array.isArray(data) || !data.length) throw new Error('empty');
          LANGS = data.map((l, i) => Object.assign({}, l, { i }));
          sheet.hidden = true;
          if (!(api.saved && restore(api.saved))) newGame();
        } catch (e) {
          if (destroyed) return;
          phase = 'error'; sheet.innerHTML = ''; const p = el('div', 'lk-panel');
          p.append(el('h2', '', 'Could not load the languages'), el('p', 'lk-muted', 'The language file did not open. Try again.'));
          const b = el('button', 'lk-btn lk-primary', 'Try again'); b.onclick = boot; p.appendChild(b);
          sheet.appendChild(p);
        }
      }
      chips(); boot();

      if (window.ludusDebug) window.ludusDebug.tongue = () => ({ phase, ans: ans && ans.name, ansI: ans && ans.i, guesses: guesses.map(g => [LANGS[g.i].name, g.by]), done, won, round, lives, score, players, turn, scores: scores.slice(0, players) });
      return {
        save: snapshot,
        pause() { try { ta.input.blur(); } catch (e) {} },
        resume() { if (phase === 'play') ta.focus(); },
        destroy() { destroyed = true; try { ro.disconnect(); } catch (e) {} root.remove(); }
      };
    }
  });
})();
