// Lawchart 레이아웃 — 원형 배치 + 목적물 내곽 배치 (자체 구현)
// 입력: parse() 결과 {parties, relations, events, objects}
// 출력: {W, H, nodes:[{id,type,x,y}], edges, events, times, arcs}

const dateKey = d => { const m = String(d || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); return m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0; };
export const dLabel = k => k ? `${Math.floor(k / 1e4)}.${Math.floor(k / 100) % 100}.${k % 100}` : '';

const EFFECT = {
  own: /소유권이전등기|상속|유증|증여|명의신탁|전매|매도|양도|증여/,
  lien: /근저당|저당|전세권|질권|가압류|가처분|압류|담보|보증/,
  poss: /인도|점유|임대|전대|보관/,
};
const effOf = label => {
  if (EFFECT.own.test(label)) return 'own';
  if (EFFECT.lien.test(label)) return 'lien';
  if (EFFECT.poss.test(label)) return 'poss';
  return null;
};

export function layout(data) {
  const ids = [...new Set([...(data.parties || []), ...(data.relations || []).flatMap(r => [r.from, r.to])])].filter(Boolean);
  const n = ids.length;
  const W = 680;
  const pairMax = new Map((data.relations || []).filter(r => r.from !== r.to).map(r => [[r.from, r.to].sort().join('|'), 0]));
  const pairCount = new Map();
  for (const r of (data.relations || [])) {
    if (r.from === r.to) continue;
    const k = [r.from, r.to].sort().join('|');
    pairCount.set(k, (pairCount.get(k) || 0) + 1);
  }
  const maxK = Math.max(1, ...pairCount.values());

  const H = Math.round(Math.min(1200, Math.max(460, 380 + n * 42 + (maxK - 2) * 46)));
  const cx = W / 2, cy = H / 2;
  const R = Math.max(130, Math.min(240, Math.min(W, H) * 0.33));

  // 당사자: 등장 순 원형 배치 (연결 많은 쌍을 이웃시키는 단순 정렬)
  const deg = id => (data.relations || []).filter(r => r.from === id || r.to === id).length;
  const order = [...ids].sort((a, b) => deg(b) - deg(a));
  const nodes = order.map((id, i) => n === 1
    ? { id, type: 'party', x: cx, y: cy }
    : n === 2
      ? { id, type: 'party', x: cx + (i ? 1 : -1) * R, y: cy }
      : { id, type: 'party', x: cx + R * Math.cos(-Math.PI / 2 + i * 2 * Math.PI / n), y: cy + R * Math.sin(-Math.PI / 2 + i * 2 * Math.PI / n) });
  const at = Object.fromEntries(nodes.map(nd => [nd.id, nd]));

  // 목적물: 관련 당사자 무게중심에서 원점 방향으로 밀어낸 안쪽 위치
  const things = (data.objects || []).filter(o => !at[o] && (data.relations || []).some(r => r.obj === o)).slice(0, 8);
  things.forEach((t, i) => {
    const rel = (data.relations || []).filter(r => r.obj === t);
    const ps = [...new Set(rel.flatMap(r => [r.from, r.to]))].map(p => at[p]).filter(Boolean);
    let x = cx, y = cy;
    if (ps.length) {
      const mx = ps.reduce((a, p) => a + p.x, 0) / ps.length;
      const my = ps.reduce((a, p) => a + p.y, 0) / ps.length;
      const ang = Math.atan2(my - cy, mx - cx) + (i - things.length / 2) * 0.5;
      const rr = R * 0.48;
      x = cx + rr * Math.cos(ang); y = cy + rr * Math.sin(ang);
    }
    nodes.push({ id: t, type: 'thing', x, y });
    at[t] = nodes[nodes.length - 1];
  });

  const edges = [...(data.relations || [])]
    .map((r, i) => ({ ...r, id: 'e' + i, effect: effOf(String(r.label)) }))
    .sort((a, b) => (dateKey(a.date) || 9e9) - (dateKey(b.date) || 9e9));

  const times = [...new Set([...edges.map(e => dateKey(e.date)), ...(data.events || []).map(e => dateKey(e.date))].filter(Boolean))].sort((a, b) => a - b);

  // 목적물별 권리 구간(소유/점유/담보) — 시점 뷰용
  const arcs = [];
  for (const th of things) {
    const rs = edges.filter(e => e.obj === th && e.from !== e.to);
    if (!rs.length) continue;
    const owns = rs.filter(r => r.effect === 'own');
    if (owns.length) {
      let holder = owns[0].from, prev = 0;
      for (const o of owns) {
        const k = dateKey(o.date) || prev;
        if (holder && holder !== o.to) arcs.push({ thing: th, party: holder, role: '소유', s: prev, e: k });
        holder = o.to; prev = k;
      }
      arcs.push({ thing: th, party: holder, role: '소유', s: prev, e: Infinity });
    }
    for (const r of rs.filter(r => r.effect === 'lien')) {
      arcs.push({ thing: th, party: r.to, role: String(r.label).replace(/\s*[(（].*$/, '').replace(/권?\s*설정$/, '') || '담보', s: dateKey(r.date) || 0, e: Infinity });
    }
    const poss = rs.filter(r => r.effect === 'poss');
    poss.forEach((r, i) => arcs.push({ thing: th, party: r.to, role: '점유', s: dateKey(r.date) || 0, e: i + 1 < poss.length ? dateKey(poss[i + 1].date) || Infinity : Infinity }));
  }

  return { W, H, nodes, edges, events: [...(data.events || [])].sort((a, b) => dateKey(a.date) - dateKey(b.date)), times, arcs: arcs.filter(a => a.e > a.s) };
}
