'use strict';
/*
 * Lawchart Phase 0 — 원본 plot 파서 기준선 측정 하네스
 * reference/plot_app.js(@__yebni 저작)를 Node VM에서 '실행만' 한다.
 * 클린룸 원칙(PRD 7.3): 이 코드는 원본을 복사·변형하지 않는다.
 * DOM/브라우저 API를 스텁으로 대체해 스크립트가 로드되게 하고,
 * 최상위 함수로 선언되는 parseFacts만 노출한다.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP_PATH = path.join(__dirname, '..', '..', 'reference', 'plot_app.js');

function makeElement() {
  const store = {};
  return new Proxy(store, {
    get(target, prop) {
      if (typeof prop === 'symbol') return undefined;
      if (prop === 'style' || prop === 'dataset') return (target[prop] = target[prop] || {});
      if (prop === 'classList') return { add() {}, remove() {}, toggle() {} };
      if (prop === 'getBoundingClientRect') return () => ({ left: 0, top: 0, width: 640, height: 480 });
      if (prop === 'addEventListener' || prop === 'removeEventListener') return () => {};
      if (prop === 'appendChild' || prop === 'removeChild') return () => makeElement();
      if (prop === 'setAttribute' || prop === 'getAttribute') return () => null;
      if (prop === 'querySelector') return () => makeElement();
      if (prop === 'querySelectorAll') return () => [];
      if (prop === 'closest') return () => null;
      if (prop === 'focus' || prop === 'click') return () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

function createSandbox() {
  const sb = {
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, RegExp, Object, Array, String, Number, Boolean, Map, Set, Promise,
    addEventListener() {},
    navigator: {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    confirm: () => true,
    prompt: () => null,
    alert: () => {},
    fetch: () => Promise.reject(new Error('network disabled in harness')),
    document: {
      documentElement: makeElement(),
      body: makeElement(),
      head: makeElement(),
      getElementById: () => makeElement(),
      createElement: () => makeElement(),
      querySelector: () => makeElement(),
      querySelectorAll: () => [],
      addEventListener() {},
    },
  };
  sb.window = sb;
  sb.self = sb;
  return sb;
}

let cachedParseFacts = null;

function ensureLoaded() {
  if (cachedParseFacts) return;
  const code = fs.readFileSync(APP_PATH, 'utf8');
  const ctx = vm.createContext(createSandbox());
  vm.runInContext(code, ctx, { filename: 'plot_app.js' });
  if (typeof ctx.parseFacts !== 'function') {
    throw new Error('parseFacts not exposed by original source — harness needs review');
  }
  cachedParseFacts = ctx.parseFacts;
}

function runOriginalParser(text) {
  ensureLoaded();
  return cachedParseFacts(String(text)) || {};
}

module.exports = { runOriginalParser };
