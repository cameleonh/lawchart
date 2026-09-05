#!/usr/bin/env node
'use strict';
/*
 * Lawchart Phase 0 — 골드셋 측정 스크립트
 * 산식은 phase0/labeling-guidelines.md §4와 1:1 대응.
 * 사용법:
 *   node evaluate.js [--verbose]
 * 결과: 콘솔 마크다운 표 + report/baseline_original.json
 */
const fs = require('fs');
const path = require('path');
const { runOriginalParser } = require('./original-runner');

const ROOT = path.join(__dirname, '..');
const GOLD_DIR = path.join(ROOT, 'goldset');
const REPORT_DIR = path.join(ROOT, 'report');

const DOMAIN_FILES = [
  ['civil.json', '민법'],
  ['commercial.json', '상법'],
  ['criminal.json', '형사'],
  ['procedural.json', '민사소송법'],
];

const THING_HINT = /토지|대지|임야|건물|주택|아파트|빌라|상가|점포|오피스텔|부동산|자동차|차량|물건|기계|선박|주식|물품|지갑|그림|보석|반지|시계|가방|노트북|컴퓨터|어음|수표|채권|예금|신주|화물|스마트폰/;

const baseLabel = l => String(l || '').replace(/\s*[(（].*$/, '').trim();
const normDate = d => {
  const m = String(d || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return m ? `${+m[1]}.${+m[2]}.${+m[3]}` : null;
};
const objFromLabel = label => {
  const m = String(label || '').match(/[(（]([^)）]*)[)）]/);
  if (!m) return null;
  const w = (m[1].trim().split(/\s+/)[0] || '').replace(/[,·]$/, '');
  return w && THING_HINT.test(w) ? w : null;
};

const keyStrict = r => `${r.from}|${r.to}|${r.base}`;
const keyDirless = r => `${[r.from, r.to].sort().join('~')}|${r.base}`;
const keyPair = r => [r.from, r.to].sort().join('~');

function loadGoldset(which) {
  const files = which === 'holdout'
    ? [['../goldset2/holdout-synth.json', '합성홀드아웃'], ['../goldset2/holdout-court.json', '판결문체홀드아웃']]
    : which === 'real'
      ? [['../goldset3/real-cases.json', '실판례홀드아웃']]
      : which === 'all'
        ? [...DOMAIN_FILES, ['../goldset2/holdout-synth.json', '합성홀드아웃'], ['../goldset2/holdout-court.json', '판결문체홀드아웃']]
        : DOMAIN_FILES;
  return files.flatMap(([file]) => JSON.parse(fs.readFileSync(path.resolve(GOLD_DIR, file), 'utf8')));
}

function predictOriginal(c) {
  const out = runOriginalParser(c.text);
  return {
    parties: out.parties || [],
    relations: (out.relations || [])
      .filter(r => r.from !== r.to)
      .map(r => ({ from: r.from, to: r.to, base: baseLabel(r.label), date: r.date || null, obj: objFromLabel(r.label) })),
  };
}

let lawchartMod = null;
async function predictLawchart(c) {
  if (!lawchartMod) {
    lawchartMod = await import(require('url').pathToFileURL(path.join(__dirname, '..', '..', 'app', 'src', 'parser.js')).href);
  }
  const out = lawchartMod.parse(c.text);
  return {
    parties: out.parties || [],
    relations: (out.relations || [])
      .filter(r => r.from !== r.to)
      .map(r => ({ from: r.from, to: r.to, base: baseLabel(r.label), date: r.date || null, obj: r.obj || objFromLabel(r.label) })),
  };
}

let aiMod = null;
let aiThrottle = Promise.resolve();
async function predictAI(c) {
  if (!aiMod) {
    aiMod = await import(require('url').pathToFileURL(path.join(__dirname, '..', '..', 'app', 'src', 'ai.js')).href);
  }
  const cfg = {
    baseUrl: process.env.LAWCHART_AI_BASE || 'https://api.openai.com/v1',
    apiKey: process.env.LAWCHART_AI_KEY || '',
    model: process.env.LAWCHART_AI_MODEL || 'gpt-4o-mini',
  };
  // 순차 실행 + 300ms 간격(요청 폭주 방지)
  const run = aiThrottle.then(async () => {
    const out = await aiMod.parseWithAI(c.text, cfg);
    if (!out) console.error('  [AI 응답 실패로 공란 처리]', c.id);
    await new Promise(r => setTimeout(r, 300));
    return out || { parties: [], relations: [], events: [], objects: [] };
  });
  aiThrottle = run.catch(() => {});
  return {
    parties: (await run).parties || [],
    relations: ((await run).relations || [])
      .filter(r => r.from !== r.to)
      .map(r => ({ from: r.from, to: r.to, base: baseLabel(r.label), date: r.date || null, obj: r.obj || objFromLabel(r.label) })),
  };
}

function prf(TP, FP, FN) {
  const p = TP + FP ? TP / (TP + FP) : 0;
  const r = TP + FN ? TP / (TP + FN) : 0;
  return { precision: +p.toFixed(4), recall: +r.toFixed(4), f1: +(p + r ? 2 * p * r / (p + r) : 0).toFixed(4) };
}

function emptyBucket() {
  return { parties: { TP: 0, FP: 0, FN: 0 }, relStrict: { TP: 0, FP: 0, FN: 0 }, relDirless: { TP: 0, FP: 0, FN: 0 }, relPair: { TP: 0, FP: 0, FN: 0 }, objects: { TP: 0, FP: 0, FN: 0 } };
}

function compareSets(goldArr, predArr, bucket) {
  const G = new Set(goldArr), P = new Set(predArr);
  for (const k of P) { if (G.has(k)) bucket.TP++; else bucket.FP++; }
  for (const k of G) if (!P.has(k)) bucket.FN++;
  return G;
}

async function evaluate(cases, predictor) {
  const total = emptyBucket();
  const byDomain = {}, byDiff = {};
  const perCase = [];
  const dateStat = { hit: 0, total: 0 };

  for (const c of cases) {
    const pred = await predictor(c);
    const b = emptyBucket();

    compareSets(c.parties, pred.parties, b.parties);

    const goldRel = c.relations.map(r => ({ ...r, base: baseLabel(r.label) }));
    const predRel = pred.relations;

    const gS = compareSets(goldRel.map(keyStrict), predRel.map(keyStrict), b.relStrict);
    compareSets(goldRel.map(keyDirless), predRel.map(keyDirless), b.relDirless);
    compareSets(goldRel.map(keyPair), predRel.map(keyPair), b.relPair);

    const goldDate = new Map(goldRel.map(r => [keyStrict(r), r.date]));
    const predDate = new Map(predRel.map(r => [keyStrict(r), r.date]));
    for (const k of gS) {
      const gd = normDate(goldDate.get(k));
      if (!gd) continue;
      dateStat.total++;
      if (normDate(predDate.get(k)) === gd) dateStat.hit++;
    }

    compareSets(c.objects || [], predRel.map(r => r.obj).filter(Boolean), b.objects);

    for (const field of Object.keys(total)) for (const k of ['TP', 'FP', 'FN']) total[field][k] += b[field][k];
    (byDomain[c.domain] = byDomain[c.domain] || emptyBucket());
    for (const field of Object.keys(b)) for (const k of ['TP', 'FP', 'FN']) byDomain[c.domain][field][k] += b[field][k];
    (byDiff[c.difficulty] = byDiff[c.difficulty] || emptyBucket());
    for (const field of Object.keys(b)) for (const k of ['TP', 'FP', 'FN']) byDiff[c.difficulty][field][k] += b[field][k];

    const predKeys = new Set(predRel.map(keyStrict));
    perCase.push({
      id: c.id, domain: c.domain, difficulty: c.difficulty,
      partiesF1: prf(b.parties.TP, b.parties.FP, b.parties.FN).f1,
      strictF1: prf(b.relStrict.TP, b.relStrict.FP, b.relStrict.FN).f1,
      missedGold: [...gS].filter(k => !predKeys.has(k)),
      extraPred: [...predKeys].filter(k => !gS.has(k)),
    });
  }

  const summarize = b => ({
    parties: prf(b.parties.TP, b.parties.FP, b.parties.FN),
    relStrict: prf(b.relStrict.TP, b.relStrict.FP, b.relStrict.FN),
    relDirless: prf(b.relDirless.TP, b.relDirless.FP, b.relDirless.FN),
    relPair: prf(b.relPair.TP, b.relPair.FP, b.relPair.FN),
    objects: prf(b.objects.TP, b.objects.FP, b.objects.FN),
  });

  return {
    meta: { cases: cases.length, parser: 'original plot parseFacts (baseline)', date: new Date().toISOString() },
    overall: summarize(total),
    dateAccuracy: { hit: dateStat.hit, total: dateStat.total, rate: dateStat.total ? +(dateStat.hit / dateStat.total).toFixed(4) : null },
    byDomain: Object.fromEntries(Object.entries(byDomain).map(([d, b]) => [d, summarize(b)])),
    byDifficulty: Object.fromEntries(Object.entries(byDiff).map(([d, b]) => [d, summarize(b)])),
    perCase,
  };
}

function fmt(x) { return x == null ? '—' : x.toFixed(3); }

function printReport(title, res, verbose) {
  const o = res.overall;
  console.log(`# Lawchart 골드셋 측정 — ${title}`);
  console.log(`사건 ${res.meta.cases}건 · 측정일 ${res.meta.date}\n`);
  console.log('| 지표 | P | R | F1 |');
  console.log('|---|---|---|---|');
  console.log(`| 당사자 | ${fmt(o.parties.precision)} | ${fmt(o.parties.recall)} | **${fmt(o.parties.f1)}** |`);
  console.log(`| 관계(엄격: 쌍+방향+라벨) | ${fmt(o.relStrict.precision)} | ${fmt(o.relStrict.recall)} | **${fmt(o.relStrict.f1)}** |`);
  console.log(`| 관계(방향 무시) | ${fmt(o.relDirless.precision)} | ${fmt(o.relDirless.recall)} | ${fmt(o.relDirless.f1)} |`);
  console.log(`| 관계(쌍만) | ${fmt(o.relPair.precision)} | ${fmt(o.relPair.recall)} | ${fmt(o.relPair.f1)} |`);
  console.log(`| 목적물 | ${fmt(o.objects.precision)} | ${fmt(o.objects.recall)} | ${fmt(o.objects.f1)} |`);
  console.log(`\n날짜 정확도(엄격 TP 중): ${res.dateAccuracy.hit}/${res.dateAccuracy.total} = ${fmt(res.dateAccuracy.rate)}\n`);
  const dmName = Object.fromEntries(DOMAIN_FILES.map(([f, n]) => [f.replace('.json', ''), n]));
  console.log('| 법역 | 당사자 F1 | 관계 F1(엄격) |');
  console.log('|---|---|---|');
  for (const [d, s] of Object.entries(res.byDomain)) console.log(`| ${dmName[d] || d} | ${fmt(s.parties.f1)} | ${fmt(s.relStrict.f1)} |`);
  console.log('\n| 난이도 | 당사자 F1 | 관계 F1(엄격) |');
  console.log('|---|---|---|');
  for (const [d, s] of Object.entries(res.byDifficulty)) console.log(`| ${d} | ${fmt(s.parties.f1)} | ${fmt(s.relStrict.f1)} |`);
  if (verbose) {
    console.log('\n## 사건별 누락(정답−예측) / 과잉(예측−정답)');
    for (const pc of res.perCase) {
      if (!pc.missedGold.length && !pc.extraPred.length) continue;
      console.log(`\n**${pc.id}** (${pc.domain}/${pc.difficulty}) strict F1=${fmt(pc.strictF1)}`);
      if (pc.missedGold.length) console.log('  - 누락: ' + pc.missedGold.join(' / '));
      if (pc.extraPred.length) console.log('  - 과잉: ' + pc.extraPred.join(' / '));
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const which = args.includes('--parser') ? args[args.indexOf('--parser') + 1] : 'both';
  const domainFilter = args.includes('--filter') ? args[args.indexOf('--filter') + 1] : null;
  const set = args.includes('--set') ? args[args.indexOf('--set') + 1] : 'main';
  let cases = loadGoldset(set);
  if (domainFilter) cases = cases.filter(c => c.domain === domainFilter);

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const suffix = set === 'main' ? 'phase1' : `p2_${set}`;
  const runs = [];
  if (which === 'original' || which === 'both') {
    const res = await evaluate(cases, predictOriginal);
    fs.writeFileSync(path.join(REPORT_DIR, `${suffix}_original.json`), JSON.stringify(res, null, 2), 'utf8');
    runs.push(['원본 plot 파서(기준선)', res, `${suffix}_original.json`]);
  }
  if (which === 'lawchart' || which === 'both') {
    const res = await evaluate(cases, predictLawchart);
    fs.writeFileSync(path.join(REPORT_DIR, `${suffix}_lawchart.json`), JSON.stringify(res, null, 2), 'utf8');
    runs.push(['Lawchart 파서 v1', res, `${suffix}_lawchart.json`]);
  }
  if (which === 'ai') {
    if (!process.env.LAWCHART_AI_KEY) {
      console.error('AI 측정에는 LAWCHART_AI_KEY 환경변수가 필요합니다 (선택: LAWCHART_AI_BASE, LAWCHART_AI_MODEL).\n예: set LAWCHART_AI_KEY=sk-... && node evaluate.js --parser ai --set all\n주의: 건당 1회 LLM 호출 — 비용 발생.');
      process.exit(1);
    }
    console.error(`AI 측정 — ${process.env.LAWCHART_AI_MODEL || 'gpt-4o-mini'} @ ${process.env.LAWCHART_AI_BASE || 'https://api.openai.com/v1'} · ${cases.length}건 호출(비용 발생)`);
    const res = await evaluate(cases, predictAI);
    fs.writeFileSync(path.join(REPORT_DIR, `${suffix}_ai.json`), JSON.stringify(res, null, 2), 'utf8');
    runs.push(['AI 경로(BYOK)', res, `${suffix}_ai.json`]);
  }
  for (const [name, res] of runs) printReport(name, res, verbose);
}

main().catch(e => { console.error(e); process.exit(1); });
