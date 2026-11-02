// Writes the cover webp of a game for both websites (docs/covers, ~/Code/Mac-Apps/ludus/covers).
// NODE_PATH=<playwright-core folder> node QA/harness/cover-export.js <game id>
const { chromium } = require('playwright-core'); const path = require('path'), fs = require('fs'), os = require('os'), { execFileSync } = require('child_process');
const id = process.argv[2]; if (!id) { console.log('game id?'); process.exit(1); }
const root = path.join(__dirname, '..', '..');
const SIZES = [{ dir: path.join(root, 'docs', 'covers'), w: 112, h: 80, k: 2 }, { dir: path.join(os.homedir(), 'Code', 'Mac-Apps', 'ludus', 'covers'), w: 221, h: 78, k: 3 }];
(async () => {
  const b = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
  const p = await b.newPage({ viewport: { width: 400, height: 600 } });
  await p.addInitScript(() => { localStorage.setItem('ludus.v1', JSON.stringify({ introDone: true, theme: 'light' })); });
  await p.goto('file://' + path.join(root, 'web', 'index.html')); await p.waitForTimeout(800);
  for (const s of SIZES) {
    const png = await p.evaluate(([id, w, h, k]) => {
      const g = Ludus.games.find(x => x.id === id), c = document.createElement('canvas'); c.width = w * k; c.height = h * k;
      const ctx = c.getContext('2d'); ctx.scale(k, k); ctx.fillStyle = g.tint; ctx.fillRect(0, 0, w, h); g.art(ctx, w, h, Ludus.colors()); return c.toDataURL('image/png');
    }, [id, s.w, s.h, s.k]);
    const tmp = path.join(os.tmpdir(), id + '-cover.png'); fs.writeFileSync(tmp, Buffer.from(png.split(',')[1], 'base64'));
    fs.mkdirSync(s.dir, { recursive: true }); execFileSync('cwebp', ['-q', '86', '-quiet', tmp, '-o', path.join(s.dir, id + '.webp')]); fs.unlinkSync(tmp);
    console.log('wrote', path.join(s.dir, id + '.webp'));
  }
  await b.close();
})();
