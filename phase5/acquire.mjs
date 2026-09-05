// 실 판례 확보 — law.go.kr 판례 검색→상세→사실관계 추출 (phase5)
// 사용법: node acquire.mjs   → phase5/raw/*.json + index.json
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 9225;
const ROOT = dirname(fileURLToPath(import.meta.url));
const RAW = join(ROOT, 'raw');
mkdirSync(RAW, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 도메인별 검색어 (하급심 단순 사안 위주로 후보 확보)
const QUERIES = ['명의신탁 약정', '소유권이전등기 경료', '대여금 약정 이자', '전세권 설정 등기', '매매 예약 완결'];

async function connect(urlFilter) {
  const targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
  const t = targets.find(x => x.type === 'page' && urlFilter(x));
  if (!t) return null;
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  return { ws, send: (() => { let i = 0; const p = new Map(); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } }; return (method, params = {}) => new Promise(res => { const id = ++i; p.set(id, res); ws.send(JSON.stringify({ id, method, params })); }); })() };
}
const ev = async (c, expr) => (await c.send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;

async function main() {
  const index = existsSync(join(RAW, 'index.json')) ? JSON.parse(readFileSync(join(RAW, 'index.json'), 'utf8')) : [];
  const main = await connect(t => t.url.includes('law.go.kr'));
  if (!main) throw new Error('검색 탭 없음 — 크롬을 precSc URL로 띄워주세요');
  await main.send('Page.enable'); await main.send('Runtime.enable');

  for (const q of QUERIES) {
    const enc = encodeURIComponent(q);
    await main.send('Page.navigate', { url: `https://www.law.go.kr/precSc.do?menuId=1&subMenuId=45&query=${enc}` });
    await sleep(5000);
    const rows = await ev(main, `(() => {
      const seen = new Set(); const out = [];
      for (const a of document.querySelectorAll('a[onclick*="precView"]')) {
        const oc = a.getAttribute('onclick');
        const id = (oc.match(/precView\\('(\\d+)'/) || [])[1];
        const head = (a.innerText || '').replace(/\\s+/g, ' ').slice(0, 140);
        if (id && !seen.has(id)) { seen.add(id); out.push({ id, head }); }
      }
      return out.slice(0, 6);
    })()`);
    console.log(`\n[${q}] 후보 ${rows.length}건`);
    let taken = 0;
    for (const row of rows) {
      if (taken >= 3) break;
      if (index.some(x => x.id === row.id)) { console.log('  skip(중복)', row.id); continue; }
      // 직접 전문 URL — 서버 렌더링, 약관 없음
      await main.send('Page.navigate', { url: `https://www.law.go.kr/precInfoP.do?precSeq=${row.id}` });
      await sleep(4500);
      const meta = await ev(main, `(() => {
        const t = document.body.innerText;
        const m = t.match(/\\[([^\\]\\n]{0,50}(?:법원|지원)[^\\]\\n]{0,50})\\s+(\\d{4}\\.\\s?\\d{1,2}\\.\\s?\\d{1,2}\\.\\s?선고)\\s+([\\uAC00-\\uD7A3\\d]+)/);
        return { url: location.href, len: t.length, court: m ? m[1].trim() : '', date: m ? m[2] : '', caseNo: m ? m[3].trim() : '', title: (document.title || '').slice(0, 60) };
      })()`);
      const facts = await ev(main, `(() => {
        const t = document.body.innerText;
        // 사실관계 섹션 후보: 기초사실/사실관계/범죄사실 → 없으면 【이 유】 이후 서술부
        const cands = [
          ['【기초사실】'], ['기초사실'], ['【사실관계】'], ['사실관계 및 처리경과'], ['【범죄사실】'], ['공소사실은'],
          ['【이 유】'], ['이 유'],
        ];
        let s = -1, mk = '';
        for (const [m] of cands) { const i = t.indexOf(m); if (i >= 0) { s = i; mk = m; break; } }
        if (s < 0) return null;
        const endM = ['【당해법원의 판단】', '먼저 살펴본다', '판단한다', '1. 원심판결', '그러므로'];
        let e = Math.min(t.length, s + 9000);
        for (const m of endM) { const i = t.indexOf(m, s + 400); if (i >= 0 && i < e) e = i; }
        return { marker: mk, text: t.slice(s, e), full: t.slice(0, 22000) };
      })()`);
      // 다음 후보를 위해 검색으로 복귀
      await main.send('Page.navigate', { url: `https://www.law.go.kr/precSc.do?menuId=1&subMenuId=45&query=${enc}` });
      await sleep(1500);
      if (!facts || !meta.caseNo || facts.text.replace(/\s/g, '').length < 400) { console.log('  no-facts', row.id, meta?.court || meta?.title || ''); continue; }
      const rec = { id: row.id, query: q, head: row.head, ...meta, facts };
      writeFileSync(join(RAW, `${row.id}.json`), JSON.stringify(rec, null, 2), 'utf8');
      index.push({ id: row.id, query: q, court: meta.court, caseNo: meta.caseNo, date: meta.date, head: row.head.slice(0, 80) });
      taken++;
      console.log('  OK', row.id, meta.court, meta.caseNo, '| facts', facts.text.length, '자 |', facts.marker);
      await sleep(1500);
    }
  }
  writeFileSync(join(RAW, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
  console.log(`\n총 확보: ${index.length}건 → ${RAW}`);
  try { await main.ws.close(); } catch {}
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
