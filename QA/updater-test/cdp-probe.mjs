// Drive a running Ludus (Windows WebView2 with --remote-debugging-port) from outside, with real input events.
// usage: node cdp-probe.mjs <port> <test.js> <out.json> [out.png]
// test.js is an async function expression run in the page. It may return { click: [x, y], then: '<async fn source>' }:
// the click is sent as a real mouse press (CDP Input), then `then` runs and its value is the result.
// Every page error and console error is collected.
import { readFileSync, writeFileSync } from 'node:fs';
const [port, testFile, outJson, outPng] = process.argv.slice(2);
const wait = ms => new Promise(r => setTimeout(r, ms));
const t0 = Date.now();
let page = null;
while (!page && Date.now() - t0 < 120000) {
  try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page' && /index\.html/.test(t.url)); } catch { /* starting */ }
  if (!page) await wait(500);
}
if (!page) { writeFileSync(outJson, JSON.stringify({ error: 'no page' })); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) => new Promise(res => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const run = async src => {
  const m = await send('Runtime.evaluate', { expression: '(' + src + ')()', awaitPromise: true, returnByValue: true });
  if (m.result?.exceptionDetails) errors.push('TEST THREW: ' + (m.result.exceptionDetails.exception?.description || m.result.exceptionDetails.text));
  return m.result?.result?.value;
};
await send('Runtime.enable');
// wait for the games page to be ready
for (let i = 0; i < 200; i++) { const ok = await run('async () => !!(window.Ludus && Ludus.games && Ludus.games.length && window.ludusOpenGame)'); if (ok) break; await wait(300); }
let result = await run(readFileSync(testFile, 'utf8'));
if (result && result.click) {
  const [x, y] = result.click;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  await wait(900);
  result = { first: result, after: result.then ? await run(result.then) : null };
}
if (outPng) { const shot = await send('Page.captureScreenshot', { format: 'png' }); if (shot.result?.data) writeFileSync(outPng, Buffer.from(shot.result.data, 'base64')); }
writeFileSync(outJson, JSON.stringify({ result, errors }, null, 1));
console.log(JSON.stringify({ result, errors }, null, 1));
ws.close();
process.exit(0);
