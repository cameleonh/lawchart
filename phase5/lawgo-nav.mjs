// law.go.kr 판례 검색 CDP 드라이버 — 단계별 사이트 탐색용 (phase5)
// 사용법: node lawgo-nav.mjs <URL> [링크추출여부]
const PORT = 9225;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const url = process.argv[2];
const wantLinks = process.argv[3] === 'links';

async function main() {
  const targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
  const page = targets.find(t => t.type === 'page');
  if (!page) throw new Error('target 없음');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result?.result?.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url });
  await sleep(5000); // 서버렌더+스크립트 대기
  const info = await ev(`(() => ({
    url: location.href,
    title: document.title,
    textLen: document.body.innerText.length,
    head: document.body.innerText.replace(/[\\t ]+/g,' ').slice(0, 1500),
    ${wantLinks ? `links: [...document.querySelectorAll('a')].filter(a => a.href && a.innerText.trim()).slice(0, 40).map(a => a.innerText.trim().slice(0,60) + ' => ' + a.href.slice(0,120)),` : ''}
  }))()`);
  console.log(JSON.stringify(info, null, 1));
  ws.close();
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
