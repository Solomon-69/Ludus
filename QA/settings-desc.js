// Settings: every description says what the CURRENT value does. Flips each switch and segment and checks the text
// under it changes with it (and back). Run with a fake app bridge so the Mac / Windows rows show:
//   node QA/harness/run.js QA/settings-desc.js --init QA/settings-desc-init.js   (set window.__PLAT='windows' for Windows rows)
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms)), out = { rows: [], bad: [] };
  [...document.querySelectorAll('button')].find(b => /settings/i.test(b.getAttribute('aria-label') || ''))?.click(); await wait(500);
  document.querySelector('.more-head')?.click(); await wait(600);
  const sub = r => (r.querySelector('.row-sub') || {}).textContent || '';
  for (const r of document.querySelectorAll('#settingsBody .row')) {
    const title = (r.querySelector('.row-title') || {}).textContent || '';
    const s = r.querySelector('[role=switch]:not([aria-disabled=true])'), sg = r.querySelector('.seg');
    if (!s && !sg) continue;
    if (s) {
      const a = sub(r), h0 = r.offsetHeight, on0 = s.getAttribute('aria-checked') === 'true'; s.click(); await wait(80);
      const b = sub(r), jump = r.offsetHeight !== h0, on1 = s.getAttribute('aria-checked') === 'true'; s.click(); await wait(80);
      const c = sub(r);
      const ok = !jump && a !== b && a === c && (!/^(On|Off):/.test(b) || b.startsWith(on1 ? 'On:' : 'Off:')) && (!/^(On|Off):/.test(a) || a.startsWith(on0 ? 'On:' : 'Off:'));
      out.rows.push({ title, kind: 'switch', before: a, flipped: b, ok: ok || (!a && !b) });
      if (!ok && (a || b)) out.bad.push(title);
    } else {
      const btns = [...sg.querySelectorAll('button')], first = btns.find(b => b.classList.contains('is-on')), texts = [];
      for (const b of btns) { b.click(); await wait(60); texts.push(b.textContent.trim() + ' -> ' + sub(r)); }
      first.click(); await wait(60);
      const subs = new Set(texts.map(t => t.split(' -> ')[1]));
      const ok = !sub(r) || subs.size === btns.length;
      out.rows.push({ title, kind: 'segment', texts, ok }); if (!ok) out.bad.push(title);
    }
  }
  return out;
}
