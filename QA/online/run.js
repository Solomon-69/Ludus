// Runs a QA page test (an async function expression, like ../smoke.js) in headless Chromium.
// node run.js <test.js> [--size compact|large|wide|widelarge] [--dark]
const { chromium } = require('playwright-core'); const fs = require('fs'), path = require('path');
const L = require('./lib.js');
const a = process.argv.slice(2), opt = n => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : null; };
const SIZES = { compact: { width: 400, height: 600 }, large: { width: 520, height: 740 }, wide: { width: 760, height: 500 }, widelarge: { width: 900, height: 640 } };
(async () => {
  const b = await L.launch(), p = await b.newPage({ viewport: SIZES[opt('--size') || 'compact'], colorScheme: a.includes('--dark') ? 'dark' : 'light' });
  const errors = []; p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await p.goto('file://' + path.join(L.WEB, 'index.html')); await p.waitForTimeout(300);
  let result = null; try { result = await p.evaluate('(' + fs.readFileSync(a[0], 'utf8') + ')()'); } catch (e) { errors.push('TEST THREW: ' + e.message); }
  console.log(JSON.stringify({ errors, result }).slice(0, 900)); await b.close(); process.exit(errors.length ? 1 : 0);
})();
