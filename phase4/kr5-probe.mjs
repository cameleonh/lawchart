// KR5 사전 점검 — GLM 코딩 엔드포인트 1건 호출 (키는 출력하지 않음)
import { parseWithAI } from '../app/src/ai.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const key = process.env.ZAI_API_KEY;
if (!key) { console.log('ZAI_API_KEY 없음'); process.exit(1); }
const cfg = {
  baseUrl: process.env.LAWCHART_AI_BASE || 'https://api.z.ai/api/coding/paas/v4',
  apiKey: key,
  model: process.env.LAWCHART_AI_MODEL || 'glm-5',
};
const goldset = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'phase0', 'goldset', 'civil.json'), 'utf8'));
const c = goldset[0];
const t0 = Date.now();
const out = await parseWithAI(c.text, cfg);
const ms = Date.now() - t0;
console.log('endpoint:', cfg.baseUrl, '| model:', cfg.model, '| elapsed:', ms + 'ms');
if (!out) { console.log('RESULT: null (폴백 신호) — 응답 형태 확인 필요'); process.exit(2); }
console.log('parties:', out.parties.join(','));
for (const r of out.relations) console.log(' ', r.from, '→', r.to, r.label, r.kind, r.date);
console.log('gold:', c.relations.map(r => `${r.from}|${r.to}|${r.label.replace(/\s*[(（].*$/, '')}`).join('  //  '));
