import { test } from 'node:test';
import assert from 'node:assert/strict';
import { precedentUrl, precedentChips, QUERY_OVERRIDES } from './precedent.js';
import { ACTION_PATTERNS } from './dict.js';

const PREC_URL = 'https://www.law.go.kr/precSc.do?menuId=7&subMenuId=47&tabMenuId=213&query=';

test('precedentUrl — 한글 검색어 인코딩', () => {
  assert.equal(precedentUrl('명의신탁'), PREC_URL + encodeURIComponent('명의신탁'));
});

test('precedentUrl — 특수문자 리터럴 고정(&는 %26으로 인코딩)', () => {
  assert.equal(precedentUrl('A&B'), PREC_URL + 'A%26B');
  assert.equal(precedentUrl('A&B 청구'), PREC_URL + 'A%26B%20%EC%B2%AD%EA%B5%AC');
});

test('precedentChips — 괄호 목적물 제거·라벨 집계·빈도 정렬', () => {
  const chips = precedentChips([
    { label: '매도 (X토지)' },
    { label: '매도' },
    { label: '전세권 설정', issue: '보증금 반환' },
  ]);
  assert.deepEqual(chips.map(c => c.name), ['매도', '전세권 설정', '보증금 반환']);
  assert.equal(chips[0].count, 2);
  assert.ok(chips[0].url.endsWith(encodeURIComponent('매도')));
  assert.equal(chips[1].memo, false);
  assert.equal(chips[2].memo, true);
  assert.ok(chips[2].url.includes(encodeURIComponent('보증금 반환')));
});

test('precedentChips — 매핑 없는 유형은 라벨 그대로', () => {
  const [chip] = precedentChips([{ label: '명의신탁' }]);
  assert.ok(chip.url.endsWith(encodeURIComponent('명의신탁')));
});

test('precedentChips — QUERY_OVERRIDES 전수(리터럴 고정)', () => {
  const cases = [
    ['임대', '임대차'],
    ['금전대여', '금전소비대차'],
    ['입금', '지급'],
    ['근저당권 설정', '근저당권'],
    ['저당권 설정', '저당권'],
    ['전세권 설정', '전세권'],
    ['질권 설정', '질권'],
    ['담보 제공', '담보'],
    ['가등기 설정', '가등기'],
    ['보관위탁', '보관'],
    ['고용', '근로계약'],
    ['유류분반환청구', '유류분'],
    ['손해배상 청구', '손해배상'],
    ['청구·제소', '소 제기'],
    ['압류·집행', '강제집행'],
    ['약속어음 발행', '약속어음'],
    ['배서양도', '배서'],
    ['신주 인수', '신주인수'],
    ['절취', '절도'],
    ['강취', '강도'],
    ['장물취득', '장물'],
    ['폭행·상해', '폭행'],
    ['살해', '살인'],
  ];
  assert.equal(cases.length, Object.keys(QUERY_OVERRIDES).length);
  for (const [label, q] of cases) {
    const [chip] = precedentChips([{ label }]);
    assert.ok(chip.url.endsWith(encodeURIComponent(q)), `${label} → ${q}`);
  }
});

test('precedentChips — QUERY_OVERRIDES 키는 dict.js 라벨과 동기(드리프트 가드)', () => {
  const vocab = new Set(ACTION_PATTERNS.map(p => p.label));
  for (const key of Object.keys(QUERY_OVERRIDES)) {
    assert.ok(vocab.has(key), `QUERY_OVERRIDES 키 '${key}'가 dict.js ACTION_PATTERNS 라벨에 없음 — 라벨이 개명되면 매핑을 함께 갱신할 것`);
  }
});

test('precedentChips — 프로토타입 멤버명 라벨은 그대로 검색(hasOwnProperty 가드)', () => {
  for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    const [chip] = precedentChips([{ label: name }]);
    assert.equal(chip.name, name);
    assert.ok(chip.url.endsWith(encodeURIComponent(name)), `${name} → ${chip.url}`);
  }
});

test('precedentChips — e.type이 있으면 라벨 재유도 대신 type 사용', () => {
  const [chip] = precedentChips([{ label: '매도 (X토지)', type: '임대' }]);
  assert.equal(chip.name, '임대');
  assert.ok(chip.url.endsWith(encodeURIComponent('임대차')));
});

test('precedentChips — 메모 trim 정규화로 동일 메모는 한 칩으로 집계', () => {
  const chips = precedentChips([
    { label: '매도', issue: '보증금 반환' },
    { label: '임대', issue: ' 보증금 반환 ' },
  ]);
  const memos = chips.filter(c => c.memo);
  assert.equal(memos.length, 1);
  assert.equal(memos[0].count, 2);
});

test('precedentChips — 빈 입력·괄호만 있는 라벨 무시', () => {
  assert.deepEqual(precedentChips([]), []);
  assert.deepEqual(precedentChips(null), []);
  assert.deepEqual(precedentChips([{ label: '(X토지)' }]), []);
});
