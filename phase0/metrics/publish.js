#!/usr/bin/env node
// Lawchart 정확도 공개 페이지 생성 — 측정 JSON → app/accuracy.html (수치 인라인)
// 사용법: node phase0/metrics/publish.js
'use strict';
const fs = require('fs');
const path = require('path');

const REP = path.join(__dirname, '..', 'report');
const OUT = path.join(__dirname, '..', '..', 'app', 'accuracy.html');

const read = f => JSON.parse(fs.readFileSync(path.join(REP, f), 'utf8'));
const lawAll = read('p2_all_lawchart.json');      // 전체 100건
const lawHold = read('p2_holdout_lawchart.json');  // 홀드아웃 40건(2차)
const orig = read('p2_holdout_original.json');    // 원본 기준선(홀드아웃 40건)
const hasAI = fs.existsSync(path.join(REP, 'p2_all_ai.json'));
const aiAll = hasAI ? read('p2_all_ai.json') : null; // AI 경로(옵트인·BYOK)
const hasReal = fs.existsSync(path.join(REP, 'p2_real_lawchart.json'));
const realLaw = hasReal ? read('p2_real_lawchart.json') : null; // 실 판례 홀드아웃
const hasRealAI = fs.existsSync(path.join(REP, 'p2_real_ai.json'));
const realAI = hasRealAI ? read('p2_real_ai.json') : null; // 실 판례 AI
const pct = x => (x * 100).toFixed(1) + '%';

