// Lawchart 메인 — 입력 → 파서 → 레이아웃 → 렌더 (자체 구현)
import { parse } from './src/parser.js';
import { layout } from './src/layout.js';
import { Renderer, KIND_LABEL } from './src/render.js';

const $ = id => document.getElementById(id);
const svg = $('svg');
const renderer = new Renderer(svg);
let G = null;

const SAMPLE = '갑은 2019. 5. 1. 을에게 A주택을 보증금 2억원에 세를 주고 전세권을 설정해 주었다. 을은 2021. 3. 1. 그 주택에서 나가면서 갑에게 보증금의 반환을 청구하였다. 갑은 보증금을 반환하지 못하자 2021. 6. 1. 을의 자동차를 유치하고 있다.';

function build(text) {
  const data = parse(text);
  if (!data.parties.length) { toast('당사자(갑·을·甲·A…)를 찾지 못했어요'); return false; }
  G = layout(data);
  renderer.setGraph(G);
  $('result').hidden = false;
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}

renderer.hooks.onChange = ({ T, isFut }) => {
  // 범례
  const kinds = [...new Set(G.edges.map(e => e.kind))];
  $('legend').innerHTML = kinds.map(k => `<span><i style="border-color:var(--${k in KIND_LABEL ? k : 'other'})"></i>${KIND_LABEL[k] || k}</span>`).join('')
    + (G.nodes.some(n => n.type === 'thing') ? '<span style="color:var(--contract)">▨ 목적물</span>' : '');

  // 타임라인
  const tw = $('tl-wrap');
  tw.hidden = !G.events.length && G.times.length < 2;
  $('tl-range').min = -1; $('tl-range').max = Math.max(0, G.times.length - 1); $('tl-range').value = renderer.ti;
  const hid = G.edges.filter(e => isFut(e.date)).length;
  const i = renderer.ti;
  $('tl-now').textContent = G.times.length < 2 ? '' : i < 0 ? '사건 전' : i >= G.times.length - 1 ? '전체 시점' : `${d(T)} 시점${hid ? ` · 이후 ${hid}건 흐림` : ''}`;
  $('timeline').innerHTML = G.events.map(ev => {
    const k = String(ev.date || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    const key = k ? +k[1] * 10000 + +k[2] * 100 + +k[3] : 0;
    return `<div class="ev${isFut(ev.date) ? ' fut' : ''}" data-k="${key}"><b>${esc(ev.date || '')}</b><span>${esc(ev.text)}</span></div>`;
  }).join('');

  // 관계 목록
  $('edges').innerHTML = G.edges.map(e => `<div class="er${isFut(e.date) ? ' fut' : ''}" data-e="${e.id}">
    <span class="k-dot" style="background:var(--${e.kind in KIND_LABEL ? e.kind : 'other'})"></span>
    ${e.date ? `<time>${esc(e.date)}</time>` : ''}
    <b>${esc(e.from)}</b><i>→</i><b>${esc(e.to)}</b>
    <span class="lab">${esc(e.label)}</span>
    <button class="btn ghost" data-memo="${e.id}" title="쟁점 메모" style="padding:4px 8px">⚑</button>
    <button class="btn ghost" data-del="${e.id}" style="padding:4px 10px">×</button>
    ${e.issue ? `<span class="memo">⚑ ${esc(e.issue)}</span>` : ''}</div>`).join('') || '<div class="hint">관계가 없어요. 아래에서 추가해 보세요.</div>';
  const opts = G.nodes.filter(n => n.type !== 'thing').map(n => `<option>${esc(n.id)}</option>`).join('');
  $('add-from').innerHTML = opts; $('add-to').innerHTML = opts;
  if (G.nodes.length > 1) $('add-to').selectedIndex = 1;

  saveLocal();
};
const d = k => k === Infinity ? '전체' : `${Math.floor(k / 1e4)}.${Math.floor(k / 100) % 100}.${k % 100}`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

renderer.hooks.onRename = nd => {
  const nv = prompt(nd.type === 'thing' ? '목적물 이름 (비우면 삭제)' : '당사자 이름 (비우면 삭제)', nd.id);
  if (nv === null) return;
  const v = nv.trim();
  if (nd.type === 'thing') {
    G.nodes = G.nodes.filter(n => n !== nd);
    G.edges.forEach(e => { if (e.obj === nd.id) e.obj = v || null; });
    if (v) G.nodes.push({ ...nd, id: v });
  } else {
    G.nodes = G.nodes.filter(n => n !== nd);
    G.edges = G.edges.filter(e => e.from !== nd.id && e.to !== nd.id);
    if (v) { G.nodes.push({ ...nd, id: v }); G.edges.forEach(e => { if (e.from === nd.id) e.from = v; if (e.to === nd.id) e.to = v; }); }
  }
  renderer._vb = null;
  renderer.setGraph(G);
};

renderer.hooks.onEdgeClick = id => {
  const e = G.edges.find(x => x.id === id);
  if (!e) return;
  const nv = prompt(`${e.from} → ${e.to}\n관계 이름 (비우면 삭제)`, e.label);
  if (nv === null) return;
  if (!nv.trim()) G.edges = G.edges.filter(x => x.id !== id); else e.label = nv.trim();
  renderer.setGraph(G);
};

$('draw').onclick = () => { const t = $('text').value.trim(); if (t) build(t); };
$('sample').onclick = () => { $('text').value = SAMPLE; $('count').textContent = SAMPLE.length + '자'; };
$('clear').onclick = () => {
  $('text').value = ''; $('count').textContent = ''; $('result').hidden = true; G = null;
  try { localStorage.removeItem('lawchart-last'); } catch {}
};
$('text').addEventListener('input', () => { $('count').textContent = $('text').value.length ? $('text').value.length + '자' : ''; });

$('tl-range').addEventListener('input', e => { renderer.ti = +e.target.value; renderer.render(); });
$('tl-prev').onclick = () => { renderer.ti = Math.max(-1, renderer.ti - 1); renderer.render(); };
$('tl-next').onclick = () => { renderer.ti = Math.min(G.times.length - 1, renderer.ti + 1); renderer.render(); };
$('tl-all').onclick = () => { renderer.ti = G.times.length - 1; renderer.render(); };
$('timeline').addEventListener('click', e => {
  const el = e.target.closest('.ev'); if (!el) return;
  const i = G.times.indexOf(+el.dataset.k);
  if (i >= 0) { renderer.ti = i; renderer.render(); }
});

$('edges').addEventListener('click', e => {
  const memo = e.target.closest('[data-memo]');
  if (memo) {
    const edge = G.edges.find(x => x.id === memo.dataset.memo);
    if (!edge) return;
    const nv = prompt(`쟁점 메모 — ${edge.from} → ${edge.to}\n(비우면 삭제)`, edge.issue || '');
    if (nv === null) return;
    edge.issue = nv.trim() || null;
    renderer.setGraph(G);
    return;
  }
  const del = e.target.closest('[data-del]');
  if (del) { G.edges = G.edges.filter(x => x.id !== del.dataset.del); renderer.setGraph(G); return; }
  const row = e.target.closest('.er');
  if (row) renderer.hooks.onEdgeClick(row.dataset.e);
});

$('add-btn').onclick = () => {
  const from = $('add-from').value, to = $('add-to').value, label = $('add-label').value.trim();
  if (!from || !to || !label) return;
  G.edges.push({ id: 'm' + Date.now(), from, to, label, kind: label.includes('저당') || label.includes('담보') || label.includes('보증') ? 'security' : label.includes('대여') || label.includes('지급') ? 'money' : 'contract', date: null });
  $('add-label').value = '';
  renderer.setGraph(G);
};
$('add-party').onclick = () => {
  const nv = prompt('추가할 당사자'); if (!nv || !nv.trim()) return;
  G.nodes.push({ id: nv.trim(), type: 'party', x: G.W / 2 + (Math.random() - .5) * 200, y: G.H / 2 + (Math.random() - .5) * 150 });
  renderer.setGraph(G);
};
$('add-thing').onclick = () => {
  const nv = prompt('추가할 목적물 (예: X토지)'); if (!nv || !nv.trim()) return;
  G.nodes.push({ id: nv.trim(), type: 'thing', x: G.W / 2, y: G.H / 2 });
  renderer.setGraph(G);
};

$('save-png').onclick = async () => {
  const clone = svg.cloneNode(true);
  const vb = (svg.getAttribute('viewBox') || '0 0 680 460').split(/\s+/).map(Number);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const cW = 1600, cH = Math.round(cW * vb[3] / (vb[2] || 680));
  clone.setAttribute('width', cW); clone.setAttribute('height', cH);
  const css = [...document.styleSheets[0].cssRules].map(r => r.cssText).join('');
  clone.insertAdjacentHTML('afterbegin', `<style>${css}</style><rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#F6F5F2"/>`);
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  await new Promise(r => img.onload = r);
  const c = document.createElement('canvas'); c.width = cW; c.height = cH;
  c.getContext('2d').drawImage(img, 0, 0, cW, cH);
  const a = document.createElement('a'); a.download = 'lawchart.png'; a.href = c.toDataURL('image/png'); a.click();
};

/* ── 저장(F7): 자동저장 + 사건 파일(JSON) + SVG ── */
const snapshot = () => G ? ({
  text: $('text').value,
  graph: { W: G.W, H: G.H, objects: G.objects, nodes: G.nodes, edges: G.edges, events: G.events },
}) : null;

function restoreCase(snap) {
  $('text').value = snap.text || '';
  $('count').textContent = snap.text ? snap.text.length + '자' : '';
  const g = snap.graph || {};
  G = layout({
    parties: (g.nodes || []).filter(n => n.type !== 'thing').map(n => n.id),
    relations: g.edges || [],
    events: g.events || [],
    objects: g.objects || [],
  });
  // 사용자가 옮겨둔 위치 복원
  const pos = new Map((g.nodes || []).map(n => [n.id, n]));
  G.nodes.forEach(n => { const p = pos.get(n.id); if (p) { n.x = p.x; n.y = p.y; } });
  renderer.setGraph(G);
  $('result').hidden = false;
}

let lsT;
function saveLocal() {
  clearTimeout(lsT);
  lsT = setTimeout(() => {
    try { const s = snapshot(); if (s) localStorage.setItem('lawchart-last', JSON.stringify(s)); } catch {}
  }, 700);
}

function download(name, blob) {
  const a = document.createElement('a'); a.download = name; a.href = URL.createObjectURL(blob); a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

$('save-case').onclick = () => {
  const s = snapshot();
  if (!s) return alert('먼저 관계도를 그려 주세요');
  const title = (s.text || '').trim().replace(/\s+/g, ' ').slice(0, 24) || '사건';
  download(`lawchart-${title}.json`, new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' }));
};
$('open-case').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const snap = JSON.parse(await f.text());
    if (!snap || !snap.graph || !Array.isArray(snap.graph.nodes)) throw new Error('bad');
    restoreCase(snap);
    $('result').scrollIntoView({ behavior: 'smooth' });
  } catch { alert('사건 파일을 읽지 못했어요'); }
  finally { e.target.value = ''; }
});

