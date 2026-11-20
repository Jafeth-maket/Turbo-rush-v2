// ============================================================
//  TURBO RUSH - AUTOS JAPONESES (v3: carrocerías curvas + shaders)
//  La carrocería se "modela" por secciones (como un loft): cofre,
//  parabrisas, techo y luneta salen de una sola superficie suave.
//  Pintura, cristales, franjas y cofre de carbono se dibujan en el
//  shader (gfx.js). Aquí también están las ruedas y accesorios.
// ============================================================
const CARS = (() => {
  const T = THREE;

  /* ---------------- Utilidades ---------------- */
  const geos = new Map();
  function geo(key, make) {
    let g = geos.get(key);
    if (!g) { g = make(); g.userData.keep = true; geos.set(key, g); }
    return g;
  }
  const hex = (s) => parseInt(String(s).slice(1), 16);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const step = (a, b, x) => sm((x - a) / (b - a));
  function pw(pts, u) {
    if (u <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (u <= pts[i][0]) { const a = pts[i - 1], b = pts[i]; return lerp(a[1], b[1], (u - a[0]) / (b[0] - a[0])); }
    return pts[pts.length - 1][1];
  }
  function mesh(parent, g, m, x, y, z) { const o = new T.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o; }
  const box = (w, h, d) => geo(`box${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)}`, () => new T.BoxGeometry(w, h, d));
  const cylZ = (r, len, seg = 14) => geo(`cz${r.toFixed(3)},${len.toFixed(3)}`, () => new T.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2));
  function mk(pos, idx, mask) {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    if (mask) g.setAttribute("aMask", new T.Float32BufferAttribute(mask, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  /* ---------------- Catálogos ---------------- */
  const PALETTE = ["#e53935", "#ff6d00", "#fbc02d", "#76ff03", "#00c853", "#00bfa5", "#00e5ff", "#1e88e5",
                   "#283593", "#8e24aa", "#ff4081", "#f5f5f5", "#b0b6bf", "#424242", "#111111", "#a1887f"];
  const RIM_COLORS = ["#c7ccd4", "#f5f5f5", "#1a1a1a", "#d4af37", "#b87333", "#e53935", "#1e88e5", "#00e5ff", "#76ff03", "#ff4081"];
  // n = rayos (0 = disco), w0/w1 = ancho del rayo en el centro y en la orilla, dbl = doble capa
  const RIMS = [
    { nombre: "Clásica 5",   n: 5,  w0: 0.11, w1: 0.075 },
    { nombre: "Rally 6",     n: 6,  w0: 0.14, w1: 0.11 },
    { nombre: "Racing 10",   n: 10, w0: 0.065, w1: 0.04 },
    { nombre: "Malla 14",    n: 14, w0: 0.05, w1: 0.035 },
    { nombre: "Doble 8",     n: 8,  w0: 0.09, w1: 0.06, dbl: true },
    { nombre: "Disco turbo", n: 0,  w0: 0, w1: 0 }
  ];
  const RIM_SIZES = [0.20, 0.24, 0.28, 0.31];
  const FINISH = ["Normal", "Metálico", "Perlado", "Cromo", "Mate"];
  const GLASS = [0x1c3a52, 0x0a1420, 0x020304];
  const DROP = [0, 0.04, 0.08, 0.11];

  /* ---------------- Modelos (siluetas) ----------------
     top: altura de la línea de cintura (u: 0 = trompa, 1 = cola) | cab: parabrisas, techo, luneta
     wr: radio de la llanta | bulge: ensanche de las salpicaderas | wb: posición de los ejes */
  const MODELS = {
    hatch: { L: 4.2, hw: 0.93, y0: 0.30, wr: 0.36, tw: 0.30, taperF: 0.15, taperR: 0.08, bulge: 0.025, wb: [-1.30, 1.28],
      top: [[0, 0.52], [0.04, 0.62], [0.09, 0.72], [0.2, 0.76], [0.4, 0.79], [0.5, 0.80], [0.9, 0.80], [1, 0.74]],
      cab: { c0: 0.41, c1: 0.93, ws: 0.14, rw: 0.13, roof: 1.22 }, head: "pop", tail: "bar" },
    coupe: { L: 4.3, hw: 0.93, y0: 0.28, wr: 0.35, tw: 0.31, taperF: 0.17, taperR: 0.10, bulge: 0.03, wb: [-1.38, 1.32],
      top: [[0, 0.44], [0.04, 0.55], [0.10, 0.66], [0.2, 0.71], [0.4, 0.73], [0.55, 0.74], [0.85, 0.75], [1, 0.68]],
      cab: { c0: 0.44, c1: 0.90, ws: 0.15, rw: 0.22, roof: 1.17 }, head: "slim", tail: "slim" },
    gtr: { L: 4.4, hw: 1.0, y0: 0.29, wr: 0.37, tw: 0.34, taperF: 0.12, taperR: 0.08, bulge: 0.045, wb: [-1.40, 1.36],
      top: [[0, 0.54], [0.04, 0.66], [0.09, 0.76], [0.2, 0.79], [0.4, 0.82], [0.5, 0.83], [0.9, 0.86], [1, 0.82]],
      cab: { c0: 0.40, c1: 0.88, ws: 0.10, rw: 0.12, roof: 1.32 }, head: "round", tail: "round4" },
    sedan: { L: 4.5, hw: 0.94, y0: 0.30, wr: 0.36, tw: 0.31, taperF: 0.14, taperR: 0.08, bulge: 0.03, wb: [-1.45, 1.40],
      top: [[0, 0.52], [0.04, 0.64], [0.09, 0.74], [0.2, 0.77], [0.4, 0.80], [0.5, 0.81], [0.9, 0.83], [1, 0.78]],
      cab: { c0: 0.38, c1: 0.80, ws: 0.12, rw: 0.10, roof: 1.32 }, head: "slim", tail: "slim" },
    super: { L: 4.4, hw: 1.0, y0: 0.25, wr: 0.33, tw: 0.36, taperF: 0.20, taperR: 0.10, bulge: 0.05, wb: [-1.45, 1.20],
      top: [[0, 0.36], [0.05, 0.50], [0.1, 0.62], [0.16, 0.68], [0.3, 0.70], [0.5, 0.72], [0.8, 0.78], [1, 0.70]],
      cab: { c0: 0.30, c1: 0.74, ws: 0.18, rw: 0.20, roof: 1.07 }, head: "slim", tail: "bar" },
    van: { L: 4.5, hw: 0.95, y0: 0.32, wr: 0.36, tw: 0.28, taperF: 0.10, taperR: 0.05, bulge: 0.01, wb: [-1.4, 1.3],
      top: [[0, 0.6], [0.04, 0.72], [0.09, 0.8], [0.3, 0.86], [1, 0.88]],
      cab: { c0: 0.2, c1: 0.98, ws: 0.16, rw: 0.06, roof: 1.75 }, head: "slim", tail: "slim" }
  };
  for (const k in MODELS) MODELS[k].id = k;

  function defaultCustom(def) {
    return {
      color: def.color || "#e53935", acabado: 0, techo: null, acento: "#14161b",
      llanta: 0, llantaColor: "#c7ccd4", llantaTam: 1, pinza: null,
      aleron: 0, kit: 0, cofre: 0, suspension: 0,
      franja: 0, franjaColor: "#ffffff", vidrio: 1, neon: null, faros: "#fff3b0", escape: 0, llama: "#ffa000"
    };
  }

  /* ---------------- Carrocería por secciones ---------------- */
  const HXr = [0.985, 0.90, 0.74, 0.52, 0.27, 0], HYa = [0, 0.012, 0.0, -0.025, -0.04, -0.045];
  const UXr = [0.985, 0.86, 0.83, 0.67, 0.45, 0], UYf = [0, 0.04, 0.45, 0.84, 0.985, 1.0];
  const LXr = [0, 0.78, 0.96, 1.0, 1.0, 0.985];

  // funciones de forma (dependen del modelo)
  function shape(M, wide) {
    const L = M.L, hl = L / 2, c = M.cab;
    const yb = (u) => pw(M.top, u);
    const y0 = (u) => M.y0 + 0.11 * (1 - sm(u / 0.08)) + 0.07 * (1 - sm((1 - u) / 0.08));
    const uF = (M.wb[0] + hl) / L, uR = (M.wb[1] + hl) / L;
    const hwAt = (u) => {
      const wn = (0.6 + 0.4 * sm(u / M.taperF)) * (0.7 + 0.3 * sm((1 - u) / M.taperR));
      const g = (a) => Math.exp(-Math.pow((u - a) / 0.07, 2));
      return M.hw * wide * wn * (1 + M.bulge * (g(uF) + g(uR) * 1.15));
    };
    const ramp = (t) => { t = clamp(t, 0, 1); return t * 0.5 + sm(t) * 0.5; };
    const k = (u) => (u <= c.c0 || u >= c.c1) ? 0 : Math.min(ramp((u - c.c0) / c.ws), ramp((c.c1 - u) / c.rw));
    return { L, hl, c, yb, y0, hwAt, k, uF, uR };
  }

  function bodyGeo(M, wide, NU) {
    return geo(`body|${M.id}|${wide}|${NU}`, () => {
      const S = shape(M, wide), c = S.c, pos = [], mask = [], idx = [];
      const rings = [];
      for (let i = 0; i < NU; i++) {
        const u = i / (NU - 1), z = -S.hl + u * S.L, hw = S.hwAt(u), yb = S.yb(u), y0 = S.y0(u), k = S.k(u);
        const dyr = Math.max(0.2, c.roof - yb);
        // parte baja: de la cintura izquierda, por abajo, a la cintura derecha
        const lo = [];
        const LY = [0, 0, 0.06, (yb - y0) * 0.45, (yb - y0) * 0.8, yb - y0];
        for (let j = 5; j >= 1; j--) lo.push([-hw * LXr[j], y0 + LY[j]]);
        lo.push([0, y0]);
        for (let j = 1; j <= 5; j++) lo.push([hw * LXr[j], y0 + LY[j]]);
        // parte alta: cofre / parabrisas / techo / luneta
        const up = [], ux = [], uy = [];
        for (let j = 0; j < 6; j++) { ux.push(hw * lerp(HXr[j], UXr[j], k)); uy.push(yb + lerp(HYa[j], UYf[j] * dyr, k)); }
        for (let j = 0; j < 5; j++) up.push([-ux[j], uy[j], j]);
        up.push([0, uy[5], 5]);
        for (let j = 4; j >= 0; j--) up.push([ux[j], uy[j], j]);
        // máscaras: x = cristal, y = techo, z = cofre
        const side = step(c.c0 + c.ws * 0.45, c.c0 + c.ws * 0.65, u) * (1 - step(c.c1 - c.rw * 0.65, c.c1 - c.rw * 0.45, u));
        const bp = M.id === "hatch" || M.id === "gtr" || M.id === "super" || M.id === "coupe" ? 1 : (Math.abs(u - (c.c0 + c.c1) * 0.5) < 0.012 ? 0 : 1);
        const wsh = step(c.c0 + 0.004, c.c0 + 0.03, u) * (1 - step(c.c0 + c.ws * 0.92, c.c0 + c.ws, u));
        const rew = step(c.c1 - c.rw, c.c1 - c.rw + 0.02, u) * (1 - step(c.c1 - 0.02, c.c1 - 0.004, u));
        const roofW = step(c.c0 + c.ws * 0.9, c.c0 + c.ws * 1.05, u) * (1 - step(c.c1 - c.rw * 1.05, c.c1 - c.rw * 0.9, u));
        const hoodW = step(0.085, 0.105, u) * (1 - step(c.c0 - 0.03, c.c0 - 0.012, u));
        const base = pos.length / 3;
        for (const p of lo) { pos.push(p[0], p[1], z); mask.push(0, 0, 0); }
        for (const p of up) {
          const j = p[2];
          let gl = 0;
          if (j === 1 || j === 2) gl = side * bp; else if (j >= 4) gl = Math.max(wsh, rew);
          pos.push(p[0], p[1], z);
          mask.push(gl, j >= 3 ? roofW : 0, j >= 1 ? hoodW : 0);
        }
        rings.push({ base, lo: lo.length, up: up.length, z, lo_pts: lo, up_pts: up });
      }
      const strip = (a, b, n) => { for (let j = 0; j < n - 1; j++) idx.push(a + j, b + j, a + j + 1, a + j + 1, b + j, b + j + 1); };
      for (let i = 0; i < NU - 1; i++) {
        const r0 = rings[i], r1 = rings[i + 1];
        strip(r0.base, r1.base, r0.lo);
        strip(r0.base + r0.lo, r1.base + r1.lo, r0.up);
      }
      // tapas delanteras y traseras
      for (const ri of [0, NU - 1]) {
        const r = rings[ri], outline = r.lo_pts.concat(r.up_pts.slice().reverse().map((p) => [p[0], p[1]]));
        let cy = 0; for (const p of outline) cy += p[1]; cy /= outline.length;
        const b0 = pos.length / 3;
        pos.push(0, cy, r.z); mask.push(0, 0, 0);
        for (const p of outline) { pos.push(p[0], p[1], r.z); mask.push(0, 0, 0); }
        for (let j = 0; j < outline.length; j++) idx.push(b0, b0 + 1 + j, b0 + 1 + ((j + 1) % outline.length));
      }
      return mk(pos, idx, mask);
    });
  }

  /* ---------------- Ruedas ---------------- */
  function lathe(profile, seg) {     // profile: [r, x] -> revolución alrededor del eje X
    const pos = [], idx = [], n = profile.length;
    for (let i = 0; i < seg; i++) {
      const a = i / seg * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      for (const [r, x] of profile) pos.push(x, r * ca, r * sa);
    }
    for (let i = 0; i < seg; i++) {
      const i2 = (i + 1) % seg;
      for (let j = 0; j < n - 1; j++) { const a = i * n + j, b = i2 * n + j; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    }
    return mk(pos, idx);
  }
  function tireGeo(R, W, rr, seg) {
    return geo(`tire${R}|${W}|${rr}|${seg}`, () => {
      const h = W / 2, d = R - rr;
      return lathe([[rr * 1.02, h * 0.92], [rr + d * 0.35, h * 1.0], [R - d * 0.18, h * 0.96], [R * 0.995, h * 0.62], [R, h * 0.3],
                    [R, -h * 0.3], [R * 0.995, -h * 0.62], [R - d * 0.18, -h * 0.96], [rr + d * 0.35, -h], [rr * 1.02, -h * 0.92]], seg);
    });
  }
  function rimGeo(rr, xf) {
    return geo(`rim${rr}|${xf}`, () => lathe([[0, xf - 0.045], [rr * 0.22, xf - 0.045], [rr * 0.3, xf - 0.022], [rr * 0.86, xf - 0.022],
      [rr * 0.89, xf - 0.004], [rr * 0.95, xf + 0.012], [rr, xf + 0.012], [rr, xf - 0.09]], 28));
  }
  function spokesGeo(rr, xf, rs) {
    return geo(`spk${rr}|${xf}|${rs.n}|${rs.w0}|${rs.dbl ? 1 : 0}`, () => {
      const pos = [], idx = [], r0 = rr * 0.2, r1 = rr * 0.9, t = 0.026;
      const layers = rs.dbl ? 2 : 1;
      for (let ly = 0; ly < layers; ly++) {
        for (let s = 0; s < rs.n; s++) {
          const a = (s + ly * 0.5) / rs.n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
          const x0 = xf - 0.02 + ly * 0.012, b = pos.length / 3;
          const w0 = rs.w0 * rr * (ly ? 0.7 : 1) / 0.28 * 0.5, w1 = rs.w1 * rr / 0.28 * 0.5;
          const pt = (r, w, x) => pos.push(x, r * ca + (-sa) * w, r * sa + ca * w);
          pt(r0, -w0, x0); pt(r0, w0, x0); pt(r1, w1, x0); pt(r1, -w1, x0);
          pt(r0, -w0 * 0.8, x0 + t); pt(r0, w0 * 0.8, x0 + t); pt(r1, w1 * 0.8, x0 + t); pt(r1, -w1 * 0.8, x0 + t);
          const f = (a1, b1, c1, d1) => idx.push(b + a1, b + b1, b + c1, b + a1, b + c1, b + d1);
          f(4, 5, 6, 7); f(0, 1, 5, 4); f(1, 2, 6, 5); f(2, 3, 7, 6); f(3, 0, 4, 7);
        }
      }
      return mk(pos, idx);
    });
  }
  function wheelProto(cu, M, lod) {
    const rs = RIMS[cu.llanta] || RIMS[0], rr = RIM_SIZES[cu.llantaTam] ?? RIM_SIZES[1];
    const tw = M.tw + (cu.kit >= 3 ? 0.06 : 0), xf = tw / 2 - 0.015, R = M.wr;
    const g = new T.Group();
    const rimM = GFX.carMat({ color: hex(cu.llantaColor), metal: 1, rough: 0.22, clear: 0.45, ao: 0.2 });
    mesh(g, tireGeo(R, tw, rr, lod === 2 ? 14 : 28), GFX.carMat({ color: 0x0b0b0c, rough: 0.9, clear: 0.08, ao: 0.1 }), 0, 0, 0);
    mesh(g, rimGeo(rr, xf), rs.n ? GFX.carMat({ color: 0x15171b, metal: 0.6, rough: 0.5, ao: 0.1 }) : rimM, 0, 0, 0);
    if (lod === 2) return g;
    if (rs.n) mesh(g, spokesGeo(rr, xf, rs), rimM, 0, 0, 0);
    else for (let k = 0; k < 5; k++) mesh(g, box(0.02, 0.04, rr * 1.2), GFX.carMat({ color: 0x0b0c0e, rough: 0.6 }), xf + 0.014, 0, 0).rotation.x = k * Math.PI / 5;
    mesh(g, geo("hubcap" + rr, () => new T.CylinderGeometry(rr * 0.2, rr * 0.2, 0.05, 14).rotateZ(Math.PI / 2)), rimM, xf - 0.012, 0, 0);
    if (!lod) {
      mesh(g, geo("disc" + rr, () => lathe([[rr * 0.28, 0], [rr * 0.86, 0], [rr * 0.86, 0.028], [rr * 0.28, 0.028]], 24)), GFX.carMat({ color: 0x555a62, metal: 0.85, rough: 0.45 }), xf - 0.095, 0, 0);
      if (cu.pinza && rs.n) {
        const cal = mesh(g, box(0.055, rr * 0.5, rr * 0.36), GFX.carMat({ color: hex(cu.pinza), rough: 0.3, clear: 0.9 }), xf - 0.07, rr * 0.5, -rr * 0.15);
        cal.rotation.x = 0.5;
      }
    }
    return g;
  }

  /* ---------------- Sombra falsa y rayos de luz ---------------- */
  let blobM = null;
  function blobMat() {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d"), gr = x.createRadialGradient(32, 32, 4, 32, 32, 31);
    gr.addColorStop(0, "rgba(0,0,0,0.75)"); gr.addColorStop(0.6, "rgba(0,0,0,0.45)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const m = new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false });
    m.polygonOffset = true; m.polygonOffsetFactor = -4; m.polygonOffsetUnits = -4;
    return m;
  }
  function shadow(w, l) {
    if (!blobM) blobM = blobMat();
    const s = new T.Mesh(geo(`blob${w}|${l}`, () => new T.PlaneGeometry(w, l).rotateX(-Math.PI / 2)), blobM);
    s.position.y = 0.035; s.renderOrder = 1; return s;
  }
  const beamMat = GFX.glowMat(0xfff0c8, 0.0001);   // el juego cambia su opacidad: de noche se ven los rayos de luz

  /* ---------------- Construcción del auto ---------------- */
  function paintOpts(cu, M) {
    const f = cu.acabado | 0, c = hex(cu.color);
    const o = { mask: true, rough: 0.18, clear: 1, ao: 0.5, beltY: pw(M.top, 0.5), stripeStyle: cu.franja, stripeColor: hex(cu.franjaColor), hood: cu.cofre === 3, glass: GLASS[cu.vidrio] ?? GLASS[1] };
    if (f === 1) Object.assign(o, { metal: 0.5, flake: 1, rough: 0.2 });
    else if (f === 2) Object.assign(o, { metal: 0.25, pearl: 1 });
    else if (f === 3) Object.assign(o, { metal: 1, rough: 0.06, clear: 0.5 });
    else if (f === 4) Object.assign(o, { rough: 0.92, clear: 0.12 });
    const c2 = cu.techo ? hex(cu.techo) : c;
    const chrome = (v) => new T.Color(v).lerp(new T.Color(0xffffff), 0.55).getHex();
    o.color = f === 3 ? chrome(c) : c;
    o.color2 = f === 3 ? chrome(c2) : c2;
    return o;
  }

  function build(def, custom, opts = {}) {
    const M = MODELS[def.modelo] || MODELS.hatch;
    const cu = Object.assign(defaultCustom(def), custom || {});
    const lod = opts.lod ? (opts.lod === true ? 1 : opts.lod) : 0;
    const drop = DROP[cu.suspension] || 0, wide = cu.kit >= 3 ? 1.07 : 1;
    const S = shape(M, wide), L = M.L, hl = L / 2, c = M.cab;
    const g = new T.Group(), shell = new T.Group();
    g.add(shell); shell.position.y = -drop;
    const po = paintOpts(cu, M);
    po.arch = [M.wb[0], M.wb[1], M.wr + drop, M.wr * 1.1];
    const body = GFX.carMat(po);
    const plain = GFX.carMat(Object.assign({}, po, { mask: false, stripeStyle: 0, hood: false }));
    const acc = GFX.carMat({ color: hex(cu.acento), rough: 0.25, clear: 0.8, ao: 0.3 });
    const dark = GFX.carMat({ color: 0x0b0c0f, rough: 0.6, clear: 0.2, ao: 0.3 });
    const chrome = GFX.carMat({ color: 0xc8ced6, metal: 1, rough: 0.15, clear: 0.3, ao: 0.2 });

    mesh(shell, bodyGeo(M, wide, lod === 2 ? 22 : 54), body, 0, 0, 0);

    const topAt = S.yb;
    // espejos
    if (lod < 2) for (const sx of [-1, 1]) {
      const m = mesh(shell, box(0.09, 0.1, 0.17), plain, sx * (S.hwAt(c.c0) * 0.93 + 0.08), topAt(c.c0) + 0.1, -hl + c.c0 * L + 0.18);
      m.rotation.y = sx * 0.2;
    }
    // líneas de puertas y manijas
    if (lod === 0) for (const sx of [-1, 1]) {
      const ys = (S.y0(0.5) + topAt(0.5)) / 2 + 0.03, hh = topAt(0.5) - S.y0(0.5) - 0.16;
      const two = M.id === "coupe" || M.id === "super" || M.id === "gtr" || M.id === "hatch";
      const us = two ? [c.c0 + 0.02, c.c0 + (c.c1 - c.c0) * 0.62] : [c.c0 + 0.02, c.c0 + (c.c1 - c.c0) * 0.5, c.c0 + (c.c1 - c.c0) * 0.88];
      for (const u of us) mesh(shell, box(0.012, hh, 0.012), dark, sx * (S.hwAt(u) + 0.004), ys, -hl + u * L);
      mesh(shell, box(0.02, 0.025, 0.14), chrome, sx * (S.hwAt(us[1]) + 0.01), topAt(0.5) - 0.06, -hl + (us[1] - 0.05) * L);
    }
    // cofre: rejillas / toma de aire
    const hu = (0.1 + c.c0 - 0.02) / 2, hz = -hl + hu * L, hy = topAt(hu) - 0.04;
    const slope = -Math.atan((topAt(c.c0 - 0.03) - topAt(0.12)) / ((c.c0 - 0.15) * L));
    if (cu.cofre === 1 || cu.cofre === 3) for (const sx of [-1, 1]) {
      mesh(shell, box(0.34, 0.012, 0.46), dark, sx * 0.36, hy + 0.012, hz).rotation.x = slope;
      for (let k = -1; k <= 1; k++) mesh(shell, box(0.34, 0.016, 0.016), acc, sx * 0.36, hy + 0.022, hz + k * 0.13).rotation.x = slope;
    }
    if (cu.cofre === 2) {
      mesh(shell, box(0.6, 0.13, 0.62), acc, 0, hy + 0.07, hz + 0.08).rotation.x = slope;
      mesh(shell, box(0.5, 0.08, 0.03), dark, 0, hy + 0.07, hz - 0.24).rotation.x = slope;
    }

    // kit aerodinámico
    if (cu.kit >= 1) {
      mesh(shell, box(S.hwAt(0.05) * 1.7, 0.04, 0.2), acc, 0, S.y0(0.02) + 0.02, -hl + 0.06);
      for (const sx of [-1, 1]) mesh(shell, box(0.07, 0.1, L * 0.36), acc, sx * (S.hwAt(0.5) + 0.005), S.y0(0.5) + 0.06, (M.wb[0] + M.wb[1]) / 2);
    }
    if (cu.kit >= 2) {
      mesh(shell, box(S.hwAt(0.95) * 1.5, 0.08, 0.3), acc, 0, S.y0(0.97) + 0.04, hl - 0.06);
      for (const sx of [-0.4, -0.2, 0, 0.2, 0.4]) mesh(shell, box(0.02, 0.1, 0.3), dark, sx * 1.2, S.y0(0.97) + 0.06, hl - 0.04);
      mesh(shell, box(S.hwAt(0.9) * 1.7, 0.035, 0.22), acc, 0, topAt(0.95) + 0.02, hl - 0.14);
    }
    if (cu.kit >= 3) for (const sx of [-1, 1]) for (const wz of M.wb) mesh(shell, box(0.14, 0.22, 1.05), plain, sx * (S.hwAt((wz + hl) / L) + 0.02), 0.57, wz);

    // luces delanteras: faros LED + DRL
    const hb = GFX.glowMat(hex(cu.faros)), tailM = GFX.glowMat(0xff1e2e), white = GFX.glowMat(0xffffff);
    const hu0 = 0.045, hyN = topAt(hu0) - 0.07, hx = S.hwAt(hu0) * 0.62, hzN = -hl + hu0 * L - 0.01;
    if (M.head === "pop") {
      for (const sx of [-1, 1]) {
        mesh(shell, box(0.5, 0.02, 0.26), dark, sx * 0.5, topAt(0.12) + 0.01, -hl + 0.12 * L);
        mesh(shell, box(0.34, 0.1, 0.05), hb, sx * hx, hyN - 0.01, hzN);
      }
    } else if (M.head === "round") {
      for (const sx of [-1, 1]) { mesh(shell, cylZ(0.16, 0.05), dark, sx * hx, hyN, hzN - 0.005); mesh(shell, cylZ(0.12, 0.06), hb, sx * hx, hyN, hzN - 0.012); }
    } else {
      for (const sx of [-1, 1]) {
        mesh(shell, box(0.52, 0.085, 0.05), hb, sx * hx, hyN, hzN);
        mesh(shell, box(0.52, 0.018, 0.05), white, sx * hx, hyN + 0.07, hzN);
      }
    }
    // parrilla y placa
    mesh(shell, box(0.86, 0.11, 0.05), dark, 0, S.y0(0.02) + 0.14, -hl + 0.02);
    for (let k = -1; k <= 1; k++) mesh(shell, box(0.84, 0.012, 0.055), chrome, 0, S.y0(0.02) + 0.14 + k * 0.035, -hl + 0.015);
    mesh(shell, box(0.42, 0.11, 0.03), white, 0, S.y0(0.02) + 0.04, -hl + 0.005);

    // luces traseras LED
    const ty = topAt(0.97) - 0.12, tx = S.hwAt(0.97);
    if (M.tail === "bar") { mesh(shell, box(tx * 1.7, 0.07, 0.05), tailM, 0, ty, hl - 0.01); mesh(shell, box(tx * 1.7, 0.1, 0.03), dark, 0, ty, hl - 0.005); }
    else if (M.tail === "round4") for (const sx of [-1, 1]) for (const dx of [0.36, 0.64]) { mesh(shell, cylZ(0.105, 0.03), dark, sx * dx, ty, hl - 0.01); mesh(shell, cylZ(0.08, 0.05), tailM, sx * dx, ty, hl - 0.016); }
    else for (const sx of [-1, 1]) { mesh(shell, box(0.64, 0.1, 0.03), dark, sx * 0.55, ty, hl - 0.005); mesh(shell, box(0.6, 0.065, 0.05), tailM, sx * 0.55, ty, hl - 0.012); }
    mesh(shell, box(0.42, 0.11, 0.03), white, 0, ty - 0.17, hl - 0.005);

    // alerón
    if (cu.aleron >= 1) {
      const wz = hl - (cu.aleron === 1 ? 0.22 : 0.4), wy = topAt(0.93);
      if (cu.aleron === 1) mesh(shell, box(S.hwAt(0.9) * 1.6, 0.045, 0.3), acc, 0, wy + 0.04, wz).rotation.x = -0.12;
      else {
        const hgt = [0, 0, 0.3, 0.5, 0.5][cu.aleron], wd = S.hwAt(0.9) * (cu.aleron === 2 ? 1.85 : 2.0);
        for (const sx of [-1, 1]) {
          mesh(shell, box(0.06, hgt, 0.1), dark, sx * 0.52, wy + hgt / 2, wz);
          mesh(shell, box(0.04, 0.2, 0.55), acc, sx * wd / 2, wy + hgt + 0.06, wz);
        }
        mesh(shell, box(wd, 0.06, cu.aleron === 2 ? 0.36 : 0.5), acc, 0, wy + hgt + 0.06, wz).rotation.x = -0.1;
        if (cu.aleron === 4) mesh(shell, box(wd * 0.96, 0.05, 0.3), acc, 0, wy + hgt + 0.2, wz + 0.04).rotation.x = -0.25;
      }
    }

    // escape + llamas del nitro
    const ex = cu.escape === 0 ? [0.5] : cu.escape === 1 ? [-0.5, 0.5] : [-0.62, -0.34, 0.34, 0.62];
    const er = cu.escape === 2 ? 0.065 : 0.055;
    for (const x of ex) { mesh(shell, cylZ(er, 0.22), chrome, x, S.y0(0.97) + 0.09, hl + 0.03); mesh(shell, cylZ(er * 0.65, 0.23), dark, x, S.y0(0.97) + 0.09, hl + 0.035); }
    const flameM = GFX.glowMat(hex(cu.llama));
    g.userData.flames = (ex.length > 2 ? [-0.5, 0.5] : ex.length > 1 ? ex : [-0.5, 0.5]).map((x) => {
      const f = mesh(g, geo("flame", () => new T.ConeGeometry(0.28, 1.8, 8).rotateX(Math.PI / 2)), flameM, x, 0.4, hl + 0.85);
      f.visible = false; return f;
    });

    // neón
    if (cu.neon) {
      const nc = hex(cu.neon);
      mesh(g, box(S.hwAt(0.5) * 1.7, 0.03, L * 0.9), GFX.glowMat(nc, 0.85), 0, 0.12 - drop * 0.5, 0);
      mesh(g, box(S.hwAt(0.5) * 2.3, 0.01, L * 1.15), GFX.glowMat(nc, 0.11), 0, 0.04, 0);
    }

    // arcos y ruedas
    const proto = wheelProto(cu, M, lod), wheels = [], wx = M.hw * wide - 0.1;
    for (const sx of [-1, 1]) for (const wz of M.wb) {
            const holder = new T.Group(); holder.position.set(sx * wx, M.wr, wz);
      const spin = new T.Group(), content = proto.clone(); content.scale.x = sx;
      spin.add(content); holder.add(spin); g.add(holder); wheels.push(spin);
    }
    g.userData.wheels = wheels;

    // sombra de contacto y rayos de luz de los faros
    if (!opts.noShadow) g.add(shadow(S.hwAt(0.5) * 2 + 0.9, L + 1.0));
    if (lod < 2 && !opts.noBeam) {
      const bm = mesh(g, geo("beam", () => new T.ConeGeometry(2.6, 15, 12, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -7.5)), beamMat, 0, 0.7, -hl);
      bm.renderOrder = 2;
    }
    return g;
  }

  // Autos del tráfico: mismos modelos pero más simples y con colores comunes
  const TRAFFIC_COLORS = ["#e8eaed", "#9aa0a8", "#1c1f24", "#b71c1c", "#1565c0", "#5d4037", "#cfd8dc", "#2e7d32", "#f9a825", "#37474f"];
  function buildTraffic(modelo, color) {
    return build({ modelo, color }, { color, llanta: 3, llantaTam: 0, aleron: 0 }, { lod: 2, noBeam: true });
  }

  function dispose(obj) {
    obj.traverse((o) => { if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose(); });
  }

  return { build, buildTraffic, dispose, defaultCustom, shadow, beamMat, MODELS, RIMS, RIM_SIZES, PALETTE, RIM_COLORS, FINISH, TRAFFIC_COLORS };
})();
