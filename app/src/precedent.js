// Lawchart 근접 판례 — 파서가 인식한 쟁점 유형 → 국가법령정보센터 판례 검색 딥링크
// 1단계: 데이터 파이프라인 없음. 관계 라벨의 기저 유형과 사용자 쟁점 메모를
// 검색어로 변환해 검색 페이지로 보낼 뿐, 판례 목록 자체는 내장하지 않는다.
// URL 형식은 2026-09-06 실브라우저 검증(클라이언트 JS가 query를 읽어 결과를 렌더링).
// 같은 검색의 다른 사본이 phase5/acquire.mjs·phase5/onclick-probe.mjs에 있다(menuId=1&subMenuId=45 —
// raw 코퍼스를 생산한 검증 형태. 본 상수의 menuId=7&subMenuId=47은 브라우저 렌더링 검증 형태).
// law.go.kr 쿼리 체계 변경 시 세 곳을 함께 확인할 것.
import { baseLabel } from './parser.js';

const PREC_URL = 'https://www.law.go.kr/precSc.do?menuId=7&subMenuId=47&tabMenuId=213&query=';

export const precedentUrl = q => PREC_URL + encodeURIComponent(String(q || '').trim());

// 검색 품질을 위해 조정하는 매핑만 둔다. 여기 없는 유형은 기저 라벨을 그대로 검색어로 쓴다.
// 키는 dict.js ACTION_PATTERNS의 라벨에서 손으로 유도 — precedent.test.mjs의 드리프트 가드가 동기 상태를 검사한다.
export const QUERY_OVERRIDES = {
  '임대': '임대차',
  '금전대여': '금전소비대차',
  '입금': '지급',
  '근저당권 설정': '근저당권',
  '저당권 설정': '저당권',
  '전세권 설정': '전세권',
  '질권 설정': '질권',
  '담보 제공': '담보',
  '가등기 설정': '가등기',
  '보관위탁': '보관',
  '고용': '근로계약',
  '유류분반환청구': '유류분',
  '손해배상 청구': '손해배상',
  '청구·제소': '소 제기',
  '압류·집행': '강제집행',
  '약속어음 발행': '약속어음',
  '배서양도': '배서',
  '신주 인수': '신주인수',
  '절취': '절도',
  '강취': '강도',
  '장물취득': '장물',
  '폭행·상해': '폭행',
  '살해': '살인',
};

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function precedentChips(edges) {
  const byLabel = new Map(), byMemo = new Map();
  for (const e of edges || []) {
    const lab = e.type || baseLabel(e.label);
    if (lab) {
      const c = byLabel.get(lab) || { name: lab, count: 0, memo: false };
      c.count++; byLabel.set(lab, c);
    }
    const memo = String(e.issue || '').trim();
    if (memo) {
      const c = byMemo.get(memo) || { name: memo, count: 0, memo: true };
      c.count++; byMemo.set(memo, c);
    }
  }
  const labels = [...byLabel.values()].sort((a, b) => b.count - a.count);
  const memos = [...byMemo.values()].sort((a, b) => b.count - a.count);
  return [...labels, ...memos].map(c => ({ ...c, url: precedentUrl(hasOwn(QUERY_OVERRIDES, c.name) ? QUERY_OVERRIDES[c.name] : c.name) }));
}
