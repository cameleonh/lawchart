// precView의 네트워크 요청 캡처 → 전문 직접 URL 패턴 발굴
const PORT = 9225;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  const targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
  const t = targets.find(x => x.type === 'page' && x.url.includes('law.go.kr'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let i = 0; const p = new Map(); const reqs = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); }
    if (m.method === 'Network.requestWillBeSent' && /\.do|LSW|prec|lawLink|LsInfo/i.test(m.params.request.url)) {
      reqs.push(m.params.request.method + ' ' + m.params.request.url.slice(0, 180));
    }
  };
  const send = (method, params = {}) => new Promise(res => { const id = ++i; p.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send('Runtime.enable'); await send('Network.enable');
  await send('Runtime.evaluate', { expression: `precView('217523'); 0` });
  await sleep(5000);
  console.log([...new Set(reqs)].join('\n'));
  ws.close();
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
