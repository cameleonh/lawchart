// precView 후 DOM 변화(iframe/레이어) 확인
const PORT = 9225;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  const targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
  const t = targets.find(x => x.type === 'page' && x.url.includes('precSc'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let i = 0; const p = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } };
  const send = (method, params = {}) => new Promise(res => { const id = ++i; p.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async ex => (await send('Runtime.evaluate', { expression: ex, returnByValue: true })).result?.result?.value;
  await send('Runtime.enable');
  console.log('tabs:', (await (await fetch(`http://localhost:${PORT}/json`)).json()).map(x => x.type + ':' + x.url.slice(0, 80)).join('\n  '));
  await ev(`precView('217523'); 0`);
  await sleep(4000);
  const probe = await ev(`(() => {
    const ifr = [...document.querySelectorAll('iframe')].map(f => ({ src: (f.src || '').slice(0, 120), name: f.name, len: (() => { try { return f.contentDocument ? f.contentDocument.body.innerText.length : -1; } catch { return -2; } })() }));
    const has약관 = document.body.innerText.includes('이용약관');
    const layers = [...document.querySelectorAll('div')].filter(d => d.style && (d.style.display !== 'none') && /약관|전문/.test(d.innerText || '') && d.innerText.length < 3000).length;
    return { ifr, has약관, bodyLen: document.body.innerText.length, head: document.body.innerText.slice(-600).replace(/\\s+/g, ' ') };
  })()`);
  console.log(JSON.stringify(probe, null, 1));
  ws.close();
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
