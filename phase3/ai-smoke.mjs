// ai.js 계약 스모크 — 모의 fetch로 3가지 응답 형태 검증 (일회성, node phase4-smoke.mjs)
import { parseWithAI, normalizeAI, _internals } from '../app/src/ai.js';

const mock = content => async () => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });
let fails = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fails++; console.log('FAIL', name, '→', JSON.stringify(a)); } else console.log('ok', name); };

// 1) 정상 JSON
_internals.fetchImpl = mock('{"parties":["갑","을"],"relations":[{"from":"갑","to":"을","label":"매도 (X토지)","kind":"contract","date":"2020. 3. 1.","obj":"X토지"},{"from":"갑","to":"을","label":"매도","kind":"contract","date":"2020. 3. 1.","obj":null},{"from":"갑","to":"갑","label":"매도","kind":"contract","date":null,"obj":null}],"events":[]}');
let out = await parseWithAI('지문', { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' });
eq('정상 JSON — parties', out.parties, ['갑', '을']);
eq('정상 JSON — 중복/자기자신 제거 후 1건', out.relations.length, 1);
eq('정상 JSON — 라벨 괄호 제거·obj', out.relations[0].label === '매도' && out.relations[0].obj === 'X토지' && out.relations[0].date === '2020. 3. 1.', true);

// 2) 코드펜스 + 잡담 포함
_internals.fetchImpl = mock('분석 결과입니다:\n```json\n{"parties":["A"],"relations":[{"from":"A","to":"B","label":"기망","kind":"dispute","date":"2021.1.1","obj":null}],"events":[]}\n```');
out = await parseWithAI('지문', { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' });
eq('코드펜스 추출', out.relations[0].label === '기망' && out.relations[0].date === '2021. 1. 1.', true);

// 3) 파손 응답 → null (폴백 신호)
_internals.fetchImpl = mock('JSON이 아니에요');
eq('파손 응답 → null', await parseWithAI('지문', { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' }), null);

// 4) HTTP 실패 → null
_internals.fetchImpl = async () => ({ ok: false, json: async () => ({}) });
eq('HTTP 실패 → null', await parseWithAI('지문', { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' }), null);

// 5) 설정 누락 → null (네트워크 호출 없음)
eq('설정 누락 → null', await parseWithAI('지문', { baseUrl: '', apiKey: '', model: '' }), null);

// 6) normalizeAI 방어: 잘못 kind·빈 라벨·과장 obj
const n = normalizeAI({ parties: ['갑'], relations: [{ from: '갑', to: '을', label: '  ', kind: 'weird', obj: '아주 긴 목적물 이름이어도 잘리는지 확인합니다' }], events: [{ text: 'x' }] });
eq('빈 라벨 제거', n.relations.length, 0);

console.log(fails === 0 ? 'AI-SMOKE-PASS' : `AI-SMOKE-FAIL(${fails})`);
process.exit(fails === 0 ? 0 : 1);
