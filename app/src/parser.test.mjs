import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from './parser.js';

const rels = text => parse(text).relations;
const dir = r => `${r.from} --[${r.type}]--> ${r.to}`;

// 사용자 보고 사례(2026-09-06): 임대인 시점 '전세로' 문장이 임차인 패턴에 걸려 방향이 반전되던 버그
test('임대인 시점 — 동사 없는 "…에게 아파트 전세로"는 갑→을 임대 단일 관계', () => {
  const r = rels('갑은 2026년 9월 1일 을에게 아파트 전세로');
  assert.equal(r.length, 1);
  assert.equal(dir(r[0]), '갑 --[임대]--> 을');
});

test('임대인 시점 — "전세로 빌려주었다"는 임대만 발화(금전대여 미발화)', () => {
  const r = rels('갑은 2026년 9월 1일 을에게 아파트를 전세로 빌려주었다');
  assert.equal(r.length, 1);
  assert.equal(dir(r[0]), '갑 --[임대]--> 을');
  assert.ok(!r.some(x => x.type === '금전대여'));
});

test('임차인 시점 — "전세로 빌려 살았다/들어 살았다"는 을→갑 임대 유지', () => {
  for (const text of [
    '갑이 을에게 아파트를 전세로 빌려 살았다',
    '갑이 을의 아파트를 보증금 2억원에 전세로 들어 살았다',
  ]) {
    const r = rels(text);
    assert.equal(r.length, 1, text);
    assert.equal(dir(r[0]), '을 --[임대]--> 갑', text);
  }
});

test('금전대여 — "돈을 빌려주다" 계열은 그대로 금전대여', () => {
  const r = rels('갑은 을에게 1,000만원을 빌려주었다');
  assert.equal(r.length, 1);
  assert.equal(dir(r[0]), '갑 --[금전대여]--> 을');
});

test('골드셋 civil 문장 — 세를 주고 전세권 설정은 갑→을 2건 유지', () => {
  const r = rels('갑은 2019. 5. 1. 을에게 A주택을 보증금 5천만원에 세를 주고 전세권을 설정해 주었다.');
  assert.ok(r.some(x => dir(x) === '갑 --[임대]--> 을'));
  assert.ok(r.some(x => dir(x) === '갑 --[전세권 설정]--> 을'));
});
