/* The Decider: rock, paper, scissors against the computer. First to 3 rounds takes the match.
   Score = matches won in a row. The run ends when the computer takes a match. */
(function () {
  const MOVES = ['rock', 'paper', 'scissors'];
  const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
  const COUNTER = { rock: 'paper', paper: 'scissors', scissors: 'rock' };
  const LABEL = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };
  const TARGET = 3;
  const PINK = '#e05d8b';

  // ---------- the computer's brain (pure, no drawing) ----------
  // Each strategy predicts the player's next move from history and plays the counter.
  // Strategies are scored on how they would have done; the best recent one is used.
  function makeBrain(level, rnd) {
    rnd = rnd || Math.random;
    const hist = [];      // player's moves
    const comp = [];      // computer's moves
    const res = [];       // player's result each round: 'w', 'l', 't'
    const rot = (m, n) => { for (let i = 0; i < n; i++) m = COUNTER[m]; return m; };
    const pickMax = counts => {
      let best = null, bv = 0;
      MOVES.forEach(m => { if (counts[m] > bv + 1e-9) { bv = counts[m]; best = m; } });
      return best;
    };
    const predictors = {
      freq() {
        const c = { rock: 0, paper: 0, scissors: 0 }; let wgt = 1;
        for (let i = hist.length - 1; i >= 0; i--) { c[hist[i]] += wgt; wgt *= 0.9; }
        return hist.length ? pickMax(c) : null;
      },
      m1() { return markov(1); },
      m2() { return markov(2); },
      // Win-stay, lose-shift: people repeat a winner and switch after a loss.
      wsls() {
        if (!hist.length) return null;
        const last = hist[hist.length - 1], r = res[res.length - 1];
        if (r === 'w') return last;
        if (r === 'l') return COUNTER[comp[comp.length - 1]];
        return COUNTER[last];
      }
    };
    function markov(k) {
      if (hist.length <= k) return null;
      const key = hist.slice(-k).join();
      const c = { rock: 0, paper: 0, scissors: 0 }; let seen = 0;
      for (let i = k; i < hist.length; i++) {
        if (hist.slice(i - k, i).join() === key) { c[hist[i]] += 1 + i / hist.length; seen++; }
      }
      return seen ? pickMax(c) : null;
    }
    const names = level >= 2 ? ['freq', 'm1', 'm2', 'wsls'] : ['freq', 'm1'];
    const strategies = [];
    names.forEach(n => { for (let r = 0; r < (level >= 2 ? 3 : 1); r++) strategies.push({ n, r, score: 0, move: null }); });
    const noise = [1, 0.25, 0.08][level] ?? 0.25;
    return {
      choose() {
        strategies.forEach(s => { const p = predictors[s.n](); s.move = p ? rot(COUNTER[p], s.r) : null; });
        if (rnd() < noise) return MOVES[Math.floor(rnd() * 3)];
        let best = null;
        strategies.forEach(s => { if (s.move && (!best || s.score > best.score)) best = s; });
        return best ? best.move : MOVES[Math.floor(rnd() * 3)];
      },
      record(player, computer) {
        strategies.forEach(s => {
          s.score *= 0.82;
          if (s.move) s.score += BEATS[s.move] === player ? 1 : BEATS[player] === s.move ? -1 : 0;
        });
        res.push(player === computer ? 't' : BEATS[player] === computer ? 'w' : 'l');
        hist.push(player); comp.push(computer);
      }
    };
  }
  const outcome = (a, b) => (a === b ? 0 : BEATS[a] === b ? 1 : -1);

  // ---------- drawing the three hands ----------
  // Side-on, pointing right (the second player's hand is mirrored). Shapes are filled with the player's colour and
  // separated by thin translucent dark/light lines, so the same drawing reads on light and dark backgrounds.
  function drawHand(ctx, kind, x, y, r, col, ink, flip) {
    const LINE = 'rgba(30,18,12,0.34)', GLOSS = 'rgba(255,255,255,0.38)';
    ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
    ctx.scale(r, r); ctx.translate(0.1, 0);       // unit space: the hand spans about -0.9 .. 0.8
    ctx.fillStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const lw = Math.max(0.03, 1.1 / r);             // keeps separation lines visible on the small button icons
    const cap = (x1, y1, x2, y2, wd) => {            // a capsule (finger / thumb) with its outline
      ctx.lineWidth = wd; ctx.strokeStyle = col;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.lineWidth = lw; ctx.strokeStyle = LINE; ctx.beginPath();
      const a = Math.atan2(y2 - y1, x2 - x1), h = wd / 2;
      ctx.arc(x2, y2, h, a - Math.PI / 2, a + Math.PI / 2); ctx.arc(x1, y1, h, a + Math.PI / 2, a + Math.PI * 1.5);
      ctx.closePath(); ctx.stroke();
    };
    const sleeve = () => {
      ctx.save(); ctx.fillStyle = ink; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(-0.9, -0.34); ctx.lineTo(-0.58, -0.3); ctx.lineTo(-0.58, 0.36); ctx.lineTo(-0.9, 0.4); ctx.closePath(); ctx.fill(); ctx.restore();
    };
    const back = () => {                              // back of the hand / palm block
      ctx.beginPath(); ctx.moveTo(-0.6, -0.3);
      ctx.bezierCurveTo(-0.45, -0.52, 0.1, -0.56, 0.3, -0.46);
      ctx.bezierCurveTo(0.44, -0.3, 0.44, 0.3, 0.3, 0.5); ctx.bezierCurveTo(0.1, 0.56, -0.45, 0.5, -0.6, 0.34); ctx.closePath(); ctx.fill();
    };
    if (kind === 'rock') {
      sleeve(); back();
      // four curled fingers stacked down the front, knuckles to the right
      for (let i = 0; i < 4; i++) {
        const yy = -0.36 + i * 0.235, ex = 0.52 - (i === 3 ? 0.08 : i === 0 ? 0.04 : 0);
        cap(0.02, yy, ex, yy, 0.23);
        ctx.strokeStyle = GLOSS; ctx.lineWidth = 0.035; ctx.beginPath(); ctx.moveTo(0.2, yy - 0.06); ctx.lineTo(ex - 0.1, yy - 0.06); ctx.stroke();
      }
      // thumb wrapped across the front of the fingers
      cap(-0.2, 0.4, 0.4, 0.16, 0.26);
      ctx.strokeStyle = GLOSS; ctx.lineWidth = 0.035; ctx.beginPath(); ctx.moveTo(-0.05, 0.34); ctx.lineTo(0.3, 0.2); ctx.stroke();
    } else if (kind === 'paper') {
      sleeve();
      ctx.beginPath(); ctx.moveTo(-0.6, -0.3); ctx.bezierCurveTo(-0.45, -0.52, -0.1, -0.5, 0.02, -0.42);
      ctx.lineTo(0.02, 0.44); ctx.bezierCurveTo(-0.1, 0.52, -0.45, 0.5, -0.6, 0.34); ctx.closePath(); ctx.fill();
      [[-0.33, 0.7], [-0.11, 0.78], [0.11, 0.72], [0.33, 0.56]].forEach(([yy, ex]) => cap(0.0, yy, ex, yy, 0.2));
      cap(-0.28, -0.38, 0.12, -0.7, 0.22);
      ctx.strokeStyle = LINE; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(-0.3, -0.04); ctx.quadraticCurveTo(-0.15, 0.06, 0.0, 0.0); ctx.stroke();
    } else {
      sleeve(); back();
      // ring and pinky curled, thumb across them, index and middle out in a V
      cap(0.0, 0.2, 0.42, 0.2, 0.2); cap(0.0, 0.4, 0.36, 0.4, 0.2);
      cap(0.15, -0.02, 0.78, -0.5, 0.2);
      cap(0.15, -0.2, 0.8, 0.0, 0.2);
      cap(-0.2, 0.46, 0.28, 0.28, 0.22);
    }
    ctx.restore();
  }

  Ludus.register({
    id: 'decider', name: 'Rock Paper Scissors', aka: 'The Decider', tag: 'Duel', tint: PINK, versus: true, online: { min: 2, max: 2 },
    onlineHint: 'Pick with <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd>, <kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> or a click. Picks are secret until both players have locked in. First to 3',
    hint: 'Pick with <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd>, <kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> or a click. Rock beats scissors, scissors beat paper, paper beats rock. First to 3. vs Friend: secret picks, Player 1 <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>, Player 2 <kbd>J</kbd><kbd>K</kbd><kbd>L</kbd>',
    _rules: { makeBrain, outcome, BEATS, COUNTER }, _hand: drawHand,
    art(ctx, w, h) {
      const r = Math.min(w, h) * 0.36;
      drawHand(ctx, 'rock', w * 0.3, h * 0.52, r, 'rgba(255,255,255,0.95)', '#7a1d43', false);
      drawHand(ctx, 'paper', w * 0.7, h * 0.52, r, 'rgba(255,255,255,0.75)', '#7a1d43', true);
      Ludus.draw.text(ctx, 'VS', w / 2, h * 0.52, r * 0.42, 'rgba(255,255,255,0.85)', 800);
    },
    create(stage, api) {
      const D = Ludus.draw;
      const view = api.canvas();
      const { ctx } = view;
      const brain = makeBrain(api.level);
      const friend = api.friend;
      // Online: seat 0 is the left hand, seat 1 the right. Picks are secret: each screen first sends a fingerprint
      // (SHA-256 of round, seat, pick and a random nonce) and only when both fingerprints are in does it send the pick
      // itself. The other screen checks the pick against the fingerprint, so nobody can change their mind after seeing.
      const on = api.online;
      const mySeat = on ? on.seat : -1, otherSeat = on ? 1 - on.seat : -1;
      const nameOf = left => (on && on.names[left ? 0 : 1]) || (left ? 'Player 1' : 'Player 2');
      let rid = 0, own = null, theirs = { commit: '', pick: '' }, locked = [false, false];
      const hexNonce = () => { const a = new Uint8Array(8); crypto.getRandomValues(a); return Array.from(a, x => x.toString(16).padStart(2, '0')).join(''); };
      const fingerprint = (seat, k, n) => Ludus.net.sha256(rid + ':' + seat + ':' + k + ':' + n);
      let p1 = null, p2 = null;
      let clock = 0, matches = 0, round = 1;
      let pts = { you: 0, cpu: 0 };
      let phase = 'pick', phaseT = 0, lockT = 0;
      let you = null, cpu = null, result = 0, hover = -1, pressed = -1, pressT = -9;
      let banner = null, parts = [], shake = 0;
      const log = [], history = [];
      api.score(0);

      function newRound() {
        phase = 'pick'; phaseT = clock; lockT = friend ? clock : clock + api.rand(0.35, 0.7); you = cpu = null; p1 = p2 = null;
        rid++; own = null; theirs = { commit: '', pick: '' }; locked = [false, false];
      }
      // online: lock my secret pick
      function onlinePick(k) {
        if (phase !== 'pick' || own) return;
        const nonce = hexNonce();
        own = { k, nonce, sent: false }; locked[mySeat] = true; api.sfx('tap');
        on.send('commit', { r: rid, h: fingerprint(mySeat, k, nonce) });
        stepOnline();
      }
      // both fingerprints in: show mine; both picks shown: reveal
      function stepOnline() {
        if (phase !== 'pick' || !own) return;
        if (theirs.commit && !own.sent) { own.sent = true; on.send('reveal', { r: rid, k: own.k, n: own.nonce }); }
        if (own.sent && theirs.pick) {
          const mine = own.k, other = theirs.pick;
          if (mySeat === 0) shakeOut(mine, other, -1); else shakeOut(other, mine, -1);
        }
      }
      // vs Friend: each player locks a secret pick; the hands show only when both are in
      function lockPick(first, k) {
        if (phase !== 'pick') return;
        if (first ? p1 : p2) return;
        if (first) p1 = k; else p2 = k;
        api.sfx('tap');
        if (p1 && p2) shakeOut(p1, p2, -1);
      }
      function choose(k) {
        if (phase !== 'pick') return;
        if (on) { onlinePick(k); return; }
        if (friend) { lockPick(!p1, k); return; }
        lockT = Math.min(lockT, clock);
        shakeOut(k, brain.choose(), MOVES.indexOf(k));
      }
      function shakeOut(a, b, pi) {
        you = a; cpu = b;
        pressed = pi; pressT = clock;
        phase = 'shake'; phaseT = clock; api.sfx('click');
        const dur = api.reduceMotion ? 0.25 : 0.95;
        if (!api.reduceMotion) { api.timeout(() => api.sfx('tick'), 300); api.timeout(() => api.sfx('tick'), 610); }
        api.timeout(reveal, dur * 1000);
      }
      function reveal() {
        phase = 'reveal'; phaseT = clock;
        result = outcome(you, cpu);
        if (!friend) brain.record(you, cpu); history.push([you, cpu]);
        log.unshift({ you, cpu, result }); if (log.length > 4) log.pop();
        if (result > 0) { pts.you++; api.sfx('score'); burst(0.3); }
        else if (result < 0) { pts.cpu++; if (friend) { api.sfx('score'); burst(0.7); } else { api.sfx('hit'); if (!api.reduceMotion) shake = 0.25; } }
        else api.sfx('tap');
        api.timeout(afterReveal, 1100);
      }
      function afterReveal() {
        if (friend && (pts.you >= TARGET || pts.cpu >= TARGET)) {
          const left = pts.you >= TARGET;
          phase = 'done'; api.sfx('win'); burst(left ? 0.3 : 0.7);
          api.timeout(() => api.over({ score: TARGET, won: true, title: nameOf(left) + ' wins', message: 'Match ' + pts.you + ' to ' + pts.cpu }), 900);
          return;
        }
        if (pts.you >= TARGET) {
          matches++; api.score(matches); api.sfx('win');
          banner = { title: 'Match won', sub: matches === 1 ? 'Next match. The bot is learning you' : matches + ' in a row', t: clock };
          burst(0.5);
          phase = 'between';
          api.timeout(() => { banner = null; pts = { you: 0, cpu: 0 }; round = 1; newRound(); }, 1700);
        } else if (pts.cpu >= TARGET) {
          phase = 'done';
          api.timeout(() => api.over({ score: matches, won: false, title: 'Bot wins', message: matches ? matches + (matches === 1 ? ' match' : ' matches') + ' won in a row' : 'No matches won this time' }), 900);
        } else { round++; newRound(); }
      }
      function burst(xf) {
        if (api.reduceMotion) return;
        const x = view.w * xf, y = view.h * 0.42;
        const c = friend && xf > 0.5 ? D.P2 : null;
        for (let i = 0; i < 22; i++) parts.push({ x, y, vx: api.rand(-160, 160), vy: api.rand(-260, -40), life: api.rand(0.5, 0.9), s: api.rand(2, 4.5), c });
      }

      // ---------- layout ----------
      function layout() {
        const w = view.w, h = view.h;
        const bw = Math.min(110, (w - 48) / 3), bh = Math.min(78, h * 0.18);
        const by = h - bh - 14;
        const btns = MOVES.map((m, i) => ({ m, x: w / 2 + (i - 1) * (bw + 10) - bw / 2, y: by, w: bw, h: bh }));
        const arenaY = 52 + (by - 52) * 0.44;
        const r = Math.min(w * 0.17, (by - 70) * 0.3, 70);
        return { w, h, btns, arenaY, r, by };
      }
      function hitBtn(e) {
        const rect = view.canvas.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
        return layout().btns.findIndex(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      }
      api.on(view.canvas, 'pointerdown', e => { const i = hitBtn(e); if (i >= 0) choose(MOVES[i]); });
      api.on(view.canvas, 'pointermove', e => { hover = hitBtn(e); view.canvas.style.cursor = hover >= 0 && phase === 'pick' ? 'pointer' : 'default'; });
      api.on(view.canvas, 'pointerleave', () => { hover = -1; });
      api.keys(e => {
        if (on) {
          const k = { 1: 'rock', 2: 'paper', 3: 'scissors', a: 'rock', s: 'paper', d: 'scissors', ArrowLeft: 'rock', ArrowDown: 'paper', ArrowUp: 'paper', ArrowRight: 'scissors' }[e.key.length === 1 ? e.key.toLowerCase() : e.key];
          if (k) choose(k);
          return;
        }
        if (friend) {
          const key = e.key.toLowerCase();
          const a = { a: 'rock', s: 'paper', d: 'scissors', 1: 'rock', 2: 'paper', 3: 'scissors' }[key];
          const b = { j: 'rock', k: 'paper', l: 'scissors', 8: 'rock', 9: 'paper', 0: 'scissors' }[key];
          if (a) lockPick(true, a); else if (b) lockPick(false, b);
          return;
        }
        const k = { 1: 'rock', 2: 'paper', 3: 'scissors', ArrowLeft: 'rock', ArrowDown: 'paper', ArrowUp: 'paper', ArrowRight: 'scissors' }[e.key];
        if (k) choose(k);
      });

      // ---------- render ----------
      function pips(x, y, n, col, line, align) {
        for (let i = 0; i < TARGET; i++) {
          const px = align === 'left' ? x + i * 14 : x - i * 14;
          ctx.fillStyle = i < n ? col : line;
          ctx.beginPath(); ctx.arc(px, y, 4.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      // small green tick on an avatar: that side has locked in a pick
      function lockBadge(r) {
        const col = api.colors();
        ctx.fillStyle = col.good || col.accent; ctx.beginPath(); ctx.arc(r * 0.5, r * 0.5, r * 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, r * 0.06); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(r * 0.41, r * 0.5); ctx.lineTo(r * 0.48, r * 0.58); ctx.lineTo(r * 0.6, r * 0.43); ctx.stroke();
      }
      function render() {
        const col = api.colors(), L = layout(), { w, h } = L;
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        if (shake > 0) ctx.translate(api.rand(-1, 1) * shake * 14, api.rand(-1, 1) * shake * 8);
        // header
        D.duelHeader(ctx, 8, 8, w - 16, {
          left: friend ? { who: 'you', label: nameOf(true), pips: pts.you, of: TARGET } : { who: 'you', pips: pts.you, of: TARGET },
          right: friend ? { who: 'p2', label: nameOf(false), pips: pts.cpu, of: TARGET } : { who: 'bot', pips: pts.cpu, of: TARGET },
          turn: friend ? null : phase === 'pick' ? (clock < lockT ? 'right' : 'left') : null,
          status: phase === 'done' ? (friend ? nameOf(pts.you >= TARGET) + ' wins' : 'Bot wins') : 'Round ' + round, thinking: !friend && phase === 'pick' && clock < lockT
        }, col);
        const BOTC = friend ? D.P2 : col.dark ? '#aab2bf' : '#5d6573';

        // arena
        const ay = L.arenaY, r = L.r, lx = w * 0.27, rx = w * 0.73;
        const shaking = phase === 'shake';
        const st = clock - phaseT;
        let bob = 0;
        if (shaking && !api.reduceMotion) bob = -Math.abs(Math.sin(Math.min(st / 0.95, 1) * Math.PI * 3)) * r * 0.45;
        [[lx, col.accent, you, false, result > 0], [rx, BOTC, cpu, true, result < 0]].forEach(([x, c, m, flip, won], i) => {
          const revealed = phase === 'reveal' || phase === 'between' || phase === 'done';
          let s = 1;
          if (revealed && st < 0.3 && !api.reduceMotion && phase === 'reveal') s = D.ease.outBack(Math.min(1, st / 0.3));
          ctx.fillStyle = col.dark ? 'rgba(255,255,255,0.05)' : 'rgba(32,28,23,0.05)';
          ctx.beginPath(); ctx.arc(x, ay, r * 1.05, 0, Math.PI * 2); ctx.fill();
          if (revealed && won) {
            ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(clock * 6);
            ctx.beginPath(); ctx.arc(x, ay, r * 1.12, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
          }
          // spring rebound after the reveal: a quick pop up that settles back
          const rb = revealed && phase === 'reveal' && !api.reduceMotion ? -r * 0.16 * Math.exp(-6 * st) * Math.sin(st * 22) : 0;
          ctx.save(); ctx.translate(x, ay + bob + rb); ctx.scale(s * (won && revealed ? 1.08 : 1), s * (won && revealed ? 1.08 : 1));
          if (revealed && m) drawHand(ctx, m, 0, 0, r, c, col.ink, flip);
          else if (shaking) drawHand(ctx, 'rock', 0, 0, r, c, col.ink, flip);
          else if (friend) {
            D.avatar(ctx, 0, 0, r * 0.62, i === 0 ? 'you' : 'p2', col);
            if (on ? locked[i] : (i === 0 ? p1 : p2)) lockBadge(r);
          }
          else if (i === 0) D.avatar(ctx, 0, 0, r * 0.62, 'you', col);
          else {
            D.avatar(ctx, 0, 0, r * 0.62, 'bot', col);
            if (clock >= lockT) lockBadge(r);
          }
          ctx.restore();
        });
        D.text(ctx, 'VS', w / 2, ay, 14, col.ink3, 800);

        // status line
        let msg = '';
        if (phase === 'pick' && on) msg = own ? (theirs.commit ? 'Both locked in' : 'Locked in. Waiting for ' + nameOf(otherSeat === 0)) : theirs.commit ? nameOf(otherSeat === 0) + ' locked in. Your pick' : 'Pick rock, paper or scissors';
        else if (phase === 'pick' && friend) msg = p1 ? 'Player 1 locked in. Player 2: J K L' : p2 ? 'Player 2 locked in. Player 1: A S D' : 'Secret picks: A S D  vs  J K L';
        else if (phase === 'pick') msg = clock < lockT ? 'Bot is choosing' : 'Bot locked in. Your pick';
        else if (phase === 'shake') msg = ['Rock', 'Paper', 'Scissors'][Math.min(2, Math.floor(st / 0.32))] + '...';
        else if (phase === 'reveal' || phase === 'between' || phase === 'done') {
          msg = result === 0 ? 'Same pick. No point' : result > 0 ? LABEL[you] + ' beats ' + LABEL[cpu] + (friend ? '. ' + nameOf(true) + ' point' : '. Your point') : LABEL[cpu] + ' beats ' + LABEL[you] + (friend ? '. ' + nameOf(false) + ' point' : '. Bot point');
        }
        D.fitText(ctx, msg, w / 2, ay + r * 1.05 + 24, w - 24, 14, phase === 'reveal' && result > 0 ? col.accent : phase === 'reveal' && result < 0 && friend ? D.P2 : col.ink, 680);
        // recent rounds
        log.forEach((g, i) => {
          const x = w / 2 + (i - (log.length - 1) / 2) * 26, y = ay + r * 1.05 + 48;
          ctx.globalAlpha = 1 - i * 0.2;
          ctx.fillStyle = g.result > 0 ? col.accent : g.result < 0 ? BOTC : col.line;
          ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        });

        // buttons
        L.btns.forEach((b, i) => {
          const can = phase === 'pick' && !(on && own);
          const hov = can && hover === i;
          const pt = clock - pressT, press = pressed === i && pt < 0.25 ? 1 - Math.sin(pt / 0.25 * Math.PI) * 0.06 : 1;
          const chosen = you === b.m && phase !== 'pick' && !friend;
          ctx.save(); ctx.translate(b.x + b.w / 2, b.y + b.h / 2 - (hov ? 2 : 0)); ctx.scale(press, press);
          ctx.globalAlpha = can || chosen ? 1 : 0.5;
          ctx.fillStyle = chosen ? col.accent : col.surface2;
          D.roundRect(ctx, -b.w / 2, -b.h / 2, b.w, b.h, 14); ctx.fill();
          ctx.strokeStyle = hov ? col.accent : col.line; ctx.lineWidth = hov ? 2 : 1; ctx.stroke();
          const ic = chosen ? '#fff8f2' : col.ink;
          drawHand(ctx, b.m, 0, -b.h * 0.12, b.h * 0.3, ic, chosen ? col.accent : col.surface2, false);
          D.text(ctx, (friend && !on ? 'ASD'[i] + ' ' + 'JKL'[i] : i + 1) + '  ' + LABEL[b.m], 0, b.h * 0.32, 11, chosen ? '#fff8f2' : col.ink2, 650);
          ctx.restore();
        });

        // particles
        parts.forEach(p => { ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); ctx.fillStyle = p.c || col.accent; ctx.fillRect(p.x, p.y, p.s, p.s); });
        ctx.globalAlpha = 1;
        ctx.restore();

        // banner
        if (banner) {
          const k = Math.min(1, (clock - banner.t) / 0.35), e = api.reduceMotion ? 1 : D.ease.outBack(k);
          ctx.save(); ctx.translate(w / 2, h * 0.42); ctx.scale(e, e);
          ctx.fillStyle = col.surface; ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 16; D.roundRect(ctx, -120, -42, 240, 84, 18); ctx.fill(); ctx.shadowBlur = 0;
          D.text(ctx, banner.title, 0, -10, 20, col.ink, 750);
          D.text(ctx, banner.sub, 0, 18, 12, col.ink2, 560);
          ctx.restore();
        }
      }

      // ---------- save / restore ----------
      function restore(sv) {
        if (!sv || sv.v !== 1 || sv.dead || !sv.pts || !Array.isArray(sv.history)) return false;
        const pu = sv.pts.you | 0, pc = sv.pts.cpu | 0;
        if (pu < 0 || pc < 0 || pu >= TARGET || pc >= TARGET) return false;
        const okPair = x => Array.isArray(x) && MOVES.includes(x[0]) && MOVES.includes(x[1]);
        if (!sv.history.every(okPair)) return false;
        // replay every round so the bot remembers your habits exactly as before
        sv.history.slice(-200).forEach(([a, b]) => { brain.choose(); brain.record(a, b); history.push([a, b]); });
        (Array.isArray(sv.log) ? sv.log : []).slice(0, 4).forEach(g => { if (g && MOVES.includes(g.you) && MOVES.includes(g.cpu)) log.push({ you: g.you, cpu: g.cpu, result: outcome(g.you, g.cpu) }); });
        matches = Math.max(0, sv.matches | 0); round = Math.max(1, sv.round | 0); pts = { you: pu, cpu: pc };
        api.score(matches);
        return true;
      }
      restore(api.saved);

      newRound();
      // The other player's fingerprint and pick. A message from a round we have not reached yet waits.
      if (on) on.queue((type, d, from) => {
        if (type !== 'commit' && type !== 'reveal') return true;
        if (!d || !Number.isInteger(d.r) || from !== otherSeat) return true;
        if (d.r > rid) return false;
        if (d.r < rid || phase !== 'pick') return true;
        if (type === 'commit') {
          if (typeof d.h !== 'string' || !/^[0-9a-f]{64}$/.test(d.h) || theirs.commit) return true;
          theirs.commit = d.h; locked[otherSeat] = true; api.sfx('tap');
        } else {
          if (!MOVES.includes(d.k) || typeof d.n !== 'string' || d.n.length > 32 || !theirs.commit || theirs.pick) return true;
          if (fingerprint(otherSeat, d.k, d.n) !== theirs.commit) return true;   // does not match what they locked in
          theirs.pick = d.k;
        }
        stepOnline();
        return true;
      });
      api.loop(dt => {
        clock += dt;
        shake = Math.max(0, shake - dt);
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i]; p.life -= dt; p.vy += 600 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.life <= 0) parts.splice(i, 1);
        }
        render();
      });
      return {
        save() {
          if (api.ended) return null;
          if (phase === 'done' || pts.cpu >= TARGET || (friend && pts.you >= TARGET)) return { v: 1, dead: true };
          let r = round, p = { you: pts.you, cpu: pts.cpu };
          if (phase === 'between' || pts.you >= TARGET) { r = 1; p = { you: 0, cpu: 0 }; }
          else if (phase === 'reveal') r = round + 1;
          if (!history.length && !matches) return null;
          return { v: 1, matches: matches + (phase === 'reveal' && pts.you >= TARGET ? 1 : 0), round: r, pts: p, history: history.slice(-200), log: log.slice() };
        }
      };
    }
  });
})();
