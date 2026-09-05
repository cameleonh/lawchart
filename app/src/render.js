// Lawchart 렌더러 — SVG 관계도 + 시점 타임라인 (자체 구현)

export const KIND_STYLE = {
  contract: { color: 'var(--contract)', dash: '' },
  money: { color: 'var(--money)', dash: '' },
  security: { color: 'var(--security)', dash: '7 4.5' },
  dispute: { color: 'var(--dispute)', dash: '' },
  status: { color: 'var(--status)', dash: '2.5 5' },
  other: { color: 'var(--other)', dash: '' },
};
export const KIND_LABEL = { contract: '계약·거래', money: '금전', security: '담보', dispute: '분쟁·범죄', status: '신분', other: '기타' };

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateKey = d => { const m = String(d || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); return m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0; };

export class Renderer {
  constructor(svg) {
    this.svg = svg;
    this.G = null;
    this.ti = -2;          // -2: 아직 설정 전, -1: 사건 전, ... times.length-1: 전체
    this.view = null;      // {cx, cy, s} — null이면 자동 맞춤
    this.hooks = { onChange: null, onRename: null };
    this._bind();
  }

  setGraph(G) {
    this.G = G;
    this.ti = G.times.length - 1;
    this.view = null;
    this.render();
  }

  now() {
    if (!this.G || !this.G.times.length) return Infinity;
    const i = Math.max(-1, Math.min(this.G.times.length - 1, this.ti));
    return i < 0 ? 0 : this.G.times[i];
  }

