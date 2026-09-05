// glaw CDP 프로브 — 렌더 확인 + 본문 구조 덤프 (phase5)
const PORT = 9225;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
  const page = targets.find(t => t.type === 'page' && t.url.includes('glaw'));
  if (!page) throw new Error('glaw target 없음');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error('eval: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 200));
    return r.result?.result?.value;
  };
  await send('Runtime.enable');
  await sleep(2000);
  const info = await ev(`(() => ({
    url: location.href,
    title: document.title,
    textLen: document.body.innerText.length,
    head: document.body.innerText.replace(/\\s+/g,' ').slice(0, 600),
    inputs: [...document.querySelectorAll('input')].map(i => i.id + '|' + i.placeholder + '|' + i.type).slice(0, 8),
  }))()`);
  console.log(JSON.stringify(info, null, 1));
  ws.close();
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
