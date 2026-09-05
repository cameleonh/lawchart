// Lawchart AI 파서 (F9) — BYOK 방식: 사용자 키로 브라우저/Node에서 직접 호출 (서버 없음)
// 계약: 규칙 파서와 동일한 {parties, relations, events} 형태로 정규화해서 반환.
// 실패 시 예외를 던지지 않고 null 반환 — 호출측(parseFacts)이 규칙 파서로 폴백.
import { ACTION_PATTERNS } from './dict.js';

const KINDS = new Set(['contract', 'money', 'security', 'dispute', 'status', 'other']);

// 통제 어휘 — 사전에서 단일 소스로 도출 (사전 확장 시 프롬프트도 자동 갱신)
const VOCAB = [...new Set(ACTION_PATTERNS.map(p => p.label).filter(l => l !== '사망' && l !== '설립'))];
const KIND_KR = { contract: '계약·거래', money: '금전', security: '담보', dispute: '분쟁·범죄', status: '신분', other: '기타' };

export function buildPrompt() {
  return `당신은 한국어 법률 사실관계 지문에서 당사자와 법률관계를 추출하는 분석기다.
지문을 읽고 아래 JSON 형태로만 답하라. 설명·마크다운 금지. 순수 JSON만.

{
 "parties": ["갑", "을", ...],
 "relations": [
   {"from": "행위자", "to": "상대방", "label": "통제어휘", "kind": "contract|money|security|dispute|status|other", "date": "2020. 3. 1." 또는 null, "obj": "목적물" 또는 null}
 ],
 "events": [
   {"date": "2021. 6. 1.", "text": "갑 해제 통지"}
 ]
}

규칙:
1. parties: 법적 주체만. 목적물(X토지, 어음)은 제외. 역할어(원고/피고/피고인/피해자/회사)도 당사자로 포함. 법원·검찰은 제외. 당사자 표기는 지문 문자열 그대로(갑, 을, A주식회사). '갑의 채권자'처럼 소유격 수식으로 지칭된 자는, 그 자신이 행위 주체일 때 '채권자' 단독으로 표기하고 수식어를 붙이지 마라.
2. relations의 label은 반드시 이 통제 어휘 중 하나로: ${VOCAB.join(', ')}.
3. 방향은 라벨의 의미 기준: 매도=매도인→매수인, 임대=임대인→임차인, 금전대여=대여자→차용자, 담보류(근저당권 설정·보증·담보 제공 등)와 전세권·질권 설정=설정(제공)한 자→권리자, 위임·도급·고용=위임자(도급인·고용주)→수탁자, 양도·채권양도=양도인→양수인, 기망·횡령 등 범죄=가해자→피해자, 상속=피상속인→상속인, 유증·증여=주는 자→받는 자.
4. 수동·수취 표현("설정받았다","매수하였다","위탁받았다")도 방향 규칙을 따라 정규화하라. 설정등기·설정행위를 한 자가 담보류 관계의 from이다("을이 전세권을 설정등기하였다" → 을→갑).
5. 라벨 구분: 재판매(전매·재매도·다시 매도)는 '전매'. '계약을 체결'은 '계약'(매도가 아님). 수령·교부받음("교부받았다")은 '지급' 관계가 아니다. '지급을 청구/구하는'은 지급이 아니라 청구·제소.
6. 함의 추출(단어가 없어도): (a) 위탁받은 금전·물건의 임의 소비·사용 = '횡령'. (b) 위탁받은 임무에 위배되는 처분(승낙 없이 담보 제공·자기 이익 취득 등) = '배임'. 소비·유용은 횡령, 처분·이익취득은 배임.
7. 형사 관계의 상대: 피해자는 직접 대상 또는 피해 물건의 소유자('갑의 지갑을 훔쳤다' → 갑). 절도·강도는 범인→소유자. '장물취득'은 취득자→원 절취자.
8. date는 지문의 날짜("2020. 3. 1." 형식). 상대 표현(그 다음날·같은 날)은 환산한 절대 날짜. 없으면 null.
9. obj는 지문에 나오는 특정 목적물 명칭(X토지, A주택, 약속어음)으로 가능한 한 채워라. 금전 액수는 obj가 아니다.
10. 부정("지급하지 않았다")·미실현("인도하려고")·배경 설명은 관계에서 제외. 통지·판결·항소 등 절차는 events에만. 하나의 법률행위 = 1개 관계, 중복 금지.`;
}

// 모의 응답 주입용(테스트·측정 하네스): fetch를 갈아끼울 수 있게 모듈이 직접 참조
export const _internals = { fetchImpl: (...a) => fetch(...a) };

const normDate = d => {
  const m = String(d || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return m ? `${+m[1]}. ${+m[2]}. ${+m[3]}.` : null;
};
const baseOf = l => String(l || '').replace(/\s*[(（].*$/, '').trim();

// AI 출력 정규화·검증 — 규칙 파서 출력과 동일 구조로
export function normalizeAI(raw, fallbackParties = []) {
  if (!raw || typeof raw !== 'object') return null;
  const parties = [...new Set([...(Array.isArray(raw.parties) ? raw.parties : []).map(String)])].filter(p => p && p.length <= 20);
  const relations = [];
  const seen = new Set();
  for (const r of (Array.isArray(raw.relations) ? raw.relations : [])) {
    if (!r || typeof r !== 'object') continue;
    const from = String(r.from || '').trim(), to = String(r.to || '').trim();
    const label = baseOf(r.label);
    if (!from || !to || from === to || !label) continue;
    const kind = KINDS.has(r.kind) ? r.kind : 'other';
    const date = normDate(r.date);
    const obj = r.obj ? String(r.obj).trim().slice(0, 30) : null;
    const key = `${from}|${to}|${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relations.push({ from, to, label, kind, date, obj });
  }
  const events = (Array.isArray(raw.events) ? raw.events : [])
    .filter(e => e && (e.date || e.text))
    .map(e => ({ date: normDate(e.date), text: String(e.text || '').slice(0, 60) }));
  if (!parties.length && !fallbackParties.length && !relations.length) return null;
  return { parties, relations, events, objects: [...new Set(relations.map(r => r.obj).filter(Boolean))] };
}

function extractJSON(text) {
  const t = String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '') // 추론 태그 방어(GLM 등)
    .trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch {}
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch {} }
  return null;
}

/**
 * AI 파싱. 성공 → normalizeAI 결과, 실패 → null (호출측 폴백).
 * cfg: { baseUrl, apiKey, model } — baseUrl은 /chat/completions 직전까지 (예: https://api.openai.com/v1)
 */
export async function parseWithAI(text, cfg) {
  if (!cfg || !cfg.apiKey || !cfg.baseUrl || !cfg.model) return null;
  let res;
  try {
    res = await _internals.fetchImpl(cfg.baseUrl.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.apiKey },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        messages: [
          { role: 'system', content: buildPrompt() },
          { role: 'user', content: '지문:\n' + text },
        ],
      }),
    });
  } catch { return null; }
  if (!res.ok) return null;
  let j;
  try { j = await res.json(); } catch { return null; }
  const content = j?.choices?.[0]?.message?.content;
  if (!content) return null;
  return normalizeAI(extractJSON(content));
}