  render() {
    const G = this.G;
    if (!G) return;
    const T = this.now();
    const isFut = d => { const k = dateKey(d); return !!k && k > T; };
    const node = id => G.nodes.find(n => n.id === id);
    const parties = G.nodes.filter(n => n.type !== 'thing');
    const things = G.nodes.filter(n => n.type === 'thing');
    for (const t of things) { t.w = Math.min(150, t.id.length * 13 + 22); t.h = 30; }

    const defs = Object.entries(KIND_STYLE).map(([k, st]) =>
      `<marker id="arr-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${st.color}"/></marker>`).join('');

    const pairSeen = new Map();
    const edgeSvg = [];
    const labels = [];
    for (const e of G.edges) {
      const a = node(e.from), b = node(e.to);
      if (!a || !b || a === b) continue;
      const st = KIND_STYLE[e.kind] || KIND_STYLE.other;
      const fut = isFut(e.date);
      const key = [e.from, e.to].sort().join('|');
      const idx = (pairSeen.get(key) || 0); pairSeen.set(key, idx + 1);
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      let nx = -dy / len, ny = dx / len;
      const midx = (a.x + b.x) / 2, midy = (a.y + b.y) / 2;
      const cxn = G.nodes.reduce((s, nd) => s + nd.x, 0) / G.nodes.length;
      const cyn = G.nodes.reduce((s, nd) => s + nd.y, 0) / G.nodes.length;
      if ((midx - cxn) * nx + (midy - cyn) * ny < 0) { nx = -nx; ny = -ny; }
      const off = (idx * 34 - 8) * (pairSeen.get(key) > 1 ? 1 : 0.4);
      const px = midx + nx * off * 1.6, py = midy + ny * off * 1.6;
      const r = 28, r2 = 36;
      const l1 = Math.hypot(px - a.x, py - a.y) || 1, l2 = Math.hypot(px - b.x, py - b.y) || 1;
      const x1 = a.x + (px - a.x) / l1 * r, y1 = a.y + (py - a.y) / l1 * r;
      const x2 = b.x + (px - b.x) / l2 * r2, y2 = b.y + (py - b.y) / l2 * r2;
      edgeSvg.push(`<g class="edge" data-e="${e.id}"><path d="M${x1.toFixed(1)} ${y1.toFixed(1)} Q ${px.toFixed(1)} ${py.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${st.color}" stroke-dasharray="${st.dash}" marker-end="url(#arr-${e.kind})"${fut ? ' opacity=".14"' : ''}/></g>`);
      // 라벨 칩
      const head = String(e.label || '').replace(/\s*[(（]([^)）]*)[)）]\s*$/, '').trim();
      const sub = (String(e.label || '').match(/[(（]([^)）]*)[)）]/) || [])[1] || '';
      const lines = [
        e.date ? { t: e.date, c: 'd' } : null,
        { t: head },
        sub ? { t: sub } : null,
        e.issue ? { t: '⚑ ' + e.issue, c: 'i' } : null,
      ].filter(Boolean);
      let w = 0; for (const l of lines) w = Math.max(w, l.t.length * (l.c === 'd' ? 6.3 : l.c === 'i' ? 7.4 : 8.2));
      w = Math.round(w) + 16; const h = lines.length * 13 + 8;
      labels.push({ e, x: px, y: py, w, h, lines, fut, st });
    }

    // 권리 상태 arc (활성 구간만 진하게)
    const arcSvg = [];
    const arcLabels = [];
    for (const arc of G.arcs) {
      const tn = node(arc.thing), pn = node(arc.party);
      if (!tn || !pn || tn === pn) continue;
      const act = arc.s <= T && (arc.e === Infinity || T < arc.e);
      const dx = pn.x - tn.x, dy = pn.y - tn.y, len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const s0 = Math.abs(ux) > 1e-6 ? (tn.w / 2) / Math.abs(ux) : 1e9;
      const s1 = Math.abs(uy) > 1e-6 ? (tn.h / 2) / Math.abs(uy) : 1e9;
      const o = Math.min(s0, s1) + 3;
      const x1 = tn.x + ux * o, y1 = tn.y + uy * o, x2 = pn.x - ux * 33, y2 = pn.y - uy * 33;
      const col = arc.role === '소유' ? 'var(--ink)' : arc.role === '점유' ? 'var(--sub)' : 'var(--security)';
      const dash = arc.role === '소유' ? '' : arc.role === '점유' ? '2 4' : '6 4';
      arcSvg.push(`<g class="arc"><path d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${col}" stroke-dasharray="${dash}"${act ? '' : ' opacity=".1"'}/></g>`);
      if (act) {
        const lx = x1 + (x2 - x1) * 0.42, ly = y1 + (y2 - y1) * 0.42;
        arcLabels.push(`<g transform="translate(${lx.toFixed(1)},${ly.toFixed(1)})"><rect x="${-arc.role.length * 5.6 - 5}" y="-9" width="${arc.role.length * 11.2 + 10}" height="18" rx="8" fill="#fff" stroke="${col}" stroke-dasharray=""/><text text-anchor="middle" dy="4" font-size="10.5" font-weight="700" fill="${col}">${esc(arc.role)}</text></g>`);
      }
    }

    const thingSvg = things.map(nd => `<g class="node thing" data-n="${esc(nd.id)}" transform="translate(${nd.x},${nd.y})"><rect x="${-nd.w / 2}" y="${-nd.h / 2}" width="${nd.w}" height="${nd.h}" rx="8"/><text dy="4" text-anchor="middle">${esc(nd.id.length > 11 ? nd.id.slice(0, 11) + '…' : nd.id)}</text></g>`).join('');
    const nodeSvg = parties.map(nd => `<g class="node" data-n="${esc(nd.id)}" transform="translate(${nd.x},${nd.y})"><circle r="27"/><text dy="5" text-anchor="middle">${esc(nd.id.length > 5 ? nd.id.slice(0, 5) + '…' : nd.id)}</text></g>`).join('');
    const labelSvg = labels.map(L => `<g class="edge" data-e="${L.e.id}" transform="translate(${L.x.toFixed(1)},${L.y.toFixed(1)})"><rect class="chip" x="${-L.w / 2}" y="${-L.h / 2}" width="${L.w}" height="${L.h}" rx="7" stroke="${L.st.color}"/>${L.lines.map((l, i) => `<text text-anchor="middle" y="${(-L.h / 2 + 12 + i * 13).toFixed(1)}" class="${l.c === 'd' ? 'd' : ''}" fill="${l.c === 'd' ? 'var(--sub)' : 'var(--ink)'}">${esc(l.t)}</text>`).join('')}</g>`).join('');

    this.svg.innerHTML = `<defs>${defs}</defs>${arcSvg.join('')}${edgeSvg.join('')}${thingSvg}${nodeSvg}${arcLabels.join('')}${labelSvg}`;

    // 뷰박스: 내용물 감싸기(드래그 중엔 넓어지기만) + 줌 상태
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const grow = (x, y, mx = 0, my = 0) => { x0 = Math.min(x0, x - mx); y0 = Math.min(y0, y - my); x1 = Math.max(x1, x + mx); y1 = Math.max(y1, y + my); };
    for (const nd of G.nodes) grow(nd.x, nd.y, nd.type === 'thing' ? (nd.w / 2 + 4) : 30, nd.type === 'thing' ? 20 : 30);
    for (const L of labels) grow(L.x, L.y, L.w / 2, L.h / 2);
    if (x0 > x1) { x0 = 0; y0 = 0; x1 = G.W; y1 = G.H; }
    let vb = [x0 - 12, y0 - 12, x1 - x0 + 24, y1 - y0 + 24];
    if (this._vb) vb = [Math.min(this._vb[0], vb[0]), Math.min(this._vb[1], vb[1]), Math.max(this._vb[0] + this._vb[2], vb[0] + vb[2]) - Math.min(this._vb[0], vb[0]), Math.max(this._vb[1] + this._vb[3], vb[1] + vb[3]) - Math.min(this._vb[1], vb[1])];
    this._vb = vb;
    let [vx, vy, vw, vh] = vb;
    if (this.view) { vw /= this.view.s; vh /= this.view.s; vx = this.view.cx - vw / 2; vy = this.view.cy - vh / 2; }
    this.svg.setAttribute('viewBox', [vx, vy, vw, vh].map(v => Math.round(v * 10) / 10).join(' '));
    this.svg.style.aspectRatio = `${Math.max(1, vb[2])} / ${Math.max(1, vb[3])}`;
    this.hooks.onChange && this.hooks.onChange({ T, isFut, ti: this.ti });
  }

  _bind() {
    const svg = this.svg;
    let drag = null, pan = null;
    const toBase = (X, Y) => {
      const r = svg.getBoundingClientRect();
      const vb = this._vb || [0, 0, 680, 460];
      const sc = this.view ? this.view.s : 1;
      return { x: vb[0] + (X - r.left) / r.width * vb[2] / sc, y: vb[1] + (Y - r.top) / r.height * vb[3] / sc };
    };
    svg.addEventListener('pointerdown', e => {
      const g = e.target.closest('.node');
      if (g) {
        drag = this.G.nodes.find(n => n.id === g.dataset.n);
        svg.setPointerCapture(e.pointerId);
      } else if (e.target.closest('.edge')) {
        return; // 클릭은 click에서 처리
      } else {
        if (!this.view) this.view = { cx: (this._vb[0] + this._vb[2] / 2), cy: (this._vb[1] + this._vb[3] / 2), s: 1 };
        pan = { x: e.clientX, y: e.clientY, cx: this.view.cx, cy: this.view.cy };
        svg.setPointerCapture(e.pointerId);
      }
    });
    svg.addEventListener('pointermove', e => {
      if (drag) {
        const p = toBase(e.clientX, e.clientY);
        drag.x = p.x; drag.y = p.y;
        this._vb = null;
        this.render();
      } else if (pan) {
        const r = svg.getBoundingClientRect();
        const vb = this._vb || [0, 0, 680, 460];
        this.view.cx = pan.cx - (e.clientX - pan.x) * vb[2] / r.width / this.view.s;
        this.view.cy = pan.cy - (e.clientY - pan.y) * vb[3] / r.height / this.view.s;
        this.render();
      }
    });
    svg.addEventListener('pointerup', e => { drag = null; pan = null; });
    svg.addEventListener('dblclick', e => {
      const g = e.target.closest('.node');
      if (g && this.hooks.onRename) {
        const nd = this.G.nodes.find(n => n.id === g.dataset.n);
        this.hooks.onRename(nd);
        return;
      }
      this.view = null; this._vb = null; this.render(); // 맞춤
    });
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      if (!this.view) this.view = { cx: this._vb[0] + this._vb[2] / 2, cy: this._vb[1] + this._vb[3] / 2, s: 1 };
      this.view.s = Math.max(.4, Math.min(8, this.view.s * (e.deltaY < 0 ? 1.13 : 1 / 1.13)));
      this.render();
    }, { passive: false });
    svg.addEventListener('click', e => {
      if (drag || pan) return;
      const g = e.target.closest('.edge');
      if (g && this.hooks.onEdgeClick) this.hooks.onEdgeClick(g.dataset.e);
    });
  }
}
