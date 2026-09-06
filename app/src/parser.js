// Lawchart 파서 v2 — 사실관계 지문 → {parties, relations, events, objects}
// 자체 설계·작성 (클린룸: reference/ 원본 코드 무참조)
// 방향 규칙은 라벨링 기준 §6(통제 어휘)의 의미 방향을 따른다.
import {
  ACTION_PATTERNS, EVENT_PATTERNS, THING_RE, THING_NOUNS,
  HANJA, ROLE_WORDS, ORG_WORDS, STOPWORDS,
} from './dict.js';

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const baseLabel = l => String(l || '').replace(/\s*[(（].*$/, '').trim();
const isCompanyName = p => /(주식회사|유한회사|합자회사|보험회사|회사|은행)$/.test(p);

const COMPANY_SUFFIX = '주식회사|유한회사|합자회사|보험회사|은행|회사';
const PARTICLES = '은|는|이|가|의|에게|에게서|한테|한테서|을|를|과|와|으로부터|로부터|에|도|만|이며|이고|,|에서|로|으로|\\s?앞으로|\\s?소유';

/* ── 당사자 추출 ─────────────────────────────────────────── */
export function findParties(text) {
  const set = new Set(), order = [];
  const add = p => { if (p && !set.has(p)) { set.add(p); order.push(p); } };

  for (const ch of text) if (HANJA.includes(ch)) add(ch);
  for (const m of text.matchAll(new RegExp(`(?<![가-힣])([갑을병정])(?=(?:${PARTICLES}))`, 'g'))) add(m[1]);

  // 회사명: 접미사(유한회사·보험회사 등 포함) + 붙은 접두사(한글·영문)
  for (const m of text.matchAll(new RegExp(`([A-Z가-힣]{1,6})(${COMPANY_SUFFIX})`, 'g'))) {
    add(m[1] + m[2]);
  }

  const thingNext = new RegExp('^\\s?(?:' + THING_NOUNS + ')');
  const companyNext = new RegExp(`^\\s?(?:${COMPANY_SUFFIX})`);
  for (const m of text.matchAll(/(?<![A-Za-z가-힣])([A-Z])(?![A-Za-z])/g)) {
    const after = text.slice(m.index + 1, m.index + 8);
    if (thingNext.test(after) || companyNext.test(after)) continue;
    add(m[1]);
  }

  // 역할어: 조사가 붙어도 검출 (수식어는 "역할어 + 당사자 후보" 형태만 제외)
  for (const w of [...ROLE_WORDS].sort((a, b) => b.length - a.length)) {
    if (!new RegExp(`(?<![가-힣])${w}(?=(?:${PARTICLES}))`).test(text)) continue;
    if (new RegExp(`${w}\\s+[갑을병정甲-癸A-Z]`).test(text)) continue;
    if (ROLE_WORDS.some(o => o.length > w.length && o.startsWith(w) && new RegExp(`(?<![가-힣])${o}`).test(text))) continue;
    add(w);
  }

  // 판결문식 표기: 번호형 역할어(피고 1), 소외·공소외(소외 2, 소외 1 회사), 역할어+회사 복합형(피고 회사)
  const EDGE = `(?=(?:${PARTICLES})|\\s|$|[,.])`;
  const CO_SUF = '주식회사|유한회사|회사|은행';
  const ROLE_PREFIX = /^(?:소외|공소외|원고|피고|피고인|피해자|참가인)$/;
  for (const m of text.matchAll(new RegExp(`(?<![가-힣\\d])((?:원고|피고|피고인|피해자|참가인) \\d+)${EDGE}`, 'g'))) add(m[1]);
  for (const m of text.matchAll(new RegExp(`(?<![가-힣\\d])((?:소외인|소외|공소외)(?: \\d+)?)( ?(?:${CO_SUF}))?${EDGE}`, 'g'))) {
    const whole = (m[1] + (m[2] || '')).trim();
    if (ROLE_PREFIX.test(whole)) continue;
    add(whole);
  }
  const compoundForms = [];
  for (const m of text.matchAll(new RegExp(`(?<![가-힣\\d])((?:원고|피고)(?: \\d+)?)( (?:${CO_SUF}))${EDGE}`, 'g'))) {
    compoundForms.push(m[1] + m[2]);
    add(m[1] + m[2]);
  }
  // 판결문식 복합형이 검출된 지문에서는 bare '회사'류가 같은 표기의 중복이므로 제외
  const judgmentStyle = compoundForms.length > 0 || /(?<![가-힣\d])(?:소외|공소외)(?:인| \d)/.test(text);
  // '피고 1 회사'가 있으면 '피고 1'은 제거(bare '피고'는 단독 사용 규칙이 판단)
  for (const cmp of compoundForms) {
    const base = cmp.replace(new RegExp(` (?:${CO_SUF})$`), '');
    if (/ \d+$/.test(base)) set.delete(base);
  }
  for (const w of ['원고', '피고', '피고인', '피해자', '참가인']) {
    const hasNumOrCmp = new RegExp(`(?<![가-힣\\d])${w}(?: \\d+| (?:${CO_SUF}))`).test(text);
    const standalone = new RegExp(`(?<![가-힣\\d])${w}(?=(?:${PARTICLES}))`).test(text);
    if (hasNumOrCmp && !standalone) set.delete(w);
  }

  // 빈출 2-4글자 명사(조사 동반 2회 이상) + 단일 조사 언급 이름(에게류 1회)
  const freq = new Map();
  const thingWord = new RegExp(`^(?:${THING_NOUNS})$`);
  for (const m of text.matchAll(/(?<![가-힣\d])((?:[가-힣]){2,4})(?=(?:은|는|이|가|에게|한테|에게서|으로부터|로부터|을|를|와|과|의)(?![가-힣]))/g)) {
    const w = m[1];
    if (STOPWORDS.test(w) || thingWord.test(w) || ROLE_PREFIX.test(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  for (const [w, n] of freq) if (n >= 2) add(w);
  for (const m of text.matchAll(/(?<![가-힣\d])((?:[가-힣]){2,3})(에게|한테|에게서)(?![가-힣])/g)) {
    const w = m[1];
    if (STOPWORDS.test(w) || thingWord.test(w) || /주식회사|회사|은행$/.test(w) || ROLE_PREFIX.test(w)) continue;
    add(w);
  }

  // 판결문식 지문에서 freq가 재추가한 bare '회사'류도 최종 제외 (합성 지문의 '회사' party는 유지)
  if (judgmentStyle) for (const w of ['회사', '주식회사', '유한회사', '은행']) set.delete(w);
  return [...new Set(order)].filter(p => set.has(p) && !ORG_WORDS.includes(p));
}

/* ── 날짜 마스킹·상대 날짜 환산 ──────────────────────────── */
function maskDates(text) {
  return text.replace(/(\d{4})\s*[.년]\s*(\d{1,2})\s*[.월]\s*(\d{1,2})\s*[.일]?/g,
    (_, y, mm, d) => `⟦${+y}.${+mm}.${+d}⟧`);
}

const shiftDate = (key, n) => {
  const [y, m, d] = key.split('.').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}.${dt.getUTCMonth() + 1}.${dt.getUTCDate()}`;
};

function resolveRelativeDates(masked) {
  const RE = /⟦([^⟧]+)⟧|그 ?다음 ?날|다음 ?날|이튿날|익일|같은 ?날|당일|(같은 ?해|그해)\s*(\d{1,2})\s*[.월]\s*(\d{1,2})\s*[.일]?|같은 ?달\s*(\d{1,2})\s*[.일]?/g;
  let last = null, first = null, out = '', idx = 0, m;
  while ((m = RE.exec(masked))) {
    out += masked.slice(idx, m.index);
    idx = m.index + m[0].length;
    if (m[1]) { last = m[1]; if (!first) first = m[1]; out += m[0]; }
    else if (m[3] !== undefined) { // 같은 해 M. D. — 직전(또는 첫) 연도
      const y = (last || first || '2000.1.1').split('.')[0];
      const key = `${y}.${+m[3]}.${+m[4]}`;
      last = key; out += `⟦${key}⟧`;
    }
    else if (m[5] !== undefined) { // 같은 달 D. — 직전 연·월
      const base = (last || first || '2000.1.1').split('.');
      const key = `${base[0]}.${+base[1]}.${+m[5]}`;
      last = key; out += `⟦${key}⟧`;
    }
    else if (/다음 ?날|이튿날|익일/.test(m[0])) {
      const base = last || first;
      out += base ? `⟦${shiftDate(base, 1)}⟧` : m[0];
    } else {
      const base = last || first;
      out += base ? `⟦${base}⟧` : m[0];
    }
  }
  return out + masked.slice(idx);
}

/* ── 문장·절 분할 ──────────────────────────────────────────
 * 분할은 항상 어간을 남기는 형태로만: '-하고/-하며' 리터럴을 쓰면
 * '유치하고'→'유치'처럼 어간이 파괴되므로 조사 글자만 소비한다. */
const CLAUSE_SPLIT = /(?<=[가-힣])고(?=도?[\s,])|(?<=[가-힣])(?:며|으며|지만|으나|이며)[,]?\s*|(?<=[가-힣])(?: ?후| ?뒤)(?:에)?\s*|(?<=[가-힣](?:한|된|은|는|던)) ?다음(?:에)?\s*|하자|했는데|하였는데|인데[,]?\s*/;
const splitSentences = t => t.split(/(?<=[.!?。])\s+|\n+/).map(s => s.trim()).filter(s => s.length > 1);
const splitClauses = s => s.split(CLAUSE_SPLIT).map(c => c.trim()).filter(Boolean);

/* ── 주어·상대·부속 정보 탐색 ────────────────────────────── */
function findSubjectHits(clause, pAlt) {
  return [...clause.matchAll(new RegExp(`(${pAlt})(은|는|이|가)(?![가-힣])`, 'g'))].map(m => ({ p: m[1], i: m.index }));
}

function precedingChain(clause, idx, pAlt) {
  const head = clause.slice(Math.max(0, idx - 18), idx);
  const m = head.match(new RegExp(`((?:${pAlt})(?:(?:\\s*(?:와|과|및|,|·)\\s*)(?:${pAlt}))*)(?:\\s*(?:와|과|및|,|·)\\s*)?$`));
  if (!m) return [];
  return m[1].split(/\s*(?:와|과|및|,|·)\s*/).filter(Boolean);
}

const ATTRIB_END = /(?<!대)(?<!관)(?<!연)(?<!차)(?:한|된|는|은|던|함)\s/;

function tierRegexes(pAlt) {
  return [
    new RegExp(`(${pAlt})\\s*(에게|한테|께)`, 'g'),
    new RegExp(`(${pAlt})\\s*(?:을|를)\\s*상대로`, 'g'),
    new RegExp(`(${pAlt})\\s*에\\s*대(한|하여|해)`, 'g'),
    new RegExp(`(${pAlt})\\s*(와|과)`, 'g'),
    new RegExp(`(${pAlt})\\s*앞으로`, 'g'),
    new RegExp(`(${pAlt})\\s*(?:을|를)?\\s*위하(여|한)`, 'g'),
    new RegExp(`(${pAlt})\\s*소유`, 'g'),
    new RegExp(`(${pAlt})\\s*(?:으로부터|로부터|에게서|한테서)`, 'g'),
    new RegExp(`(${pAlt})\\s*에(?![가-힣])`, 'g'),
  ];
}

function findCounterparty(clause, pAlt, verbIdx, excludeArr, allowPersonDirect) {
  const okBefore = m => m.index < verbIdx && !excludeArr.includes(m[1]);
  const okAny = m => !excludeArr.includes(m[1]);
  for (const re of tierRegexes(pAlt)) {
    const hits = [...clause.matchAll(re)].filter(okBefore);
    if (hits.length) return { party: hits[hits.length - 1][1] };
  }
  const direct = [...clause.matchAll(new RegExp(`(${pAlt})\\s*(을|를)(?!\\s*(?:상대로|위하|대리))`, 'g'))].filter(okBefore);
  const person = direct.filter(m => allowPersonDirect || isCompanyName(m[1]));
  if (person.length) return { party: person[person.length - 1][1] };
  const compAny = [...clause.matchAll(new RegExp(`(${pAlt})\\s*(을|를)`, 'g'))].filter(m => isCompanyName(m[1]) && okAny(m));
  if (compAny.length) return { party: compAny[compAny.length - 1][1] };
  // 물건 소유자(피해자·거래 상대 추정): "(P)의 물건을" — 물건 사전 + 일반명사 모두
  const ownThing = [...clause.matchAll(new RegExp(`(${pAlt})의\\s*(?:[A-Z가-힣]{0,2})?(?:${THING_NOUNS})`, 'g'))].filter(okAny);
  if (ownThing.length) return { party: ownThing[ownThing.length - 1][1] };
  const ownAny = [...clause.matchAll(new RegExp(`(${pAlt})의\\s*[가-힣A-Z0-9]{1,8}\\s*(?:을|를)(?![가-힣])`, 'g'))].filter(okAny);
  if (ownAny.length) return { party: ownAny[ownAny.length - 1][1] };
  // 동사 뒤 조사(피해자가 뒤에 오는 기망·수취 표현): 에게/으로부터 전체 탐색
  for (const re of [new RegExp(`(${pAlt})\\s*(에게|한테)`, 'g'), new RegExp(`(${pAlt})\\s*(?:으로부터|로부터|에게서)`, 'g')]) {
    const hits = [...clause.matchAll(re)].filter(okAny);
    if (hits.length) return { party: hits[0][1] };
  }
  return null;
}

function findThing(clause, verbIdx) {
  const hits = [...clause.matchAll(THING_RE)].filter(h => clause.slice(h.index + h[0].length, h.index + h[0].length + 2) !== '회사');
  const before = hits.filter(h => h.index < verbIdx);
  const pick = before.length ? before[before.length - 1] : hits[0];
  return pick ? { name: pick[1] ? pick[1] + pick[2] : pick[2], idx: pick.index } : null;
}

function findMoney(clause) {
  const m = clause.match(/(\d[\d,]*\s?(?:억|만|천)(?:\s?\d[\d,]*\s?(?:만|천))?\s?원?|\d[\d,]{2,}\s?원)/);
  if (!m) return null;
  let s = m[1].replace(/\s/g, '');
  return /원$/.test(s) ? s : s + '원';
}

function bindDate(clause, verbIdx, fallback) {
  const hits = [...clause.matchAll(/⟦([^⟧]+)⟧/g)];
  const before = hits.filter(h => h.index < verbIdx);
  if (before.length) return before[before.length - 1][1];
  if (hits.length && hits[0].index < 4) return hits[0][1];
  return fallback;
}

const dateKey = d => { const m = String(d || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); return m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0; };
const SERVICE_LABELS = new Set(['위임', '보관위탁', '도급', '고용', '대리', '계약', '조합', '혼인', '이혼']);

/* ── 메인 파서 ────────────────────────────────────────────── */
export function parse(text) {
  const parties = findParties(text);
  const relations = [], events = [];
  const objectsSet = new Set();
  if (!parties.length) return { parties, relations, events, objects: [] };

  const pAlt = parties.map(esc).sort((a, b) => b.length - a.length).join('|');
  const withRel = resolveRelativeDates(maskDates(text));

  let deceased = null;
  let lastEnumeration = null;
  let lastThingGlobal = null;
  const globalPairs = [];
  const BREACH = ['배임', '횡령'];

  for (const sen of splitSentences(withRel)) {
    let lastSubjList = null;
    let sentFirst = null;
    let sentTopic = null;
    let lastDate = null;
    const sentPairs = new Map();
    const mentionOf = new Map();
    const sentDative = new Set();

    const clauses = splitClauses(sen);
    clauses.forEach((c, ci) => {
      for (const m of c.matchAll(new RegExp(`(${pAlt})\\s*(?:와|과)\\s*(?:[가-힣]{1,3}\\s+)?(${pAlt})`, 'g'))) {
        lastEnumeration = [m[1], m[2]];
      }

      const subjHits = findSubjectHits(c, pAlt);
      const chainOf = h => [...precedingChain(c, h.i, pAlt), h.p];
      // 수식형 주어 회피: 주어~동사 사이에 관형형 종결('-한 ')이 있으면 그 주어는 건너뛴다
      const subjectAt = pos => {
        const before = subjHits.filter(h => h.i < pos);
        for (let k = before.length - 1; k >= 0; k--) {
          const seg = c.slice(before[k].i + before[k].p.length, pos);
          if (k > 0 && ATTRIB_END.test(seg)) continue;
          return chainOf(before[k]);
        }
        return null;
      };
      const lastChain = subjHits.length ? chainOf(subjHits[subjHits.length - 1]) : null;
      const pronoun = /두 ?사람(은|는|이|가)|이들(은|는)|모두(은|는)/.test(c) && lastEnumeration ? lastEnumeration : null;
      const pending = lastChain || pronoun;
      if (ci === 0 && subjHits.length) { sentFirst = chainOf(subjHits[0]); sentTopic = sentFirst; }
      let subjectList = pending || lastSubjList || [];

      for (const s of subjectList) {
        for (const re of tierRegexes(pAlt)) {
          const h = [...c.matchAll(re)].find(x => x[1] !== s);
          if (h) { if (!mentionOf.has(s)) mentionOf.set(s, h[1]); break; }
        }
      }
      for (const m of c.matchAll(new RegExp(`(${pAlt})\\s*(에게|한테|께)`, 'g'))) sentDative.add(m[1]);

      const agency = c.match(new RegExp(`(${pAlt})\\s*(?:을|를)?\\s*대리하여`));

      const handleAction = r => {
        const { pat } = r;
        const after = c.slice(r.i + r.len, r.i + r.len + 10);
        if (/(하지|치지|기지|지)\s*(않|아니|못)|않았|아니하였|못하였/.test(after) ||
            /않|아니했|못했/.test(c.slice(Math.max(0, r.i - 3), r.i))) return;
        if (pat.delivery && /(려고|기로|예정|하려)/.test(after)) return;

        // 주어 결정 규칙 (동사 직전 > 절 주어 > 종속절 마커 > 관계절 파편 > 운반)
        const own = subjectAt(r.i);
        const carried = !own && !subjHits.length;
        let base = own || subjectList;
        const subMark = c.search(/않자|않었기|하지 ?않[고서]|않은 ?(후|뒤)에|없이/);
        if (subMark >= 0 && r.i > subMark) {
          const afterMark = subjHits.filter(h => h.i > subMark && h.i < r.i);
          base = afterMark.length ? subjectAt(r.i) || base : (sentFirst || base);
        } else if (carried && sentFirst && /^(?:있던|있고|하던|하며 ?있|달고 ?있|들고 ?있|된)/.test(c)) {
          base = sentFirst;
        }
        const effective = agency ? [agency[1]] : base;
        const subj0 = effective[0];

        if (pat.label === '사망') {
          events.push({ date: bindDate(c, r.i, lastDate), text: `${subj0 || ''} 사망`.trim() });
          if (subj0) deceased = subj0;
          return;
        }
        if (pat.noRel || !subj0) return;

        // 라벨 확정 (byWord: 설정받 류의 어투별 라벨)
        let label = pat.label;
        if (pat.byWord) {
          const span = c.slice(r.i, r.i + r.len);
          for (const [w, lab] of Object.entries(pat.byWord)) if (span.includes(w)) { label = lab; break; }
        }

        // 목적물: 서비스류 라벨은 동사 근처(12자 이내)의 물건만 붙인다(부착 과다 방지)
        const t = findThing(c, r.i);
        const thing = t && (t.idx > r.i - 14 || !SERVICE_LABELS.has(baseLabel(label))) ? t.name : lastThingGlobalFor(label, t);
        function lastThingGlobalFor(lab, tt) {
          if (tt && !SERVICE_LABELS.has(baseLabel(lab))) return tt.name;
          return null;
        }
        if (thing) lastThingGlobal = thing;
        const money = findMoney(c);
        const d = bindDate(c, r.i, lastDate);

        if (label === '양도' && /채권/.test(c)) label = '채권양도';

        let cp = null;
        if (BREACH.includes(label)) cp = sentPairs.get(subj0) || null;
        if (!cp) {
          cp = findCounterparty(c, pAlt, r.i, [...effective, ...(agency ? [agency[1]] : [])], !!pat.person);
        }
        if (label === '상속' && !cp && deceased) cp = { party: deceased };
        if (label === '장물취득' && !cp) {
          const theft = [...relations].reverse().find(x => ['절취', '강취'].includes(baseLabel(x.label)));
          if (theft) cp = { party: theft.from };
        }

        const parts = [];
        if (thing) parts.push(thing);
        if (money && !(thing && thing.includes(money))) parts.push(money);
        const fullLabel = parts.length ? `${label} (${parts.join(' ').slice(0, 22)})` : label;

        const push = (f, t2) => {
          if (!f || !t2 || f === t2) return;
          const key = `${f}|${t2}|${label}|${d || ''}`;
          if (relations.some(x => x._k === key)) return;
          relations.push({ from: f, to: t2, label: fullLabel, type: label, kind: pat.kind, date: d, obj: thing || null, _k: key });
          if (thing) objectsSet.add(thing);
          sentPairs.set(f, t2); sentPairs.set(t2, f);
          globalPairs.push({ a: f, b: t2 });
        };

        if (pat.group && effective.length > 1) {
          for (let a = 0; a < effective.length; a++)
            for (let b = a + 1; b < effective.length; b++) push(effective[a], effective[b]);
          return;
        }

        let cpParty = cp ? cp.party : null;
        if (!cpParty) cpParty = sentPairs.get(subj0) ?? null;
        if (!cpParty && mentionOf.has(subj0)) cpParty = mentionOf.get(subj0);
        if (!cpParty && sentTopic && subj0 !== sentTopic[0] && !carried) cpParty = sentTopic[0]; // 수식형 행위자의 상대 = 문장 주어
        if (!cpParty) {
          // 문장 안 조사 언급(수식형 발행의 소지인 등) → 유일 회사
          const dative = [...sentDative].find(p => p !== subj0);
          if (dative) cpParty = dative;
        }
        if (!cpParty) {
          const comps = parties.filter(p => isCompanyName(p));
          if (comps.length === 1) cpParty = comps[0];
        }
        if (!cpParty) {
          const g = [...globalPairs].reverse().find(p => p.a === subj0 || p.b === subj0);
          if (g) cpParty = g.a === subj0 ? g.b : g.a;
        }
        if (!cpParty) return;

        if (pat.group) { push(subj0, cpParty); return; }

        if (pat.from === 'obj') {
          for (const s of effective) if (s !== cpParty) push(cpParty, s);
        } else {
          for (const s of effective) if (s !== cpParty) push(s, cpParty);
        }
      };

      const before = relations.length + events.length;
      const raw = [];
      const g = re => new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      for (const pat of ACTION_PATTERNS) {
        for (const m of c.matchAll(g(pat.re))) {
          if (pat.when && !pat.when(text)) continue;
          raw.push({ pat, i: m.index, len: m[0].length, matched: m[0] });
        }
      }
      raw.sort((a, b) => a.i - b.i || b.len - a.len);
      const taken = [];
      for (const r of raw) {
        if (taken.some(t => r.i < t.end && t.start < r.i + r.len)) continue;
        taken.push({ start: r.i, end: r.i + r.len });
        handleAction(r);
      }

      for (const [re, name] of EVENT_PATTERNS) {
        const m = re.exec(c);
        if (!m) continue;
        if (/(하지|치지|기지|지)\s*(않|아니|못)/.test(c.slice(m.index, m.index + m[0].length + 8))) continue;
        const d = bindDate(c, m.index, lastDate);
        const who = (subjectAt(m.index) || subjectList)[0] || '';
        events.push({ date: d, text: `${who ? who + ' ' : ''}${name}` });
      }

      if (pending && (ci === 0 || relations.length + events.length > before)) lastSubjList = pending;

      const dh = [...c.matchAll(/⟦([^⟧]+)⟧/g)];
      if (dh.length) lastDate = dh[dh.length - 1][1];
    });
  }

  for (const r of relations) delete r._k;
  relations.sort((a, b) => (dateKey(a.date) || 9e9) - (dateKey(b.date) || 9e9));
  return { parties, relations, events, objects: [...objectsSet] };
}
