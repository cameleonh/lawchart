// 라이브 accuracy 페이지 QA — 시각 요소·수치·레이아웃 확인 (CDP)
const PORT = 9223;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  const targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let i = 0; const p = new Map(); const errors = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + JSON.stringify(m.params.exceptionDetails.exception?.description || '').slice(0, 200));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('ERR: ' + JSON.stringify(m.params.args?.map(a => a.value)).slice(0, 200));
  };
  const send = (method, params = {}) => new Promise(res => { const id = ++i; p.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async ex => (await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send('Runtime.enable'); await send('Page.enable');

  // accuracy 페이지로 이동
  await send('Page.navigate', { url: 'https://cameleonh.github.io/lawchart/app/accuracy.html' });
  await sleep(4000);

  const qa = await ev(`(() => {
    const t = document.body.innerText;
    const sections = ['법역별', 'AI 보조 경로', '실제 판결문 일반화', '측정 방법', '정직한 한계'];
    const nums = ['96.9%', '95.6%', '30.6%', '70.9%', '79.8%', '93.1%', '64.7%', '59.5%'];
    return {
      title: document.title,
      sections: Object.fromEntries(sections.map(s => [s, t.includes(s)])),
      nums: Object.fromEntries(nums.map(n => [n, t.includes(n)])),
      heroCount: document.querySelectorAll('.hero .num').length,
      cards: document.querySelectorAll('.card').length,
      hcards: document.querySelectorAll('.hcard').length,
      tables: document.querySelectorAll('table').length,
      notes: document.querySelectorAll('.note').length,
      bodyH: document.body.scrollHeight,
      overflow: document.body.scrollWidth > window.innerWidth,
      links: [...document.querySelectorAll('a')].map(a => ({ text: a.innerText.trim().slice(0, 30), href: a.href.slice(0, 80) })).filter(l => l.text),
    };
  })()`);

  // 메인 앱으로 돌아가서 AI UI 확인
  await send('Page.navigate', { url: 'https://cameleonh.github.io/lawchart/app/' });
  await sleep(3000);
  const appQA = await ev(`(() => ({
    brand: document.querySelector('.brand')?.textContent,
    aiToggle: !!document.getElementById('ai'),
    aiOff: document.getElementById('ai') ? !document.getElementById('ai').checked : null,
    aiHint: document.getElementById('ai-hint')?.textContent,
    cfgBtn: !!document.getElementById('ai-cfg-btn'),
    ocrBtn: !!document.getElementById('img'),
    plotCredit: document.body.innerText.includes('plot(app.yebni.cc)'),
    accuracyLink: !!document.querySelector('a[href="./accuracy.html"]'),
    svgPresent: !!document.getElementById('svg'),
  }))()`);

  console.log(JSON.stringify({ accuracy: qa, app: appQA, errors }, null, 1));
  const ok = Object.values(qa.sections).every(Boolean) && Object.values(qa.nums).every(Boolean)
    && appQA.brand === 'Lawchart' && appQA.aiToggle && appQA.plotCredit && appQA.accuracyLink && errors.length === 0;
  console.log(ok ? 'LIVE-QA-PASS' : 'LIVE-QA-FAIL');
  ws.close();
  process.exit(ok ? 0 : 1);
}
main().catch(e => { console.error('QA-ERROR', e.message); process.exit(1); });