$('save-svg').onclick = () => {
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const vb = (svg.getAttribute('viewBox') || '0 0 680 460').split(/\s+/).map(Number);
  clone.setAttribute('width', Math.round(vb[2])); clone.setAttribute('height', Math.round(vb[3]));
  const css = [...document.styleSheets[0].cssRules].map(r => r.cssText).join('');
  clone.insertAdjacentHTML('afterbegin', `<style>${css}</style><rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#F6F5F2"/>`);
  download('lawchart.svg', new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
};

// 시작 시 자동저장 복원
try {
  const last = JSON.parse(localStorage.getItem('lawchart-last') || 'null');
  if (last && last.graph && (last.graph.nodes || []).length) restoreCase(last);
} catch {}

/* ── OCR (Tesseract.js — 필요할 때 CDN에서 로드, 전부 브라우저 안에서) ── */
$('img').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  const btn = $('draw'); btn.disabled = true; btn.textContent = '글자 읽는 중…';
  try {
    if (!window.Tesseract) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        s.onload = res; s.onerror = rej; document.head.appendChild(s);
      });
    }
    const bmp = await preprocess(f);
    const { data } = await Tesseract.recognize(bmp, 'kor');
    let t = (data.text || '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
    t = t.replace(/[ ]?(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\./g, ' $1. $2. $3.');
    $('text').value = ($('text').value.trim() ? $('text').value.trim() + '\n' : '') + t;
    $('count').textContent = $('text').value.length + '자';
  } catch (err) {
    console.error(err);
    alert('인식에 실패했어요. 직접 입력해 주세요.');
  } finally {
    e.target.value = ''; btn.disabled = false; btn.textContent = '관계도 그리기';
  }
});
async function preprocess(file) { // 확대 + 흑백 대비 — 인식률 보조
  const img = await createImageBitmap(file);
  const s = Math.min(2, 1800 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const g = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2];
    const v = g > 150 ? 255 : g < 90 ? 0 : g;
    p[i] = p[i + 1] = p[i + 2] = v;
  }
  x.putImageData(d, 0, 0); return c;
}

let tt;
function toast(m) {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
  el.textContent = m; el.classList.add("show");
  clearTimeout(tt); tt = setTimeout(() => el.classList.remove("show"), 2200);
}
