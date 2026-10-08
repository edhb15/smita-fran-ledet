'use strict';
(function () {
  const G = window.GBG, Snd = window.Snd, Weather = window.Weather;
  // ---------- Karta (Göteborg) ----------
  // Rutnätet har en cell per kartpixel (1,5 m i spelet). i går väst→öst, j norr→söder.
  const { PX0, PY0, PX1, PY1, OX, OY, S } = G;
  const GW = PX1 - PX0, GH = PY1 - PY0;
  const BLD = 0, ST = 1, WATER = 2, PARK = 3, OBS = 4, PLAZA = 5, BRIDGE = 7, COBBLE = 8, ROAD = 9, RAIL = 10;
  const WALK = t => t === ST || t === PARK || t === PLAZA || t === BRIDGE || t === COBBLE || t === ROAD || t === RAIL;
  const X = px => (px - OX) * S, Z = py => (py - OY) * S;
  const PXof = x => x / S + OX, PYof = z => z / S + OY;
  const grid = new Uint8Array(GW * GH);
  const inMap = (i, j) => i >= 0 && i < GW && j >= 0 && j < GH;
  const idx = (i, j) => j * GW + i;
  const at = (i, j) => inMap(i, j) ? grid[idx(i, j)] : BLD;
  const cellI = x => Math.floor(x / S + OX - PX0), cellJ = z => Math.floor(z / S + OY - PY0);
  const cellX = i => (i + PX0 + 0.5 - OX) * S, cellZ = j => (j + PY0 + 0.5 - OY) * S;
  const MINX = X(PX0), MAXX = X(PX1), MINZ = Z(PY0), MAXZ = Z(PY1);
  let seed = 11, time = 0;
  // Förstapersonsvy (sparas mellan gångerna)
  let fp = false, fpYaw = 0;
  try { fp = localStorage.getItem('smita-fp') === '1'; } catch (e) { }
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const W = pts => pts.map(p => [X(p[0]), Z(p[1])]);

  function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function trace(g, pts, close) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
    if (close) g.closePath();
  }
  function rotRect(g, x, y, w, h, a) { g.save(); g.translate(x, y); g.rotate(a || 0); g.fillRect(-w / 2, -h / 2, w, h); g.restore(); }
  function shape(g, s, grow) {
    grow = grow || 0; g.lineJoin = 'round'; g.lineCap = 'round';
    if (s.poly) { trace(g, s.poly, true); g.fill(); if (grow > 0) { g.lineWidth = grow * 2; g.stroke(); } }
    else if (s.line) { trace(g, s.line, false); g.lineWidth = s.w + grow * 2; g.stroke(); }
    else if (s.circle) { g.beginPath(); g.arc(s.circle[0], s.circle[1], s.circle[2] + grow, 0, 7); g.fill(); }
    else if (s.ell) { const e = s.ell; g.beginPath(); g.ellipse(e[0], e[1], e[2] + grow, e[3] + grow, e[4] || 0, 0, 7); g.fill(); }
    else if (s.rect) { const r = s.rect; rotRect(g, r[0], r[1], r[2] + grow * 2, r[3] + grow * 2, r[4]); }
  }
  // Ritar former på en duk med en pixel per cell och läser tillbaka vilka celler som täcks
  function mask(list, grow) {
    const c = cv(GW, GH), g = c.getContext('2d');
    g.translate(-PX0, -PY0); g.fillStyle = g.strokeStyle = '#fff';
    for (const s of list) shape(g, s, grow);
    const d = g.getImageData(0, 0, GW, GH).data, m = new Uint8Array(GW * GH);
    for (let k = 0; k < m.length; k++) m[k] = d[k * 4 + 3] > 127 ? 1 : 0;
    return m;
  }
  // Förskjuten linje (används för räls och bropelare)
  function offsetLine(pts, d) {
    return pts.map((p, k) => {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      return [p[0] - dy / l * d, p[1] + dx / l * d];
    });
  }
  function closestOn(pts, x, y) {
    let best = null, bd = Infinity;
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
      const px = a[0] + dx * t, py = a[1] + dy * t, d = Math.hypot(px - x, py - y), l = Math.sqrt(l2);
      if (d < bd) { bd = d; best = { x: px, y: py, nx: -dy / l, ny: dx / l, d }; }
    }
    return best;
  }

  // Landmärkenas fotavtryck (kartpixlar)
  const AV = Math.atan2(61, 48); // Avenyns riktning
  const FOOT = [
    { rect: [634, 328, 4, 4, 0] }, { rect: [622, 342, 9.3, 4, -0.844] }, { rect: [584, 425, 8, 4, 0.507] },
    { rect: [515, 463, 6, 6, 0] }, { circle: [582, 467, 3] }, { rect: [586, 452, 4, 3.5, 0] }, { rect: [604, 457, 5, 9, 0] },
    { rect: [620, 399, 5, 8, -0.1] }, { rect: [635, 355.5, 18, 15, 0] }, { rect: [664, 356, 20, 10, 0] },
    { rect: [697, 473, 15, 5, AV - Math.PI / 2] }, { rect: [712, 478, 10, 8, 0] },
    { rect: [727, 446, 3.2, 3.2, 0.2] }, { rect: [733, 443, 3.2, 3.2, 0.2] }, { rect: [739, 448, 3.2, 3.2, 0.2] },
    { circle: [493, 376, 3] }, { rect: [677, 386, 8, 4, 0] },
    { circle: [762, 470, 1.6] }, { rect: [752, 476, 5, 1.6, 0] }, { circle: [742, 491, 2.4] }
  ];
  // Läktare: Gamla Ullevi (rektangel) och Nya Ullevi (oval), med öppningar
  const STANDS = [];
  {
    const cx = 692, cy = 384.5, w = 12, h = 9, t = 1.6;
    for (const s of [-1, 1]) for (const k of [-1, 1]) {
      STANDS.push({ rect: [cx + k * 3.4, cy + s * (h / 2 - t / 2), 4.4, t, 0], h: 5, c: '#5c7ea8' });
      STANDS.push({ rect: [cx + s * (w / 2 - t / 2), cy + k * 2.6, t, 3, 0], h: 5, c: '#5c7ea8' });
    }
    const ux = 722, uy = 390, rx = 12, ry = 7.6, n = 32;
    for (let k = 0; k < n; k++) {
      const a = (k + 0.5) / n * Math.PI * 2;
      if (k % 8 === 0) continue;
      const x = ux + Math.cos(a) * rx, y = uy + Math.sin(a) * ry;
      const tx = -Math.sin(a) * rx, ty = Math.cos(a) * ry, len = Math.hypot(tx, ty) * Math.PI * 2 / n + 0.3;
      STANDS.push({ rect: [x, y, len, 2.6, Math.atan2(ty, tx)], h: 8, c: '#d0d5dc' });
    }
  }
  for (const s of STANDS) FOOT.push({ rect: s.rect });

  // Färjelägen för Älvsnabben med bryggor ut i vattnet
  const DOCKS = [[G.southBank, 586, 398], [G.northBank, 498, 393], [G.northBank, 408, 416]].map(([bank, x, y]) => {
    const c = closestOn(bank, x, y);
    return { x: c.x + c.nx * 2.4, y: c.y + c.ny * 2.4, pier: { rect: [c.x + c.nx * 0.3, c.y + c.ny * 0.3, 2.4, 4, Math.atan2(c.ny, c.nx)] } };
  });
  const PIERS = DOCKS.map(d => d.pier);

  // ---------- Rasterisera kartan ----------
  const roadShapes = G.roads.map(r => ({ line: r.p, w: r.w }));
  const mWater = mask(G.water), mRoad = mask(roadShapes), mPark = mask(G.parks), mPlaza = mask(G.plazas);
  const mHaga = mask([{ poly: G.haga }]), mRail = mask([{ poly: G.rail }]), mPier = mask(PIERS);
  for (let k = 0; k < grid.length; k++) {
    let t = ST;
    if (mHaga[k]) t = COBBLE;
    if (mPark[k]) t = PARK;
    if (mPlaza[k]) t = PLAZA;
    if (mRail[k]) t = RAIL;
    if (mWater[k]) t = WATER;
    if (mRoad[k]) t = t === WATER ? BRIDGE : mHaga[k] ? COBBLE : ROAD;
    if (mPier[k] && t === WATER) t = BRIDGE;
    grid[k] = t;
  }
  // Här får det inte byggas hus
  const reserved = new Uint8Array(GW * GH);
  for (const m of [mask(G.water, 2), mask(G.parks, 0.8), mask(G.plazas, 0.8), mask([{ poly: G.rail }], 0.8), mask(roadShapes, 1), mask(FOOT, 1.5), mask(PIERS, 2)])
    for (let k = 0; k < m.length; k++) if (m[k]) reserved[k] = 1;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) if (i < 3 || j < 3 || i >= GW - 3 || j >= GH - 3) reserved[idx(i, j)] = 1;

  // ---------- Stadsdelar och kvarter ----------
  const STY = {
    old: { cols: ['#e8d5b0', '#d9b98c', '#c9a27a', '#efe3c8', '#b7865c', '#d8c3a0', '#c48a5c', '#e6cfa1'], roofs: ['#4f7a6e', '#5a4a42', '#4a4a50', '#6b3f30'], fl: [3, 4], pitch: 0.3, slab: [2.4, 4] },
    stone: { cols: ['#c8946a', '#b06a4a', '#e0c79a', '#a7735a', '#d6b38a', '#9c5a42', '#e9dcc3', '#c9a27a'], roofs: ['#4a4a50', '#5b4b45', '#3f3f45'], fl: [4, 5], pitch: 0.15, slab: [2.6, 4.5] },
    haga: { cols: ['#f3d9a4', '#e9b8a0', '#cfe0c3', '#f6e7c1', '#d9c2a6', '#c7dbe6', '#f1c9b5'], roofs: ['#8a3b2e', '#7a3428', '#93432f'], fl: [2, 2], pitch: 0.9, slab: [2, 3.2] },
    lands: { cols: ['#e8c872', '#c9533e', '#6b8f71', '#d98e48', '#8fb3c9', '#e3dccb', '#a35d6a', '#7d9cc4', '#d6a2ad'], roofs: ['#4a4a50', '#5a5a60', '#7a3428'], fl: [3, 3], pitch: 0.4, slab: [2.6, 4.2] },
    office: { cols: ['#9aa7b4', '#c4ccd4', '#7d8b99', '#b8c4cf', '#d9dde1'], roofs: ['#3a3d42', '#55595f'], fl: [5, 8], pitch: 0, slab: [3, 5] },
    modern: { cols: ['#d9dee3', '#8fa3b5', '#c0392b', '#e5e7e9', '#a3b8c9', '#f0e6d2'], roofs: ['#3a3d42', '#55595f'], fl: [4, 8], pitch: 0, slab: [3, 5] },
    industry: { cols: ['#8d8d8d', '#a3a19b', '#6f7b87', '#b5651d', '#7f8c8d', '#9c6b4e'], roofs: ['#5b5f66', '#6b6b6b', '#4c5a66'], fl: [2, 3], pitch: 0, slab: [5, 9], solid: true },
    tower: { cols: ['#e9e4d8', '#d3cbbd', '#c9c2b5', '#e0d6c2'], roofs: ['#4a4a50'], fl: [6, 9], pitch: 0, slab: [3, 5] },
    campus: { cols: ['#a0522d', '#b5653a', '#8b4a2b', '#c27c54'], roofs: ['#4a4a50', '#3f3f45'], fl: [3, 5], pitch: 0.1, slab: [3, 5] },
    villa: { cols: ['#f1f3f5', '#e8c872', '#c9533e', '#8fb3c9', '#e3dccb', '#d6a2ad', '#a7c4a0'], roofs: ['#7a3428', '#4a4a50', '#5a5a60'], fl: [1, 2], pitch: 1, slab: [2, 3] }
  };
  const seeds = G.seeds;
  function nearest(px, py) {
    let b = 0, bd = Infinity;
    for (let k = 0; k < seeds.length; k++) { const d = (seeds[k][1] - px) ** 2 + (seeds[k][2] - py) ** 2; if (d < bd) { bd = d; b = k; } }
    return b;
  }
  const freePx = (px, py) => { const i = Math.floor(px - PX0), j = Math.floor(py - PY0); return inMap(i, j) && !reserved[idx(i, j)]; };
  function okRect(si, cx, cy, hw, hd, ux, uy) {
    const vx = -uy, vy = ux, na = Math.max(2, Math.ceil(hw / 1.2)), nb = Math.max(2, Math.ceil(hd / 1.2));
    for (let a = 0; a <= na; a++) for (let b = 0; b <= nb; b++) {
      const sa = -1 + 2 * a / na, sb = -1 + 2 * b / nb;
      const px = cx + ux * hw * sa + vx * hd * sb, py = cy + uy * hw * sa + vy * hd * sb;
      if (!freePx(px, py)) return false;
      if ((a === 0 || a === na) && (b === 0 || b === nb) && nearest(px, py) !== si) return false;
    }
    return true;
  }
  const blocks = [], houses = [];
  function house(s, cx, cy, w, d, ang) {
    const floors = s.fl[0] + Math.floor(rnd() * (s.fl[1] - s.fl[0] + 1));
    houses.push({ x: X(cx), z: Z(cy), w: w * S, d: d * S, a: ang, h: floors * 3, col: pick(s.cols), roof: pick(s.roofs), pitch: rnd() < s.pitch, solid: !!s.solid, px: cx, py: cy, pw: w, pd: d });
  }
  function strip(s, cx, cy, len, dep, ang) {
    const ux = Math.cos(ang), uy = Math.sin(ang);
    let p = -len / 2;
    while (p < len / 2 - 0.01) {
      let w = s.slab[0] + rnd() * (s.slab[1] - s.slab[0]);
      if (len / 2 - (p + w) < s.slab[0] * 0.6) w = len / 2 - p;
      house(s, cx + ux * (p + w / 2), cy + uy * (p + w / 2), w, dep, ang);
      p += w;
    }
  }
  function addBlock(st, cx, cy, hw, hd, ang, small) {
    const s = STY[st], ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux;
    const b = { cx, cy, hw, hd, ang, lawn: st === 'tower' || st === 'villa', court: false };
    blocks.push(b);
    if (st === 'tower') {
      if (rnd() < 0.15) return;
      const r = Math.min(hw, hd) * 0.62;
      house(s, cx, cy, r * 2, r * 2, ang);
    } else if (st === 'villa') {
      for (const a of [-1, 1]) for (const c of [-1, 1]) if (rnd() < 0.8) {
        const w = hw * 0.6, turn = rnd() < 0.5 ? 0 : Math.PI / 2;
        house(s, cx + (ux * a * hw + vx * c * hd) * 0.5, cy + (uy * a * hw + vy * c * hd) * 0.5, w, w * 0.75, ang + turn);
      }
    } else if (!small && hw > 3.1 && hd > 3.1 && st !== 'industry') {
      const dep = 2.4; b.court = true;
      for (const k of [-1, 1]) {
        strip(s, cx + vx * k * (hd - dep / 2), cy + vy * k * (hd - dep / 2), hw * 2, dep, ang);
        strip(s, cx + ux * k * (hw - dep / 2), cy + uy * k * (hw - dep / 2), hd * 2 - dep * 2, dep, ang + Math.PI / 2);
      }
    } else if (hw >= hd) strip(s, cx, cy, hw * 2, hd * 2, ang);
    else strip(s, cx, cy, hd * 2, hw * 2, ang + Math.PI / 2);
  }
  seeds.forEach((sd, si) => {
    const [, sx, sy, deg, P, st] = sd, ang = deg * Math.PI / 180, ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux;
    const gap = st === 'haga' ? 2.2 : st === 'industry' ? 3.2 : 2.6, h = (P - gap) / 2, R = Math.ceil(300 / P);
    for (let k = -R; k <= R; k++) for (let l = -R; l <= R; l++) {
      const bx = sx + ux * (k + 0.5) * P + vx * (l + 0.5) * P, by = sy + uy * (k + 0.5) * P + vy * (l + 0.5) * P;
      if (bx < PX0 || bx > PX1 || by < PY0 || by > PY1 || nearest(bx, by) !== si) continue;
      if (okRect(si, bx, by, h, h, ux, uy)) { addBlock(st, bx, by, h, h, ang); continue; }
      const q = h / 2 - 0.3;
      if (q < 1.1) continue;
      for (const a of [-1, 1]) for (const b of [-1, 1]) {
        const qx = bx + (ux * a + vx * b) * h / 2, qy = by + (uy * a + vy * b) * h / 2;
        if (okRect(si, qx, qy, q, q, ux, uy)) addBlock(st, qx, qy, q, q, ang, true);
      }
    }
  });
  {
    const m = mask(houses.map(b => ({ rect: [b.px, b.py, b.pw, b.pd, b.a] })).concat(FOOT));
    for (let k = 0; k < m.length; k++) if (m[k]) grid[k] = BLD;
  }
  const setObs = (px, py, r) => {
    for (let j = Math.floor(py - r - PY0); j <= Math.floor(py + r - PY0); j++) for (let i = Math.floor(px - r - PX0); i <= Math.floor(px + r - PX0); i++)
      if (inMap(i, j) && Math.hypot(i + PX0 + 0.5 - px, j + PY0 + 0.5 - py) <= r + 0.5 && WALK(grid[idx(i, j)])) grid[idx(i, j)] = OBS;
  };
  setObs(641, 399.5, 0.8); setObs(691, 464.5, 1.2); // Kopparmärra och Poseidon

  // Träd: alléer längs Avenyn och Allén, och i parkerna
  const trees = [];
  function addTree(x, z, s) {
    const i = cellI(x), j = cellJ(z);
    if (!inMap(i, j)) return;
    const t = grid[idx(i, j)];
    if (t !== PARK && t !== ST && t !== ROAD && t !== PLAZA) return;
    grid[idx(i, j)] = OBS; trees.push([x, z, s]);
  }
  function nearOtherRoad(px, py, name) {
    for (const r of G.roads) if (r.n !== name && r.n !== 'Kungsportsbron') { const c = closestOn(r.p, px, py); if (c.d < r.w / 2 + 1.5) return true; }
    return false;
  }
  for (const [name, off, step] of [['Avenyn', 3.3, 3], ['Allén', 2.6, 3.2], ['Södra vägen', 2.6, 3.5], ['Vasagatan', 2.6, 4]]) {
    const r = G.roads.find(q => q.n === name);
    for (const side of [-1, 1]) {
      const pts = offsetLine(r.p, side * off);
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let t = 1.5; t < l - 1; t += step) {
          const px = a[0] + (b[0] - a[0]) * t / l, py = a[1] + (b[1] - a[1]) * t / l;
          if (!nearOtherRoad(px, py, name)) addTree(X(px), Z(py), 0.9);
        }
      }
    }
  }
  for (let j = 1; j < GH - 1; j++) for (let i = 1; i < GW - 1; i++) {
    if (grid[idx(i, j)] !== PARK) continue;
    const px = i + PX0, py = j + PY0, big = px > 484 && px < 568 && py > 485;
    if (rnd() > (big ? 0.1 : 0.07)) continue;
    let ok = true;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const t = grid[idx(i + di, j + dj)]; if (t === OBS || t === WATER || t === ROAD) ok = false; }
    if (ok) addTree(cellX(i), cellZ(j), 0.85 + rnd() * 0.5);
  }

  // ---------- Three.js ----------
  const V3 = THREE.Vector3;
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#a8d8f0');
  scene.fog = new THREE.Fog('#a8d8f0', 75, 180);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 420);
  const hemi = new THREE.HemisphereLight('#e6f4ff', '#5a5048', 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e0', 0.75);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 180 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  // Genomsiktliga hus: allt mellan kameran och spelaren klipps bort i shadern
  const seeU = { uP: { value: new V3() }, uC: { value: new V3() }, uR: { value: 0 }, uSnow: { value: 0 } };
  function patch(mat, solid) {
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, seeU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying float vUp;' + (solid ? '\nattribute float aSolid; varying float vSolid;' : ''))
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vUp = normalize(mat3(modelMatrix) * objectNormal).y;' + (solid ? ' vSolid = aSolid;' : ''));
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying float vUp; uniform vec3 uP; uniform vec3 uC; uniform float uR; uniform float uSnow;' + (solid ? '\nvarying float vSolid;' : ''))
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if (uR > 0.0) {
            vec3 pc = uC - uP; float L = length(pc); vec3 dir = pc / L; vec3 rel = vWP - uP; float t = dot(rel, dir);
            if (t > 0.6 && t < L && vWP.y > 0.12) {
              float d = length(rel - dir * t), r = uR * clamp(t / 5.0, 0.45, 1.0);
              float n = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
              if (d < r - 0.9 || (d < r && n > (d - r + 0.9) / 0.9)) discard;
            }
          }`)
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.98), uSnow * smoothstep(0.55, 0.8, vUp));');
      if (solid) sh.fragmentShader = sh.fragmentShader
        .replace('#include <map_fragment>', '#ifdef USE_MAP\n diffuseColor *= mix(texture2D(map, vUv), vec4(1.0), vSolid);\n#endif')
        .replace('#include <emissivemap_fragment>', '#ifdef USE_EMISSIVEMAP\n totalEmissiveRadiance *= texture2D(emissiveMap, vUv).rgb * (1.0 - vSolid);\n#endif');
    };
    mat.customProgramCacheKey = () => solid ? 'see-solid' : 'see';
    return mat;
  }
  const lam = c => new THREE.MeshLambertMaterial({ color: c });
  const lamS = c => patch(lam(c), false);
  const mesh = (geo, mat, x, y, z, parent, shadow = true) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = shadow; (parent || scene).add(m); return m;
  };
  const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // ---------- Marken (ritad textur) ----------
  const K = 5;
  const groundCv = cv(GW * K, GH * K);
  {
    const g = groundCv.getContext('2d');
    g.setTransform(K, 0, 0, K, -PX0 * K, -PY0 * K);
    g.lineJoin = g.lineCap = 'round';
    const R = (a, b) => a + rnd() * (b - a);
    const clipTo = (list, fn) => {
      g.save(); g.beginPath();
      for (const s of list) {
        if (s.poly) { g.moveTo(s.poly[0][0], s.poly[0][1]); for (const p of s.poly) g.lineTo(p[0], p[1]); g.closePath(); }
        else if (s.circle) { g.moveTo(s.circle[0] + s.circle[2], s.circle[1]); g.arc(s.circle[0], s.circle[1], s.circle[2], 0, 7); }
      }
      g.clip(); fn(); g.restore();
    };
    g.fillStyle = '#62666d'; g.fillRect(PX0, PY0, GW, GH);
    // Haga: kullersten
    g.fillStyle = '#8c7b6a'; shape(g, { poly: G.haga });
    clipTo([{ poly: G.haga }], () => { g.fillStyle = 'rgba(0,0,0,.13)'; for (let y = 440; y < 463; y += 0.6) for (let x = 574 + (y * 10 % 2) * 0.3; x < 603; x += 0.6) g.fillRect(x, y, 0.35, 0.35); });
    // Kvarter: trottoar runt, gård eller gräsmatta inuti
    for (const b of blocks) {
      g.fillStyle = '#9a9da3'; rotRect(g, b.cx, b.cy, b.hw * 2 + 1.1, b.hd * 2 + 1.1, b.ang);
      if (b.lawn) { g.fillStyle = '#7aa865'; rotRect(g, b.cx, b.cy, b.hw * 2, b.hd * 2, b.ang); }
      else if (b.court) { g.fillStyle = '#7f9f6a'; rotRect(g, b.cx, b.cy, b.hw * 2 - 4.8, b.hd * 2 - 4.8, b.ang); }
    }
    // Parker
    g.fillStyle = '#6fa35a'; for (const s of G.parks) shape(g, s);
    clipTo(G.parks, () => {
      for (let k = 0; k < 2600; k++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(40,90,30,.18)' : 'rgba(170,210,120,.16)';
        g.beginPath(); g.arc(R(PX0, PX1), R(PY0, PY1), R(1, 4), 0, 7); g.fill();
      }
      g.strokeStyle = '#d8cba5'; g.lineWidth = 0.9;
      // grusgångar i Slottsskogen: en runda och några stigar tvärs över
      const ex = (a, k) => [526 + Math.cos(a) * 26 * k, 543 + Math.sin(a) * 42 * k];
      g.beginPath(); g.ellipse(526, 543, 26, 42, 0.1, 0, 7); g.stroke();
      for (let k = 0; k < 5; k++) {
        const a = rnd() * 6.28, b = a + Math.PI + (rnd() - 0.5) * 1.4, p0 = ex(a, 1.25), p1 = ex(b, 1.25), c = ex(a + 1.5, 0.3);
        g.beginPath(); g.moveTo(p0[0], p0[1]); g.quadraticCurveTo(c[0], c[1], p1[0], p1[1]); g.stroke();
      }
    });
    // Torg
    g.fillStyle = '#bcae94'; for (const s of G.plazas) shape(g, s);
    g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 0.15;
    for (let r = 2; r < 8.5; r += 1.5) { g.beginPath(); g.arc(692, 467, r, 0, 7); g.stroke(); }
    // Heden: grus och fotbollsplaner
    g.fillStyle = '#cdbb94'; shape(g, { poly: [[680, 398], [698, 398], [698, 432], [680, 434]] });
    for (const y of [404, 420]) {
      g.fillStyle = '#5c9a4c'; g.fillRect(682, y, 14, 9); g.strokeStyle = '#fff'; g.lineWidth = 0.2;
      g.strokeRect(682.6, y + 0.6, 12.8, 7.8); g.beginPath(); g.moveTo(689, y + 0.6); g.lineTo(689, y + 8.4); g.stroke();
    }
    // Liseberg: grusgångar och rabatter
    g.fillStyle = '#dccaa2'; shape(g, { poly: G.liseberg });
    clipTo([{ poly: G.liseberg }], () => {
      for (let k = 0; k < 500; k++) { g.fillStyle = pick(['#e64980', '#fab005', '#7bc067', '#ff8787', '#74c0fc']); g.beginPath(); g.arc(R(736, 770), R(462, 502), R(0.15, 0.4), 0, 7); g.fill(); }
    });
    // Ullevi-planerna
    g.fillStyle = '#4f9a45'; g.beginPath(); g.ellipse(722, 390, 10, 5.6, 0, 0, 7); g.fill();
    g.fillRect(686, 381, 12, 7);
    g.strokeStyle = '#fff'; g.lineWidth = 0.25; g.strokeRect(715, 386.5, 14, 7); g.beginPath(); g.moveTo(722, 386.5); g.lineTo(722, 393.5); g.stroke();
    g.strokeRect(687.5, 382, 9, 5); g.beginPath(); g.arc(722, 390, 1.4, 0, 7); g.stroke();
    // Banområdet vid Centralen
    g.fillStyle = '#7a7268'; shape(g, { poly: G.rail });
    g.strokeStyle = '#3b3631'; g.lineWidth = 0.18;
    for (let y = 324; y < 350; y += 2.2) for (const o of [0, 0.7]) { g.beginPath(); g.moveTo(674, y + o); g.lineTo(771, y + o - 1.5); g.stroke(); }
    // Vatten med kajkanter
    g.fillStyle = '#9a958c'; g.strokeStyle = '#9a958c';
    for (const s of G.water) { if (s.line) { trace(g, s.line); g.lineWidth = s.w + 1; g.stroke(); } else shape(g, s, 0.5); }
    g.fillStyle = '#2f6fa3'; g.strokeStyle = '#2f6fa3';
    for (const s of G.water) shape(g, s);
    clipTo(G.water.filter(s => s.poly), () => {
      g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 0.25;
      for (let k = 0; k < 1400; k++) { const x = R(PX0, PX1), y = R(PY0, PY1); g.beginPath(); g.moveTo(x, y); g.lineTo(x + R(1, 3), y - 0.3); g.stroke(); }
    });
    // Bryggor
    g.fillStyle = '#8a6a4a'; for (const pr of PIERS) shape(g, pr);
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 0.1;
    for (const pr of PIERS) { const [x, y, w, h, a] = pr.rect; g.save(); g.translate(x, y); g.rotate(a); for (let u = -w / 2; u < w / 2; u += 0.5) { g.beginPath(); g.moveTo(u, -h / 2); g.lineTo(u, h / 2); g.stroke(); } g.restore(); }
    // Gator
    const ROADC = { hw: '#4b4f56', major: '#575b62', street: '#5d6168', avenue: '#b0a38c', bridge: '#8e8780', cobble: '#8c7b6a' };
    for (const r of G.roads) {
      if (r.k === 'bridge') { g.strokeStyle = '#3b3b3b'; g.lineWidth = r.w + 0.7; trace(g, r.p); g.stroke(); }
      else if (r.k !== 'hw') { g.strokeStyle = '#9a9da3'; g.lineWidth = r.w + 1.2; trace(g, r.p); g.stroke(); }
    }
    for (const r of G.roads) { g.strokeStyle = ROADC[r.k]; g.lineWidth = r.w; trace(g, r.p); g.stroke(); }
    for (const r of G.roads) {
      if (r.k === 'avenue') { g.strokeStyle = '#a3967f'; g.lineWidth = r.w - 2.4; trace(g, r.p); g.stroke(); }
      if (r.k === 'hw' || r.k === 'major' || r.k === 'bridge') {
        g.strokeStyle = r.k === 'hw' ? '#f1f3f5' : '#e9e3c7'; g.lineWidth = 0.14; g.setLineDash([1.2, 1.2]);
        trace(g, r.p); g.stroke(); g.setLineDash([]);
      }
    }
    // Spårvagnsräls
    g.strokeStyle = '#2f2f2f'; g.lineWidth = 0.14;
    for (const t of G.trams) for (const o of [-0.45, 0.45]) { trace(g, offsetLine(t.p, o)); g.stroke(); }
    // Husens fotavtryck (syns knappt, men ger skugga i gränderna)
    g.fillStyle = '#4a4744';
    for (const h of houses) rotRect(g, h.px, h.py, h.pw, h.pd, h.a);
  }
  const groundTex = new THREE.CanvasTexture(groundCv);
  groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const groundMat = new THREE.MeshLambertMaterial({ map: groundTex });
  {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(GW * S, GH * S), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.set((MINX + MAXX) / 2, 0, (MINZ + MAXZ) / 2);
    ground.receiveShadow = true; scene.add(ground);
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), lam('#55604f'));
    outside.rotation.x = -Math.PI / 2; outside.position.set((MINX + MAXX) / 2, -0.05, (MINZ + MAXZ) / 2); scene.add(outside);
  }

  // ---------- Hus (sammanslagna i block för att spelet ska gå snabbt) ----------
  const WINW = 2.4, WINH = 3;
  const winCv = cv(256, 256), litCv = cv(256, 256);
  {
    const g = winCv.getContext('2d'), l = litCv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256); l.fillStyle = '#000'; l.fillRect(0, 0, 256, 256);
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
      const x = a * 64, y = b * 64;
      g.fillStyle = '#f2efe6'; g.fillRect(x + 16, y + 12, 32, 40);
      g.fillStyle = '#34506b'; g.fillRect(x + 20, y + 16, 24, 32);
      g.fillStyle = '#f2efe6'; g.fillRect(x + 31, y + 16, 2, 32); g.fillRect(x + 20, y + 30, 24, 2);
      if (rnd() < 0.45) { l.fillStyle = rnd() < 0.5 ? '#ffcf73' : '#ffe2a0'; l.fillRect(x + 20, y + 16, 24, 32); }
    }
  }
  const mkTex = c => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
  const bMat = patch(new THREE.MeshLambertMaterial({ vertexColors: true, map: mkTex(winCv), emissiveMap: mkTex(litCv), emissive: new THREE.Color(0, 0, 0) }), true);
  {
    const chunks = new Map(), cA = new THREE.Color(), cB = new THREE.Color();
    const chunk = (x, z) => { const k = Math.floor(x / 48) + ',' + Math.floor(z / 48); let c = chunks.get(k); if (!c) chunks.set(k, c = { p: [], n: [], u: [], c: [], s: [] }); return c; };
    function poly(ch, V, U, hint, col, solid) {
      const e1 = [V[1][0] - V[0][0], V[1][1] - V[0][1], V[1][2] - V[0][2]], e2 = [V[2][0] - V[0][0], V[2][1] - V[0][1], V[2][2] - V[0][2]];
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const l = Math.hypot(n[0], n[1], n[2]) || 1; n = n.map(q => q / l);
      if (n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) { V = V.slice().reverse(); U = U.slice().reverse(); n = n.map(q => -q); }
      const order = V.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
      for (const k of order) { ch.p.push(V[k][0], V[k][1], V[k][2]); ch.n.push(n[0], n[1], n[2]); ch.u.push(U[k][0], U[k][1]); ch.c.push(col.r, col.g, col.b); ch.s.push(solid); }
    }
    const Z4 = [[0, 0], [0, 0], [0, 0], [0, 0]];
    for (const b of houses) {
      const ch = chunk(b.x, b.z), ca = Math.cos(b.a), sa = Math.sin(b.a), hw = b.w / 2, hd = b.d / 2, h = b.h;
      const L = (lx, lz, y) => [b.x + lx * ca - lz * sa, y, b.z + lx * sa + lz * ca];
      const wall = cA.set(b.col), roof = cB.set(b.roof);
      const cs = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
      const uo = Math.floor(rnd() * 4) / 4, vo = Math.floor(rnd() * 4) / 4, sol = b.solid ? 1 : 0;
      for (let k = 0; k < 4; k++) {
        const p = cs[k], q = cs[(k + 1) % 4], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2, hint = [mx * ca - mz * sa, 0, mx * sa + mz * ca];
        const u1 = uo + len / WINW / 4, v1 = vo + h / WINH / 4;
        poly(ch, [L(p[0], p[1], 0), L(q[0], q[1], 0), L(q[0], q[1], h), L(p[0], p[1], h)], [[uo, vo], [u1, vo], [u1, v1], [uo, v1]], hint, wall, sol);
      }
      if (!b.pitch) poly(ch, cs.map(c => L(c[0], c[1], h)), Z4, [0, 1, 0], roof, 1);
      else {
        const rh = Math.min(b.d * 0.45, 2.4), r0 = L(-hw, 0, h + rh), r1 = L(hw, 0, h + rh);
        for (const s of [-1, 1]) {
          poly(ch, [L(-hw, s * hd, h), L(hw, s * hd, h), r1, r0], Z4, [-s * sa, 1, s * ca], roof, 1);
          poly(ch, [L(s * hw, -hd, h), L(s * hw, hd, h), s < 0 ? r0 : r1], Z4, [s * ca, 0, s * sa], wall, 1);
        }
      }
    }
    for (const c of chunks.values()) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(c.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(c.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(c.u, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(c.c, 3));
      geo.setAttribute('aSolid', new THREE.Float32BufferAttribute(c.s, 1));
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, bMat); m.castShadow = m.receiveShadow = true; scene.add(m);
    }
  }

  // ---------- Landmärken ----------
  const grp = (px, py, a) => { const g = new THREE.Group(); g.position.set(X(px), 0, Z(py)); g.rotation.y = -(a || 0); scene.add(g); return g; };
  // Läppstiftet
  {
    const g = grp(634, 328), red = lamS('#c92a2a'), white = lamS('#f8f9fa');
    mesh(Box(5.6, 40, 5.6), red, 0, 20, 0, g);
    for (let y = 4; y < 34; y += 5) mesh(Box(5.8, 1.2, 5.8), white, 0, y, 0, g);
    mesh(Box(4, 4, 4), red, 0, 42, 0, g);
  }
  // Operan
  {
    const g = grp(622, 342, -0.844), body = lamS('#9b3b2e'), glass = lamS('#8ec5e0');
    mesh(Box(13.5, 7, 5.6), body, 0, 3.5, 0, g);
    mesh(Box(14.5, 0.6, 8), glass, 0, 8.3, -0.6, g).rotation.x = -0.25;
  }
  // Barken Viking vid Lilla Bommen
  {
    const g = grp(615, 325, -0.844), hull = lamS('#f8f9fa'), dark = lamS('#1b1b1b'), wood = lamS('#7a5230');
    mesh(Box(16, 2.2, 3.2), hull, 0, 0.6, 0, g);
    mesh(Box(16.2, 0.5, 3.3), dark, 0, 1.6, 0, g);
    for (const x of [-5, -1.5, 2, 5.5]) {
      mesh(new THREE.CylinderGeometry(0.12, 0.16, 13, 6), wood, x, 7, 0, g);
      for (const y of [6, 9, 11.5]) mesh(Box(0.14, 0.14, 4 - y * 0.15), wood, x, y, 0, g);
    }
  }
  // Feskekôrka
  {
    const g = grp(584, 425, 0.507), wall = lamS('#e9dfc7'), roof = lamS('#5d4a3a');
    mesh(Box(11.4, 3.5, 5.4), wall, 0, 1.75, 0, g);
    const sh = new THREE.Shape(); sh.moveTo(-3.3, 0); sh.lineTo(3.3, 0); sh.lineTo(0, 6); sh.lineTo(-3.3, 0);
    const rg = new THREE.ExtrudeGeometry(sh, { depth: 12, bevelEnabled: false }); rg.translate(0, 0, -6);
    mesh(rg, roof, 0, 3.5, 0, g).rotation.y = Math.PI / 2;
  }
  // Masthuggskyrkan
  {
    const g = grp(515, 463), brick = lamS('#a6533a'), roof = lamS('#4f8f7a');
    mesh(Box(8.4, 8, 8), brick, 0, 4, 1.5, g);
    mesh(Box(4.5, 22, 4.5), brick, 0, 11, -2.5, g);
    mesh(new THREE.ConeGeometry(3.4, 7, 4), roof, 0, 25.5, -2.5, g).rotation.y = Math.PI / 4;
    mesh(new THREE.ConeGeometry(6, 4, 4), roof, 0, 10, 1.5, g).rotation.y = Math.PI / 4;
  }
  // Skansen Kronan
  {
    const g = grp(582, 467), rock = lamS('#6e7d5a'), stone = lamS('#e0c068'), gold = lamS('#f5c518');
    mesh(new THREE.CylinderGeometry(3.2, 4.6, 5, 14), rock, 0, 2.5, 0, g);
    mesh(new THREE.CylinderGeometry(1.9, 2.1, 5, 12), stone, 0, 7.5, 0, g);
    mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.6, 12), stone, 0, 10.2, 0, g);
    mesh(new THREE.ConeGeometry(0.9, 1.6, 8), gold, 0, 11.3, 0, g);
  }
  // Kafé i Haga med Hagabullen på taket
  const bigBun = new THREE.Group();
  {
    const g = grp(586, 452);
    mesh(Box(6, 7, 5.2), lamS('#f6e7c1'), 0, 3.5, 0, g);
    mesh(Box(6.3, 0.4, 5.5), lamS('#8a3b2e'), 0, 7.2, 0, g);
    const dough = lam('#b5793a');
    mesh(new THREE.TorusGeometry(1.6, 0.85, 10, 20), dough, 0, 0, 0, bigBun).rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(1.1, 12, 8), dough, 0, 0.35, 0, bigBun).scale.y = 0.6;
    for (let k = 0; k < 10; k++) { const a = k * 2.4; mesh(new THREE.SphereGeometry(0.14, 6, 4), lam('#fff'), Math.cos(a) * 1.6, 0.85, Math.sin(a) * 1.6, bigBun); }
    bigBun.position.set(X(586), 8.4, Z(452)); scene.add(bigBun);
  }
  // Hagakyrkan
  {
    const g = grp(604, 457), brick = lamS('#b5653a'), roof = lamS('#4f8f7a');
    mesh(Box(7.5, 8, 11), brick, 0, 4, 1.5, g);
    mesh(new THREE.ConeGeometry(5.6, 4, 4), roof, 0, 10, 1.5, g).rotation.y = Math.PI / 4;
    mesh(Box(3.2, 16, 3.2), brick, 0, 8, -5.5, g);
    mesh(new THREE.ConeGeometry(2.4, 8, 4), roof, 0, 20, -5.5, g).rotation.y = Math.PI / 4;
  }
  // Domkyrkan
  {
    const g = grp(620, 399, -0.1), wall = lamS('#e9dcc3'), roof = lamS('#4f7a6e');
    mesh(Box(7.5, 9, 9), wall, 0, 4.5, 1.8, g);
    mesh(Box(8, 0.6, 9.6), roof, 0, 9.3, 1.8, g);
    mesh(Box(3.6, 18, 3.6), wall, 0, 9, -4.2, g);
    mesh(new THREE.SphereGeometry(2.1, 12, 8), roof, 0, 19, -4.2, g);
    mesh(new THREE.ConeGeometry(0.6, 3, 6), roof, 0, 22, -4.2, g);
  }
  // Nordstan och Centralstationen
  {
    const g = grp(635, 355.5);
    mesh(Box(27, 9, 22.5), lamS('#b9a28a'), 0, 4.5, 0, g);
    mesh(Box(4, 1.2, 22.6), lamS('#9fd3f5'), 0, 9.4, 0, g);
    mesh(Box(27.1, 1.2, 4), lamS('#9fd3f5'), 0, 9.4, 0, g);
    const c = grp(664, 356), brick = lamS('#c27c54');
    mesh(Box(30, 8, 15), brick, 0, 4, 0, c);
    mesh(Box(30.5, 0.6, 15.5), lamS('#4f6f66'), 0, 8.3, 0, c);
    mesh(Box(4, 13, 4), brick, -6, 6.5, 6, c);
    mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.3, 16), lamS('#fff9db'), -6, 11, 8.05, c).rotation.x = Math.PI / 2;
  }
  // Konstmuseet och Poseidon på Götaplatsen
  {
    const g = grp(697, 473, AV - Math.PI / 2), stone = lamS('#b5835a'), dark = lamS('#3d2b1f');
    mesh(Box(22.5, 11, 7.5), stone, 0, 5.5, 0, g);
    for (let k = -1; k <= 1; k++) mesh(Box(2.4, 6, 0.3), dark, k * 5, 3, -3.85, g);
    mesh(Box(18, 0.4, 2), stone, 0, 0.2, -4.8, g);
    const p = grp(691, 464.5, AV - Math.PI / 2), st = lamS('#b8b0a2'), green = lamS('#4f8f7a');
    mesh(new THREE.CylinderGeometry(3, 3, 0.6, 24), st, 0, 0.3, 0, p);
    mesh(new THREE.CylinderGeometry(2.7, 2.7, 0.62, 24), lam('#4d94c9'), 0, 0.32, 0, p, false);
    mesh(Box(1.6, 2.4, 1.6), st, 0, 1.5, 0, p);
    mesh(new THREE.CylinderGeometry(0.45, 0.6, 2.8, 10), green, 0, 4.1, 0, p);
    mesh(new THREE.SphereGeometry(0.45, 12, 10), green, 0, 5.8, 0, p);
    mesh(Box(0.25, 1.6, 0.25), green, 0.6, 5, -0.3, p).rotation.z = -0.6;
    mesh(Box(1.2, 0.35, 0.25), green, 1.3, 5.7, -0.3, p);
  }
  // Universeum och Gothia Towers vid Korsvägen
  {
    const g = grp(712, 478), wood = lamS('#a07850'), glass = lamS('#9fd3f5');
    mesh(Box(15, 11, 12), wood, 0, 5.5, 0, g);
    mesh(Box(11, 8, 0.4), glass, 0, 5, -6.1, g);
    const tg = lamS('#6d8fae'), top = lamS('#e9ecef');
    [[727, 446, 36], [733, 443, 42], [739, 448, 30]].forEach(([px, py, h]) => {
      const t = grp(px, py, 0.2);
      mesh(Box(4.8, h, 4.8), tg, 0, h / 2, 0, t);
      mesh(Box(5, 1.2, 5), top, 0, h + 0.6, 0, t);
    });
  }
  // Kuggen på Lindholmen
  {
    const g = grp(493, 376);
    ['#d9480f', '#f08c00', '#e8590c', '#fab005', '#c92a2a', '#f76707'].forEach((c, k) =>
      mesh(new THREE.CylinderGeometry(4.5 + k * 0.12, 4.5 + k * 0.12, 3, 20), lamS(c), 0, 1.5 + k * 3, 0, g));
  }
  // Palmhuset i Trädgårdsföreningen
  {
    const g = grp(677, 386), glass = lamS('#d7eef2');
    mesh(Box(12, 3.4, 4.2), glass, 0, 1.7, 0, g);
    mesh(new THREE.SphereGeometry(2.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 3.4, 0, g);
  }
  // Kopparmärra på Kungsportsplatsen
  {
    const g = grp(641, 399.5, 0.3), st = lamS('#9c9a94'), cu = lamS('#4f8f7a');
    mesh(Box(1.6, 2, 2.6), st, 0, 1, 0, g);
    mesh(Box(0.7, 0.8, 1.8), cu, 0, 2.6, 0, g);
    for (const [x, z] of [[-0.25, -0.7], [0.25, -0.7], [-0.25, 0.7], [0.25, 0.7]]) mesh(Box(0.15, 0.7, 0.15), cu, x, 2.05, z, g);
    mesh(Box(0.35, 0.7, 0.5), cu, 0, 3.1, 0.95, g).rotation.x = -0.5;
    mesh(Box(0.4, 0.9, 0.4), cu, 0, 3.4, -0.1, g);
  }
  // Ullevi: läktare och strålkastarmaster
  for (const s of STANDS) {
    const [px, py, w, d, a] = s.rect, g = grp(px, py, a);
    mesh(Box(w * S, s.h, d * S), lamS(s.c), 0, s.h / 2, 0, g);
  }
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const m = mesh(new THREE.CylinderGeometry(0.35, 0.5, 34, 8), lamS('#ced4da'), X(722 + dx * 14), 15, Z(390 + dy * 9.5));
    m.rotation.z = -dx * 0.18; m.rotation.x = dy * 0.18;
  }
  // Eriksbergskranen
  {
    const a = Math.atan2(-15, 30), g = grp(372, 428, a), blue = lamS('#2f5d8a');
    for (const x of [-6, 6]) for (const z of [-4, 4]) mesh(Box(0.9, 30, 0.9), blue, x, 15, z, g);
    mesh(Box(16, 2.4, 9.5), blue, 0, 31, 0, g);
    mesh(Box(4, 3, 4), lamS('#f1f3f5'), 2, 33.6, 0, g);
    for (const x of [-6, 6]) for (const z of [-4, 4]) setObs(372 + Math.cos(a) * x / S - Math.sin(a) * z / S, 428 + Math.sin(a) * x / S + Math.cos(a) * z / S, 0.4);
  }
  // Liseberg: pariserhjul, berg- och dalbana, karusell och AtmosFear-tornet
  let wheel;
  {
    const cx = X(752), cz = Z(476), white = lamS('#f1f3f5'), steel = lamS('#adb5bd');
    for (const s of [-1, 1]) for (const dz of [-1.2, 1.2]) mesh(Box(0.4, 12, 0.4), steel, cx + s * 2.5, 5.6, cz + dz).rotation.z = s * 0.25;
    wheel = new THREE.Group(); wheel.position.set(cx, 11.5, cz); scene.add(wheel);
    mesh(new THREE.TorusGeometry(9, 0.25, 8, 48), white, 0, 0, 0, wheel);
    const gcols = ['#e03131', '#f08c00', '#2f9e44', '#1971c2', '#ae3ec9', '#fab005'];
    wheel.userData.gond = [];
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2;
      mesh(Box(0.15, 9, 0.15), white, Math.cos(a) * 4.5, Math.sin(a) * 4.5, 0, wheel).rotation.z = a - Math.PI / 2;
      wheel.userData.gond.push(mesh(Box(1.2, 1.2, 1.2), lam(gcols[k % 6]), Math.cos(a) * 9, Math.sin(a) * 9 - 0.8, 0, wheel));
    }
    const wood = lamS('#9c6b3c'), track = lamS('#e03131');
    let prev = null;
    for (let x = X(745); x <= X(768); x += 3) {
      const z = Z(497), h = 3 + Math.abs(Math.sin(x * 0.3)) * 7;
      mesh(Box(0.4, h, 0.4), wood, x, h / 2, z - 0.8); mesh(Box(0.4, h, 0.4), wood, x, h / 2, z + 0.8);
      if (prev) {
        const dx = x - prev[0], dy = h - prev[1], len = Math.hypot(dx, dy);
        mesh(Box(len, 0.3, 2), track, (x + prev[0]) / 2, (h + prev[1]) / 2, z).rotation.z = Math.atan2(dy, dx);
      }
      prev = [x, h];
    }
    const kx = X(742), kz = Z(491);
    mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.5, 16), lamS('#fab005'), kx, 0.25, kz);
    mesh(new THREE.CylinderGeometry(0.3, 0.3, 3.5, 8), white, kx, 2, kz);
    mesh(new THREE.ConeGeometry(3.8, 2.2, 16), lamS('#e64980'), kx, 4.6, kz);
    const ax = X(762), az = Z(470);
    mesh(new THREE.CylinderGeometry(0.9, 1.1, 46, 10), lamS('#dee2e6'), ax, 23, az);
    mesh(new THREE.TorusGeometry(2.2, 0.5, 8, 18), lamS('#7048e8'), ax, 18, az).rotation.x = Math.PI / 2;
    mesh(new THREE.ConeGeometry(1.2, 3, 10), lamS('#e03131'), ax, 47.5, az);
    // Entrén
    const e = grp(737, 466, -0.2);
    for (const x of [-3, 3]) mesh(Box(0.8, 6, 0.8), lamS('#2f9e44'), x, 3, 0, e);
    mesh(Box(7.6, 1.4, 0.8), lamS('#f8f9fa'), 0, 6.4, 0, e);
  }
  // Slottsskogen: sälar i dammen, älgar och lekplatsen Plikta
  const seals = [];
  for (let k = 0; k < 3; k++) {
    const s = mesh(new THREE.SphereGeometry(0.5, 10, 8), lam('#6c757d'), 0, 0.2, 0);
    s.scale.set(0.8, 0.6, 1.8); seals.push(s);
  }
  const pondX = X(530), pondZ = Z(561);
  const moose = [];
  for (let k = 0; k < 3; k++) {
    const g = new THREE.Group(), brown = lam('#5a3d24'), tan = lam('#c9a66b');
    mesh(Box(1, 1.1, 2.2), brown, 0, 1.9, 0, g);
    for (const [x, z] of [[-0.35, -0.8], [0.35, -0.8], [-0.35, 0.8], [0.35, 0.8]]) mesh(Box(0.2, 1.4, 0.2), brown, x, 0.7, z, g);
    mesh(Box(0.5, 0.9, 0.5), brown, 0, 2.6, 1.1, g).rotation.x = 0.5;
    mesh(Box(0.45, 0.45, 0.9), brown, 0, 3, 1.5, g);
    for (const s of [-1, 1]) mesh(Box(1, 0.1, 0.5), tan, s * 0.6, 3.4, 1.3, g).rotation.z = s * 0.3;
    scene.add(g);
    moose.push({ g, x: X(540 + k * 5), z: Z(512 + k * 6), tx: 0, tz: 0, wait: 0 });
  }
  const swings = [];
  {
    const red = lam('#e03131'), blue = lam('#1c7ed6'), yellow = lam('#fab005');
    const sx = X(512), sz = Z(578);
    for (const dx of [-4, 4]) for (const dz of [-0.8, 0.8]) mesh(Box(0.2, 3.4, 0.2), red, sx + dx, 1.6, sz + dz).rotation.x = dz > 0 ? -0.25 : 0.25;
    mesh(Box(8.4, 0.2, 0.2), red, sx, 3.2, sz);
    for (const dx of [-2, 0, 2]) {
      const s = new THREE.Group(); s.position.set(sx + dx, 3.2, sz); scene.add(s);
      mesh(Box(0.05, 2.4, 0.05), lam('#333'), 0, -1.2, 0, s);
      mesh(Box(0.7, 0.1, 0.4), blue, 0, -2.4, 0, s);
      swings.push(s);
    }
    const rx = X(516), rz = Z(581);
    mesh(Box(1.2, 2.6, 1.2), yellow, rx, 1.3, rz - 1);
    mesh(Box(1, 0.15, 4), blue, rx, 1.3, rz + 0.8).rotation.x = 0.55;
    setObs(512, 578, 2.5); setObs(516, 580.5, 1.2);
  }
  // Broräcken (överallt där en gata går över vatten) och pyloner på de stora broarna
  {
    const rail = lam('#3b3b3b');
    for (const r of G.roads) for (const side of [-1, 1]) {
      const pts = offsetLine(r.p, side * (r.w / 2 + 0.15));
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        let run = null;
        for (let t = 0; t <= l; t += 0.5) {
          const px = a[0] + (b[0] - a[0]) * t / l, py = a[1] + (b[1] - a[1]) * t / l;
          const c = closestOn(r.p, px, py), on = at(Math.floor(c.x - PX0), Math.floor(c.y - PY0)) === BRIDGE;
          if (on && !run) run = [px, py];
          if ((!on || t + 0.5 > l) && run) {
            const len = Math.hypot(px - run[0], py - run[1]) * S;
            if (len > 0.5) {
              const m = mesh(Box(len, 1, 0.25), rail, X((px + run[0]) / 2), 0.5, Z((py + run[1]) / 2));
              m.rotation.y = -Math.atan2(py - run[1], px - run[0]);
            }
            run = null;
          }
        }
      }
    }
    const pyl = lamS('#e9ecef'), cable = new THREE.LineBasicMaterial({ color: '#495057' });
    const alv = G.roads.find(r => r.n === 'Älvsborgsbron').p, [a, b] = alv, ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const tops = [];
    for (const t of [0.33, 0.67]) {
      const g = grp(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, ang);
      for (const z of [-3.6, 3.6]) mesh(Box(1.2, 44, 1.2), pyl, 0, 22, z, g);
      mesh(Box(1.2, 1.6, 8.4), pyl, 0, 43, 0, g); mesh(Box(1.2, 1.2, 8.4), pyl, 0, 20, 0, g);
      tops.push(t);
    }
    for (const z of [-3.6, 3.6]) {
      const pts = [];
      for (let k = 0; k <= 30; k++) {
        const t = k / 30, y = t < 0.33 ? 2 + (t / 0.33) * 41 : t > 0.67 ? 2 + ((1 - t) / 0.33) * 41 : 43 - Math.sin((t - 0.33) / 0.34 * Math.PI) * 30;
        const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
        pts.push(new V3(X(px) - Math.sin(ang) * z, y, Z(py) + Math.cos(ang) * z));
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cable));
    }
    const his = G.roads.find(r => r.n === 'Hisingsbron').p, ha = Math.atan2(his[1][1] - his[0][1], his[1][0] - his[0][0]);
    for (const t of [0.42, 0.58]) {
      const g = grp(his[0][0] + (his[1][0] - his[0][0]) * t, his[0][1] + (his[1][1] - his[0][1]) * t, ha);
      for (const z of [-4.4, 4.4]) mesh(Box(1.6, 16, 1.6), pyl, 0, 8, z, g);
      mesh(Box(1.6, 1.2, 10.4), pyl, 0, 15.4, 0, g);
    }
  }
  // Instanser uppdelade i rutor, så att bara det som syns ritas
  function tiled(items, parts) {
    const tiles = new Map(), m4 = new THREE.Matrix4();
    for (const it of items) { const k = Math.floor(it[0] / 70) + ',' + Math.floor(it[1] / 70); if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push(it); }
    for (const list of tiles.values()) {
      let cx = 0, cz = 0, r = 0;
      for (const it of list) { cx += it[0] / list.length; cz += it[1] / list.length; }
      for (const it of list) r = Math.max(r, Math.hypot(it[0] - cx, it[1] - cz));
      for (const pt of parts) {
        const g = pt.geo.clone(); g.boundingSphere = new THREE.Sphere(new V3(0, 3, 0), r + 5);
        const im = new THREE.InstancedMesh(g, pt.mat, list.length); im.position.set(cx, 0, cz);
        list.forEach((it, k) => { pt.set(m4, it[0] - cx, it[1] - cz, it[2] || 1); im.setMatrixAt(k, m4); });
        im.castShadow = !!pt.shadow; scene.add(im);
      }
    }
  }
  // Träd
  const crownMat = lam('#3f8f3a');
  tiled(trees, [
    { geo: new THREE.CylinderGeometry(0.2, 0.28, 1.8, 6), mat: lam('#7a5230'), shadow: true, set: (m, x, z) => m.makeTranslation(x, 0.9, z) },
    { geo: new THREE.IcosahedronGeometry(1.3, 0), mat: crownMat, shadow: true, set: (m, x, z, s) => m.makeScale(s, s, s).setPosition(x, 2.6 * s, z) }
  ]);
  // Gatlyktor (lyser på kvällen)
  const lampMat = new THREE.MeshBasicMaterial({ color: '#c9c9c0' });
  {
    const spots = [];
    for (const r of G.roads) {
      if (r.k === 'hw') continue;
      const pts = r.p;
      let side = 1;
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l;
        for (let t = 3; t < l; t += 7) {
          side = -side;
          const px = a[0] + (b[0] - a[0]) * t / l + nx * side * (r.w / 2 + 0.3), py = a[1] + (b[1] - a[1]) * t / l + ny * side * (r.w / 2 + 0.3);
          const c = at(Math.floor(px - PX0), Math.floor(py - PY0));
          if (WALK(c)) spots.push([X(px), Z(py)]);
        }
      }
    }
    tiled(spots, [
      { geo: new THREE.CylinderGeometry(0.07, 0.09, 3.6, 5), mat: lam('#3b3b3b'), set: (m, x, z) => m.makeTranslation(x, 1.8, z) },
      { geo: new THREE.SphereGeometry(0.28, 8, 6), mat: lampMat, set: (m, x, z) => m.makeTranslation(x, 3.65, z) }
    ]);
  }
  // Måsar över älven
  const gulls = [];
  for (let k = 0; k < 16; k++) {
    const g = new THREE.Group(), wm = lam('#f8f9fa');
    mesh(Box(0.3, 0.25, 0.8), wm, 0, 0, 0, g, false);
    const l = new THREE.Group(), r = new THREE.Group(); g.add(l, r);
    mesh(Box(1.1, 0.05, 0.4), wm, -0.55, 0, 0, l, false);
    mesh(Box(1.1, 0.05, 0.4), wm, 0.55, 0, 0, r, false);
    scene.add(g);
    const p = G.southBank[2 + Math.floor(rnd() * 14)];
    gulls.push({ g, l, r, cx: X(p[0]) - 10, cz: Z(p[1]) - 12, rad: 8 + rnd() * 14, a: rnd() * 6, sp: (0.3 + rnd() * 0.3) * (rnd() < 0.5 ? -1 : 1), y: 14 + rnd() * 8 });
  }

  // Skyltar
  function textCanvas(text, font, pad, bg) {
    const c = document.createElement('canvas'), g = c.getContext('2d');
    g.font = font; const tw = g.measureText(text).width;
    c.width = Math.ceil(tw + pad * 2); c.height = 96;
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (bg) { g.fillStyle = bg; const r = 30; g.beginPath(); g.moveTo(r, 4); g.arcTo(c.width - 2, 4, c.width - 2, 92, r); g.arcTo(c.width - 2, 92, 2, 92, r); g.arcTo(2, 92, 2, 4, r); g.arcTo(2, 4, c.width - 2, 4, r); g.fill(); }
    g.fillStyle = '#1b1b1b'; g.fillText(text, c.width / 2, 52);
    return c;
  }
  function label(text, x, y, z, s = 1) {
    const c = textCanvas(text, 'bold 52px system-ui, sans-serif', 28, 'rgba(255,255,255,.88)');
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
    sp.scale.set(c.width / c.height * 2.2 * s, 2.2 * s, 1); sp.position.set(x, y, z); scene.add(sp); return sp;
  }
  for (const [t, px, py, s] of G.labels) label(t, X(px), 14, Z(py), s);
  [['Läppstiftet', 634, 328, 47], ['Operan', 622, 342, 12], ['Barken Viking', 615, 325, 16], ['Feskekôrka', 584, 425, 12],
    ['Masthuggskyrkan', 515, 463, 31], ['Skansen Kronan', 582, 467, 14], ['Hagabullen', 586, 452, 12, 0.8], ['Hagakyrkan', 604, 457, 26],
    ['Domkyrkan', 620, 399, 25], ['Centralstationen', 664, 356, 16], ['Avenyn', 668, 437, 12], ['Götaplatsen', 691, 464, 4, 0.8],
    ['Konstmuseet', 697, 473, 15], ['Liseberg', 752, 476, 24, 1.4], ['Universeum', 712, 478, 14], ['Gothia Towers', 733, 445, 50],
    ['Ullevi', 722, 390, 14, 1.4], ['Gamla Ullevi', 692, 384, 9], ['Kuggen', 493, 376, 21], ['Eriksbergskranen', 372, 428, 38],
    ['Älvsborgsbron', 335, 481, 48, 1.3], ['Hisingsbron', 623, 301, 19], ['Kopparmärra', 641, 399.5, 6, 0.7], ['Trädgårdsföreningen', 678, 381, 8],
    ['Plikta', 512, 578, 6], ['Heden', 689, 415, 4], ['Stenpiren', 586, 400, 5, 0.8]
  ].forEach(([t, px, py, y, s]) => label(t, X(px), y, Z(py), s || 1));

  // Ikon ovanför figurer
  function iconSprite() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const tex = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.renderOrder = 20; sp.scale.set(1.6, 1.6, 1); sp.userData = { cv: c, tex, cur: null }; sp.visible = false; return sp;
  }
  function setIcon(sp, e) {
    if (sp.userData.cur === e) return;
    sp.userData.cur = e; sp.visible = !!e; if (!e) return;
    const g = sp.userData.cv.getContext('2d'); g.clearRect(0, 0, 128, 128);
    g.font = '96px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(e, 64, 70); sp.userData.tex.needsUpdate = true;
  }

  // ---------- Figurer ----------
  const geo = {
    leg: Box(0.2, 0.62, 0.22), shoe: Box(0.22, 0.12, 0.32), body: Box(0.56, 0.62, 0.32), arm: Box(0.14, 0.52, 0.14),
    hand: new THREE.SphereGeometry(0.09, 8, 6), head: new THREE.SphereGeometry(0.27, 16, 12),
    hair: new THREE.SphereGeometry(0.29, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), eye: new THREE.SphereGeometry(0.04, 6, 6),
    pack: Box(0.42, 0.46, 0.18)
  };
  // Randig tröja: två ränder på varje sida av kroppen och armarna
  const stripeCache = {};
  function stripeTex(base, stripe) {
    const k = base + stripe;
    if (!stripeCache[k]) {
      const c = cv(16, 16), g = c.getContext('2d');
      g.fillStyle = base; g.fillRect(0, 0, 16, 16);
      g.fillStyle = stripe; g.fillRect(0, 3, 16, 4); g.fillRect(0, 10, 16, 4);
      const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; stripeCache[k] = t;
    }
    return stripeCache[k];
  }
  function person(o) {
    const g = new THREE.Group(), mats = [];
    const M = c => { const m = lam(c); mats.push(m); return m; };
    const skin = M(o.skin), pants = M(o.pants), hair = M(o.hair), black = M('#222');
    const shirt = o.stripe ? (m => { mats.push(m); return m; })(new THREE.MeshLambertMaterial({ map: stripeTex(o.shirt, o.stripe) })) : M(o.shirt);
    const hipL = new THREE.Group(), hipR = new THREE.Group(), shL = new THREE.Group(), shR = new THREE.Group();
    hipL.position.set(-0.13, 0.68, 0); hipR.position.set(0.13, 0.68, 0);
    shL.position.set(-0.36, 1.22, 0); shR.position.set(0.36, 1.22, 0);
    g.add(hipL, hipR, shL, shR);
    for (const h of [hipL, hipR]) { mesh(geo.leg, pants, 0, -0.31, 0, h); mesh(geo.shoe, o.shoes ? M(o.shoes) : black, 0, -0.62, 0.05, h); }
    for (const s of [shL, shR]) { mesh(geo.arm, shirt, 0, -0.24, 0, s); mesh(geo.hand, skin, 0, -0.52, 0, s); }
    mesh(geo.body, shirt, 0, 0.98, 0, g);
    mesh(geo.head, skin, 0, 1.56, 0, g);
    mesh(geo.hair, hair, 0, 1.58, -0.02, g);
    mesh(geo.eye, black, -0.09, 1.6, 0.25, g); mesh(geo.eye, black, 0.09, 1.6, 0.25, g);
    if (o.pack) mesh(geo.pack, M(o.pack), 0, 1.0, -0.25, g);
    if (o.cap) {
      const cm = M(o.cap);
      mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.14, 16), cm, 0, 1.76, 0, g);
      mesh(Box(0.4, 0.04, 0.3), cm, 0, 1.71, o.capBack ? -0.26 : 0.26, g);
    }
    if (o.shades) mesh(Box(0.4, 0.08, 0.04), black, 0, 1.61, 0.26, g);
    if (o.chain) {
      const gold = M('#f5c518');
      mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 16), gold, 0, 1.2, 0.06, g).rotation.x = 1.15;
      mesh(Box(0.09, 0.11, 0.03), gold, 0, 1.04, 0.18, g);
    }
    if (o.teacher) {
      mesh(new THREE.SphereGeometry(0.14, 10, 8), hair, 0, 1.8, -0.18, g);
      mesh(Box(0.36, 0.06, 0.03), black, 0, 1.61, 0.27, g);
      mesh(Box(0.62, 0.42, 0.38), shirt, 0, 0.62, 0, g);
    }
    const icon = iconSprite(); icon.position.y = o.teacher ? 2.2 : 2.3; g.add(icon);
    g.userData = { hipL, hipR, shL, shR, mats, icon };
    scene.add(g);
    return g;
  }
  function animate(e, dt, moving, speedK) {
    const u = e.mesh.userData;
    if (moving) e.ph += dt * 9 * speedK; else e.ph *= 0.85;
    const a = moving ? Math.sin(e.ph) * 0.75 : Math.sin(e.ph) * 0.75 * 0.5;
    u.hipL.rotation.x = a; u.hipR.rotation.x = -a; u.shL.rotation.x = -a * 0.8; u.shR.rotation.x = a * 0.8;
  }
  const ent = (m, r = 0.42) => ({ mesh: m, x: 0, z: 0, y: 0, rot: 0, r, ph: 0, stun: 0, vx: 0, vz: 0 });
  // Gubbarna man kan välja mellan. Klasskompisarna i ledet är de andra gubbarna.
  const CHARS = [
    { n: 'John', hair: '#3b2414', skin: '#f1c7a4', shirt: '#2b8a3e', stripe: '#121212', pants: '#212529' },
    { n: 'Wille', hair: '#f1d16e', skin: '#f5d3b8', shirt: '#2f9e44', pants: '#1c7ed6' },
    { n: 'Albin', hair: '#f1d16e', skin: '#f1c7a4', shirt: '#fcc419', stripe: '#ffffff', pants: '#f1f3f5' },
    { n: 'Maxi', hair: '#111111', skin: '#f5d3b8', shirt: '#2b8a3e', stripe: '#111111', pants: '#111111' },
    { n: 'August', hair: '#a57149', skin: '#f1c7a4', shirt: '#1c7ed6', stripe: '#ffffff', pants: '#343a40' },
    { n: 'Loa', hair: '#5c3a21', skin: '#e0ac85', shirt: '#2b8a3e', stripe: '#111111', pants: '#1c3d6e' },
    { n: 'Ebbe', hair: '#a57149', skin: '#f1c7a4', shirt: '#e03131', stripe: '#1c4fa8', pants: '#343a40' },
    { n: 'Robin', hair: '#3b2414', skin: '#f5d3b8', shirt: '#2b8a3e', stripe: '#111111', pants: '#495057' },
    { n: 'Lily F', hair: '#9a7450', skin: '#f5d3b8', shirt: '#8d44c9', pants: '#1c3d6e' },
    { n: 'Edward', hair: '#7a4a24', skin: '#f1c7a4', shirt: '#2b8a3e', stripe: '#111111', pants: '#343a40' },
    { n: 'August T', hair: '#e9c46a', skin: '#f5d3b8', shirt: '#2b8a3e', stripe: '#111111', pants: '#343a40' },
    { n: 'Henry', hair: '#2b1d12', skin: '#f1c7a4', shirt: '#1971c2', pants: '#343a40' },
    { n: 'Albert', hair: '#a57149', skin: '#f5d3b8', shirt: '#2f9e44', stripe: '#fcc419', pants: '#343a40' },
    { n: 'Marcos', hair: '#2b1d12', skin: '#e0ac85', shirt: '#2b8a3e', stripe: '#111111', pants: '#212529' },
    { n: 'Isak', hair: '#2b1d12', skin: '#f1c7a4', shirt: '#161616', pants: '#111111', shoes: '#ffffff', cap: '#161616', capBack: true, shades: true, chain: true },
    { n: 'Philip', hair: '#f1d16e', skin: '#f5d3b8', shirt: '#f8f9fa', pants: '#8db4dc' }
  ];
  const teacher = ent(person({ teacher: true, skin: '#e8b996', shirt: '#7048e8', pants: '#3b2f63', hair: '#9a9a9a' }), 0.5);
  teacher.mesh.scale.setScalar(1.22);
  const PACKS = ['#fab005', '#4c6ef5', '#12b886', '#e03131'];
  let chosen = 0;
  try { const n = localStorage.getItem('smita-gubbe'); const k = CHARS.findIndex(c => c.n === n); if (k >= 0) chosen = k; } catch (e) { }
  const player = ent(person(Object.assign({ pack: '#e03131' }, CHARS[chosen])));
  const students = [0, 1, 2, 3, 4, 5, 6].map(k => ent(person(Object.assign({ pack: PACKS[k % 3] }, CHARS[(chosen + 1 + k) % CHARS.length]))));
  // Byt gubbe: spelaren blir den valda, klasskompisarna slumpas bland de andra
  function setCharacter(k) {
    chosen = k;
    try { localStorage.setItem('smita-gubbe', CHARS[k].n); } catch (e) { }
    scene.remove(player.mesh); player.mesh.remove(skate);
    player.mesh = person(Object.assign({ pack: '#e03131' }, CHARS[k])); player.mesh.add(skate);
    const others = CHARS.filter((c, i) => i !== k).sort(() => Math.random() - 0.5);
    students.forEach((st, i) => { scene.remove(st.mesh); st.mesh = person(Object.assign({ pack: PACKS[i % 3] }, others[i])); });
  }
  const youLabel = label('DU', 0, 0, 0, 0.55); youLabel.material.depthTest = false; youLabel.renderOrder = 21;
  // Lärarens paraply (när det regnar)
  const umbrella = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 5), lam('#222'), 0.32, 1.65, 0.1, umbrella);
  mesh(new THREE.ConeGeometry(0.95, 0.45, 10, 1, true), new THREE.MeshLambertMaterial({ color: '#2b2b2b', side: THREE.DoubleSide }), 0.32, 2.35, 0.1, umbrella);
  umbrella.visible = false; teacher.mesh.add(umbrella);

  // Lärarens synfält
  const cone = new THREE.Group();
  const coneMat = new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  {
    const R = 30, half = 0.9, seg = 20, pos = [0, 0, 0];
    for (let k = 0; k <= seg; k++) { const a = -half + 2 * half * k / seg; pos.push(Math.sin(a) * R, 0, Math.cos(a) * R); }
    const idxs = []; for (let k = 1; k <= seg; k++) idxs.push(0, k + 1, k);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idxs);
    const m = new THREE.Mesh(g, coneMat);
    m.position.y = 0.08; cone.add(m); cone.visible = false; scene.add(cone);
  }
  // Sparkcykel och moped (lärare), skateboard (elev)
  const scooter = new THREE.Group();
  mesh(Box(0.35, 0.08, 1.1), lam('#2b8a3e'), 0, 0.08, 0, scooter);
  mesh(Box(0.06, 1.1, 0.06), lam('#222'), 0, 0.6, 0.5, scooter);
  mesh(Box(0.5, 0.06, 0.06), lam('#222'), 0, 1.15, 0.5, scooter);
  scooter.visible = false; teacher.mesh.add(scooter);
  const moped = new THREE.Group();
  mesh(Box(0.5, 0.45, 1.3), lam('#e03131'), 0, 0.5, 0, moped);
  mesh(Box(0.42, 0.12, 0.6), lam('#222'), 0, 0.78, -0.25, moped);
  for (const z of [-0.6, 0.6]) mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 12), lam('#1b1b1b'), 0, 0.28, z, moped).rotation.z = Math.PI / 2;
  mesh(Box(0.07, 0.8, 0.07), lam('#adb5bd'), 0, 0.9, 0.6, moped);
  mesh(Box(0.7, 0.07, 0.07), lam('#adb5bd'), 0, 1.3, 0.6, moped);
  moped.visible = false; teacher.mesh.add(moped);
  const skate = new THREE.Group();
  mesh(Box(0.4, 0.06, 1.2), lam('#e8590c'), 0, 0.14, 0, skate);
  for (const z of [-0.4, 0.4]) mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 8), lam('#222'), 0, 0.07, z, skate).rotation.z = Math.PI / 2;
  skate.visible = false; player.mesh.add(skate);

  // ---------- Fordon som följer en rutt (spårvagnar och båtar) ----------
  function mkPath(pts) {
    const seg = []; let L = 0;
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l < 1e-6) continue;
      seg.push({ a, s0: L, ux: (b[0] - a[0]) / l, uz: (b[1] - a[1]) / l }); L += l;
    }
    return { seg, L };
  }
  function pathAt(p, s, o) {
    s = Math.max(0, Math.min(p.L, s));
    let g = p.seg[0];
    for (const q of p.seg) { if (s >= q.s0) g = q; else break; }
    const t = s - g.s0;
    o.x = g.a[0] + g.ux * t; o.z = g.a[1] + g.uz * t; o.ux = g.ux; o.uz = g.uz;
    return o;
  }
  const vehicles = [], trams = [], boats = [];
  function addVehicle(list, g, path, o) {
    const v = Object.assign({ g, path, s: 0, dir: 1, wait: 0, x: 0, z: 0, ux: 1, uz: 0, atEnd: false, bell: 0, limit: 10, pause: 2.5 }, o);
    v.s0 = v.s; v.dir0 = v.dir;
    list.push(v); vehicles.push(v); placeVehicle(v); scene.add(g);
    return v;
  }
  function placeVehicle(v) {
    pathAt(v.path, v.s, v);
    if (v.dir < 0) { v.ux = -v.ux; v.uz = -v.uz; }
    v.g.position.set(v.x, v.bob ? Math.sin(time * 1.3 + v.s) * 0.08 : 0, v.z);
    v.g.rotation.y = Math.atan2(-v.uz, v.ux);
  }
  function makeTram(color) {
    const g = new THREE.Group();
    mesh(Box(10, 2.4, 2.4), lam(color), 0, 1.5, 0, g);
    mesh(Box(10.05, 0.45, 2.45), lam('#f8f9fa'), 0, 0.75, 0, g);
    mesh(Box(9.2, 0.8, 2.46), lam('#1c2a3a'), 0, 2.1, 0, g);
    mesh(Box(9.6, 0.25, 2.2), lam('#ced4da'), 0, 2.82, 0, g);
    mesh(Box(1.6, 0.08, 0.08), lam('#222'), 0, 3.4, 0, g).rotation.z = 0.5;
    return g;
  }
  for (const t of G.trams) {
    const path = mkPath(W(t.p));
    for (const [s, dir] of [[0, 1], [path.L, -1]])
      addVehicle(trams, makeTram(t.c), path, { s, dir, speed: 8, len: 10, wid: 2.4, deck: 2.95, kind: 'tram', name: 'spårvagnen' });
  }
  // Segelfartyg längs södra kajen
  {
    const ship = new THREE.Group();
    mesh(Box(14, 2, 3.4), lam('#f8f9fa'), 0, 0.6, 0, ship);
    mesh(Box(14.2, 0.5, 3.5), lam('#1c3d6e'), 0, -0.2, 0, ship);
    for (const x of [-4, 0, 4]) {
      mesh(new THREE.CylinderGeometry(0.12, 0.15, 10, 6), lam('#7a5230'), x, 6, 0, ship);
      mesh(Box(0.15, 0.15, 4), lam('#7a5230'), x, 8, 0, ship);
      mesh(Box(0.1, 4, 1.2), lam('#fff9db'), x + 0.2, 5.5, 0, ship, false);
    }
    const route = offsetLine(G.southBank.slice(10, 18), 2.2);
    addVehicle(boats, ship, mkPath(W(route)), { speed: 3, len: 14, wid: 3.4, deck: 1.6, kind: 'boat', name: 'båten', bob: true, pause: 4 });
  }
  // Paddan-båtar i Vallgraven och Fattighusån
  {
    const route = W(G.moat.concat(G.fattighus.slice(1))), path = mkPath(route);
    for (const [s, dir] of [[0, 1], [path.L * 0.6, -1]]) {
      const g = new THREE.Group();
      mesh(Box(9, 0.8, 2.6), lam('#1c5aa6'), 0, 0.2, 0, g);
      mesh(Box(9.1, 0.2, 2.7), lam('#f8f9fa'), 0, 0.65, 0, g);
      for (let k = -3; k <= 3; k += 1.5) mesh(Box(0.3, 0.35, 2), lam('#c92a2a'), k, 0.9, 0, g);
      addVehicle(boats, g, path, { s, dir, speed: 3.5, len: 9, wid: 2.6, deck: 0.75, kind: 'boat', name: 'Paddan' });
    }
  }
  // Älvsnabben: färjan Stenpiren – Lindholmen – Eriksberg
  {
    const pts = W(DOCKS.map(d => [d.x, d.y]));
    const path = mkPath(pts), g = new THREE.Group();
    mesh(Box(11, 1.3, 3.6), lam('#f8f9fa'), 0, 0.4, 0, g);
    mesh(Box(11.1, 0.4, 3.7), lam('#1971c2'), 0, -0.1, 0, g);
    mesh(Box(4.5, 1.6, 2.8), lam('#e9ecef'), -1, 1.85, 0, g);
    mesh(Box(4.6, 0.5, 2.9), lam('#1c2a3a'), -1, 2.2, 0, g);
    mesh(Box(0.5, 1.4, 0.5), lam('#fab005'), 1.6, 2.4, 0, g);
    const v = addVehicle(boats, g, path, { speed: 5.5, len: 11, wid: 3.6, deck: 1.05, kind: 'ferry', name: 'Älvsnabben', limit: Infinity, pause: 4, bob: true });
    v.stops = [path.seg[1].s0];
  }

  // Bilar man kan köra
  const cars = [];
  {
    const COLS = ['#e03131', '#1971c2', '#f8f9fa', '#2b8a3e', '#fab005', '#343a40', '#ae3ec9', '#f76707'];
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 10), tire = lam('#1b1b1b'), glass = lam('#2b3a4a'), light = lam('#fff3bf');
    const roadList = G.roads.filter(r => r.k === 'major' || r.k === 'street');
    const tramPaths = G.trams.map(t => t.p);
    for (let tries = 0; tries < 4000 && cars.length < 26; tries++) {
      const r = pick(roadList), k = Math.floor(rnd() * (r.p.length - 1)), a = r.p[k], b = r.p[k + 1];
      const t = rnd(), l = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / l, uy = (b[1] - a[1]) / l, side = rnd() < 0.5 ? -1 : 1;
      const px = a[0] + (b[0] - a[0]) * t - uy * side * (r.w / 2 - 0.9), py = a[1] + (b[1] - a[1]) * t + ux * side * (r.w / 2 - 0.9);
      if (tramPaths.some(p => closestOn(p, px, py).d < 2.6)) continue;
      const x = X(px), z = Z(py);
      let ok = true;
      for (const d of [-1.8, 0, 1.8]) if (!WALK(at(cellI(x + ux * d), cellJ(z + uy * d)))) ok = false;
      if (!ok || cars.some(c => Math.hypot(c.x0 - x, c.z0 - z) < 14)) continue;
      const g = new THREE.Group(), col = lam(COLS[cars.length % COLS.length]);
      mesh(Box(1.8, 0.7, 3.6), col, 0, 0.65, 0, g);
      mesh(Box(1.6, 0.6, 1.9), glass, 0, 1.3, -0.2, g);
      mesh(Box(1.62, 0.12, 1.7), col, 0, 1.62, -0.2, g);
      for (const [wxo, wzo] of [[-0.9, -1.2], [0.9, -1.2], [-0.9, 1.2], [0.9, 1.2]]) mesh(wheelGeo, tire, wxo, 0.35, wzo, g).rotation.z = Math.PI / 2;
      for (const lx of [-0.6, 0.6]) mesh(Box(0.4, 0.2, 0.1), light, lx, 0.75, 1.81, g);
      const h = Math.atan2(ux, uy) + (rnd() < 0.5 ? Math.PI : 0);
      scene.add(g);
      cars.push({ g, x, z, h, spd: 0, cool: 0, x0: x, z0: z, h0: h });
    }
  }

  // ---------- Vägsökning ----------
  const dist = new Int32Array(GW * GH), Q = new Int32Array(GW * GH);
  function flood(pc) {
    dist.fill(-1); let h = 0, t = 0; dist[pc] = 0; Q[t++] = pc;
    while (h < t) {
      const c = Q[h++], i = c % GW, j = (c / GW) | 0, d = dist[c] + 1;
      if (i > 0 && dist[c - 1] < 0 && WALK(grid[c - 1])) { dist[c - 1] = d; Q[t++] = c - 1; }
      if (i < GW - 1 && dist[c + 1] < 0 && WALK(grid[c + 1])) { dist[c + 1] = d; Q[t++] = c + 1; }
      if (j > 0 && dist[c - GW] < 0 && WALK(grid[c - GW])) { dist[c - GW] = d; Q[t++] = c - GW; }
      if (j < GH - 1 && dist[c + GW] < 0 && WALK(grid[c + GW])) { dist[c + GW] = d; Q[t++] = c + GW; }
    }
  }
  const cellIdxOf = (x, z) => { const i = cellI(x), j = cellJ(z); return inMap(i, j) ? idx(i, j) : -1; };
  const freeAt = (x, z) => WALK(at(cellI(x), cellJ(z)));
  const free = (x, z, r) => freeAt(x - r, z - r) && freeAt(x + r, z - r) && freeAt(x - r, z + r) && freeAt(x + r, z + r);

  // Linjen uppför Avenyn
  const LA = [X(G.line.from[0]), Z(G.line.from[1])], LB = [X(G.line.to[0]), Z(G.line.to[1])];
  const LLEN = Math.hypot(LB[0] - LA[0], LB[1] - LA[1]), LD = [(LB[0] - LA[0]) / LLEN, (LB[1] - LA[1]) / LLEN];
  const WALK_ROT = Math.atan2(LD[0], LD[1]);
  const linePos = s => [LA[0] + LD[0] * s, LA[1] + LD[1] * s];

  // Vilka celler går att nå från Avenyn? (för kanelbullar och vattenpölar)
  const reach = new Uint8Array(GW * GH);
  {
    flood(cellIdxOf(LA[0], LA[1]));
    for (let k = 0; k < reach.length; k++) reach[k] = dist[k] >= 0 ? 1 : 0;
  }
  function randomSpot(types, tries = 400) {
    for (let k = 0; k < tries; k++) {
      const i = Math.floor(Math.random() * GW), j = Math.floor(Math.random() * GH), c = idx(i, j);
      if (reach[c] && types.includes(grid[c]) && WALK(at(i + 1, j)) && WALK(at(i - 1, j)) && WALK(at(i, j + 1)) && WALK(at(i, j - 1))) return [cellX(i), cellZ(j)];
    }
    return [LA[0], LA[1]];
  }

  // Bananer, ballonger, moln, kanelbullar, vattenpölar
  const bananaGeo = new THREE.TorusGeometry(0.32, 0.09, 6, 12, Math.PI), bananaMat = lam('#ffd43b');
  const balloonGeo = new THREE.SphereGeometry(0.3, 12, 10), balloonMat = lam('#4dabf7');
  const cloudMat = new THREE.MeshBasicMaterial({ color: '#94d82d', transparent: true, opacity: 0.5, depthWrite: false });
  let bananas = [], balloons = [], clouds = [];
  const bunGeo = new THREE.TorusGeometry(0.3, 0.16, 8, 14), bunMat = lam('#c68a46');
  const buns = [];
  const placeBun = b => { [b.x, b.z] = randomSpot([ST, PARK, PLAZA, COBBLE, ROAD]); b.m.position.set(b.x, 0.7, b.z); };
  for (let k = 0; k < 120; k++) {
    const m = mesh(bunGeo, bunMat, 0, 0, 0); m.rotation.x = Math.PI / 2;
    const b = { m, x: 0, z: 0 }; placeBun(b); buns.push(b);
  }
  const puddles = [];
  {
    const pg = new THREE.CircleGeometry(1, 16), pm = new THREE.MeshLambertMaterial({ color: '#4e6478', transparent: true, opacity: 0.6, depthWrite: false });
    for (let k = 0; k < 90; k++) {
      const [x, z] = randomSpot([ST, ROAD, PLAZA, COBBLE]), m = new THREE.Mesh(pg, pm);
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.03, z); m.scale.set(0.8 + Math.random(), 0.6 + Math.random() * 0.6, 1);
      m.visible = false; scene.add(m); puddles.push({ m, x, z, cool: 0 });
    }
  }

  // ---------- Väder ----------
  const RAIN_MAX = 2400, rainPos = new Float32Array(RAIN_MAX * 6), drops = [];
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#c8d6e5', transparent: true, opacity: 0.5 }));
  rain.frustumCulled = false; rain.visible = false; scene.add(rain);
  const SNOW_MAX = 1600, snowPos = new Float32Array(SNOW_MAX * 3);
  const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const flakeCv = cv(32, 32);
  { const g = flakeCv.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); }
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ size: 0.45, map: new THREE.CanvasTexture(flakeCv), transparent: true, depthWrite: false }));
  snow.frustumCulled = false; snow.visible = false; scene.add(snow);
  // Snötäcke på marken (inte på vattnet)
  const snowCover = (() => {
    const c = cv(GW, GH), g = c.getContext('2d'), img = g.createImageData(GW, GH);
    for (let k = 0; k < grid.length; k++) {
      const t = grid[k]; if (t === WATER) continue;
      const a = t === ROAD || t === BRIDGE ? 110 : 210;
      img.data[k * 4] = img.data[k * 4 + 1] = img.data[k * 4 + 2] = 255; img.data[k * 4 + 3] = a - Math.random() * 40;
    }
    g.putImageData(img, 0, 0);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(GW * S, GH * S), new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set((MINX + MAXX) / 2, 0.02, (MINZ + MAXZ) / 2); m.receiveShadow = true; m.visible = false; scene.add(m);
    return m;
  })();
  const WXLOOK = {
    clear: { sky: '#a8d8f0', fn: 70, ff: 165, hemi: 0.75, sun: 0.75 },
    partly: { sky: '#b4d4e8', fn: 65, ff: 160, hemi: 0.8, sun: 0.6 },
    cloudy: { sky: '#aab4bf', fn: 55, ff: 150, hemi: 0.95, sun: 0.3 },
    fog: { sky: '#c5cbd0', fn: 6, ff: 55, hemi: 0.95, sun: 0.15 },
    drizzle: { sky: '#9ea9b4', fn: 50, ff: 140, hemi: 0.9, sun: 0.22 },
    rain: { sky: '#8b96a2', fn: 40, ff: 125, hemi: 0.85, sun: 0.18 },
    heavy: { sky: '#76818d', fn: 28, ff: 100, hemi: 0.8, sun: 0.12 },
    snow: { sky: '#d3dbe3', fn: 30, ff: 115, hemi: 1.0, sun: 0.22 },
    storm: { sky: '#5c6670', fn: 30, ff: 110, hemi: 0.7, sun: 0.1 }
  };
  const wx = { kind: 'cloudy', sight: 1, rainN: 0, rainLen: 1, rainV: 25, snowN: 0, windX: 0, windZ: 0, flash: 0, nextFlash: 8, hemi: 0.95, slippery: false, wet: false };
  function applyWeather() {
    const info = Weather.info, d = Weather.describe(), L = WXLOOK[info.kind], night = !info.day;
    wx.kind = info.kind; wx.sight = d.sight;
    const sky = new THREE.Color(L.sky);
    if (night) sky.lerp(new THREE.Color('#0b1424'), 0.85);
    else if (info.dusk > 0) sky.lerp(new THREE.Color('#f4a26b'), info.dusk * 0.45);
    scene.background = sky; scene.fog.color = sky;
    scene.fog.near = L.fn * (night ? 0.7 : 1); scene.fog.far = L.ff * (night ? 0.8 : 1);
    camera.far = scene.fog.far + 15; camera.updateProjectionMatrix();
    wx.hemi = night ? L.hemi * 0.3 + 0.08 : L.hemi; hemi.intensity = wx.hemi;
    sun.intensity = night ? 0.18 : L.sun * (1 - info.dusk * 0.4);
    sun.color.set(night ? '#9fb4ff' : info.dusk > 0 ? '#ffb36b' : '#fff4e0');
    hemi.color.set(night ? '#7d8fc9' : '#e6f4ff');
    bMat.emissive.setScalar(night ? 1 : info.dusk * 0.6);
    lampMat.color.set(night || info.dusk > 0.5 ? '#fff2b8' : '#c9c9c0');
    coneMat.color.set(night ? '#fff7d0' : '#ffe066'); coneMat.opacity = night ? 0.38 : 0.28;
    const wet = ['drizzle', 'rain', 'heavy', 'storm'].includes(info.kind);
    wx.wet = wet; wx.slippery = info.kind === 'snow';
    groundMat.color.set(wet ? '#b6bdc6' : '#ffffff');
    for (const p of puddles) p.m.visible = wet;
    umbrella.visible = wet;
    snowCover.visible = wx.slippery; snow.visible = wx.slippery; seeU.uSnow.value = wx.slippery ? 1 : 0;
    crownMat.color.set(wx.slippery ? '#b9cfc0' : night ? '#2f6a2c' : '#3f8f3a');
    wx.rainN = { drizzle: 600, rain: 1400, heavy: 2400, storm: 2400 }[info.kind] || 0;
    wx.rainLen = info.kind === 'drizzle' ? 0.5 : 1.1; wx.rainV = info.kind === 'drizzle' ? 14 : 26;
    wx.snowN = wx.slippery ? SNOW_MAX : 0;
    const wa = (info.windDir + 180) * Math.PI / 180, ws = Math.min(info.wind, 18) * 0.5; // vinden blåser mot detta håll
    wx.windX = Math.sin(wa) * ws; wx.windZ = -Math.cos(wa) * ws;
    rain.visible = wx.rainN > 0;
    Snd.setAmb({ city: night ? 0.35 : 0.6, rain: { drizzle: 0.35, rain: 0.7, heavy: 1, storm: 1 }[info.kind] || 0, wind: Math.min(1, 0.08 + info.wind / 14) });
    $('wx').textContent = d.short;
    $('wxmenu').innerHTML = 'Vädret i Göteborg ' + (info.live ? 'just nu' : '(gissat)') + ': <b>' + d.emoji + ' ' + d.name +
      (info.temp === null ? '' : ', ' + Math.round(info.temp) + ' °C') + (night ? ', kväll' : '') + '</b><br>' + d.tip + (night ? ' Det är mörkt, så läraren ser sämre.' : '');
  }
  function updateWeather(dt) {
    const cx = camTarget.x, cz = camTarget.z - 8;
    if (wx.rainN > 0) {
      while (drops.length < wx.rainN) drops.push({ x: cx + (Math.random() - 0.5) * 90, y: Math.random() * 30, z: cz + (Math.random() - 0.5) * 80 });
      const n = Math.min(drops.length, wx.rainN), lx = wx.windX * 0.04, lz = wx.windZ * 0.04;
      for (let k = 0; k < n; k++) {
        const d = drops[k];
        d.y -= wx.rainV * dt; d.x += wx.windX * dt; d.z += wx.windZ * dt;
        if (d.y < 0 || Math.abs(d.x - cx) > 45 || Math.abs(d.z - cz) > 40) { d.x = cx + (Math.random() - 0.5) * 90; d.z = cz + (Math.random() - 0.5) * 80; d.y = 26 + Math.random() * 6; }
        const o = k * 6;
        rainPos[o] = d.x; rainPos[o + 1] = d.y; rainPos[o + 2] = d.z;
        rainPos[o + 3] = d.x - lx * wx.rainLen; rainPos[o + 4] = d.y + wx.rainLen; rainPos[o + 5] = d.z - lz * wx.rainLen;
      }
      rainGeo.setDrawRange(0, n * 2); rainGeo.attributes.position.needsUpdate = true;
    }
    if (wx.snowN > 0) {
      for (let k = 0; k < wx.snowN; k++) {
        const o = k * 3;
        if (snowPos[o + 1] <= 0 || Math.abs(snowPos[o] - cx) > 45 || Math.abs(snowPos[o + 2] - cz) > 40) {
          snowPos[o] = cx + (Math.random() - 0.5) * 90; snowPos[o + 2] = cz + (Math.random() - 0.5) * 80;
          snowPos[o + 1] = snowPos[o + 1] <= 0 && time > 1 ? 24 + Math.random() * 4 : Math.random() * 28;
        }
        snowPos[o + 1] -= 2.4 * dt;
        snowPos[o] += (wx.windX * 0.5 + Math.sin(time * 1.3 + k) * 0.6) * dt; snowPos[o + 2] += wx.windZ * 0.5 * dt;
      }
      snowGeo.attributes.position.needsUpdate = true;
    }
    if (wx.kind === 'storm') {
      wx.nextFlash -= dt;
      if (wx.nextFlash <= 0) { wx.flash = 0.35; wx.nextFlash = 7 + Math.random() * 12; setTimeout(() => Snd.thunder(), 400 + Math.random() * 1600); }
      if (wx.flash > 0) { wx.flash -= dt; hemi.intensity = wx.hemi + ((wx.flash > 0.25 || (wx.flash < 0.15 && wx.flash > 0.08)) ? 2 : 0); }
      else hemi.intensity = wx.hemi;
    }
  }

  // ---------- HUD ----------
  const $ = id => document.getElementById(id);
  const msgEl = $('msg'); let msgQ = [], msgT = 0;
  function say(text, dur = 2.2) { msgQ.push([text, dur]); }
  function updMsg(dt) {
    msgT -= dt;
    if (msgT <= 0) {
      if (msgQ.length) { const [t, d] = msgQ.shift(); msgEl.textContent = t; msgEl.classList.add('show'); msgT = d; }
      else msgEl.classList.remove('show');
    }
  }
  let best = 0; try { best = +localStorage.getItem('smita-best') || 0; } catch (e) { }
  $('best').textContent = best;
  // Minikarta: en förrenderad karta med två pixlar per cell
  const MK = 2, miniBg = cv(GW * MK, GH * MK);
  {
    const g = miniBg.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(groundCv, 0, 0, GW * MK, GH * MK);
    g.setTransform(MK, 0, 0, MK, -PX0 * MK, -PY0 * MK);
    g.fillStyle = '#3d3d42';
    for (const h of houses) rotRect(g, h.px, h.py, h.pw, h.pd, h.a);
    for (const f of FOOT) { g.fillStyle = '#c92a2a'; shape(g, f); }
  }
  const miniCv = $('mini'), mini = miniCv.getContext('2d'), MINI = 130, MR = 65; // MR = kartpixlar från mitten
  function dot(g, x, y, r, fill) { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke(); }
  function drawMini() {
    const ppx = PXof(player.x), ppy = PYof(player.z), sc = MINI / (MR * 2);
    mini.fillStyle = '#55604f'; mini.fillRect(0, 0, MINI, MINI);
    let sx = (ppx - MR - PX0) * MK, sy = (ppy - MR - PY0) * MK, sw = MR * 2 * MK, sh = MR * 2 * MK, dx = 0, dy = 0, dw = MINI, dh = MINI;
    const k = MINI / sw;
    if (sx < 0) { dx -= sx * k; dw += sx * k; sw += sx; sx = 0; }
    if (sy < 0) { dy -= sy * k; dh += sy * k; sh += sy; sy = 0; }
    if (sx + sw > miniBg.width) { const o = sx + sw - miniBg.width; sw -= o; dw -= o * k; }
    if (sy + sh > miniBg.height) { const o = sy + sh - miniBg.height; sh -= o; dh -= o * k; }
    if (sw > 0 && sh > 0) mini.drawImage(miniBg, sx, sy, sw, sh, dx, dy, dw, dh);
    mini.strokeStyle = '#000'; mini.lineWidth = 1.5;
    let tx = (PXof(teacher.x) - ppx) * sc + MINI / 2, ty = (PYof(teacher.z) - ppy) * sc + MINI / 2;
    tx = Math.max(5, Math.min(MINI - 5, tx)); ty = Math.max(5, Math.min(MINI - 5, ty));
    dot(mini, tx, ty, 4.5, '#7048e8');
    if (fp) {
      const yaw = player.car ? player.car.h : fpYaw;
      mini.strokeStyle = '#ffd43b'; mini.lineWidth = 3; mini.beginPath(); mini.moveTo(MINI / 2, MINI / 2);
      mini.lineTo(MINI / 2 + Math.sin(yaw) * 16, MINI / 2 + Math.cos(yaw) * 16); mini.stroke();
      mini.strokeStyle = '#000'; mini.lineWidth = 1.5;
    }
    dot(mini, MINI / 2, MINI / 2, 5, '#ffd43b');
  }
  // Stor karta (tryck på minikartan)
  let paused = false;
  function showBigMap() {
    paused = true;
    const c = $('bigcv'), maxW = Math.min(window.innerWidth * 0.94, 900), maxH = window.innerHeight * 0.8, sc = Math.min(maxW / GW, maxH / GH);
    c.width = Math.round(GW * sc); c.height = Math.round(GH * sc);
    const g = c.getContext('2d');
    g.drawImage(miniBg, 0, 0, c.width, c.height);
    g.font = 'bold 12px system-ui, sans-serif'; g.textAlign = 'center'; g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.85)'; g.fillStyle = '#1b1b1b';
    for (const [t, px, py] of G.labels) { g.strokeText(t, (px - PX0) * sc, (py - PY0) * sc); g.fillText(t, (px - PX0) * sc, (py - PY0) * sc); }
    g.strokeStyle = '#000'; g.lineWidth = 2;
    if (state === 'free') dot(g, (PXof(teacher.x) - PX0) * sc, (PYof(teacher.z) - PY0) * sc, 6, '#7048e8');
    dot(g, (PXof(player.x) - PX0) * sc, (PYof(player.z) - PY0) * sc, 7, '#ffd43b');
    $('bigmap').classList.remove('hidden');
  }
  miniCv.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (state === 'line' || state === 'free') showBigMap(); });
  $('bigmap').addEventListener('pointerdown', e => { e.preventDefault(); $('bigmap').classList.add('hidden'); paused = false; last = performance.now(); });
  const muteBtn = $('mutebtn');
  const viewBtn = $('viewbtn');
  const updView = () => { viewBtn.textContent = fp ? '🎥' : '👀'; viewBtn.setAttribute('aria-label', fp ? 'Byt till vy ovanifrån' : 'Byt till förstapersonsvy'); };
  function toggleView() {
    fp = !fp; if (fp) fpYaw = player.car ? player.car.h : player.rot;
    try { localStorage.setItem('smita-fp', fp ? '1' : '0'); } catch (e) { }
    updView();
  }
  updView();
  viewBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); toggleView(); });
  const updMute = () => { muteBtn.textContent = Snd.isMuted() ? '🔇' : '🔊'; };
  updMute();
  muteBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Snd.init(); Snd.setMuted(!Snd.isMuted()); updMute(); });

  // ---------- Grejer ----------
  const PITEMS = [
    { id: 'banan', e: '🍌', n: 'Bananskal' }, { id: 'godis', e: '🍬', n: 'Godis-turbo' },
    { id: 'keps', e: '🧢', n: 'Osynlighetskeps' }, { id: 'ballong', e: '🎈', n: 'Vattenballong' },
    { id: 'skate', e: '🛹', n: 'Skateboard' }, { id: 'prutt', e: '💨', n: 'Pruttkudde' }];
  const TITEMS = [{ id: 'megafon', e: '📣', n: 'Megafon' }, { id: 'kaffe', e: '☕', n: 'Kaffe' }, { id: 'scooter', e: '🛴', n: 'Elsparkcykel' }, { id: 'telefon', e: '📱', n: 'Telefon' }];
  let inv = [], bunCount = 0;
  function updItemUI() {
    const b = $('itembtn'), badge = $('badge');
    if (!inv.length) { b.firstChild.textContent = '–'; b.classList.add('empty'); $('itemname').textContent = 'Ingen grej än'; badge.style.display = 'none'; return; }
    b.firstChild.textContent = inv[0].e; b.classList.remove('empty'); $('itemname').textContent = inv[0].n;
    badge.style.display = inv.length > 1 ? 'flex' : 'none'; badge.textContent = inv.length;
  }
  function setPlayerAlpha(a) { for (const m of player.mesh.userData.mats) { m.transparent = a < 1; m.opacity = a; } }
  function useItem() {
    if (state !== 'free' || paused || !inv.length || player.stun > 0 || player.phone > 0) return;
    const it = inv.shift(); updItemUI();
    const d = Math.hypot(teacher.x - player.x, teacher.z - player.z);
    if (it.id === 'banan') {
      const m = mesh(bananaGeo, bananaMat, player.x - Math.sin(player.rot) * 1.3, 0.12, player.z - Math.cos(player.rot) * 1.3);
      m.rotation.x = -Math.PI / 2; bananas.push({ m, life: 25 }); say('Bananskal på marken! 🍌', 1.5); Snd.item();
    } else if (it.id === 'godis') {
      player.boost = 4; say('Godis-turbo! Spring! 🍬', 1.5); Snd.item(); Snd.swoosh();
    } else if (it.id === 'keps') {
      player.invis = 5; setPlayerAlpha(0.3); teacher.state = 'confused'; say('Du är osynlig i 5 sekunder! 🧢', 1.8); Snd.item();
    } else if (it.id === 'ballong') {
      const m = mesh(balloonGeo, balloonMat, player.x, 1.5, player.z);
      balloons.push({ m, sx: player.x, sz: player.z, t: 0, hit: d < 16, mx: player.x + Math.sin(player.rot) * 8, mz: player.z + Math.cos(player.rot) * 8 });
      Snd.swoosh();
    } else if (it.id === 'skate') {
      player.skate = 5; say('Skateboard! Full fart! 🛹', 1.5); Snd.item();
    } else if (it.id === 'prutt') {
      const m = mesh(new THREE.SphereGeometry(1, 12, 10), cloudMat.clone(), player.x, 1, player.z, null, false);
      clouds.push({ m, t: 0 }); Snd.fart();
      if (d < 12) { teacher.stun = 2.8; say('Pruttkudden! Läraren håller för näsan! 💨', 1.8); }
      else say('Pruttkudden! Men läraren var för långt bort 💨', 1.6);
    }
  }
  function giveItems() {
    const p = PITEMS[Math.floor(Math.random() * PITEMS.length)];
    if (inv.length < 3) { inv.push(p); updItemUI(); say('Du fick ' + p.e + ' ' + p.n + '!', 1.6); Snd.item(); }
    const t = TITEMS[Math.floor(Math.random() * TITEMS.length)];
    setTimeout(() => {
      if (state !== 'free') return;
      if (t.id === 'megafon') { player.slow = 2; say('Läraren fick 📣 Megafon: "STANNA!" Du blir långsam!', 2); Snd.whistle(); }
      else if (t.id === 'kaffe') { teacher.coffee = 5; say('Läraren drack ☕ Kaffe och blev snabbare!', 2); Snd.bad(); }
      else if (t.id === 'scooter') { teacher.scoot = 4; say('Läraren hoppade på en 🛴 Elsparkcykel!', 2); Snd.bad(); }
      else { player.phone = 1.3; say('Läraren ringde din mamma! 📱 Du måste svara!', 2); Snd.phone(); }
    }, 1700);
  }

  // ---------- Åka spårvagn, båt och färja ----------
  function local(e, v) { const dx = e.x - v.x, dz = e.z - v.z; return [dx * v.ux + dz * v.uz, -dx * v.uz + dz * v.ux]; }
  const distToVehicle = (e, v) => { const [lx, lz] = local(e, v); return Math.hypot(Math.max(0, Math.abs(lx) - v.len / 2), Math.max(0, Math.abs(lz) - v.wid / 2)); };
  const inTram = (x, z, r) => trams.some(t => { const [lx, lz] = local({ x, z }, t); return Math.abs(lx) < t.len / 2 + r && Math.abs(lz) < t.wid / 2 + r; });
  function nearestVehicle() {
    let bestV = null, bestD = 2.4;
    for (const v of vehicles) { const d = distToVehicle(player, v) - (v.kind === 'tram' ? 0 : 0.8); if (d < bestD) { bestD = d; bestV = v; } }
    return bestV;
  }
  const rideX = (e, v) => v.x + v.ux * e.rox - v.uz * e.roz, rideZ = (e, v) => v.z + v.uz * e.rox + v.ux * e.roz;
  function board(e, v) {
    const [lx] = local(e, v);
    e.rox = Math.max(-v.len / 2 + 0.6, Math.min(v.len / 2 - 0.6, lx)); e.roz = 0;
    e.rideT = 0;
    e.hop = { t: 0, sx: e.x, sy: e.y, sz: e.z, ride: v };
  }
  function updateHop(e, dt) {
    const h = e.hop; h.t += dt;
    const p = Math.min(1, h.t / 0.4), v = h.ride;
    const ex = v ? rideX(e, v) : h.ex, ez = v ? rideZ(e, v) : h.ez, ey = v ? v.deck : 0;
    e.x = h.sx + (ex - h.sx) * p; e.z = h.sz + (ez - h.sz) * p;
    e.y = h.sy + (ey - h.sy) * p + Math.sin(p * Math.PI) * 1.6;
    if (p >= 1) { e.hop = null; e.ride = v; e.y = ey; if (!v) Snd.step('stone'); }
    animate(e, dt, false, 1);
  }
  // Hoppar av åt sidan, till närmaste lediga plats
  function jumpOff(e, msg) {
    const v = e.ride, sx = -v.uz, sz = v.ux;
    let spot = null;
    search: for (const d of [v.wid / 2 + 1.2, v.wid / 2 + 2.6, v.wid / 2 + 4.2]) for (const a of [0, -2, 2, -4, 4, -6, 6]) for (const sg of [1, -1]) {
      const al = e.rox + a, x = v.x + v.ux * al + sx * sg * d, z = v.z + v.uz * al + sz * sg * d;
      if (free(x, z, 0.5) && !inTram(x, z, 0.5)) { spot = [x, z]; break search; }
    }
    if (!spot) { if (e === player && !msg) say('Kan inte hoppa av här!', 1); return false; }
    e.ride = null;
    e.hop = { t: 0, sx: e.x, sy: e.y, sz: e.z, ride: null, ex: spot[0], ez: spot[1] };
    if (msg) say(msg, 1.6);
    Snd.boing();
    return true;
  }
  function nearestCar() {
    let bestC = null, bestD = 2.8;
    for (const c of cars) { const d = Math.hypot(c.x - player.x, c.z - player.z); if (c.cool <= 0 && d < bestD) { bestD = d; bestC = c; } }
    return bestC;
  }
  function enterCar(c) {
    player.car = c; player.driveT = 0; c.spd = 0; player.mesh.visible = false;
    say('Brum brum! Du kör bil i 10 sekunder 🚗', 1.6); Snd.engineStart();
    if (state === 'free') say('Läraren hoppade på en moped! 🛵', 1.6);
  }
  function exitCar(msg) {
    const c = player.car, rx = Math.cos(c.h), rz = -Math.sin(c.h), fx = Math.sin(c.h), fz = Math.cos(c.h);
    for (const [a, b] of [[2, 0], [-2, 0], [3, 0], [-3, 0], [0, -3], [0, 3], [2, -2], [-2, -2]]) {
      const x = c.x + rx * a + fx * b, z = c.z + rz * a + fz * b;
      if (!free(x, z, 0.5)) continue;
      player.car = null; c.spd = 0; c.cool = 15; player.mesh.visible = true;
      player.x = x; player.z = z; player.vx = player.vz = 0;
      Snd.engine(-1);
      if (msg) say(msg, 1.6);
      return;
    }
    if (!msg) say('Kan inte kliva ur här!', 1);
  }
  function pushOutOfTram(e, t, r) {
    const [lx, lz] = local(e, t);
    if (Math.abs(lx) >= t.len / 2 + r || Math.abs(lz) >= t.wid / 2 + r) return false;
    for (const sg of [Math.sign(lz) || 1, -(Math.sign(lz) || 1)]) {
      const o = t.wid / 2 + 0.1 + r, x = t.x + t.ux * lx - t.uz * sg * o, z = t.z + t.uz * lx + t.ux * sg * o;
      if (free(x, z, Math.min(r, 0.5)) || sg !== (Math.sign(lz) || 1)) { e.x = x; e.z = z; break; }
    }
    return true;
  }
  function updateCar(dt, ix, iz, l) {
    const c = player.car;
    player.driveT += dt;
    if (l > 0.2 && player.phone <= 0) {
      let dd = Math.atan2(ix, iz) - c.h; while (dd > Math.PI) dd -= Math.PI * 2; while (dd < -Math.PI) dd += Math.PI * 2;
      c.h += Math.max(-3 * dt, Math.min(3 * dt, dd));
      c.spd = Math.min(c.spd + (wx.slippery ? 7 : 14) * dt, 13 * l * (player.slow > 0 ? 0.5 : 1));
    } else c.spd = Math.max(0, c.spd - (wx.slippery ? 6 : 18) * dt);
    const sx = Math.sin(c.h) * c.spd * dt, sz = Math.cos(c.h) * c.spd * dt;
    const okx = free(c.x + sx, c.z, 0.9), okz = free(c.x, c.z + sz, 0.9);
    if (okx) c.x += sx; if (okz) c.z += sz;
    if (!okx && !okz) c.spd *= 0.3;
    for (const t of trams) if (pushOutOfTram(c, t, 0.9)) {
      if (c.spd > 3) { say('Krock med spårvagnen! 🚋', 1.2); Snd.slip(); }
      c.spd = 0;
    }
    if (state === 'free' && teacher.stun <= 0 && c.spd > 4 && Math.hypot(c.x - teacher.x, c.z - teacher.z) < 1.9) {
      teacher.stun = 1.8; say('Läraren fick hoppa undan! 💨', 1.4); Snd.slip();
    }
    player.x = c.x; player.z = c.z; player.rot = c.h;
    c.g.position.set(c.x, 0, c.z); c.g.rotation.y = c.h;
    Snd.engine(c.spd);
    if (player.driveT > 10) exitCar('Bensinen tog slut! ⛽');
  }
  let rideLabel = null;
  function rideUI(text) {
    if (text === rideLabel) return;
    rideLabel = text; const b = $('ridebtn');
    b.textContent = text; b.classList.toggle('hidden', !text);
  }
  const rideIcon = v => v.kind === 'tram' ? '🚋' : v.kind === 'ferry' ? '⛴️' : '⛵';
  function toggleRide() {
    if ((state !== 'line' && state !== 'free') || paused || player.hop || player.stun > 0 || player.phone > 0) return;
    if (player.car) exitCar('');
    else if (player.ride) jumpOff(player, '');
    else {
      const v = nearestVehicle();
      if (v) {
        board(player, v); Snd.boing();
        say(v.kind === 'ferry' ? 'Du åker Älvsnabben! Färjan är gratis ⛴️' : 'Du hoppade på ' + v.name + '! ' + rideIcon(v), 1.6);
      } else { const c = nearestCar(); if (c) enterCar(c); }
    }
  }

  // ---------- Spelets tillstånd ----------
  const SLOT0 = 2.8, GAP = 1.5, PSLOT = 4;
  let state = 'menu', line, freeT = 0, itemT = 0, beatT = 0, gullT = 6;
  const slotPos = k => linePos(line.s - SLOT0 - k * GAP);
  const camTarget = new V3(), camOff = new V3(), tmpV = new V3();

  function reset() {
    line = { s: 0, ph: 'walk', t: 5 };
    [teacher.x, teacher.z] = linePos(0); teacher.rot = WALK_ROT; teacher.stun = 0; teacher.state = 'lead';
    teacher.coffee = 0; teacher.scoot = 0; teacher.lost = 0; scooter.visible = false;
    let k = 0;
    for (let s = 0; s < 8; s++) {
      const e = s === PSLOT ? player : students[k++];
      [e.x, e.z] = slotPos(s); e.rot = WALK_ROT; e.stun = 0; e.mesh.position.y = 0;
    }
    player.boost = player.slow = player.invis = player.skate = player.phone = 0; player.vx = player.vz = 0; setPlayerAlpha(1);
    inv = []; bunCount = 0; updItemUI(); $('buns').textContent = 0;
    for (const b of bananas) scene.remove(b.m); for (const b of balloons) scene.remove(b.m); for (const c of clouds) scene.remove(c.m);
    bananas = []; balloons = []; clouds = [];
    freeT = 0; itemT = 0; msgQ = []; msgT = 0; cone.visible = false;
    for (const v of vehicles) { v.s = v.s0; v.dir = v.dir0; v.wait = 0; v.atEnd = false; placeVehicle(v); }
    player.ride = null; player.hop = null; player.car = null; player.y = 0; player.mesh.visible = true; rideUI('');
    for (const c of cars) { c.x = c.x0; c.z = c.z0; c.h = c.h0; c.spd = 0; c.cool = 0; c.g.position.set(c.x, 0, c.z); c.g.rotation.y = c.h; }
    setIcon(teacher.mesh.userData.icon, null);
    $('time').textContent = 0; $('itemwrap').classList.add('hidden');
    camTarget.set(player.x, 0, player.z);
    fpYaw = WALK_ROT;
    Snd.engine(-1);
  }

  function canSeeCone(maxD, half) {
    if (player.invis > 0) return false;
    const dx = player.x - teacher.x, dz = player.z - teacher.z, d = Math.hypot(dx, dz);
    if (d > maxD * wx.sight) return false;
    if ((Math.sin(teacher.rot) * dx + Math.cos(teacher.rot) * dz) / (d || 1) < Math.cos(half)) return false;
    return sightLOS(teacher, player);
  }
  function sightLOS(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, n = Math.ceil(Math.hypot(dx, dz) / 0.7);
    for (let k = 1; k < n; k++) if (at(cellI(a.x + dx * k / n), cellJ(a.z + dz * k / n)) === BLD) return false;
    return true;
  }
  function walkLOS(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, n = Math.ceil(Math.hypot(dx, dz) / 0.6);
    for (let k = 1; k < n; k++) if (!free(a.x + dx * k / n, a.z + dz * k / n, a.r)) return false;
    return true;
  }
  let lastPC = -1;
  function chaseDir() {
    let tx = player.x, tz = player.z;
    if (!walkLOS(teacher, player)) {
      const pc = cellIdxOf(player.x, player.z);
      if (pc >= 0 && pc !== lastPC) { lastPC = pc; flood(pc); }
      const ti = cellI(teacher.x), tj = cellJ(teacher.z);
      let bestD = inMap(ti, tj) ? dist[idx(ti, tj)] : -1, bi = ti, bj = tj;
      if (bestD < 0) bestD = 1e9;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ti + di, nj = tj + dj;
        if (!inMap(ni, nj)) continue;
        if (di && dj && (!WALK(at(ti + di, tj)) || !WALK(at(ti, tj + dj)))) continue;
        const d = dist[idx(ni, nj)];
        if (d >= 0 && d < bestD) { bestD = d; bi = ni; bj = nj; }
      }
      if (bi !== ti || bj !== tj) { tx = cellX(bi); tz = cellZ(bj); }
    }
    const dx = tx - teacher.x, dz = tz - teacher.z, l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  }
  function moveEnt(e, dx, dz) {
    let moved = false;
    if (free(e.x + dx, e.z, e.r)) { e.x += dx; moved = true; }
    if (free(e.x, e.z + dz, e.r)) { e.z += dz; moved = true; }
    return moved;
  }
  function turnTo(e, a, dt, k = 12) {
    let d = a - e.rot; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    e.rot += d * Math.min(1, dt * k);
  }

  function startFree(mode, unseen) {
    state = 'free'; teacher.state = mode; cone.visible = false; freeT = 0; itemT = 0;
    $('itemwrap').classList.remove('hidden');
    msgQ = []; msgT = 0;
    if (mode === 'chase') { say('Läraren såg dig! SPRING! 🏃', 2); Snd.whistle(); }
    else { say(unseen ? 'Du smet osedd! 🤫 Läraren letar efter dig...' : 'Läraren letar efter dig!', 2.4); Snd.warn(); }
  }

  function gameOver() {
    state = 'over'; Snd.caught(); Snd.music('off'); Snd.engine(-1);
    const s = Math.floor(freeT);
    let rec = '';
    if (s > best) { best = s; rec = '<br>🏆 Nytt rekord!'; try { localStorage.setItem('smita-best', best); } catch (e) { } $('best').textContent = best; }
    $('overtext').innerHTML = 'Du var fri i <b>' + s + ' sekunder</b><br>och åt <b>' + bunCount + '</b> kanelbullar 🥐' + rec;
    setTimeout(() => $('over').classList.remove('hidden'), 700);
  }

  // ---------- Styrning ----------
  const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, keys = {};
  const joyb = $('joyb'), joyk = $('joyk'), touch = $('touch');
  touch.addEventListener('pointerdown', e => {
    if (joy.id !== null) return;
    joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0;
    joyb.style.display = joyk.style.display = 'block';
    joyb.style.left = joyk.style.left = e.clientX + 'px'; joyb.style.top = joyk.style.top = e.clientY + 'px';
    e.preventDefault();
  });
  window.addEventListener('pointermove', e => {
    if (e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const l = Math.hypot(dx, dy), R = 60;
    if (l > R) { dx *= R / l; dy *= R / l; }
    if (l > 10) { joy.x = dx / R; joy.y = dy / R; } else joy.x = joy.y = 0;
    joyk.style.left = joy.ox + dx + 'px'; joyk.style.top = joy.oy + dy + 'px';
  });
  // Släpper man spaken stannar gubben direkt
  const endJoy = e => {
    if (e.pointerId !== joy.id) return;
    joy.id = null; joy.x = joy.y = 0;
    joyb.style.display = joyk.style.display = 'none';
  };
  window.addEventListener('pointerup', endJoy); window.addEventListener('pointercancel', endJoy);
  window.addEventListener('blur', () => { joy.id = null; joy.x = joy.y = 0; joyb.style.display = joyk.style.display = 'none'; for (const k in keys) keys[k] = false; });
  $('itembtn').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); useItem(); });
  $('ridebtn').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); toggleRide(); });
  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Space' || e.code === 'KeyE') useItem();
    if ((e.code === 'KeyF' || e.code === 'Enter') && !e.repeat) toggleRide();
    if (e.code === 'KeyV' && !e.repeat) toggleView();
    if (e.code === 'KeyM' && !e.repeat) { Snd.init(); Snd.setMuted(!Snd.isMuted()); updMute(); }
    if (e.code === 'KeyK' && !e.repeat) { if (paused) { $('bigmap').classList.add('hidden'); paused = false; last = performance.now(); } else if (state === 'line' || state === 'free') showBigMap(); }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  document.addEventListener('gesturestart', e => e.preventDefault());

  function begin() {
    Snd.init();
    $('menu').classList.add('hidden'); $('over').classList.add('hidden');
    joy.x = joy.y = 0;
    setCharacter(chosen);
    reset(); state = 'line';
    applyWeather();
    say('Smit från ledet när läraren inte tittar!', 2.6);
    const d = Weather.describe();
    if (Weather.info.loaded) say(d.emoji + ' ' + d.tip, 3);
  }
  {
    const pk = $('picker');
    CHARS.forEach((c, k) => {
      const b = document.createElement('button'); b.className = 'pick'; b.type = 'button';
      const cvs = cv(80, 96), g = cvs.getContext('2d');
      g.fillStyle = c.pants; g.fillRect(24, 62, 32, 28);
      g.fillStyle = c.shoes || '#222'; g.fillRect(22, 88, 15, 6); g.fillRect(43, 88, 15, 6);
      g.fillStyle = c.shirt; g.fillRect(18, 38, 44, 28); g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1.5; g.strokeRect(18.75, 38.75, 42.5, 26.5);
      if (c.stripe) { g.fillStyle = c.stripe; g.fillRect(18, 44, 44, 6); g.fillRect(18, 56, 44, 6); }
      g.fillStyle = c.skin; g.beginPath(); g.arc(40, 22, 15, 0, 7); g.fill();
      g.fillStyle = c.hair; g.beginPath(); g.arc(40, 21, 15.5, Math.PI * 1.02, Math.PI * 1.98); g.fill();
      if (c.cap) { g.fillStyle = c.cap; g.beginPath(); g.arc(40, 19, 16, Math.PI, 0); g.fill(); g.fillRect(c.capBack ? 46 : 18, 15, 16, 4); }
      if (c.shades) { g.fillStyle = '#111'; g.fillRect(29, 20, 9, 5); g.fillRect(42, 20, 9, 5); g.fillRect(36, 21, 8, 2); }
      if (c.chain) { g.strokeStyle = '#f5c518'; g.lineWidth = 2.5; g.beginPath(); g.arc(40, 40, 10, 0.25, Math.PI - 0.25); g.stroke(); g.fillStyle = '#f5c518'; g.fillRect(37, 49, 6, 6); }
      const lb = document.createElement('span'); lb.textContent = c.n;
      b.append(cvs, lb);
      const mark = () => pk.querySelectorAll('.pick').forEach((q, i) => q.classList.toggle('on', i === chosen));
      b.addEventListener('click', () => { chosen = k; try { localStorage.setItem('smita-gubbe', c.n); } catch (e) { } mark(); });
      pk.append(b); mark();
    });
  }
  $('startbtn').addEventListener('click', begin);
  $('againbtn').addEventListener('click', begin);

  // ---------- Uppdatering ----------
  function surface() {
    if (player.ride) return 'wood';
    if (wx.slippery) return 'snow';
    const t = at(cellI(player.x), cellJ(player.z));
    if (wx.wet) return 'wet';
    return t === PARK ? 'grass' : t === COBBLE ? 'cobble' : t === BRIDGE ? 'wood' : 'stone';
  }
  function updatePlayer(dt) {
    let ix = joy.x, iz = joy.y;
    if (keys.ArrowLeft || keys.KeyA) ix -= 1; if (keys.ArrowRight || keys.KeyD) ix += 1;
    if (keys.ArrowUp || keys.KeyW) iz -= 1; if (keys.ArrowDown || keys.KeyS) iz += 1;
    let l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; l = 1; }
    // Förstapersonsvy: upp/ner går framåt/bakåt, vänster/höger svänger
    if (fp) {
      const f = -iz;
      if (player.car) {
        const tgt = player.car.h - ix * 1.2, g = Math.max(0, f);
        ix = Math.sin(tgt) * g; iz = Math.cos(tgt) * g; l = g;
      } else {
        if (player.stun <= 0 && player.phone <= 0) fpYaw -= ix * 2.4 * dt;
        ix = Math.sin(fpYaw) * f; iz = Math.cos(fpYaw) * f; l = Math.abs(f);
      }
    }
    for (const k of ['boost', 'slow', 'skate', 'bun']) if (player[k] > 0) player[k] -= dt;
    skate.visible = player.skate > 0;
    if (player.invis > 0) { player.invis -= dt; if (player.invis <= 0) { setPlayerAlpha(1); if (teacher.state === 'confused') teacher.state = 'search'; say('Kepsen slutade fungera!', 1.4); } }
    if (player.hop) { updateHop(player, dt); return; }
    if (player.car) { if (player.phone > 0) player.phone -= dt; updateCar(dt, ix, iz, l); return; }
    if (player.ride) {
      const v = player.ride;
      player.rideT += dt;
      if (player.phone > 0) player.phone -= dt;
      else {
        player.rox = Math.max(-v.len / 2 + 0.6, Math.min(v.len / 2 - 0.6, player.rox + (ix * v.ux + iz * v.uz) * 3 * dt));
        player.roz = Math.max(-v.wid / 2 + 0.5, Math.min(v.wid / 2 - 0.5, player.roz + (-ix * v.uz + iz * v.ux) * 3 * dt));
        if (l > 0.15) turnTo(player, Math.atan2(ix, iz), dt);
      }
      player.x = rideX(player, v); player.z = rideZ(player, v); player.y = v.deck;
      animate(player, dt, l > 0.15 && player.phone <= 0, 0.5);
      if (player.rideT > v.limit) jumpOff(player, 'Biljettkontroll! 🎫 Du måste hoppa av!');
      else if (v.kind === 'tram' && v.atEnd) jumpOff(player, 'Slutstation! Alla av! 🚋');
      return;
    }
    for (const b of buns) {
      if (Math.abs(b.x - player.x) < 1.1 && Math.abs(b.z - player.z) < 1.1) {
        bunCount++; $('buns').textContent = bunCount; player.bun = 1.5; Snd.bun(); placeBun(b);
      }
    }
    if (wx.wet) for (const p of puddles) {
      p.cool -= dt;
      if (p.cool <= 0 && Math.abs(p.x - player.x) < 1 && Math.abs(p.z - player.z) < 1) { p.cool = 0.8; Snd.puddle(); }
    }
    if (player.phone > 0) { player.phone -= dt; player.vx = player.vz = 0; setIcon(player.mesh.userData.icon, '📱'); animate(player, dt, false, 1); return; }
    if (player.stun > 0) { player.stun -= dt; player.vx = player.vz = 0; player.rot += dt * 10; animate(player, dt, false, 1); return; }
    const spd = 6.5 * (player.boost > 0 ? 1.6 : 1) * (player.skate > 0 ? 1.7 : 1) * (player.bun > 0 ? 1.15 : 1) * (player.slow > 0 ? 0.45 : 1);
    const want = l > 0.15 ? 1 : 0;
    // På snö glider man lite, annars stannar man direkt när man släpper
    const kAcc = wx.slippery ? 5 : 30;
    player.vx += (ix * spd * want - player.vx) * Math.min(1, kAcc * dt);
    player.vz += (iz * spd * want - player.vz) * Math.min(1, kAcc * dt);
    if (!want && !wx.slippery) player.vx = player.vz = 0;
    const v = Math.hypot(player.vx, player.vz), moving = v > 0.4;
    if (moving) {
      if (!moveEnt(player, player.vx * dt, player.vz * dt)) player.vx = player.vz = 0;
      if (want) turnTo(player, Math.atan2(ix, iz), dt);
    }
    const before = Math.floor(player.ph / Math.PI);
    animate(player, dt, moving && want && player.skate <= 0, v / 6.5);
    if (moving && want && player.skate <= 0 && Math.floor(player.ph / Math.PI) !== before) Snd.step(surface());
    setIcon(player.mesh.userData.icon, player.slow > 0 ? '🥶' : player.boost > 0 ? '⚡' : null);
  }

  function updateLine(dt) {
    const walking = line.ph === 'walk' && line.s < LLEN;
    if (line.ph === 'walk') {
      if (walking) line.s += 1.4 * dt;
      line.t -= dt; turnTo(teacher, WALK_ROT, dt, 6);
      if (line.t <= 0) { line.ph = 'warn'; line.t = 0.9; setIcon(teacher.mesh.userData.icon, '❗'); Snd.warn(); }
    } else if (line.ph === 'warn') {
      line.t -= dt; turnTo(teacher, WALK_ROT + Math.PI, dt, 5);
      if (line.t <= 0) { line.ph = 'look'; line.t = 1.6 + Math.random() * 1.2; cone.visible = true; setIcon(teacher.mesh.userData.icon, '👀'); }
    } else {
      line.t -= dt; teacher.rot = WALK_ROT + Math.PI;
      if (line.t <= 0) { line.ph = 'walk'; line.t = 2.5 + Math.random() * 4; cone.visible = false; setIcon(teacher.mesh.userData.icon, null); }
    }
    [teacher.x, teacher.z] = linePos(line.s);
    animate(teacher, dt, walking, 0.6);
    let k = 0;
    for (let s = 0; s < 8; s++) {
      if (s === PSLOT) continue;
      const e = students[k++], [sx, sz] = slotPos(s), w = Math.sin(time * 1.3 + s) * 0.15;
      const tx = sx + LD[1] * w, tz = sz - LD[0] * w;
      const dz = tz - e.z, dx = tx - e.x, d = Math.hypot(dx, dz), mv = Math.min(d, 2.5 * dt);
      if (d > 0.02) { e.x += dx / d * mv; e.z += dz / d * mv; }
      turnTo(e, WALK_ROT, dt, 6); animate(e, dt, d > 0.05, 0.6);
    }
    const [px, pz] = slotPos(PSLOT), out = Math.hypot(player.x - px, player.z - pz) > 2.2;
    if (!player.car && !player.ride) $('status').textContent = out ? 'Utanför ledet! 🤫' : 'I ledet 🙂';
    if (out) {
      if (line.ph === 'look') { if (canSeeCone(32, 0.9)) startFree('chase'); else startFree('search', true); }
      else if (line.ph === 'walk' && canSeeCone(22, 0.8)) startFree('chase');
    }
    cone.position.set(teacher.x, 0, teacher.z); cone.rotation.y = teacher.rot; cone.scale.set(wx.sight, 1, wx.sight);
  }

  function updateTeacher(dt) {
    const icon = teacher.mesh.userData.icon;
    for (const k of ['coffee', 'scoot']) if (teacher[k] > 0) teacher[k] -= dt;
    moped.visible = !!player.car; scooter.visible = teacher.scoot > 0 && !moped.visible;
    const d = Math.hypot(player.x - teacher.x, player.z - teacher.z);
    if (teacher.stun > 0) { teacher.stun -= dt; teacher.rot += dt * 9; setIcon(icon, '💫'); animate(teacher, dt, false, 1); return; }
    if (teacher.state === 'confused') {
      teacher.rot += dt * 1.5; setIcon(icon, '❓'); animate(teacher, dt, false, 1);
      if (player.invis <= 0) teacher.state = 'search';
      return;
    }
    const see = player.invis <= 0 && d < 26 * wx.sight && sightLOS(teacher, player);
    if (teacher.state === 'search' && see) { teacher.state = 'chase'; teacher.lost = 0; say('Läraren såg dig! SPRING! 🏃', 1.6); Snd.whistle(); }
    if (teacher.state === 'chase') {
      if (see) teacher.lost = 0;
      else if ((teacher.lost += dt) > 2.5) { teacher.state = 'search'; say('Du skakade av dig läraren! 😎', 1.6); }
    }
    const spd = (teacher.state === 'chase' ? 7.0 : 4.2) * (teacher.coffee > 0 ? 1.3 : 1) * (moped.visible ? 1.65 : teacher.scoot > 0 ? 1.6 : 1);
    const [dx, dz] = chaseDir();
    moveEnt(teacher, dx * spd * dt, dz * spd * dt);
    turnTo(teacher, Math.atan2(dx, dz), dt, 10);
    animate(teacher, dt, teacher.scoot <= 0 && !moped.visible, spd / 7);
    setIcon(icon, moped.visible ? '🛵' : teacher.scoot > 0 ? '🛴' : teacher.coffee > 0 ? '☕' : teacher.state === 'chase' ? '😠' : '🔍');
    // Hjärtat bultar när läraren är nära
    if (teacher.state === 'chase' && d < 10) { beatT -= dt; if (beatT <= 0) { Snd.heart(); beatT = 0.45 + d * 0.04; } }
    if (d < (player.car ? 1.9 : 1.25) && !player.ride && !player.hop && (!player.car || player.car.spd < 4)) gameOver();
  }

  function updateVehicles(dt) {
    for (const v of vehicles) {
      if (v.wait > 0) {
        v.wait -= dt;
        if (v.wait <= 0) {
          v.atEnd = false;
          if (v.kind === 'ferry' && Math.hypot(v.x - player.x, v.z - player.z) < 70 && state !== 'menu') Snd.horn();
        }
      } else {
        let ns = v.s + v.dir * v.speed * dt;
        if (v.stops) for (const st of v.stops) if ((v.s < st && ns >= st) || (v.s > st && ns <= st)) { ns = st; v.wait = v.pause; break; }
        if (ns >= v.path.L) { ns = v.path.L; v.dir = -1; v.wait = v.pause; v.atEnd = true; }
        else if (ns <= 0) { ns = 0; v.dir = 1; v.wait = v.pause; v.atEnd = true; }
        v.s = ns;
      }
      placeVehicle(v);
    }
    if (state !== 'free') return;
    for (const t of trams) {
      t.bell -= dt;
      if (t.bell <= 0 && distToVehicle(player, t) < 9) { Snd.bell(); t.bell = 4; }
      for (const e of [player, teacher]) {
        if (e === player && (player.ride || player.hop || player.car)) continue;
        if (pushOutOfTram(e, t, e.r) && e.stun <= 0) {
          e.stun = 1.5; say(e === player ? 'Hoppsan, spårvagnen! 🚋' : 'Läraren blev påkörd av spårvagnen! 🚋', 1.5); Snd.slip();
        }
      }
    }
  }

  function updateFree(dt) {
    freeT += dt; itemT += dt;
    if (itemT >= 10) { itemT -= 10; giveItems(); }
    $('nextfill').style.width = (itemT / 10 * 100) + '%';
    $('time').textContent = Math.floor(freeT);
    if (!player.car && !player.ride) $('status').textContent = teacher.state === 'chase' ? 'Läraren jagar dig! 😱' : teacher.state === 'confused' ? 'Läraren ser dig inte 🧢' : 'Läraren letar... 🔍';
    updateTeacher(dt);
    if (state !== 'free') return;
    for (const b of bananas) {
      b.life -= dt;
      if (teacher.stun <= 0 && Math.hypot(teacher.x - b.m.position.x, teacher.z - b.m.position.z) < 1.2) {
        b.life = 0; teacher.stun = 2.5; say('Läraren halkade på bananskalet! 🍌', 1.6); Snd.slip();
      }
      if (b.life <= 0) scene.remove(b.m);
    }
    bananas = bananas.filter(b => b.life > 0);
    for (const b of balloons) {
      b.t += dt; const p = Math.min(1, b.t / 0.55);
      const tx = b.hit ? teacher.x : b.mx, tz = b.hit ? teacher.z : b.mz;
      b.m.position.set(b.sx + (tx - b.sx) * p, 1.5 + Math.sin(p * Math.PI) * 3, b.sz + (tz - b.sz) * p);
      if (p >= 1) {
        scene.remove(b.m); b.done = true; Snd.splash();
        if (b.hit) { teacher.stun = 2.2; say('Plask! Läraren blev blöt! 💦', 1.6); } else say('Plask! Missade... 💦', 1.2);
      }
    }
    balloons = balloons.filter(b => !b.done);
    for (const c of clouds) { c.t += dt; c.m.scale.setScalar(1 + c.t * 8); c.m.material.opacity = Math.max(0, 0.5 - c.t * 0.5); if (c.t > 1) { scene.remove(c.m); c.done = true; } }
    clouds = clouds.filter(c => !c.done);
    for (const s of students) { turnTo(s, Math.atan2(player.x - s.x, player.z - s.z), dt, 4); s.ph += dt * 6; s.mesh.position.y = Math.abs(Math.sin(s.ph)) * 0.25; }
  }

  function updateWorld(dt) {
    wheel.rotation.z += dt * 0.15;
    for (const gd of wheel.userData.gond) gd.rotation.z = -wheel.rotation.z;
    bigBun.rotation.y += dt * 0.5;
    for (const c of cars) if (c.cool > 0) c.cool -= dt;
    swings.forEach((s, k) => { s.rotation.x = Math.sin(time * 2 + k * 1.7) * 0.6; });
    seals.forEach((s, k) => {
      const a = time * 0.4 + k * 2.1;
      s.position.set(pondX + Math.cos(a) * (4 + k * 1.5), 0.15 + Math.max(0, Math.sin(time * 1.5 + k)) * 0.15, pondZ + Math.sin(a) * (2.5 + k));
      s.rotation.y = -a;
    });
    for (const m of moose) {
      if (m.wait > 0) { m.wait -= dt; continue; }
      const dx = m.tx - m.x, dz = m.tz - m.z, d = Math.hypot(dx, dz);
      if (d < 0.5 || !m.tx) {
        const tx = X(536 + Math.random() * 22), tz = Z(500 + Math.random() * 40);
        if (at(cellI(tx), cellJ(tz)) === PARK) { m.tx = tx; m.tz = tz; m.wait = 1 + Math.random() * 3; }
      } else { m.x += dx / d * 1.3 * dt; m.z += dz / d * 1.3 * dt; m.g.rotation.y = Math.atan2(dx, dz); }
      m.g.position.set(m.x, 0, m.z);
    }
    for (const g of gulls) {
      g.a += g.sp * dt;
      g.g.position.set(g.cx + Math.cos(g.a) * g.rad, g.y, g.cz + Math.sin(g.a) * g.rad);
      g.g.rotation.y = -g.a + (g.sp > 0 ? Math.PI : 0);
      const f = Math.sin(time * 8 + g.rad) * 0.5; g.l.rotation.z = f; g.r.rotation.z = -f;
    }
    for (const b of buns) { b.m.rotation.z += dt * 2; b.m.position.y = 0.7 + Math.sin(time * 3 + b.x) * 0.15; }
    if (state === 'line' || state === 'free') {
      gullT -= dt;
      if (gullT <= 0) {
        gullT = 9 + Math.random() * 14;
        if (gulls.some(g => Math.hypot(g.g.position.x - player.x, g.g.position.z - player.z) < 60)) Snd.gull();
      }
    }
  }

  function syncMeshes() {
    if (fp && !player.car && player.stun <= 0) player.rot = fpYaw;
    player.mesh.visible = !player.car && !fp;
    for (const e of [player, teacher, ...students]) { e.mesh.position.x = e.x; e.mesh.position.z = e.z; e.mesh.rotation.y = e.rot; }
    player.mesh.position.y = player.y;
    youLabel.position.set(player.x, player.y + 2.9 + Math.sin(time * 4) * 0.12, player.z);
    youLabel.visible = state !== 'menu' && !fp;
  }

  function updateCamera(dt) {
    const fov = fp ? 72 : 50;
    if (camera.fov !== fov) { camera.fov = fov; camera.near = fp ? 0.1 : 0.5; camera.updateProjectionMatrix(); }
    if (fp) {
      const yaw = player.car ? player.car.h : fpYaw, eye = player.car ? 1.35 : 1.55 + (player.skate > 0 ? 0.15 : 0), fwd = player.car ? 0.3 : 0.2;
      camera.position.set(player.x + Math.sin(yaw) * fwd, player.y + eye, player.z + Math.cos(yaw) * fwd);
      camera.lookAt(player.x + Math.sin(yaw) * 10, player.y + eye - 1.1, player.z + Math.cos(yaw) * 10);
      camTarget.set(player.x, 0, player.z);
      sun.position.set(camTarget.x + 25, 50, camTarget.z + 15); sun.target.position.copy(camTarget);
      seeU.uR.value = 0;
      return;
    }
    const portrait = camera.aspect < 0.9;
    camOff.set(0, portrait ? 27 : 19, portrait ? 21 : 16);
    camTarget.lerp(tmpV.set(player.x, 0, player.z), 1 - Math.exp(-dt * 5));
    camera.position.copy(camTarget).add(camOff);
    camera.lookAt(camTarget.x, 1, camTarget.z - 3);
    sun.position.set(camTarget.x + 25, 50, camTarget.z + 15); sun.target.position.copy(camTarget);
    seeU.uP.value.set(player.x, player.y + 1.1, player.z);
    seeU.uC.value.copy(camera.position);
    seeU.uR.value = state === 'menu' ? 0 : 3.4;
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  reset();
  // Visa en snygg vy över Avenyn i menyn
  camTarget.set(player.x - 6, 0, player.z - 10);
  Weather.load().then(() => applyWeather());
  applyWeather();
  if (location.hash === '#test') window.__t = { player, teacher, vehicles, cars, trams, boats, toggleRide, startFree, wx, applyWeather, Weather, grid, houses, X, Z, nearestVehicle, tick: sec => { for (let k = 0; k < sec * 20; k++) update(0.05); }, get state() { return state; }, get line() { return line; } };
  function update(dt) {
    time += dt;
    updateWorld(dt);
    if (state === 'line') { updatePlayer(dt); updateLine(dt); }
    else if (state === 'free') { updatePlayer(dt); updateFree(dt); }
    updateVehicles(dt);
    if (state === 'line' || state === 'free') {
      if (player.hop) rideUI('');
      else if (player.car) {
        rideUI('⬇️ Kliv ur');
        $('status').textContent = 'Kör bil: ' + Math.max(0, Math.ceil(10 - player.driveT)) + ' s kvar 🚗';
      } else if (player.ride) {
        const v = player.ride;
        rideUI('⬇️ Hoppa av');
        $('status').textContent = v.limit === Infinity ? (v.wait > 0 ? 'Älvsnabben ligger vid bryggan – hoppa av!' : 'På Älvsnabben ⛴️') : 'På ' + v.name + ': ' + Math.max(0, Math.ceil(v.limit - player.rideT)) + ' s kvar';
      } else {
        const v = nearestVehicle();
        rideUI(v ? rideIcon(v) + ' Hoppa på!' : nearestCar() ? '🚗 Kör bil!' : '');
      }
      Snd.music(state === 'line' ? 'calm' : teacher.state === 'chase' ? 'chase' : 'search');
    } else rideUI('');
    syncMeshes(); updateCamera(dt); updateWeather(dt); updMsg(dt);
    if (state !== 'menu') drawMini();
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!paused) update(dt);
    Snd.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
