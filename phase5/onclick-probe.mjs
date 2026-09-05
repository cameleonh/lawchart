// 판례 결과 행의 onclick 패턴 덤프
const PORT = 9225;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  const targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'https://www.law.go.kr/precSc.do?menuId=1&subMenuId=45&query=%EB%A7%A4%EB%A7%A4%EB%8C%80%EA%B8%88' });
  await sleep(5000);
  const rows = await ev(`(() => {
    const hits = [...document.querySelectorAll('[onclick]')].filter(e => /prec|LsInfo|efId|ID=/i.test(e.getAttribute('onclick') || ''));
    const marked = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (/2014가합1494|2016다42800/.test(walker.currentNode.textContent || '')) {
        let el = walker.currentNode.parentElement;
        for (let k = 0; k < 4 && el; k++) {
          const oc = el.getAttribute && el.getAttribute('onclick');
          if (oc) { marked.push({ tag: el.tagName, onclick: oc.slice(0, 260), head: (el.innerText || '').replace(/\\s+/g, ' ').slice(0, 60) }); break; }
          el = el.parentElement;
        }
      }
    }
    return { hits: hits.map(e => ({ tag: e.tagName, onclick: (e.getAttribute('onclick') || '').slice(0, 260) })).slice(0, 10), marked: marked.slice(0, 6) };
  })()`);
  console.log(JSON.stringify(rows, null, 1));
  ws.close();
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
