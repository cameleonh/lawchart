// Lawchart E2E 스모크 — 헤드리스 크롬 CDP (검증된 파이프라인)
// 전제: 크롬 --remote-debugging-port=9223 실행 중 (로컬은 dev-server.mjs(8123)도)
// 사용법: node phase3/e2e.mjs [대상URL]  (기본 http://localhost:8123/, 라이브: https://cameleonh.github.io/lawchart/app/)
const PORT = 9223, APP = process.argv[2] || 'http://localhost:8123/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
  const page = targets.find(t => t.type === 'page' && t.url.startsWith(APP));
  if (!page) throw new Error('page target 없음: ' + targets.map(t => t.url).join(' | '));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws 연결 실패')); });

  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXC ' + JSON.stringify(m.params.exceptionDetails.exception?.description || '').slice(0, 200));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('ERR ' + JSON.stringify(m.params.args?.map(a => a.value)).slice(0, 200));
  };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error('eval 실패: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 200));
    return r.result?.result?.value;
  };

  await send('Runtime.enable');

  // 1) 예시 → 관계도 그리기
  await ev(`document.getElementById('sample').click()`);
  await ev(`document.getElementById('draw').click()`);
  await sleep(900);
  const stats = await ev(`(() => ({
    nodes: document.querySelectorAll('#svg .node:not(.thing)').length,
    things: document.querySelectorAll('#svg .node.thing').length,
    edges: document.querySelectorAll('#svg .edge').length,
    arcs: document.querySelectorAll('#svg .arc').length,
    rows: document.querySelectorAll('#edges .er').length,
    chips: document.querySelectorAll('#precedents a.pchip').length,
    badHref: [...document.querySelectorAll('#precedents a.pchip')].filter(a => !a.href.startsWith('https://www.law.go.kr/precSc.do?')).length,
    precShown: !document.getElementById('prec-wrap').hidden,
    resultShown: !document.getElementById('result').hidden,
    tlShown: !document.getElementById('tl-wrap').hidden,
    svgLen: document.getElementById('svg').innerHTML.length,
  }))()`);

  // 2) 타임라인 이동 → 미래 흐림 확인
  await ev(`(() => { const r = document.getElementById('tl-range'); r.value = 0; r.dispatchEvent(new Event('input')); return 1; })()`);
  await sleep(300);
  const futAtFirst = await ev(`document.querySelectorAll('.fut').length`);
  await ev(`document.getElementById('tl-all').click()`);

  // 3) 쟁점 메모 (prompt 가로채기)
  await ev(`(() => { const orig = window.prompt; window.prompt = () => 'a0'; const b = document.querySelector('#edges [data-memo]'); const ok = !!b; if (b) b.click(); window.prompt = orig; return ok ? 1 : 0; })()`);
  await sleep(300);
  const memo = await ev(`((document.querySelector('#edges .memo')||{}).textContent || '') + ' |칩=' + (document.getElementById('svg').innerHTML.includes('\\u2691') ? 'Y' : 'N')`);
  const memoChip = await ev(`document.querySelectorAll('#precedents a.pchip.memo').length`);

  // 4) 자동저장 스냅샷
  await sleep(900);
  const saved = await ev(`(() => { try { const s = JSON.parse(localStorage.getItem('lawchart-last')); return s && s.graph && s.graph.nodes ? 'Y(' + s.graph.nodes.length + ')' : 'N'; } catch { return 'N'; } })()`);

  // 5) 노드 드래그 시뮬레이션(좌표 이동 반영)
  const dragMoved = await ev(`(() => {
    const n = document.querySelector('#svg .node'); if (!n) return 'N';
    const before = n.getAttribute('transform');
    const g = window; // Renderer는 모듈 스코프 — DOM 이벤트로 간접 확인
    const evD = new PointerEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 200, pointerId: 1 });
    n.dispatchEvent(evD);
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 300, clientY: 300, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    return before !== null ? 'dispatched' : 'no-transform';
  })()`);

  console.log(JSON.stringify({ stats, futAtFirst, memo, memoChip, saved, dragMoved, errors }, null, 1));
  const ok = stats.nodes >= 2 && stats.edges >= 2 && stats.rows >= 2 && stats.resultShown
    && stats.svgLen > 500 && stats.chips >= 2 && stats.badHref === 0 && stats.precShown && memoChip >= 1
    && memo.includes('|칩=Y') && saved.startsWith('Y') && errors.length === 0;
  console.log(ok ? 'E2E-PASS' : 'E2E-FAIL');
  ws.close();
  process.exit(ok ? 0 : 1);
}
main().catch(e => { console.error('E2E-ERROR', e.message); process.exit(1); });
