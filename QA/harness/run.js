// Light headless Ludus harness. node QA/harness/run.js <test.js> [--size compact|large|wide|widelarge] [--dark] [--shot out.png] [--web dir]
// Extra: --init file.js (runs before the page), --offline (network blocked from the start).
// test.js is an async function expression evaluated in the page; its return value is printed as JSON.
// Needs playwright-core (set PW_CORE to its folder if require() cannot find it) and a Chromium headless shell (set CHROME).
const fs = require('fs'), path = require('path'), os = require('os');
let pw; try { pw = require('playwright-core'); } catch (e) { pw = require(process.env.PW_CORE || path.join(os.homedir(), '.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core')); }
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const web = opt('--web') || path.join(__dirname, '../../web');
const SIZES = { compact: [400, 600], large: [520, 740], wide: [760, 500], widelarge: [900, 600] };
const _s = opt('--size') || ''; const [width, height] = SIZES[_s] || (/^\d+x\d+$/.test(_s) ? _s.split('x').map(Number) : SIZES.compact);
const chrome = process.env.CHROME || path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell');
(async () => {
  const browser = await pw.chromium.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: args.includes('--dark') ? 'dark' : 'light', deviceScaleFactor: 2, offline: args.includes('--offline') });
  const page = await ctx.newPage();
  if (opt('--init')) await page.addInitScript(fs.readFileSync(opt('--init'), 'utf8'));
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.stack || e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto('file://' + path.join(web, 'index.html'));
  await page.waitForTimeout(300);
  let result = null;
  if (args[0] && args[0][0] !== '-') { try { result = await page.evaluate('(' + fs.readFileSync(args[0], 'utf8') + ')()'); } catch (e) { errors.push('TEST THREW: ' + e.message); } }
  if (opt('--shot')) await page.screenshot({ path: opt('--shot') });
  console.log(JSON.stringify({ result, errors }, null, 1));
  await browser.close();
})();
