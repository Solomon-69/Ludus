/* Ludus connection state and in-app updater. Nothing here is needed to play: every game works offline.
   Only the Online tab, Map Hunt photos and updates use the internet. */
(function () {
  const L = window.Ludus;
  const root = document.documentElement;
  L.VERSION = '1.11.1';                       // the shell may override with window.__LUDUS_VERSION__ (the real app version)
  // The one place that says where updates come from: the latest release of this GitHub repository.
  // It is private for now, so a 404 just means "Couldn't check". No token is ever stored in the app.
  L.UPDATE_API = 'https://api.github.com/repos/Solomon-69/Ludus/releases/latest';

  // ---------- online / offline ----------
  const conn = { shown: true, debounceMs: 3000, listeners: [], timer: 0 };
  const raw = () => navigator.onLine !== false;
  function paint() {
    root.dataset.net = conn.shown ? 'online' : 'offline';
    conn.listeners.forEach(f => { try { f(conn.shown); } catch (e) { /* a listener must never break the others */ } });
  }
  function sync() {
    if (raw()) { clearTimeout(conn.timer); conn.timer = 0; if (!conn.shown) { conn.shown = true; paint(); } return; }
    if (conn.shown && !conn.timer) conn.timer = setTimeout(() => { conn.timer = 0; if (!raw()) { conn.shown = false; paint(); } }, conn.debounceMs);   // ~3 s, so a blip does not flash
  }
  window.addEventListener('online', sync); window.addEventListener('offline', sync);
  conn.on = f => { conn.listeners.push(f); return () => { conn.listeners = conn.listeners.filter(x => x !== f); }; };
  L.conn = conn;
  root.dataset.net = 'online';
  if (!raw()) setTimeout(sync, 0);
  window.ludusNetState = () => conn.shown;

  // ---------- updater ----------
  const U = { state: 'idle', pct: 0, latest: '', listeners: [] };
  const version = () => String(window.__LUDUS_VERSION__ || L.VERSION);
  const apiUrl = () => String(window.__LUDUS_UPDATE_API__ || L.UPDATE_API);
  const isWin = () => window.__LUDUS_PLATFORM__ === 'windows';
  const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; } return false; };
  function set(state, extra) { Object.assign(U, extra || {}, { state }); U.listeners.forEach(f => f(U)); }
  U.on = f => { U.listeners.push(f); return () => { U.listeners = U.listeners.filter(x => x !== f); }; };
  U.version = version;
  let idleTimer = 0;
  U.check = async function () {
    if (U.state === 'checking' || U.state === 'progress') return;
    clearTimeout(idleTimer);
    if (!conn.shown) return set('offline');
    set('checking');
    const ctrl = new AbortController(), kill = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(apiUrl(), { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store', signal: ctrl.signal });
      if (!res.ok) throw new Error('http ' + res.status);
      const rel = await res.json(), tag = String(rel.tag_name || '').replace(/^v/i, '');
      if (!/^\d+(\.\d+){0,3}$/.test(tag)) throw new Error('bad tag');
      const assets = Array.isArray(rel.assets) ? rel.assets : [];
      const zip = assets.find(a => a.name === (isWin() ? 'Ludus-windows.zip' : 'Ludus-mac.zip'));
      const sums = assets.find(a => a.name === 'SHA256SUMS.txt');
      if (!newer(tag, version())) { set('uptodate'); idleTimer = setTimeout(() => U.state === 'uptodate' && set('idle'), 3000); return; }
      if (!zip || !sums || !zip.browser_download_url || !sums.browser_download_url) throw new Error('release has no files');
      set('available', { latest: tag, zip: zip.browser_download_url, sums: sums.browser_download_url, name: zip.name });
    } catch (e) { set('cantcheck'); }
    finally { clearTimeout(kill); }
  };
  U.askInstall = () => { if (U.state === 'available') set('confirm'); };
  U.cancel = () => { if (U.state === 'confirm') set('available'); };
  U.install = () => {
    if (U.state !== 'confirm') return;
    set('progress', { pct: 0 });
    if (!L.native('update', { zip: U.zip, sums: U.sums, name: U.name, version: U.latest })) { /* no shell (browser): nothing to install */ }
  };
  // The shell reports back: progress 0..100, "verifying", or an error. A finished update restarts the app, so there is no "done".
  window.ludusUpdateState = (kind, v) => {
    if (kind === 'progress') set('progress', { pct: Math.max(0, Math.min(100, +v || 0)) });
    else if (kind === 'error') set('error');
  };
  conn.on(up => { if (!up && (U.state === 'idle' || U.state === 'cantcheck' || U.state === 'uptodate')) set('offline'); else if (up && U.state === 'offline') set('idle'); });
  L.update = U;
})();