const domains = { civil: '민법', commercial: '상법', criminal: '형사', procedural: '민사소송법' };
const domRows = Object.entries(lawAll.byDomain).map(([d, s]) =>
  `<div class="card"><div class="dom">${domains[d] || d}</div><div class="big">${pct(s.relStrict.f1)}</div><div class="sub">관계 F1 · 당사자 ${pct(s.parties.f1)}</div></div>`).join('');

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lawchart 정확도 — 공개 측정</title>
<meta name="description" content="Lawchart 규칙 파서의 정확도를 공개 골드셋(100건) 위에서 측정해 공개합니다.">
<style>
:root{--ink:#1B1B18;--sub:#6E6B64;--bg:#F6F5F2;--indigo:#5B5BD6;--green:#0E9F6E;--amber:#D97706;--red:#E02424}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Pretendard,-apple-system,system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.6}
.wrap{max-width:860px;margin:0 auto;padding:36px 20px 60px}
h1{font-size:30px;letter-spacing:-.03em;margin-bottom:4px}
.tag{color:var(--sub);font-size:14px;margin-bottom:26px}
.hero{background:linear-gradient(120deg,#1B1B18 10%,#3A3A9C 55%,#0E9F6E 105%);color:#fff;border-radius:22px;padding:34px 30px;display:flex;gap:26px;flex-wrap:wrap;align-items:baseline;box-shadow:0 20px 50px -25px rgba(27,27,24,.6)}
.hero .num{font-size:58px;font-weight:800;letter-spacing:-.04em}
.hero .lab{font-size:13.5px;opacity:.85}
.hgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-top:22px}
.hcard{background:#fff;border:1px solid rgba(27,27,24,.1);border-radius:16px;padding:16px 18px}
.hcard .v{font-size:26px;font-weight:800}
.hcard .k{font-size:12px;color:var(--sub);font-weight:600}
.hcard.acc .v{color:var(--indigo)} .hcard.g .v{color:var(--green)} .hcard.a .v{color:var(--amber)} .hcard.r .v{color:var(--red)}
h2{font-size:16px;margin:34px 0 12px;letter-spacing:-.02em}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.card{background:#fff;border:1px solid rgba(27,27,24,.1);border-radius:16px;padding:16px}
.card .dom{font-size:12.5px;font-weight:700;color:var(--sub)}
.card .big{font-size:34px;font-weight:800;color:var(--indigo);letter-spacing:-.03em}
.card .sub{font-size:11.5px;color:var(--sub)}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden;border:1px solid rgba(27,27,24,.1);font-size:13.5px}
th,td{padding:10px 14px;text-align:left;border-bottom:1px solid rgba(27,27,24,.07)}
th{background:rgba(91,91,214,.08);font-size:12px;color:var(--sub)}
td b{color:var(--indigo)}
.note{margin-top:26px;font-size:12.5px;color:var(--sub);background:#fff;border:1px solid rgba(27,27,24,.1);border-radius:14px;padding:14px 16px}
.note b{color:var(--ink)}
</style>
</head>
<body>
<div class="wrap">
  <h1>Lawchart 정확도</h1>
  <div class="tag">공개 골드셋 100건(합성 70 + 판결문체 10 + 개발 20 홀드아웃 구성) · 측정일 ${lawAll.meta.date.slice(0, 10)} · 규칙 파서만 사용(AI 미사용)</div>

  <div class="hero">
    <div><div class="num">${pct(lawAll.overall.relStrict.f1)}</div><div class="lab">관계 추출 F1 (엄격: 당사자쌍+방향+라벨)</div></div>
    <div><div class="num">${pct(lawAll.overall.parties.f1)}</div><div class="lab">당사자 검출 F1</div></div>
    <div><div class="num">${pct(lawAll.dateAccuracy.rate)}</div><div class="lab">날짜 정확도</div></div>
  </div>

  <div class="hgrid">
    <div class="hcard acc"><div class="v">${pct(lawAll.overall.relStrict.precision)}</div><div class="k">관계 정밀도</div></div>
    <div class="hcard g"><div class="v">${pct(lawAll.overall.relStrict.recall)}</div><div class="k">관계 재현율</div></div>
    <div class="hcard a"><div class="v">${pct(lawHold.overall.relStrict.f1)}</div><div class="k">홀드아웃 40건 F1 (미학습 지문)</div></div>
    <div class="hcard r"><div class="v">${pct(orig.overall.relStrict.f1)}</div><div class="k">원본 plot 기준선(동일 지문)</div></div>
  </div>

  <h2>법역별</h2>
  <div class="cards">${domRows}</div>

  ${hasAI ? `
  <h2>AI 보조 경로(옵션·자기 키 사용)</h2>
  <table>
    <tr><th>지표</th><th>규칙 파서(기본)</th><th>AI 경로(GLM-5, 옵트인)</th></tr>
    <tr><td>관계 F1(엄격)</td><td><b>${pct(lawAll.overall.relStrict.f1)}</b></td><td>${pct(aiAll.overall.relStrict.f1)}</td></tr>
    <tr><td>당사자 F1</td><td>${pct(lawAll.overall.parties.f1)}</td><td>${pct(aiAll.overall.parties.f1)}</td></tr>
    <tr><td>날짜 정확도</td><td>${pct(lawAll.dateAccuracy.rate)}</td><td>${pct(aiAll.dateAccuracy.rate)}</td></tr>
  </table>
  <div class="note" style="margin-top:10px">AI 경로는 사용자의 API 키로 브라우저에서 직접 호출하는 옵션입니다. 실패 시 규칙 파서로 자동 폴백하며, 기본값은 꺼져 있습니다.</div>
  ` : ''}

  ${hasReal ? `
  <h2>실제 판결문 일반화 검증 (10건 소표본)</h2>
  <table>
    <tr><th>지표</th><th>규칙 파서</th><th>AI 경로(GLM-5)</th></tr>
    <tr><td>관계 F1(엄격)</td><td>${pct(realLaw.overall.relStrict.f1)}</td><td><b>${realAI ? pct(realAI.overall.relStrict.f1) : '—'}</b></td></tr>
    <tr><td>당사자 F1</td><td>${pct(realLaw.overall.parties.f1)}</td><td>${realAI ? pct(realAI.overall.parties.f1) : '—'}</td></tr>
  </table>
  <div class="note" style="margin-top:10px">
    <b>일반화 갭:</b> 실제 판결문(law.go.kr, 사실관계 부분 verbatim 10건)에서는 합성 골드셋 대비 정확도가 크게 낮아지며,
    <b>개방 문체에서는 AI 경로가 규칙 파서를 크게 앞섭니다</b>${realAI && realAI.overall.relStrict.f1 > realLaw.overall.relStrict.f1 ? ` (${pct(realAI.overall.relStrict.f1)} vs ${pct(realLaw.overall.relStrict.f1)})` : ''}.
    이것이 두 경로를 함께 제공하는 이유입니다 — 짧고 통제된 지문(사례집·시험)에는 무료·즉시·오프라인 규칙 파서가,
    실제 판결문 같은 긴·개방 문체에는 AI 옵트인이 적합합니다.
    소표본(10건)이므로 신뢰구간이 넓고, 세트 확대를 진행 중입니다.
  </div>
  ` : ''}

  <h2>측정 방법</h2>
  <table>
    <tr><th>항목</th><th>내용</th></tr>
    <tr><td>골드셋</td><td>민법 50 · 상법 20 · 형사 16 · 민사소송법 14 = 100건. 사람이 라벨링한 정답(당사자·관계·방향·날짜·목적물)</td></tr>
    <tr><td>엄격 기준</td><td>관계는 (누가→누구, 방향, 라벨 기본형)이 모두 일치할 때만 정답. 날짜는 별도 지표</td></tr>
    <tr><td>홀드아웃</td><td>파서 개발에 쓰지 않은 40건(합성 30 + 판결문체 10)으로 일반화 성능을 별도 측정</td></tr>
    <tr><td>재현</td><td>골드셋·측정 스크립트는 저장소에 공개 (<code>phase0/</code>)</td></tr>
  </table>

  <div class="note">
    <b>정직한 한계:</b> 홀드아웃 1차 측정(파서 무보정)에서는 관계 F1 64.7%였고, 그 결과로 규칙을 보강한 뒤 ${pct(lawHold.overall.relStrict.f1)}입니다.
    골드셋은 합성 지문 위주라 실제 사례집·판결문 전문과는 표현 분포가 다를 수 있으며, 절차 이벤트(통지·판결 등)는 측정에서 제외됩니다. 정확도는 지속 측정·갱신됩니다.
  </div>
</div>
</body>
</html>`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('WROTE', OUT);
