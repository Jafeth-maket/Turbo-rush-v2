/* ============================================================
   TURBO RUSH 3D - lógica del juego (Three.js)
   Los números (dinero, velocidades, precios) están en config.js
   Unidades del mundo: 1 unidad = 1 metro. El auto va hacia -Z.
   ============================================================ */
(() => {
"use strict";
const T = THREE;

const LANES = CONFIG.carriles;
const RC = CONFIG.carrera;               // ajustes del modo carrera
const TRAF_BEHIND = 150;                 // en carrera el tráfico sigue existiendo hasta aquí atrás (para los bots)
const LANE_W = 3;
const ROAD_W = LANES * LANE_W, ROAD_HALF = ROAD_W / 2;
const SPAWN = 260;                       // a qué distancia aparece el tráfico
const DECOR_STEP = 20, DECOR_N = 16, DECOR_LEN = DECOR_STEP * DECOR_N;
const PL = 4.3, PW = 1.9;                // largo y ancho del auto del jugador
const TILE = 14;                         // metros que cubre la textura de la carretera

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (n) => Math.round(n).toLocaleString("es");
const laneX = (i) => (i - (LANES - 1) / 2) * LANE_W;
const stage = $("stage");
const fx = $("fx"), fctx = fx.getContext("2d");

/* ---------------- Guardado ---------------- */
function defaultSave() {
  return {
    dinero: CONFIG.dineroInicial,
    autos: { [CONFIG.autos[0].id]: true },
    seleccionado: CONFIG.autos[0].id,
    mejoras: {},
    mejor: 0,
    sonido: CONFIG.sonido, musica: CONFIG.musica, vibracion: CONFIG.vibracion,
    custom: {},                       // personalización de cada auto
    dificultad: 1, calidad: 2, pista: 0, distancia: 1, tutorial: false,
    misiones: null, logros: {}, top: [], ghost: null,
    stats: { monedas: 0, metros: 0, casiChoques: 0, victorias: 0, carreras: 0, nitroSeg: 0, vmax: 0, powerups: 0, tuning: 0, survBest: 0 },
    records: { trial: 0, survive: 0 }
  };
}
function loadSave() {
  try {
    const raw = localStorage.getItem(CONFIG.saveKey);
    if (raw) {
      const s = Object.assign(defaultSave(), JSON.parse(raw));
      s.stats = Object.assign(defaultSave().stats, s.stats);
      s.records = Object.assign(defaultSave().records, s.records);
      return s;
    }
  } catch (e) {}
  return defaultSave();
}
let save = loadSave();
function persist() { try { localStorage.setItem(CONFIG.saveKey, JSON.stringify(save)); } catch (e) {} }

function upgradesOf(id) {
  save.mejoras[id] = Object.assign({ motor: 0, nitro: 0, llantas: 0 }, save.mejoras[id]);
  return save.mejoras[id];
}
function customOf(id) {
  const c = save.custom[id] = Object.assign(CARS.defaultCustom(carDef(id)), save.custom[id]);
  c.owned = c.owned || {};
  return c;
}
function carDef(id) { return CONFIG.autos.find((a) => a.id === id) || CONFIG.autos[0]; }
function carIndex(id) { return Math.max(0, CONFIG.autos.findIndex((a) => a.id === id)); }
function statsOf(id) {
  const c = carDef(id), u = upgradesOf(id), M = CONFIG.mejoras;
  return {
    vmax: c.velMax + u.motor * M.motor.velPorNivel,
    accel: c.aceleracion + u.motor * M.motor.accelPorNivel,
    nitroPower: CONFIG.nitroBase + u.nitro * M.nitro.potenciaPorNivel,
    nitroCap: CONFIG.nitroCapacidad + u.nitro * M.nitro.capacidadPorNivel,
    handling: c.agarre + u.llantas * M.llantas.agarrePorNivel
  };
}
function upgradeCost(key, level) {
  const m = CONFIG.mejoras[key];
  return Math.round(m.costoBase * Math.pow(m.crecimiento, level));
}

/* ---------------- Sonido (WebAudio, sin archivos) ---------------- */
const audio = { ctx: null, master: null, eng: null, engGain: null };
function audioInit() {
  if (audio.ctx) { if (audio.ctx.state === "suspended") audio.ctx.resume(); return; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const a = audio.ctx = new AC();
    audio.master = a.createGain(); audio.master.gain.value = 0.5; audio.master.connect(a.destination);
    audio.music = a.createGain(); audio.music.gain.value = 0.5; audio.music.connect(audio.master);
    const o = a.createOscillator(); o.type = "sawtooth"; o.frequency.value = 50;
    const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 420;
    const g = a.createGain(); g.gain.value = 0;
    o.connect(f); f.connect(g); g.connect(audio.master); o.start();
    audio.eng = o; audio.engGain = g;
  } catch (e) {}
}
function beep(freq, dur, type = "square", vol = 0.12, to) {
  if (!audio.ctx || !save.sonido) return;
  const a = audio.ctx, t = a.currentTime;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(audio.master); o.start(t); o.stop(t + dur + 0.02);
}
function crashSound() {
  if (!audio.ctx || !save.sonido) return;
  const a = audio.ctx, len = a.sampleRate * 0.5;
  const buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const s = a.createBufferSource(), g = a.createGain();
  s.buffer = buf; g.gain.value = 0.5; s.connect(g); g.connect(audio.master); s.start();
}
function noiseBurst(dur, f0, f1, vol) {
  if (!audio.ctx || !save.sonido) return;
  const a = audio.ctx, len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / len);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
  f.type = "bandpass"; f.Q.value = 1.2; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.value = vol; src.buffer = buf; src.connect(f); f.connect(g); g.connect(audio.master); src.start(t);
}
const sfx = {
  nitro: () => { noiseBurst(0.55, 400, 3200, 0.5); beep(180, 0.4, "sawtooth", 0.06, 420); },
  near: () => noiseBurst(0.22, 1800, 500, 0.35),
  power: () => [660, 880, 1320].forEach((f, i) => setTimeout(() => beep(f, 0.12, "triangle", 0.12), i * 70)),
  shield: () => { beep(500, 0.25, "sawtooth", 0.14, 120); noiseBurst(0.3, 3000, 400, 0.4); },
  coin: () => beep(900, 0.09, "square", 0.1, 1400)
};
function vibrate(ms) { if (save.vibracion && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } }

// Música de fondo generada con WebAudio: el tempo sube con la velocidad
const MUS = { next: 0, step: 0, bass: [0, 0, 12, 0, 7, 0, 12, 10, 0, 0, 12, 0, 7, 0, 10, 12], roots: [55, 43.65, 49, 41.2], arp: [0, 7, 12, 15, 12, 7, 3, 7] };
function musicNote(freq, t, dur, type, vol, cut) {
  const a = audio.ctx, o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
  o.type = type; o.frequency.value = freq; f.type = "lowpass"; f.frequency.value = cut;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(audio.music); o.start(t); o.stop(t + dur + 0.02);
}
function musicKick(t) {
  const a = audio.ctx, o = a.createOscillator(), g = a.createGain();
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
  g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g); g.connect(audio.music); o.start(t); o.stop(t + 0.18);
}
function musicHat(t) {
  const a = audio.ctx;
  if (!audio.hatBuf) {
    const len = Math.floor(a.sampleRate * 0.05), b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    audio.hatBuf = b;
  }
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  f.type = "highpass"; f.frequency.value = 6000; g.gain.value = 0.18;
  src.buffer = audio.hatBuf; src.connect(f); f.connect(g); g.connect(audio.music); src.start(t);
}
function musicTick(frac) {
  if (!audio.ctx || !save.sonido || !save.musica) return;
  const a = audio.ctx, stepDur = 60 / (112 + frac * 46) / 4;
  if (MUS.next < a.currentTime - 0.3) MUS.next = a.currentTime + 0.05;       // se atrasó (pausa): reinicia
  while (MUS.next < a.currentTime + 0.14) {
    const st = MUS.step, t = MUS.next, root = MUS.roots[(st >> 5) & 3];
    musicNote(root * Math.pow(2, MUS.bass[st & 15] / 12) * 2, t, stepDur * 0.9, "sawtooth", 0.1, 700 + frac * 1500);
    if ((st & 3) === 0) musicKick(t);
    if ((st & 3) === 2) musicHat(t);
    if (frac > 0.45 && (st & 1) === 0) musicNote(root * 8 * Math.pow(2, MUS.arp[(st >> 1) & 7] / 12), t, stepDur * 1.6, "square", 0.035, 2600);
    MUS.next += stepDur; MUS.step++;
  }
}

function setEngine(frac, on) {
  if (!audio.ctx || !audio.eng) return;
  const t = audio.ctx.currentTime;
  audio.eng.frequency.setTargetAtTime(45 + frac * 120, t, 0.05);
  audio.engGain.gain.setTargetAtTime(on && save.sonido ? 0.05 : 0, t, 0.08);
}

/* ---------------- Motor 3D: escena, cámara, luces ---------------- */
const BIOMES = [
  { ground: 0x2e7d32, sky: 0x8ec9ff, light: 1.0, road: 1.0, deco: "pine" },     // campo
  { ground: 0xc9a15a, sky: 0xf2d49b, light: 1.0, road: 1.0, deco: "desert" },   // desierto
  { ground: 0xe3edf2, sky: 0xcfe3f0, light: 0.95, road: 0.95, deco: "snow" },   // nieve
  { ground: 0x12142a, sky: 0x060813, light: 0.38, road: 0.55, deco: "city" },   // ciudad de noche
  { ground: 0x4a3a40, sky: 0xff9a5a, light: 0.7, road: 0.85, deco: "pine" }      // atardecer
];

let renderer;
try {
  renderer = new T.WebGLRenderer({ canvas: $("game"), antialias: true, powerPreference: "high-performance" });
} catch (e) {
  document.body.innerHTML = '<p style="color:#fff;padding:2em;font:18px sans-serif">Este dispositivo no puede mostrar gráficos 3D (WebGL).</p>';
  throw e;
}

const scene = new T.Scene();
scene.fog = new T.Fog(0xcfe6ff, 70, SPAWN + 20);      // solo para árboles y edificios; el resto lleva su propia niebla en el shader
const camera = new T.PerspectiveCamera(60, 1, 0.5, 500);
const hemi = new T.HemisphereLight(0xffffff, 0x556655, 1.7);
const sun = new T.DirectionalLight(0xffffff, 2.0);
sun.position.set(6, 12, 8);
scene.add(hemi, sun);

const ground = new T.Mesh(new T.PlaneGeometry(700, 1700).rotateX(-Math.PI / 2), GFX.groundMat());
ground.position.set(0, -0.15, -420);
scene.add(ground);

// carretera y barandales: se dibujan con shaders (asfalto, líneas, bordes y brillo)
const ROAD_LEN = 720;
GFX.ROAD.roadHalf.value = ROAD_HALF; GFX.ROAD.laneW.value = LANE_W; GFX.ROAD.lanes.value = LANES;
const road = new T.Mesh(new T.PlaneGeometry(ROAD_W + 2, ROAD_LEN).rotateX(-Math.PI / 2), GFX.roadMat());
road.position.set(0, 0, 40 - ROAD_LEN / 2);
scene.add(road);
const rails = new T.Group();
for (const sx of [-1, 1]) {
  const rl = new T.Mesh(new T.BoxGeometry(0.16, 0.8, ROAD_LEN), GFX.railMat());
  rl.position.set(sx * (ROAD_HALF + 1.35), 0.45, 40 - ROAD_LEN / 2); rails.add(rl);
}
scene.add(rails);
const sky = GFX.makeSky();
scene.add(sky);

/* ---------------- Modelos de autos (cajas y cilindros) ---------------- */
const G = {
  body: new T.BoxGeometry(1.9, 0.55, 4.3),
  cabin: new T.BoxGeometry(1.55, 0.5, 2.0),
  wheel: new T.CylinderGeometry(0.38, 0.38, 0.32, 14).rotateZ(Math.PI / 2),
  head: new T.BoxGeometry(0.45, 0.18, 0.08),
  stripe: new T.BoxGeometry(0.28, 0.02, 4.0),
  spoilerTop: new T.BoxGeometry(1.8, 0.07, 0.45),
  spoilerLeg: new T.BoxGeometry(0.08, 0.35, 0.1),
  glow: new T.BoxGeometry(1.6, 0.04, 4.0),
  flame: new T.ConeGeometry(0.28, 1.8, 8).rotateX(Math.PI / 2),
  cab: new T.BoxGeometry(2.3, 1.9, 2.3),
  trailer: new T.BoxGeometry(2.3, 2.7, 6.4),
  coin: new T.CylinderGeometry(0.55, 0.55, 0.12, 20).rotateZ(Math.PI / 2),
  pow: new T.IcosahedronGeometry(0.65, 0),
  powBeam: new T.BoxGeometry(0.07, 3.2, 0.07),
  shield: new T.IcosahedronGeometry(2.3, 1)
};
G.pow.userData.keep = G.powBeam.userData.keep = G.shield.userData.keep = true;
const matCache = new Map();
function lam(color) {
  if (!matCache.has(color)) matCache.set(color, new T.MeshLambertMaterial({ color }));
  return matCache.get(color);
}
const M = {
  glass: new T.MeshLambertMaterial({ color: 0x0f2030 }),
  tire: new T.MeshLambertMaterial({ color: 0x151515 }),
  head: new T.MeshBasicMaterial({ color: 0xfff3b0 }),
  tail: new T.MeshBasicMaterial({ color: 0xff2030 }),
  stripe: new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }),
  glow: new T.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.55 }),
  flame: new T.MeshBasicMaterial({ color: 0xffa000 }),
  trailer: new T.MeshLambertMaterial({ color: 0xcfd8dc }),
  coin: new T.MeshBasicMaterial({ color: 0xffd600 })
};
function add(parent, geo, mat, x, y, z) {
  const m = new T.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m;
}
function carMesh(color, tier = 0) {
  const g = new T.Group(), mat = lam(color);
  add(g, G.body, mat, 0, 0.55, 0);
  add(g, G.cabin, M.glass, 0, 1.07, 0.25);
  for (const sx of [-1, 1]) for (const z of [-1.4, 1.4]) add(g, G.wheel, M.tire, sx * 0.95, 0.38, z);
  add(g, G.head, M.head, -0.55, 0.62, -2.17); add(g, G.head, M.head, 0.55, 0.62, -2.17);
  add(g, G.head, M.tail, -0.55, 0.7, 2.17); add(g, G.head, M.tail, 0.55, 0.7, 2.17);
  if (tier >= 1) {                                   // alerón
    add(g, G.spoilerTop, mat, 0, 1.3, 1.95);
    add(g, G.spoilerLeg, mat, -0.6, 1.1, 1.95); add(g, G.spoilerLeg, mat, 0.6, 1.1, 1.95);
  }
  if (tier >= 2) add(g, G.stripe, M.stripe, 0, 0.84, -0.1);   // franja
  if (tier >= 3) add(g, G.glow, M.glow, 0, 0.12, 0);          // luz neón abajo
  g.userData.flames = [-0.5, 0.5].map((x) => {
    const f = add(g, G.flame, M.flame, x, 0.55, 3.0); f.visible = false; return f;
  });
  return g;
}
function truckMesh(color) {
  const g = new T.Group();
  const cabM = GFX.carMat({ color, rough: 0.25, clear: 0.8, ao: 0.5 });
  const glassM = GFX.carMat({ color: 0x0a1420, metal: 0.6, rough: 0.08, clear: 1, ao: 0 });
  const boxM = GFX.carMat({ color: 0xe6eaee, rough: 0.5, clear: 0.3, ao: 0.5 });
  const darkM = GFX.carMat({ color: 0x14161a, rough: 0.8, ao: 0.3 });
  add(g, G.cab, cabM, 0, 1.3, -3.4);
  add(g, new T.BoxGeometry(2.0, 0.6, 0.1), glassM, 0, 1.85, -4.58);
  add(g, G.trailer, boxM, 0, 1.9, 1.0);
  add(g, new T.BoxGeometry(1.9, 0.45, 8.4), darkM, 0, 0.55, 0.2);
  for (const sx of [-1, 1]) for (const z of [-3.4, 0.2, 1.6, 2.9]) add(g, G.wheel, darkM, sx * 1.0, 0.38, z);
  const hl = GFX.glowMat(0xfff3b0), tl = GFX.glowMat(0xff1e2e);
  add(g, G.head, hl, -0.7, 0.9, -4.58); add(g, G.head, hl, 0.7, 0.9, -4.58);
  add(g, G.head, tl, -0.7, 0.9, 4.22); add(g, G.head, tl, 0.7, 0.9, 4.22);
  g.add(CARS.shadow(3.2, 10.8));
  return g;
}

/* ---------------- Decoración a los lados ---------------- */
function windowTexture() {
  const c = document.createElement("canvas"); c.width = 64; c.height = 128;
  const x = c.getContext("2d");
  x.fillStyle = "#1a1e33"; x.fillRect(0, 0, 64, 128);
  for (let j = 0; j < 14; j++) for (let i = 0; i < 6; i++) {
    x.fillStyle = Math.random() < 0.45 ? "#ffd54a" : "#2a3150";
    x.fillRect(4 + i * 10, 4 + j * 9, 6, 5);
  }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
const bldTex = windowTexture();
const D = {
  trunk: new T.CylinderGeometry(0.25, 0.35, 1.5, 6),
  cone: new T.ConeGeometry(1.6, 4.2, 7),
  cactus: new T.CylinderGeometry(0.35, 0.4, 3, 8),
  rock: new T.IcosahedronGeometry(1, 0),
  box: new T.BoxGeometry(1, 1, 1),
  mTrunk: new T.MeshLambertMaterial({ color: 0x5d4037 }),
  mLeaf: new T.MeshLambertMaterial({ color: 0x1b5e20 }),
  mSnow: new T.MeshLambertMaterial({ color: 0xeaf4f8 }),
  mCactus: new T.MeshLambertMaterial({ color: 0x2e7d32 }),
  mRock: new T.MeshLambertMaterial({ color: 0x8d6e63 }),
  mBld: new T.MeshLambertMaterial({ color: 0x80838f, map: bldTex, emissive: 0xffffff, emissiveMap: bldTex, emissiveIntensity: 0.9 })
};
function makeDecor() {
  const g = new T.Group();
  g.userData = {
    trunk: add(g, D.trunk, D.mTrunk, 0, 0.75, 0),
    cone: add(g, D.cone, D.mLeaf, 0, 3.4, 0),
    cactus: add(g, D.cactus, D.mCactus, 0, 1.5, 0),
    rock: add(g, D.rock, D.mRock, 0, 0.5, 0),
    bld: add(g, D.box, D.mBld, 0, 5, 0)
  };
  return g;
}
function setDecorType(item, biomeIdx) {
  const u = item.userData, kind = BIOMES[biomeIdx].deco;
  for (const k of ["trunk", "cone", "cactus", "rock", "bld"]) u[k].visible = false;
  const s = rand(0.8, 1.5);
  if (kind === "pine" || kind === "snow") {
    u.trunk.visible = u.cone.visible = true;
    u.cone.material = kind === "snow" ? D.mSnow : D.mLeaf;
    item.scale.set(s, s, s);
    item.userData.off = rand(2, 14);
  } else if (kind === "desert") {
    if (Math.random() < 0.55) { u.cactus.visible = true; item.scale.set(s, s, s); }
    else { u.rock.visible = true; u.rock.scale.set(1.3, 0.8, 1.1); item.scale.set(s, s, s); }
    item.userData.off = rand(2, 16);
  } else {
    u.bld.visible = true;
    const h = rand(8, 26);
    u.bld.scale.set(rand(6, 9), h, rand(6, 9)); u.bld.position.y = h / 2;
    item.scale.set(1, 1, 1);
    item.userData.off = rand(7, 16);
  }
}
const decor = [];
for (let side = -1; side <= 1; side += 2) {
  for (let i = 0; i < DECOR_N; i++) {
    const it = makeDecor();
    it.userData.side = side;
    it.userData.z = 30 - i * DECOR_STEP + rand(-5, 5);
    setDecorType(it, 0);
    it.position.set(side * (ROAD_HALF + 2 + it.userData.off), 0, it.userData.z);
    scene.add(it); decor.push(it);
  }
}

/* ---------------- Estado ---------------- */
let state = "menu";          // menu | garage | playing | crashing | paused | over
let run = null;
const keys = { l: false, r: false, n: false };
const pad = { l: false, r: false, n: false };
const trafficGroup = new T.Group(), coinGroup = new T.Group(), debrisGroup = new T.Group(), powGroup = new T.Group();
const botGroup = new T.Group();
scene.add(trafficGroup, coinGroup, debrisGroup, botGroup, powGroup);
let lastMode = "free";

// línea de meta (cuadros) con arco
const finish = (() => {
  const c = document.createElement("canvas"); c.width = 128; c.height = 32;
  const x = c.getContext("2d");
  for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? "#111" : "#fff"; x.fillRect(i * 8, j * 8, 8, 8); }
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.magFilter = T.NearestFilter;
  const g = new T.Group(), checker = new T.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const line = new T.Mesh(new T.PlaneGeometry(ROAD_W, 2.4).rotateX(-Math.PI / 2), checker);
  line.position.y = 0.05; g.add(line);
  const post = new T.MeshLambertMaterial({ color: 0xeeeeee });
  for (const sx of [-1, 1]) add(g, new T.BoxGeometry(0.5, 7.5, 0.5), post, sx * (ROAD_HALF + 0.6), 3.75, 0);
  add(g, new T.BoxGeometry(ROAD_W + 1.7, 1.4, 0.5), checker, 0, 7.6, 0);
  g.visible = false; scene.add(g); return g;
})();
/* ---------------- Avisos, combos y power-ups ---------------- */
const noticeQ = []; let noticeBusy = false;
function notify(html) {
  noticeQ.push(html);
  if (noticeBusy) return;
  noticeBusy = true;
  const el = $("notice");
  const next = () => {
    if (!noticeQ.length) { el.classList.add("hidden"); noticeBusy = false; return; }
    el.innerHTML = noticeQ.shift(); el.classList.remove("hidden"); setTimeout(next, 2300);
  };
  next();
}
let comboTimer = 0;
function showCombo(text) {
  const el = $("combo"); el.textContent = text; el.classList.remove("hidden");
  el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
  clearTimeout(comboTimer); comboTimer = setTimeout(() => el.classList.add("hidden"), 900);
}
const powMats = {};
const POW_TYPES = Object.keys(CONFIG.powerups).filter((k) => CONFIG.powerups[k] && CONFIG.powerups[k].duracion);
function powMat(type) {
  if (!powMats[type]) powMats[type] = new T.MeshBasicMaterial({ color: CONFIG.powerups[type].color });
  return powMats[type];
}
const beamMats = {};
function beamMat(type) {
  if (!beamMats[type]) beamMats[type] = new T.MeshBasicMaterial({ color: CONFIG.powerups[type].color, transparent: true, opacity: 0.45 });
  return beamMats[type];
}
const shieldMat = new T.MeshBasicMaterial({ color: 0x40e0ff, transparent: true, opacity: 0.28, wireframe: true });
function addShield(m) {
  const sh = new T.Mesh(G.shield, shieldMat);
  sh.position.set(0, 0.8, 0); sh.scale.set(0.9, 0.7, 1.35); sh.visible = false;
  m.add(sh); m.userData.shield = sh;
}
function ghostMesh() {
  const g = new T.Group(), m = new T.MeshBasicMaterial({ color: 0x66fcf1, transparent: true, opacity: 0.35 });
  add(g, new T.BoxGeometry(1.9, 0.55, 4.3), m, 0, 0.55, 0);
  add(g, new T.BoxGeometry(1.5, 0.5, 2.0), m, 0, 1.07, 0.25);
  g.userData.flames = []; g.userData.wheels = [];
  return g;
}
function spinWheels(mesh, speedKmh, dt) {
  const w = mesh.userData.wheels;
  if (!w) return;
  const a = speedKmh / 3.6 / 0.38 * dt;
  for (let i = 0; i < w.length; i++) w[i].rotation.x -= a;
}
const fmtT = (t) => Math.floor(t / 60) + ":" + (t % 60).toFixed(1).padStart(4, "0");

let playerMesh = null, reflect = null;

/* ---------------- Sala de exhibición (menú, taller, ajustes) ---------------- */
let showroomOn = false;
const sr = { rot: 2.6, t: 0, view: "orbit", d: 9.6, h: 1.7, off: 0.17 };
const showroom = new T.Group();
{
  const floor = new T.Mesh(new T.CylinderGeometry(16, 16, 0.02, 64), GFX.floorMat());
  floor.position.y = 0.012; floor.renderOrder = 5; showroom.add(floor);
  const strip = (x, z, h, c) => { const m = new T.Mesh(new T.BoxGeometry(0.22, h, 0.22), GFX.glowMat(c)); m.position.set(x, h / 2, z); showroom.add(m); };
  strip(-7, -7, 6, 0x4fc3f7); strip(7, -7, 6, 0xff4081); strip(-11, -2, 4, 0x4fc3f7); strip(11, -2, 4, 0xff4081);
  const bar = new T.Mesh(new T.BoxGeometry(14, 0.16, 0.16), GFX.glowMat(0xdfe9ff)); bar.position.set(0, 5.2, -8); showroom.add(bar);
}
showroom.visible = false; scene.add(showroom);

function buildShow(def) {
  if (playerMesh) { scene.remove(playerMesh); CARS.dispose(playerMesh); }
  if (reflect) { scene.remove(reflect); CARS.dispose(reflect); }
  const cu = customOf(def.id);
  playerMesh = CARS.build(def, cu); addShield(playerMesh); scene.add(playerMesh);
  playerMesh.rotation.y = sr.rot;
  reflect = CARS.build(def, cu, { lod: 1, noBeam: true, noShadow: true });
  reflect.scale.y = -1; reflect.visible = showroomOn; scene.add(reflect);
}
function refreshDecorVis() {
  const q = CONFIG.calidad[save.calidad] || CONFIG.calidad[2];
  decor.forEach((d, i) => { d.visible = !showroomOn && (i * 0.618034) % 1 < q.decor; });
}
function setShowroom(on) {
  if (on === showroomOn) return;
  showroomOn = on; envForce = true;
  road.visible = ground.visible = rails.visible = !on;
  for (const g of [trafficGroup, coinGroup, powGroup, botGroup, debrisGroup]) g.visible = !on;
  showroom.visible = on; if (reflect) reflect.visible = on;
  if (on) finish.visible = false;
  refreshDecorVis();
  resize();
}
function updateShowCamera(dt) {
  const side = sr.view === "side", k = Math.min(1, dt * 3.5);
  sr.d += ((side ? 6.2 : 9.6) - sr.d) * k; sr.h += ((side ? 0.9 : 1.7) - sr.h) * k;
  if (camera.fov !== 30) { camera.fov = 30; camera.updateProjectionMatrix(); }
  camera.position.set(Math.sin(0.3) * sr.d, sr.h, Math.cos(0.3) * sr.d);
  camera.lookAt(0, side ? 0.4 : 0.6, 0);
}
function renderPost() {
  const r = run, P = GFX.post;
  if (P.on && r && !showroomOn) {
    const vref = r.st.vmax * r.st.nitroPower, racing = state === "playing" || state === "crashing" || state === "finishing";
    P.speed += ((racing ? clamp((r.speed - 120) / (vref - 120), 0, 1) : 0) - P.speed) * 0.08;
    P.nitro += ((r.nitroOn && state === "playing" ? 1 : 0) - P.nitro) * 0.15;
  } else { P.speed *= 0.9; P.nitro *= 0.9; }
  sky.position.copy(camera.position);
  GFX.render(renderer, scene, camera);
}
function postSize() {
  if (!GFX.post.on) return;
  const w = window.innerWidth, h = window.innerHeight, pr = renderer.getPixelRatio();
  const k = Math.min(1, (save.calidad === 2 ? 1600 : 1100) / (w * pr));
  GFX.resizePost(Math.max(2, Math.round(w * pr * k)), Math.max(2, Math.round(h * pr * k)));
}
let camX = 0, shake = 0;
const tmpColor = new T.Color();

function clearGroup(g) { while (g.children.length) g.remove(g.children[0]); }

function makeRun(mode = "free") {
  clearGroup(trafficGroup); clearGroup(coinGroup); clearGroup(debrisGroup); clearGroup(powGroup);
  for (const c of botGroup.children) CARS.dispose(c);
  clearGroup(botGroup);
  finish.visible = false;
  const st = statsOf(save.seleccionado), def = carDef(save.seleccionado);
  buildShow(def);
  const goal = mode === "trial" ? CONFIG.contrarreloj.metaMetros : (CONFIG.distancias[save.distancia] || RC.metaMetros);
  const r = {
    st, car: def, speed: CONFIG.velocidadInicial, dist: 0, coins: 0, nitro: st.nitroCap,
    x: 0, xv: 0, traffic: [], coinsArr: [], pows: [], spawnAcc: 0, nextGap: 40, t: 0, crashT: 0, nitroOn: false, nitroLocked: false,
    biome: 0, biomeFixed: save.pista - 1, debris: [], mode, inv: 0, bots: [], goal,
    pu: { escudo: 0, iman: 0, nitro: 0, doble: 0 }, near: 0, combo: 0, comboT: 0, nitroUsed: 0, vtop: 0, got: 0, safe: 0, sparkT: 0,
    raceT: 0, lives: CONFIG.supervivencia.vidas, rec: [[0, 0]], recT: 0, ghost: null, flushed: false, powKey: ""
  };
  if (r.biomeFixed >= 0) r.biome = r.biomeFixed;
  playerMesh.position.set(0, 0, 0); playerMesh.rotation.set(0, 0, 0);
  camX = 0; shake = 0;
  return r;
}

/* ---------------- Tamaño de pantalla ---------------- */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  if (showroomOn) camera.setViewOffset(w, h, w * sr.off, 0, w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  fx.width = Math.max(2, Math.round(w / 2)); fx.height = Math.max(2, Math.round(h / 2));
  postSize();
  // Horizontal: la interfaz se escala según el alto. Vertical (respaldo): según el ancho.
  const px = w >= h ? clamp(h / 24, 11, 26) : Math.max(11, 16 * Math.min(w, h * 0.5625) / 360);
  stage.style.fontSize = px + "px";
}
window.addEventListener("resize", resize);

/* ---------------- Estadísticas, misiones diarias y logros ---------------- */
const dayKey = () => { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); };
function seeded(seed) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
}
const missionDef = (id) => CONFIG.misiones.pool.find((m) => m.id === id) || CONFIG.misiones.pool[0];
function ensureMissions() {
  const k = dayKey();
  if (save.misiones && save.misiones.dia === k) return save.misiones;
  const rnd = seeded(k), pool = CONFIG.misiones.pool.slice(), lista = [];
  for (let i = 0; i < 3; i++) {
    const m = pool.splice((rnd() * pool.length) | 0, 1)[0];
    lista.push({ id: m.id, tier: i, prog: 0, cobrada: false });      // una fácil, una media y una difícil
  }
  save.misiones = { dia: k, lista }; persist();
  return save.misiones;
}
function bump(stat, n, isMax) {
  if (stat in save.stats) save.stats[stat] = isMax ? Math.max(save.stats[stat], n) : save.stats[stat] + n;
  for (const m of ensureMissions().lista) {
    if (missionDef(m.id).stat !== stat) continue;
    m.prog = isMax ? Math.max(m.prog, n) : m.prog + n;
  }
}
function flushStats(wins) {
  const r = run;
  if (!r || r.flushed) return;
  r.flushed = true;
  bump("monedas", r.coins); bump("metros", Math.floor(r.dist)); bump("casiChoques", r.near); bump("nitroSeg", r.nitroUsed);
  bump("powerups", r.got); bump("vmax", Math.round(r.vtop), true); bump("vmaxRun", Math.round(r.vtop), true);
  if (wins) bump("victorias", wins);
  checkAchievements();
  persist();
}
const statValue = (stat) => (stat === "autos" ? Object.keys(save.autos).length : save.stats[stat] || 0);
function checkAchievements() {
  for (const l of CONFIG.logros) {
    if (save.logros[l.id] || statValue(l.stat) < l.meta) continue;
    save.logros[l.id] = true; save.dinero += l.premio;
    notify(`🏆 ${l.nombre} · +${fmt(l.premio)} 💰`);
  }
  persist();
}
function claimMission(i) {
  const m = ensureMissions().lista[i], d = missionDef(m.id);
  if (!m || m.cobrada || m.prog < d.metas[m.tier]) return;
  m.cobrada = true; save.dinero += CONFIG.misiones.premios[m.tier];
  beep(600, 0.15, "triangle", 0.15, 1200); persist(); renderProgress();
}

/* ---------------- Efectos de velocidad (líneas en los bordes y viñeta de nitro) ---------------- */
const streaks = [];
function drawFx(dt) {
  const w = fx.width, h = fx.height;
  fctx.clearRect(0, 0, w, h);
  const r = run;
  if (!r || (state !== "playing" && state !== "crashing" && state !== "finishing" && state !== "countdown")) return;
  const vref = r.st.vmax * r.st.nitroPower;
  const k = clamp((r.speed - 90) / (vref - 90), 0, 1) + (r.nitroOn ? 0.35 : 0);
  if (k < 0.1) return;
  const n = Math.round(CONFIG.calidad[save.calidad].lineas * Math.min(1, k));
  const cx = w / 2, cy = h * 0.42, R = Math.hypot(w, h) * 0.6;
  fctx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const s = streaks[i] || (streaks[i] = { a: rand(0, Math.PI * 2), d: rand(0.3, 1), v: rand(0.7, 1.3) });
    s.d += dt * (0.5 + k * 2.2) * s.v;
    if (s.d > 1.15) { s.a = rand(0, Math.PI * 2); s.d = rand(0.3, 0.45); s.v = rand(0.7, 1.3); }
    const len = 0.05 + k * 0.2, ca = Math.cos(s.a), sa = Math.sin(s.a) * 0.8;
    fctx.strokeStyle = `rgba(255,255,255,${(0.1 + 0.32 * Math.min(1, k)) * Math.min(1, s.d * 1.4)})`;
    fctx.lineWidth = 1 + s.d * 2;
    fctx.beginPath(); fctx.moveTo(cx + ca * R * s.d, cy + sa * R * s.d); fctx.lineTo(cx + ca * R * (s.d + len), cy + sa * R * (s.d + len)); fctx.stroke();
  }
  if (r.nitroOn) {                                       // viñeta naranja con el nitro
    const g = fctx.createRadialGradient(cx, h * 0.5, h * 0.35, cx, h * 0.5, h * 0.95);
    g.addColorStop(0, "rgba(255,120,0,0)"); g.addColorStop(1, "rgba(255,90,0,0.38)");
    fctx.fillStyle = g; fctx.fillRect(0, 0, w, h);
  }
}
function applyQuality() {
  const q = CONFIG.calidad[save.calidad] || CONFIG.calidad[2], dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(Math.min(dpr, q.resolucion));
  GFX.post.on = save.calidad >= 1; GFX.post.fxOn = save.calidad >= 2; GFX.post.bloomK = save.calidad >= 2 ? 1 : 0.8;
  refreshDecorVis();
  resize();
}

/* ---------------- Mundo ---------------- */
let envForce = true;
function envUpdate(dt) {
  GFX.U.time.value += dt;
  const idx = showroomOn ? 5 : (run ? run.biome : 0);
  const k = envForce ? 1 : Math.min(1, dt * 0.9);
  envForce = false;
  const e = GFX.applyEnv(idx, k);
  scene.fog.color.copy(e.fog);
  hemi.color.copy(e.sun).lerp(tmpColor.set(0xffffff), 0.5);
  hemi.intensity += (1.7 * e.light - hemi.intensity) * Math.min(1, dt * 0.9);
  sun.color.copy(e.sun); sun.intensity += (2.0 * e.light - sun.intensity) * Math.min(1, dt * 0.9);
  CARS.beamMat.opacity = showroomOn ? 0.0001 : 0.0001 + 0.13 * e.night;
}

function stepWorld(dt) {
  const r = run, v = r.speed / 3.6;
  r.t += dt;
  GFX.U.scroll.value += v * dt;
  r.biome = r.biomeFixed >= 0 ? r.biomeFixed : Math.floor(r.dist / CONFIG.metrosPorAmbiente) % BIOMES.length;
  for (const d of decor) {
    const u = d.userData;
    u.z += v * dt;
    if (u.z > 30) {
      u.z -= DECOR_LEN;
      setDecorType(d, r.biome);
    }
    d.position.set(u.side * (ROAD_HALF + 2 + u.off), 0, u.z);
  }
  for (const t of r.traffic) {
    t.z += (r.speed - t.speed) / 3.6 * dt;
    t.mesh.position.z = t.z;
  }
  for (let i = r.traffic.length - 1; i >= 0; i--) {
    if (r.traffic[i].z > (r.mode === "race" ? TRAF_BEHIND : 30) || r.traffic[i].z < -SPAWN - 80) { trafficGroup.remove(r.traffic[i].mesh); r.traffic.splice(i, 1); }
  }
  for (const c of r.coinsArr) {
    c.z += v * dt; c.mesh.position.z = c.z; c.mesh.rotation.y = r.t * 4 + c.p;
  }
  for (let i = r.coinsArr.length - 1; i >= 0; i--) {
    if (r.coinsArr[i].z > 14 || r.coinsArr[i].dead) { coinGroup.remove(r.coinsArr[i].mesh); r.coinsArr.splice(i, 1); }
  }
  for (const p of r.pows) {
    p.z += v * dt; p.mesh.position.set(p.x, 1.3 + Math.sin(r.t * 3 + p.ph) * 0.18, p.z);
    p.mesh.rotation.y = r.t * 3 + p.ph; p.mesh.rotation.x = r.t * 1.7;
    p.beam.position.set(p.x, 1.6, p.z);
  }
  for (let i = r.pows.length - 1; i >= 0; i--) {
    const p = r.pows[i];
    if (p.z > 14 || p.dead) { powGroup.remove(p.mesh); powGroup.remove(p.beam); r.pows.splice(i, 1); }
  }
}

const TRAFFIC_MODELS = ["hatch", "sedan", "coupe", "van", "sedan", "hatch"];
function spawnRow(zStart = -SPAWN) {
  const Tf = CONFIG.trafico, r = run;
  const lanes = [...Array(LANES).keys()].sort(() => Math.random() - 0.5);
  const pDouble = Math.min(Tf.probDobleInicial + r.dist / 20000 + (r.mode === "survive" ? r.t / 150 : 0), Tf.probDobleMax);
  const n = Math.random() < pDouble ? 2 : 1;
  const colors = [0x43a047, 0xfb8c00, 0x00acc1, 0xd81b60, 0x6d4c41, 0x546e7a, 0xc0ca33, 0x7e57c2];
  for (let i = 0; i < n; i++) {
    const lane = lanes[i];
    const truck = Math.random() < Tf.probCamion;
    let sp = rand(Tf.velMin, Tf.velMax) * (truck ? 0.8 : 1);
    // un auto nuevo nunca alcanza al que va delante en su carril
    for (const o of r.traffic) if (o.lane === lane) sp = Math.max(sp, o.speed);
    const color = colors[(Math.random() * colors.length) | 0];
    const mesh = truck ? truckMesh(color) : CARS.buildTraffic(TRAFFIC_MODELS[(Math.random() * TRAFFIC_MODELS.length) | 0], CARS.TRAFFIC_COLORS[(Math.random() * CARS.TRAFFIC_COLORS.length) | 0]);
    mesh.position.set(laneX(lane), 0, zStart);
    trafficGroup.add(mesh);
    r.traffic.push({ lane, x: laneX(lane), z: zStart, speed: sp, len: truck ? 9.2 : PL, wid: truck ? 2.3 : PW, mesh });
  }
  // monedas en un carril libre de la fila
  if (Math.random() < 0.75 && LANES > n) {
    const lane = lanes[n + ((Math.random() * (LANES - n)) | 0)];
    const cnt = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < cnt; i++) {
      const mesh = new T.Mesh(G.coin, M.coin);
      mesh.position.set(laneX(lane), 1.1, zStart - i * 5);
      coinGroup.add(mesh);
      r.coinsArr.push({ x: laneX(lane), z: zStart - i * 5, lane, p: Math.random() * 6, mesh });
    }
  }
  // power-up en un carril libre
  const pp = r.mode === "race" ? CONFIG.powerups.probCarrera : CONFIG.powerups.prob;
  if (Math.random() < pp && LANES > n) {
    const lane = lanes[n + ((Math.random() * (LANES - n)) | 0)], type = POW_TYPES[(Math.random() * POW_TYPES.length) | 0];
    const mesh = new T.Mesh(G.pow, powMat(type)), beam = new T.Mesh(G.powBeam, beamMat(type));
    mesh.position.set(laneX(lane), 1.3, zStart - 26); beam.position.set(laneX(lane), 1.6, zStart - 26);
    powGroup.add(mesh, beam);
    r.pows.push({ type, x: laneX(lane), z: zStart - 26, lane, ph: Math.random() * 6, mesh, beam });
  }
  const ramp = r.mode === "survive" ? clamp(1 + r.t / CONFIG.supervivencia.rampaSegundos, 1, 1.8) : 1;
  r.nextGap = (Tf.separacionBase + r.speed * Tf.separacionPorVel + rand(0, 16)) / ramp;
}

function spawnTick(dt) {
  const r = run;
  r.spawnAcc += (r.speed / 3.6) * dt;
  if (r.spawnAcc >= r.nextGap) { r.spawnAcc = 0; spawnRow(); }
}

function updatePlay(dt) {
  const r = run, st = r.st;
  if (r.inv > 0) r.inv = Math.max(0, r.inv - dt);
  if (r.safe > 0) r.safe -= dt;
  if (r.comboT > 0) r.comboT -= dt;
  for (const k in r.pu) if (r.pu[k] > 0) r.pu[k] = Math.max(0, r.pu[k] - dt);
  if (r.mode === "trial" || r.mode === "race") r.raceT += dt;
  // Nitro: al vaciarse se BLOQUEA. Para volver a usarlo hay que soltar el botón
  // y esperar a que se recargue un mínimo (antes, al mantenerlo apretado se
  // recargaba un poquito y se volvía a encender solo, como si fuera infinito).
  const nitroPressed = pad.n || keys.n;
  if (r.nitroLocked && !nitroPressed && r.nitro >= st.nitroCap * CONFIG.nitroMinimo) r.nitroLocked = false;
  const freeNitro = r.pu.nitro > 0, wasOn = r.nitroOn;
  r.nitroOn = freeNitro || (nitroPressed && !r.nitroLocked && r.nitro > 0);
  if (freeNitro) r.nitro = Math.min(st.nitroCap, r.nitro + 25 * dt);
  else if (r.nitroOn) {
    r.nitro = Math.max(0, r.nitro - CONFIG.nitroConsumo * dt);
    if (r.nitro <= 0) { r.nitroOn = false; r.nitroLocked = true; }
  } else r.nitro = Math.min(st.nitroCap, r.nitro + CONFIG.nitroRegen * dt);
  if (r.nitroOn) r.nitroUsed += dt;
  if (r.nitroOn && !wasOn) { sfx.nitro(); vibrate(25); }
  $("nitroBar").classList.toggle("empty", !!r.nitroLocked);
  $("btnNitro").classList.toggle("locked", !!r.nitroLocked);
  // velocidad
  const target = st.vmax * (r.nitroOn ? st.nitroPower : 1);
  const acc = st.accel * (r.nitroOn ? 2.2 : 1);
  if (r.speed < target) r.speed = Math.min(target, r.speed + acc * dt);
  else r.speed = Math.max(target, r.speed - 70 * dt);
  r.vtop = Math.max(r.vtop, r.speed);
  r.dist += (r.speed / 3.6) * dt;
  // giro lateral con las flechas
  const steer = ((pad.r || keys.r) ? 1 : 0) - ((pad.l || keys.l) ? 1 : 0);
  const maxLat = CONFIG.velocidadLateral * st.handling;
  r.xv += (steer * maxLat - r.xv) * Math.min(1, dt * 10);
  r.x += r.xv * dt;
  const lim = ROAD_HALF - 1.0;
  if (r.x > lim || r.x < -lim) {                       // raspas el borde: chispas
    const side = r.x > 0 ? 1 : -1;
    r.x = side * lim; r.xv = 0;
    r.sparkT -= dt;
    if (r.speed > 60 && r.sparkT <= 0) { r.sparkT = 0.035; spark(r.x + side * 0.9, 0.3, 4); shake = Math.max(shake, 0.12); }
  }

  stepWorld(dt);
  spawnTick(dt);
  if (r.mode === "race") updateBots(dt);
  if (r.mode === "trial") { recordGhost(dt); updateGhost(); }

  // monedas (con imán y monedas dobles)
  const mag = r.pu.iman > 0, magR = CONFIG.powerups.iman.radio;
  for (const c of r.coinsArr) {
    for (const t of r.traffic) {
      if (t.lane === c.lane && Math.abs(t.z - c.z) < t.len / 2 + 1) { c.dead = true; break; }
    }
    if (!c.dead && mag && c.z > -magR && c.z < 6) { c.x += (r.x - c.x) * Math.min(1, dt * 9); c.mesh.position.x = c.x; c.lane = -1; }
    if (!c.dead && Math.abs(c.x - r.x) < 1.5 && Math.abs(c.z) < 2.4) {
      c.dead = true; r.coins += r.pu.doble > 0 ? 2 : 1;
      sfx.coin();
    }
  }
  // power-ups
  for (const p of r.pows) {
    for (const t of r.traffic) {
      if (t.lane === p.lane && Math.abs(t.z - p.z) < t.len / 2 + 1.5) { p.dead = true; break; }
    }
    if (!p.dead && Math.abs(p.x - r.x) < 1.7 && Math.abs(p.z) < 2.8) { p.dead = true; givePower(p.type); }
  }

  // colisiones y casi-choques (no hay choque mientras parpadeas tras reaparecer)
  if (r.inv <= 0) {
    const mg = CONFIG.casiChoque.margen;
    for (let i = 0; i < r.traffic.length; i++) {
      const t = r.traffic[i];
      const lx = (t.wid + PW) / 2 * 0.86, lz = (t.len + PL) / 2 * 0.92, dx = Math.abs(t.x - r.x);
      if (Math.abs(t.z) >= lz) continue;
      if (dx < lx) {
        if (r.safe > 0) continue;
        if (r.pu.escudo > 0) {                        // el escudo absorbe el choque
          r.pu.escudo = 0; r.safe = 0.5; shake = 0.9;
          burst(t.x, t.z, true); trafficGroup.remove(t.mesh); r.traffic.splice(i, 1); i--;
          sfx.shield(); vibrate(40); toast("🛡️ ¡Escudo roto!", 1200);
          continue;
        }
        crash(); return;
      } else if (!t.nm && dx < lx + mg) { t.nm = true; nearMiss(); }
    }
  }
  if ((r.mode === "race" || r.mode === "trial") && r.dist >= r.goal) { startFinish(); return; }

  setEngine(r.speed / (st.vmax * st.nitroPower), true);
  updateHud();
}

function nearMiss() {
  const r = run, C = CONFIG.casiChoque;
  r.combo = r.comboT > 0 ? r.combo + 1 : 1; r.comboT = C.comboSegundos; r.near++;
  const bonus = C.monedas * Math.min(r.combo, 5) * (r.pu.doble > 0 ? 2 : 1);
  r.coins += bonus;
  r.nitro = Math.min(r.st.nitroCap, r.nitro + r.st.nitroCap * C.nitro / 100);
  showCombo(`¡CASI! x${r.combo}  +${bonus}🪙`);
  sfx.near(); vibrate(15);
}
function givePower(type) {
  const r = run, P = CONFIG.powerups[type];
  r.pu[type] = P.duracion; r.got++;
  if (type === "nitro") { r.nitro = r.st.nitroCap; r.nitroLocked = false; }
  sfx.power(); vibrate(30);
  toast(`${P.icono} ${P.nombre}`, 1400);
}
function spark(x, y, n) {
  const r = run;
  for (let i = 0; i < n; i++) {
    const m = new T.Mesh(G.head, new T.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0xffd54f : 0xff9100 }));
    m.scale.setScalar(rand(0.4, 0.9)); m.position.set(x, y, rand(-1.8, 1.8));
    debrisGroup.add(m);
    r.debris.push({ m, vx: rand(-3, 3), vy: rand(1, 4), vz: rand(2, 9), life: 0.35, fixed: false });
  }
}
function recordGhost(dt) {
  const r = run; r.recT += dt;
  while (r.recT >= 0.2) { r.recT -= 0.2; r.rec.push([Math.round(r.dist * 10) / 10, Math.round(r.x * 100) / 100]); }
}
function ghostAt(t) {
  const d = run.ghost.data, i = t / 0.2, i0 = Math.floor(i);
  if (i0 >= d.length - 1) return d[d.length - 1];
  const f = i - i0;
  return [d[i0][0] + (d[i0 + 1][0] - d[i0][0]) * f, d[i0][1] + (d[i0 + 1][1] - d[i0][1]) * f];
}
function updateGhost() {
  const r = run, g = r.ghost;
  if (!g) return;
  const p = ghostAt(r.raceT);
  g.dist = p[0]; g.mesh.position.set(p[1], 0, r.dist - p[0]);
  g.mesh.visible = (state === "playing" || state === "crashing") && p[0] < r.goal + 20;
}

function burst(x, z, fixed) {
  const colors = [0xff9100, 0xffee58, 0xffffff, 0xff5252];
  for (let i = 0; i < 26; i++) {
    const m = new T.Mesh(G.head, new T.MeshBasicMaterial({ color: colors[(Math.random() * 4) | 0] }));
    m.scale.setScalar(rand(1, 3));
    m.position.set(x, 0.8, z);
    debrisGroup.add(m);
    run.debris.push({ m, vx: rand(-9, 9), vy: rand(3, 10), vz: rand(-14, 6), life: 1.6, fixed });
  }
}
function updateDebris(dt) {
  const r = run;
  for (let i = r.debris.length - 1; i >= 0; i--) {
    const d = r.debris[i];
    d.life -= dt; d.vy -= 22 * dt;
    d.m.position.x += d.vx * dt; d.m.position.y = Math.max(0.05, d.m.position.y + d.vy * dt);
    d.m.position.z += d.vz * dt + (d.fixed ? r.speed / 3.6 * dt : 0);   // fixed: se queda en la carretera
    if (d.life <= 0) { debrisGroup.remove(d.m); r.debris.splice(i, 1); }
  }
}

function crash() {
  state = "crashing";
  run.crashT = 1.1; run.nitroOn = false; shake = 1;
  pad.n = pad.l = pad.r = false;
  for (const id of ["btnNitro", "btnLeft", "btnRight"]) $(id).classList.remove("on", "locked");
  $("nitroBar").classList.remove("empty");
  burst(run.x, 0, false);
  crashSound(); setEngine(0, false);
  vibrate(200);
  if (run.mode === "survive") run.lives--;
}

function updateCrash(dt) {
  const r = run, rl = r.mode !== "free";            // en carrera, contrarreloj y supervivencia reapareces en el mismo lugar
  r.crashT -= dt; shake = Math.max(0, shake - dt * 1.4);
  if (r.mode === "trial" || r.mode === "race") r.raceT += dt;
  r.speed = Math.max(0, r.speed - (rl ? 900 : 330) * dt);   // frena casi en seco
  if (rl) r.dist += (r.speed / 3.6) * dt;
  stepWorld(dt);
  if (rl) { spawnTick(dt); if (r.mode === "race") updateBots(dt); if (r.mode === "trial") { recordGhost(dt); updateGhost(); } updateHud(); }
  playerMesh.rotation.y += 9 * dt;
  playerMesh.position.y = Math.max(0, Math.sin((1.1 - r.crashT) * 5) * 1.2);
  if (r.crashT <= 0) {
    if (!rl) gameOver();
    else if (r.mode === "survive" && r.lives <= 0) gameOver();
    else respawnPlayer();
  }
}

// saca los vehículos de tráfico que quedarían encima de alguien que reaparece
function clearAround(z, x) {
  const r = run;
  for (let i = r.traffic.length - 1; i >= 0; i--) {
    const t = r.traffic[i];
    if (Math.abs(t.x - x) < (t.wid + PW) / 2 + 0.8 && Math.abs(t.z - z) < (t.len + PL) / 2 + 6) {
      trafficGroup.remove(t.mesh); r.traffic.splice(i, 1);
    }
  }
}

function respawnPlayer() {
  const r = run;
  r.speed = RC.velSalida; r.xv = 0; r.inv = RC.invulnerable; r.nitroOn = false; shake = 0;
  playerMesh.rotation.set(0, 0, 0); playerMesh.position.y = 0;
  clearAround(0, r.x);                       // reapareces en el MISMO lugar y carril donde chocaste
  state = "playing";
}

/* ---------------- Modo carrera: bots ---------------- */
function setupRace(r) {
  const lanes = [...Array(LANES).keys()].sort(() => Math.random() - 0.5);
  const dif = CONFIG.dificultad[save.dificultad] || CONFIG.dificultad[1];
  r.x = laneX(lanes[0]);
  r.speed = 0; r.countdown = RC.cuentaRegresiva; r.go = false;
  const models = ["gtr", "coupe", "super", "sedan", "hatch"];
  RC.rivales.slice(0, LANES - 1).forEach((d, i) => {
    const lane = lanes[i + 1], f = d.nivel * dif.nivel;
    const bd = { id: "bot" + i, modelo: models[(i + 1 + ((Math.random() * 2) | 0)) % models.length], color: d.color };
    const bc = {
      aleron: (Math.random() * 3) | 0, llanta: (Math.random() * 6) | 0, suspension: (Math.random() * 3) | 0,
      llantaColor: CARS.RIM_COLORS[(Math.random() * CARS.RIM_COLORS.length) | 0],
      franja: Math.random() < 0.4 ? 1 + ((Math.random() * 3) | 0) : 0, neon: Math.random() < 0.3 ? d.color : null
    };
    const mesh = CARS.build(bd, bc, { lod: true });
    botGroup.add(mesh);
    r.bots.push({
      name: d.nombre, color: d.color, err: Math.min(0.9, d.error * dif.error), mesh,
      vmax: r.st.vmax * f, accel: r.st.accel * (0.85 + 0.15 * f), power: r.st.nitroPower, cap: r.st.nitroCap,
      lat: CONFIG.velocidadLateral * Math.max(0.9, r.st.handling * 0.95),
      dist: 0, x: laneX(lane), xv: 0, lane, speed: 0, nitro: r.st.nitroCap, nitroLocked: false, nitroOn: false,
      state: "run", t: 0, inv: 0, threat: null, brake: 0, wander: rand(2, 5), finished: false
    });
  });
}
function setupTrial(r) {
  r.x = laneX((Math.random() * LANES) | 0); r.rec = [[0, r.x]];
  r.speed = 0; r.countdown = RC.cuentaRegresiva; r.go = false;
  if (save.ghost && save.ghost.length > 3) {
    const mesh = ghostMesh(); mesh.visible = false; botGroup.add(mesh);
    r.ghost = { mesh, data: save.ghost, dist: 0 };
  }
}

// Mira un carril: ¿qué tan libre está por delante? ¿hay un carro al lado (bloqueado)? ¿hay peligro?
function laneScan(b, lane, obs) {
  const x = laneX(lane);
  let free = Infinity, blocked = false, danger = null, dGap = Infinity;
  for (const o of obs) {
    if (o.self === b) continue;
    if (Math.abs(o.x - x) >= (o.wid + PW) / 2 + 0.3) continue;
    const half = (o.len + PL) / 2, d = o.s - b.dist;
    if (Math.abs(d) < half + 1.5) { blocked = true; free = 0; continue; }   // alguien justo al lado
    if (d < 0) continue;
    const gap = d - half, closing = (b.speed - o.v) / 3.6;
    free = Math.min(free, closing > 0 ? gap : gap + 80);
    if (closing > 0 && gap < closing + 14 && gap < dGap) { danger = o; dGap = gap; }   // ~1 s de reacción
  }
  return { free, blocked, danger };
}

function updateBots(dt) {
  const r = run, obs = [];
  for (const t of r.traffic) obs.push({ s: r.dist - t.z, x: t.x, v: t.speed, len: t.len, wid: t.wid });
  obs.push({ s: r.dist, x: r.x, v: r.speed, len: PL, wid: PW });   // los bots también esquivan al jugador
  for (const b of r.bots) if (b.state === "run") obs.push({ s: b.dist, x: b.x, v: b.speed, len: PL, wid: PW, self: b });
  for (const b of r.bots) botStep(b, dt, obs);
  syncBots();
}

function botStep(b, dt, obs) {
  const r = run;
  if (b.state === "crash") {
    b.t -= dt; b.speed = Math.max(0, b.speed - 900 * dt);
    b.dist += b.speed / 3.6 * dt;
    if (b.t <= 0) botRespawn(b);
    return;
  }
  if (b.inv > 0) b.inv -= dt;

  // --- decisión: esquivar, frenar o adelantar
  const cur = laneScan(b, b.lane, obs);
  b.brake = 0;
  if (cur.danger) {
    if (!b.threat || b.threat.o !== cur.danger) b.threat = { o: cur.danger, ignore: Math.random() < b.err };   // a veces no lo ve
    if (!b.threat.ignore) {
      let pick = -1;
      for (const k of [1, 2]) {
        let best = -1, bf = -1;
        for (const L of [b.lane - k, b.lane + k]) {
          if (L < 0 || L >= LANES) continue;
          const sc = laneScan(b, L, obs);
          if (sc.blocked || sc.danger) continue;
          if (k === 2 && laneScan(b, (L + b.lane) / 2, obs).blocked) continue;
          if (sc.free > bf) { bf = sc.free; best = L; }
        }
        if (best >= 0) { pick = best; break; }
      }
      if (pick >= 0) b.lane = pick;
      else b.brake = Math.max(30, cur.danger.v - 8);          // no hay carril libre: frena
    }
  } else {
    b.threat = null;
    b.wander -= dt;
    if (b.wander <= 0) {                                     // de vez en cuando busca un carril más libre
      b.wander = rand(2.5, 6);
      if (cur.free < 140) for (const L of [b.lane - 1, b.lane + 1]) {
        if (L < 0 || L >= LANES) continue;
        const sc = laneScan(b, L, obs);
        if (!sc.blocked && !sc.danger && sc.free > cur.free + 40) { b.lane = L; break; }
      }
    }
  }

  // --- nitro (con el mismo bloqueo al vaciarse que tú)
  if (b.nitroLocked && b.nitro >= b.cap * 0.5) b.nitroLocked = false;
  b.nitroOn = cur.free > 140 && !cur.danger && !b.nitroLocked && b.nitro > 0;
  if (b.nitroOn) {
    b.nitro = Math.max(0, b.nitro - CONFIG.nitroConsumo * dt);
    if (b.nitro <= 0) { b.nitroOn = false; b.nitroLocked = true; }
  } else b.nitro = Math.min(b.cap, b.nitro + CONFIG.nitroRegen * dt);

  // --- velocidad (con "banda elástica" para que siempre estén cerca de ti)
  let target = b.vmax * (b.nitroOn ? b.power : 1);
  if (b.brake) target = Math.min(target, b.brake);
  const ahead = b.dist - r.dist;
  if (ahead > RC.ventajaMax) target *= 0.8;
  else if (ahead > RC.ventajaMax * 0.65) target *= 0.94;
  else if (ahead < -RC.retrasoMax) target *= 1.15;
  const acc = b.accel * (b.nitroOn ? 2.2 : 1);
  if (b.speed < target) b.speed = Math.min(target, b.speed + acc * dt);
  else b.speed = Math.max(target, b.speed - 90 * dt);

  // --- movimiento
  b.xv += (clamp((laneX(b.lane) - b.x) * 6, -b.lat, b.lat) - b.xv) * Math.min(1, dt * 10);
  b.x += b.xv * dt;
  b.dist += b.speed / 3.6 * dt;
  if (!b.finished && b.dist >= r.goal) b.finished = true;

  // --- choque con el tráfico
  if (b.inv <= 0) {
    const bz = r.dist - b.dist;
    for (const t of r.traffic) {
      if (Math.abs(t.x - b.x) < (t.wid + PW) / 2 * 0.86 && Math.abs(t.z - bz) < (t.len + PL) / 2 * 0.92) { botCrash(b, bz); break; }
    }
  }
}

function botCrash(b, bz) {
  b.state = "crash"; b.t = 1.1; b.nitroOn = false; b.threat = null;
  burst(b.x, bz, true);
  toast(`<span style="color:${b.color}">●</span> ${b.name} chocó`, 1500);
}
function botRespawn(b) {
  const r = run, bz = r.dist - b.dist;
  b.state = "run"; b.speed = RC.velSalida; b.inv = RC.invulnerable; b.xv = 0;
  b.lane = clamp(Math.round(b.x / LANE_W + (LANES - 1) / 2), 0, LANES - 1);   // reaparece en el mismo lado donde chocó
  clearAround(bz, b.x);
}

function syncBots() {
  const r = run;
  for (const b of r.bots) {
    const m = b.mesh;
    m.position.x = b.x; m.position.z = r.dist - b.dist;
    if (b.state === "crash") {
      m.rotation.y = (1.1 - b.t) * 9; m.position.y = Math.max(0, Math.sin((1.1 - b.t) * 5) * 1.2);
    } else {
      m.rotation.y = -clamp(b.xv / 12, -1, 1) * 0.22; m.position.y = 0;
    }
    m.visible = b.inv > 0 ? Math.floor(r.t * 12) % 2 === 0 : true;      // parpadea mientras es invulnerable
    for (const f of m.userData.flames) { f.visible = b.nitroOn; if (b.nitroOn) f.scale.set(1, 1, 0.7 + Math.random() * 0.9); }
    spinWheels(m, b.speed, lastDt);
  }
}

/* ---------------- Modo carrera: cuenta regresiva y meta ---------------- */
function updateCountdown(dt) {
  const r = run, el = $("countdown");
  r.countdown -= dt;
  el.classList.remove("hidden");
  if (r.countdown > 0) {
    const n = Math.ceil(r.countdown);
    if (el.textContent !== String(n)) { el.textContent = n; beep(520, 0.12, "square", 0.12); }
  } else {
    el.textContent = "¡YA!"; beep(900, 0.3, "square", 0.14, 1500);
    setTimeout(() => el.classList.add("hidden"), 800);
    r.speed = RC.velSalida;
    for (const b of r.bots) b.speed = RC.velSalida;
    state = "playing";
  }
  syncBots();
}

function startFinish() {
  const r = run;
  r.place = 1 + r.bots.filter((b) => b.finished).length;        // los bots que ya cruzaron la meta llegaron antes
  r.fin = 1.6; r.nitroOn = false;
  pad.n = pad.l = pad.r = false;
  for (const id of ["btnNitro", "btnLeft", "btnRight"]) $(id).classList.remove("on", "locked");
  state = "finishing"; setEngine(0, false);
  if (r.ghost) r.ghost.mesh.visible = false;
  toast("🏁 ¡META!", 1800); beep(700, 0.4, "triangle", 0.15, 1400);
}
function updateFinish(dt) {
  const r = run;
  r.fin -= dt;
  r.speed = Math.max(0, r.speed - 60 * dt);
  r.dist += (r.speed / 3.6) * dt; r.xv = 0;
  stepWorld(dt); spawnTick(dt); if (r.mode === "race") updateBots(dt); updateHud();
  if (r.fin <= 0) raceOver();
}
function raceOver() {
  const r = run, trial = r.mode === "trial", place = r.place;
  const dif = CONFIG.dificultad[save.dificultad] || CONFIG.dificultad[1];
  let prize = trial ? CONFIG.contrarreloj.premioBase : Math.round((RC.premios[place - 1] || 0) * dif.premio), record = false;
  if (trial) {
    record = !save.records.trial || r.raceT < save.records.trial;
    if (record) { save.records.trial = r.raceT; save.ghost = r.rec.concat([[r.goal, Math.round(r.x * 100) / 100]]); prize += CONFIG.contrarreloj.premioMejora; }
  }
  const earned = r.coins * CONFIG.valorMoneda + Math.floor(r.goal / 100) * CONFIG.dineroPorBloque + prize;
  save.dinero += earned;
  if (!trial) save.stats.carreras++;
  flushStats(!trial && place === 1 ? 1 : 0);
  $("oTitle").textContent = trial ? (record ? "⏱️ ¡TIEMPO RÉCORD!" : "⏱️ ¡META!") : (place === 1 ? "🏆 ¡GANASTE!" : "🏁 META");
  $("oPlaceRow").classList.toggle("hidden", trial);
  if (!trial) $("oPlace").textContent = place + "º de " + (r.bots.length + 1);
  $("oTimeRow").classList.remove("hidden"); $("oTime").textContent = fmtT(r.raceT);
  fillOver(r.goal, r.coins, earned);
  $("overRecord").classList.toggle("hidden", !record);
  state = "over"; showScreen("over");
}
function fillOver(dist, coins, earned) {
  const r = run;
  $("oDist").textContent = fmt(dist) + " m";
  $("oCoins").textContent = coins;
  $("oNearRow").classList.toggle("hidden", !r.near); $("oNear").textContent = r.near;
  $("oEarn").textContent = "+" + fmt(earned);
  $("oTotal").textContent = fmt(save.dinero);
}

let toastTimer = 0;
function toast(html, ms = 1800) {
  const t = $("toast"); t.innerHTML = html; t.classList.remove("hidden");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), ms);
}

/* ---------------- Cámara ---------------- */
function updateCamera(dt) {
  if (showroomOn) return updateShowCamera(dt);
  const r = run, px = r ? r.x : 0;
  const vmaxRef = r ? r.st.vmax * r.st.nitroPower : 300;
  const kick = r ? clamp(r.speed / vmaxRef, 0, 1) : 0.3;
  const nit = r && r.nitroOn ? 5 : 0;
  const land = camera.aspect >= 1;
  if (land) {
    // horizontal: se fija el campo de visión vertical
    camera.fov = 50 + kick * 8 + nit;
  } else {
    const hf = (54 + kick * 10 + nit) * Math.PI / 180;
    camera.fov = clamp(2 * Math.atan(Math.tan(hf / 2) / camera.aspect) * 180 / Math.PI, 45, 100);
  }
  camera.updateProjectionMatrix();
  camX += (px * 0.55 - camX) * Math.min(1, dt * 6);
  const s = shake * 0.6 + (r && r.nitroOn ? 0.1 : 0) + (r && state === "playing" ? kick * kick * 0.025 : 0);
  const camY = land ? 5.2 : 6.4, camZ = land ? 10.5 : 12.5;
  camera.position.set(camX + rand(-1, 1) * s, camY + rand(-1, 1) * s * 0.5, camZ);
  camera.lookAt(px * 0.45, land ? -0.2 : -1.2, land ? -11 : -8);
}

function updatePlayerMesh(dt) {
  if (!run || !playerMesh) return;
  if (showroomOn) {                                  // plato giratorio
    const side = sr.view === "side";
    sr.t += dt;
    if (side) { let d = -Math.PI / 2 + Math.sin(sr.t * 0.8) * 0.12 - sr.rot; d = Math.atan2(Math.sin(d), Math.cos(d)); sr.rot += d * Math.min(1, dt * 4); }
    else sr.rot += dt * 0.45;
    playerMesh.position.set(0, 0, 0); playerMesh.rotation.y = sr.rot; playerMesh.visible = true;
    spinWheels(playerMesh, side ? 20 : 35, dt);
    for (const f of playerMesh.userData.flames) f.visible = false;
    if (playerMesh.userData.shield) playerMesh.userData.shield.visible = false;
    if (reflect) { reflect.position.set(0, 0, 0); reflect.rotation.y = sr.rot; spinWheels(reflect, side ? 20 : 35, dt); }
    return;
  }
  if (state === "playing" || state === "menu" || state === "garage" || state === "countdown" || state === "finishing" || state === "tutorial" || state === "settings" || state === "progress") {
    playerMesh.position.x = run.x;
    playerMesh.rotation.y = -clamp(run.xv / 12, -1, 1) * 0.22;
    const on = state === "playing" && run.nitroOn;
    for (const f of playerMesh.userData.flames) {
      f.visible = on;
      if (on) f.scale.set(1, 1, 0.7 + Math.random() * 0.9);
    }
    playerMesh.visible = run.inv > 0 ? Math.floor(run.t * 12) % 2 === 0 : true;   // parpadea tras reaparecer
  }
  spinWheels(playerMesh, run.speed, dt);
  const sh = playerMesh.userData.shield;
  if (sh) {
    const e = run.pu.escudo;
    sh.visible = e > 0 && (e > 3 || Math.floor(run.t * 8) % 2 === 0);
    if (sh.visible) sh.rotation.y += dt * 1.5;
  }
}

/* ---------------- HUD ---------------- */
function updateHud() {
  const r = run;
  $("hudSpeed").textContent = Math.round(r.speed);
  $("hudDist").textContent = Math.floor(r.dist);
  $("hudCoins").textContent = r.coins;
  $("nitroBar").style.width = (r.nitro / r.st.nitroCap * 100) + "%";
  if (r.mode === "race" && r.dots) {
    $("hudInfo").textContent = "🏁 " + (r.bots.filter((b) => b.dist > r.dist).length + 1) + "/" + (r.bots.length + 1);
    r.bots.forEach((b, i) => { r.dots[i].style.left = clamp(b.dist / r.goal, 0, 1) * 100 + "%"; });
    r.meDot.style.left = clamp(r.dist / r.goal, 0, 1) * 100 + "%";
  } else if (r.mode === "trial") {
    let extra = "";
    if (r.ghost) {
      const gap = r.dist - r.ghost.dist;                // metros que llevas de ventaja sobre tu fantasma
      extra = "  👻 " + (gap >= 0 ? "+" : "") + Math.round(gap) + " m";
      if (r.dots) r.dots[0].style.left = clamp(r.ghost.dist / r.goal, 0, 1) * 100 + "%";
    }
    $("hudInfo").textContent = "⏱ " + fmtT(r.raceT) + extra;
    r.meDot.style.left = clamp(r.dist / r.goal, 0, 1) * 100 + "%";
  } else if (r.mode === "survive") {
    const n = CONFIG.supervivencia.vidas;
    $("hudInfo").textContent = "❤️".repeat(Math.max(0, r.lives)) + "🖤".repeat(Math.max(0, n - r.lives)) + "  " + fmtT(r.t);
  }
  updatePowHud();
}
function updatePowHud() {
  const r = run, P = CONFIG.powerups;
  let key = "", html = "";
  for (const k of POW_TYPES) {
    if (r.pu[k] > 0) {
      const sec = Math.ceil(r.pu[k]);
      key += k + sec; html += `<div class="pow${sec <= 3 ? " low" : ""}" style="--c:#${P[k].color.toString(16).padStart(6, "0")}">${P[k].icono} ${sec}</div>`;
    }
  }
  if (key !== r.powKey) { r.powKey = key; $("hudPow").innerHTML = html; }
}
function setupRaceHud() {
  const r = run, tr = $("raceTrack"), box = r.mode === "race" || r.mode === "trial" || r.mode === "survive";
  const track = r.mode === "race" || r.mode === "trial";
  $("hudPosBox").classList.toggle("hidden", !box); tr.classList.toggle("hidden", !track);
  $("countdown").classList.add("hidden"); $("toast").classList.add("hidden"); $("combo").classList.add("hidden");
  $("hudPow").innerHTML = "";
  tr.innerHTML = ""; r.dots = null;
  if (!track) return;
  tr.innerHTML = '<i class="flag">🏁</i>';
  if (r.mode === "race") {
    r.dots = r.bots.map((b) => { const d = document.createElement("i"); d.className = "dot"; d.style.background = b.color; tr.appendChild(d); return d; });
  } else {
    r.dots = [];
    if (r.ghost) { const d = document.createElement("i"); d.className = "dot"; d.style.background = "#66fcf1"; tr.appendChild(d); r.dots.push(d); }
  }
  r.meDot = document.createElement("i"); r.meDot.className = "dot me"; tr.appendChild(r.meDot);
}

/* ---------------- Pantallas ---------------- */
function showScreen(name) {
  for (const id of ["menu", "garage", "pause", "over", "settings", "progress", "tutorial"]) $(id).classList.toggle("hidden", id !== name);
  sr.off = name === "garage" ? 0.2 : name === "menu" ? 0.15 : 0.12;
  setShowroom(name === "menu" || name === "garage" || name === "settings" || name === "progress");
  if (showroomOn) resize();
  $("hud").classList.toggle("hidden", name !== "hud");
}
function soundLabel() {
  $("btnSound2").textContent = save.sonido ? "🔊 Sonido: Sí" : "🔇 Sonido: No";
}
function showMenu() {
  run = makeRun(); run.speed = 110;
  pad.n = pad.l = pad.r = false;
  state = "menu";
  $("mMoney").textContent = fmt(save.dinero);
  $("mBest").textContent = fmt(save.mejor);
  const claim = ensureMissions().lista.filter((m) => !m.cobrada && m.prog >= missionDef(m.id).metas[m.tier]).length;
  $("btnProgress").innerHTML = "📋 PROGRESO" + (claim ? `<span class="badge">${claim}</span>` : "");
  soundLabel(); showScreen("menu"); setEngine(0, false);
}
function startRun(mode = "free") {
  audioInit(); lastMode = mode;
  run = makeRun(mode);
  pad.n = pad.l = pad.r = false;
  if (mode === "race") setupRace(run);
  if (mode === "trial") setupTrial(run);
  const rl = mode === "race" || mode === "trial";
  for (let z = rl ? -100 : -70; z > -SPAWN; z -= 55) spawnRow(z);   // tráfico ya presente al arrancar
  showScreen("hud"); setupRaceHud(); updateHud();
  if (!save.tutorial) { state = "tutorial"; tutStep = 0; showTutorial(); return; }
  state = rl ? "countdown" : "playing";
}
const TUT = [
  { ico: "👆", t: "Controles", d: "Mantén ◀ ▶ (abajo a la izquierda) para girar. Puedes usar las flechas y el nitro a la vez." },
  { ico: "🔥", t: "Nitro", d: "Mantén NITRO para ir más rápido. Si se vacía, suéltalo y espera a que se recargue un poco." },
  { ico: "🪙", t: "Monedas y power-ups", d: "Junta monedas para ganar dinero. Los orbes brillantes dan 🛡️ escudo, 🧲 imán, ⚡ nitro gratis o 💰 monedas x2." },
  { ico: "💨", t: "Casi-choques", d: "Pasa rozando a otros autos sin tocarlos: ganas monedas, nitro y combos. ¡Pero no choques!" }
];
let tutStep = 0;
function showTutorial() {
  const s = TUT[tutStep];
  $("tutIco").textContent = s.ico; $("tutTitle").textContent = s.t; $("tutText").textContent = s.d;
  $("tutBtn").textContent = tutStep === TUT.length - 1 ? "¡A correr!" : "Siguiente";
  showScreen("tutorial");
}
function tutNext() {
  if (++tutStep < TUT.length) return showTutorial();
  save.tutorial = true; persist();
  state = run.mode === "race" || run.mode === "trial" ? "countdown" : "playing";
  showScreen("hud");
}
function gameOver() {
  const r = run, surv = r.mode === "survive";
  const earned = r.coins * CONFIG.valorMoneda + Math.floor(r.dist / 100) * CONFIG.dineroPorBloque;
  const dist = Math.floor(r.dist);
  let record;
  if (surv) { record = dist > save.records.survive; if (record) save.records.survive = dist; save.stats.survBest = Math.max(save.stats.survBest, dist); }
  else {
    record = dist > save.mejor; if (record) save.mejor = dist;
    save.top.push({ m: dist, f: new Date().toLocaleDateString("es") });
    save.top.sort((a, b) => b.m - a.m); save.top = save.top.slice(0, 5);
  }
  save.dinero += earned;
  flushStats(0);
  $("oTitle").textContent = surv ? "💔 ¡SIN VIDAS!" : "¡CHOCASTE!"; $("oPlaceRow").classList.add("hidden");
  $("oTimeRow").classList.toggle("hidden", !surv); $("oTime").textContent = fmtT(r.t);
  fillOver(dist, r.coins, earned);
  $("overRecord").classList.toggle("hidden", !record);
  state = "over"; showScreen("over");
}
function pauseGame() {
  if (state !== "playing") return;
  state = "paused"; pad.n = pad.l = pad.r = false;
  for (const id of ["btnNitro", "btnLeft", "btnRight"]) $(id).classList.remove("on");
  setEngine(0, false); soundLabel(); showScreen("pause");
}
function resumeGame() { if (state === "paused") { state = "playing"; showScreen("hud"); } }

/* ---------------- Garaje (vista previa 3D) ---------------- */
let gIdx = 0, gTab = "perf";
const LIM = (() => {
  const Mj = CONFIG.mejoras, A = CONFIG.autos;
  return {
    v: Math.max(...A.map((a) => a.velMax)) + Mj.motor.max * Mj.motor.velPorNivel,
    a: Math.max(...A.map((a) => a.aceleracion)) + Mj.motor.max * Mj.motor.accelPorNivel,
    h: Math.max(...A.map((a) => a.agarre)) + Mj.llantas.max * Mj.llantas.agarrePorNivel,
    n: CONFIG.nitroBase + Mj.nitro.max * Mj.nitro.potenciaPorNivel
  };
})();
const MODEL_NAMES = { hatch: "Compacto deportivo", coupe: "Coupé fastback", sedan: "Sedán de drift", gtr: "Coupé GT", super: "Superdeportivo de motor central" };
const GTABS = [["perf", "⚙️ Rendimiento"], ["paint", "🎨 Pintura"], ["wheels", "🛞 Llantas"], ["body", "🚘 Carrocería"], ["extra", "✨ Detalles"]];
const PZ = CONFIG.personalizar, PAL = CARS.PALETTE;
const TUNE = {
  paint: [
    { k: "color", n: "Color de pintura", t: "color", vals: PAL },
    { k: "acabado", n: "Acabado", t: "list", opts: ["Normal", "Metálico", "Perlado", "Cromo"], price: PZ.acabado },
    { k: "techo", n: "Techo", t: "color", vals: PAL, none: "Igual", unlock: PZ.techo.unlock },
    { k: "acento", n: "Acentos (alerón, kit, espejos)", t: "color", vals: PAL }
  ],
  wheels: [
    { k: "llanta", n: "Estilo de rin", t: "list", opts: CARS.RIMS.map((r) => r.nombre), price: PZ.llanta },
    { k: "llantaColor", n: "Color de rin", t: "color", vals: CARS.RIM_COLORS },
    { k: "llantaTam", n: "Tamaño de rin", t: "list", opts: ['15"', '16"', '17"', '18"'], price: PZ.llantaTam },
    { k: "pinza", n: "Pinzas de freno", t: "color", vals: PAL, none: "Sin", unlock: PZ.pinza.unlock }
  ],
  body: [
    { k: "aleron", n: "Alerón", t: "list", opts: ["Ninguno", "Pato", "GT", "Alto", "Carbono"], price: PZ.aleron },
    { k: "kit", n: "Kit de carrocería", t: "list", opts: ["Original", "Lip + faldones", "Aero", "Ancho"], price: PZ.kit },
    { k: "cofre", n: "Cofre", t: "list", opts: ["Original", "Rejillas", "Toma de aire", "Carbono"], price: PZ.cofre },
    { k: "suspension", n: "Suspensión", t: "list", opts: ["Original", "Baja", "Muy baja", "Stance"], price: PZ.suspension }
  ],
  extra: [
    { k: "franja", n: "Franjas", t: "list", opts: ["Ninguna", "Doble", "Ancha", "Laterales"], price: PZ.franja },
    { k: "franjaColor", n: "Color de franjas", t: "color", vals: PAL },
    { k: "vidrio", n: "Vidrios", t: "list", opts: ["Claros", "Oscuros", "Negros"], price: PZ.vidrio },
    { k: "neon", n: "Neón bajo el auto", t: "color", vals: PAL, none: "Sin", unlock: PZ.neon.unlock },
    { k: "faros", n: "Color de faros", t: "color", vals: ["#fff3b0", "#ffffff", "#7fe9ff", "#ffe34d", "#ff5252", "#b388ff"], base: "#fff3b0", unlock: PZ.faros.unlock },
    { k: "escape", n: "Escape", t: "list", opts: ["Normal", "Doble", "Cuádruple"], price: PZ.escape },
    { k: "llama", n: "Llama del nitro", t: "color", vals: ["#ffa000", "#ff5252", "#4dd0e1", "#69f0ae", "#b388ff", "#ffffff"], base: "#ffa000", unlock: PZ.llama.unlock }
  ]
};
// precio, si está desbloqueada y si es la elegida
function optState(row, cu, val, idx) {
  let price = 0, key = row.k + ":" + (row.t === "list" ? idx : "any");
  if (row.t === "list") price = row.price[idx] || 0;
  else if (row.unlock && val !== null && val !== row.base) price = row.unlock;
  const unlocked = price === 0 || !!cu.owned[key];
  const sel = row.t === "list" ? cu[row.k] === idx : cu[row.k] === val;
  return { price, key, unlocked, sel };
}
function rowHtml(row, cu) {
  let chips = "";
  const note = row.unlock && !cu.owned[row.k + ":any"] ? ` <span style="opacity:.8">· desbloquear 💰${fmt(row.unlock)}</span>` : "";
  if (row.t === "list") {
    row.opts.forEach((nm, i) => {
      const o = optState(row, cu, i, i), dis = !o.unlocked && save.dinero < o.price;
      chips += `<button class="opt${o.sel ? " sel" : ""}${o.unlocked ? "" : " lock"}" data-act="opt" data-k="${row.k}" data-i="${i}" ${dis ? "disabled" : ""}>${nm}${o.unlocked ? "" : `<small>💰 ${fmt(o.price)}</small>`}</button>`;
    });
  } else {
    if (row.none) chips += `<button class="opt${cu[row.k] === null ? " sel" : ""}" data-act="opt" data-k="${row.k}" data-v="">${row.none}</button>`;
    for (const v of row.vals) {
      const o = optState(row, cu, v), dis = !o.unlocked && save.dinero < o.price;
      chips += `<button class="sw${o.sel ? " sel" : ""}${o.unlocked ? "" : " lock"}" style="background:${v}" data-act="opt" data-k="${row.k}" data-v="${v}" ${dis ? "disabled" : ""} aria-label="${v}"></button>`;
    }
  }
  return `<div class="crow"><div class="cl">${row.n}${note}</div><div class="cc" data-k="${row.k}">${chips}</div></div>`;
}
function tuneClick(d) {
  const c = CONFIG.autos[gIdx], cu = customOf(c.id);
  const row = Object.values(TUNE).flat().find((r) => r.k === d.k);
  if (!row || !save.autos[c.id]) return;
  const list = row.t === "list", idx = list ? +d.i : 0, val = list ? idx : (d.v === "" ? null : d.v);
  const o = optState(row, cu, val, idx);
  if (!o.unlocked) {
    if (save.dinero < o.price) return;
    save.dinero -= o.price; cu.owned[o.key] = true; save.stats.tuning++;
    beep(500, 0.12, "triangle", 0.15, 900);
    checkAchievements();
  }
  cu[row.k] = val;
  persist(); renderGarage();
}
function perfHtml(c, owned) {
  const u = upgradesOf(c.id), st = statsOf(c.id);
  const bar = (nm, f, txt) => `<div class="stat"><span>${nm}</span><div class="bar"><i style="width:${f * 100}%"></i></div><b>${txt}</b></div>`;
  let html = `<div class="stats" style="max-width:none">` +
    bar("Velocidad", st.vmax / LIM.v, Math.round(st.vmax)) + bar("Aceleración", st.accel / LIM.a, Math.round(st.accel)) +
    bar("Agarre", st.handling / LIM.h, st.handling.toFixed(2)) + bar("Nitro", st.nitroPower / LIM.n, "x" + st.nitroPower.toFixed(2)) + `</div>`;
  for (const key of Object.keys(CONFIG.mejoras)) {
    const m = CONFIG.mejoras[key], lvl = u[key];
    let btn;
    if (!owned) btn = `<button class="btn" disabled>🔒</button>`;
    else if (lvl >= m.max) btn = `<button class="btn" disabled>MAX</button>`;
    else {
      const cost = upgradeCost(key, lvl);
      btn = `<button class="btn" data-act="up" data-key="${key}" ${save.dinero < cost ? "disabled" : ""}>💰 ${fmt(cost)}</button>`;
    }
    let pips = "";
    for (let i = 0; i < m.max; i++) pips += `<i class="${i < lvl ? "f" : ""}"></i>`;
    html += `<div class="up"><div><div class="t">${m.icono} ${m.nombre} <small>Nv ${lvl}/${m.max}</small></div>` +
            `<div class="i">${m.info}</div><div class="pips">${pips}</div></div>${btn}</div>`;
  }
  return html;
}
function openGarage() {
  gIdx = carIndex(save.seleccionado);
  state = "garage"; showScreen("garage"); renderGarage();
}
function renderGarage() {
  const c = CONFIG.autos[gIdx], owned = !!save.autos[c.id];
  $("gMoney").textContent = fmt(save.dinero);
  $("gName").textContent = c.nombre; $("gModel").textContent = MODEL_NAMES[c.modelo] || "";
  buildShow(c); sr.view = gTab === "wheels" ? "side" : "orbit";
  const main = $("gMain");
  if (!owned) {
    main.textContent = "Comprar · 💰 " + fmt(c.precio);
    main.disabled = save.dinero < c.precio;
  } else if (save.seleccionado === c.id) {
    main.textContent = "✔ Seleccionado"; main.disabled = true;
  } else {
    main.textContent = "Seleccionar"; main.disabled = false;
  }
  $("gTabs").innerHTML = GTABS.map(([id, nm]) => `<button class="tab${id === gTab ? " on" : ""}" data-act="gtab" data-tab="${id}">${nm}</button>`).join("");
  const panel = $("gPanel"), top = panel.scrollTop, lefts = {};
  panel.querySelectorAll(".cc").forEach((e) => { lefts[e.dataset.k] = e.scrollLeft; });
  if (gTab === "perf") panel.innerHTML = perfHtml(c, owned);
  else if (!owned) panel.innerHTML = `<div class="note">🔒 Compra este auto para personalizarlo.</div>`;
  else { const cu = customOf(c.id); panel.innerHTML = TUNE[gTab].map((r) => rowHtml(r, cu)).join(""); }
  panel.scrollTop = top;
  panel.querySelectorAll(".cc").forEach((e) => { if (lefts[e.dataset.k]) e.scrollLeft = lefts[e.dataset.k]; });
}
function garageMain() {
  const c = CONFIG.autos[gIdx];
  if (!save.autos[c.id]) {
    if (save.dinero < c.precio) return;
    save.dinero -= c.precio; save.autos[c.id] = true; save.seleccionado = c.id;
    beep(600, 0.15, "triangle", 0.15, 1200);
    checkAchievements();
  } else save.seleccionado = c.id;
  persist(); renderGarage();
}
function garageUp(key) {
  const c = CONFIG.autos[gIdx];
  if (!save.autos[c.id]) return;
  const u = upgradesOf(c.id), m = CONFIG.mejoras[key];
  if (u[key] >= m.max) return;
  const cost = upgradeCost(key, u[key]);
  if (save.dinero < cost) return;
  save.dinero -= cost; u[key]++;
  beep(500, 0.12, "triangle", 0.15, 900);
  persist(); renderGarage();
}

/* ---------------- Ajustes ---------------- */
const cycle = (key, n) => { save[key] = (save[key] + 1) % n; };
const SETS = [
  { k: "sonido", n: "🔊 Sonido", v: () => (save.sonido ? "Sí" : "No"), tap: () => { save.sonido = !save.sonido; } },
  { k: "musica", n: "🎵 Música", v: () => (save.musica ? "Sí" : "No"), tap: () => { save.musica = !save.musica; } },
  { k: "vibracion", n: "📳 Vibración", v: () => (save.vibracion ? "Sí" : "No"), tap: () => { save.vibracion = !save.vibracion; vibrate(40); } },
  { k: "calidad", n: "🖥️ Calidad gráfica", v: () => CONFIG.calidad[save.calidad].nombre, tap: () => { cycle("calidad", CONFIG.calidad.length); applyQuality(); } },
  { k: "dificultad", n: "🤖 Dificultad de los bots", v: () => CONFIG.dificultad[save.dificultad].nombre, tap: () => cycle("dificultad", CONFIG.dificultad.length) },
  { k: "pista", n: "🛣️ Pista", v: () => CONFIG.pistas[save.pista], tap: () => cycle("pista", CONFIG.pistas.length) },
  { k: "distancia", n: "📏 Distancia de la carrera", v: () => fmt(CONFIG.distancias[save.distancia]) + " m", tap: () => cycle("distancia", CONFIG.distancias.length) },
  { k: "pantalla", n: "⛶ Pantalla completa", v: () => (document.fullscreenElement ? "Sí" : "No"), tap: () => toggleFullscreen(false) },
  { k: "tutorial", n: "📖 Tutorial", v: () => (save.tutorial ? "Ver otra vez" : "Se mostrará"), tap: () => { save.tutorial = false; notify("El tutorial saldrá en tu próxima partida"); } }
];
function openSettings() { state = "settings"; showScreen("settings"); renderSettings(); }
function renderSettings() {
  $("setList").innerHTML = SETS.map((x) => `<div class="set"><span>${x.n}</span><button class="btn ghost" data-act="set" data-key="${x.k}">${x.v()}</button></div>`).join("");
}
function settingTap(k) {
  const x = SETS.find((e) => e.k === k);
  if (!x) return;
  x.tap(); persist(); renderSettings();
  if (k === "sonido" && save.sonido) beep(700, 0.1, "square", 0.1);
}

/* ---------------- Progreso: misiones, logros y récords ---------------- */
let pTab = "mis";
function openProgress() { state = "progress"; showScreen("progress"); renderProgress(); }
function renderProgress() {
  $("pMoney").textContent = fmt(save.dinero);
  $("pTabs").innerHTML = [["mis", "📋 Misiones"], ["log", "🏆 Logros"], ["rec", "📊 Récords"]]
    .map(([id, nm]) => `<button class="tab${id === pTab ? " on" : ""}" data-act="ptab" data-tab="${id}">${nm}</button>`).join("");
  let html = "";
  if (pTab === "mis") {
    html = `<div class="hdr">MISIONES DE HOY · se renuevan cada día</div>`;
    ensureMissions().lista.forEach((m, i) => {
      const d = missionDef(m.id), meta = d.metas[m.tier], prog = Math.min(meta, Math.floor(m.prog)), ready = m.prog >= meta;
      html += `<div class="mis${m.cobrada ? " done" : ""}"><div class="t">${d.texto.replace("{n}", fmt(meta))} <small style="opacity:.6">(${fmt(prog)}/${fmt(meta)})</small></div>` +
        `<div class="pb"><i style="width:${prog / meta * 100}%"></i></div>` +
        (m.cobrada ? `<button class="btn" disabled>✔ Cobrada</button>` : `<button class="btn" data-act="claim" data-i="${i}" ${ready ? "" : "disabled"}>💰 ${fmt(CONFIG.misiones.premios[m.tier])}</button>`) + `</div>`;
    });
  } else if (pTab === "log") {
    html = `<div class="hdr">LOGROS · ${CONFIG.logros.filter((l) => save.logros[l.id]).length}/${CONFIG.logros.length}</div>`;
    for (const l of CONFIG.logros) {
      const done = !!save.logros[l.id], v = Math.min(l.meta, Math.floor(statValue(l.stat)));
      html += `<div class="mis${done ? " done" : ""}"><div class="t">${done ? "🏆" : "🔒"} ${l.nombre} <small style="opacity:.6">· ${l.desc}</small></div>` +
        `<div class="pb"><i style="width:${v / l.meta * 100}%"></i></div><button class="btn" disabled>${done ? "✔" : "💰 " + fmt(l.premio)}</button></div>`;
    }
  } else {
    const S = save.stats, R = save.records, row = (a, b) => `<div class="rec"><span>${a}</span><b>${b}</b></div>`;
    html = `<div class="hdr">MIS RÉCORDS</div>` +
      row("Mejor distancia (modo libre)", fmt(save.mejor) + " m") +
      row("Mejor contrarreloj (" + fmt(CONFIG.contrarreloj.metaMetros) + " m)", R.trial ? fmtT(R.trial) : "—") +
      row("Mejor supervivencia", R.survive ? fmt(R.survive) + " m" : "—") +
      row("Carreras ganadas / jugadas", S.victorias + " / " + S.carreras) +
      row("Casi-choques", fmt(S.casiChoques)) + row("Velocidad máxima", Math.round(S.vmax) + " km/h") +
      row("Monedas juntadas", fmt(S.monedas)) + row("Distancia total", (S.metros / 1000).toFixed(1) + " km") +
      `<div class="hdr">TOP 5 · MODO LIBRE</div>` +
      (save.top.length ? save.top.map((t, i) => row(`${i + 1}º  <small style="opacity:.6">${t.f}</small>`, fmt(t.m) + " m")).join("") : `<div class="note">Aún no hay partidas</div>`);
  }
  $("pPanel").innerHTML = html;
}


/* ---------------- Pantalla completa ---------------- */
function toggleFullscreen(force) {
  const el = document.documentElement;
  try {
    if (document.fullscreenElement) { if (!force && document.exitFullscreen) document.exitFullscreen(); return; }
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    const pr = req.call(el);
    if (pr && pr.then) pr.then(() => { if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {}); }).catch(() => {});
  } catch (e) {}
}
document.addEventListener("fullscreenchange", () => { if (state === "settings") renderSettings(); resize(); });

/* ---------------- Controles ---------------- */
// Botones en pantalla: se mantienen presionados (admite varios dedos a la vez)
function hold(el, key) {
  const on = (e) => {
    pad[key] = true; el.classList.add("on"); audioInit();
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  };
  const off = () => { pad[key] = false; el.classList.remove("on"); };
  el.addEventListener("pointerdown", on);
  el.addEventListener("pointerup", off);
  el.addEventListener("pointercancel", off);
  el.addEventListener("lostpointercapture", off);
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}
hold($("btnLeft"), "l"); hold($("btnRight"), "r"); hold($("btnNitro"), "n");
$("btnPause").addEventListener("click", pauseGame);

// Teclado (para probar en PC): ← → o A D para girar, Espacio = nitro, Esc = pausa
const KEYMAP = { ArrowLeft: "l", a: "l", A: "l", ArrowRight: "r", d: "r", D: "r", " ": "n", ArrowUp: "n", w: "n", W: "n", Shift: "n" };
window.addEventListener("keydown", (e) => {
  const k = KEYMAP[e.key];
  if (k) { keys[k] = true; e.preventDefault(); return; }
  if (e.key === "Escape" || e.key === "p" || e.key === "P") { state === "playing" ? pauseGame() : resumeGame(); }
});
window.addEventListener("keyup", (e) => { const k = KEYMAP[e.key]; if (k) keys[k] = false; });
document.addEventListener("visibilitychange", () => { if (document.hidden) pauseGame(); });

stage.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled) return;
  audioInit();
  if (["play", "race", "trial", "survive"].includes(b.dataset.act)) toggleFullscreen(true);   // al empezar a jugar pide pantalla completa
  switch (b.dataset.act) {
    case "play": startRun("free"); break;
    case "race": startRun("race"); break;
    case "trial": startRun("trial"); break;
    case "survive": startRun("survive"); break;
    case "again": startRun(lastMode); break;
    case "garage": openGarage(); break;
    case "settings": openSettings(); break;
    case "progress": openProgress(); break;
    case "tutnext": tutNext(); break;
    case "gtab": gTab = b.dataset.tab; renderGarage(); $("gPanel").scrollTop = 0; break;
    case "opt": tuneClick(b.dataset); break;
    case "set": settingTap(b.dataset.key); break;
    case "ptab": pTab = b.dataset.tab; renderProgress(); break;
    case "claim": claimMission(+b.dataset.i); break;
    case "back": case "menu": if (state === "paused") flushStats(0); showMenu(); break;
    case "resume": resumeGame(); break;
    case "sound":
      save.sonido = !save.sonido; persist(); soundLabel();
      if (save.sonido) beep(700, 0.1, "square", 0.1);
      break;
    case "prev": gIdx = (gIdx + CONFIG.autos.length - 1) % CONFIG.autos.length; renderGarage(); break;
    case "next": gIdx = (gIdx + 1) % CONFIG.autos.length; renderGarage(); break;
    case "main": garageMain(); break;
    case "up": garageUp(b.dataset.key); break;
  }
});

/* ---------------- Bucle principal ---------------- */
let last = performance.now(), lastDt = 0.016;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now; lastDt = dt;
  if (run) {
    if (state === "playing") updatePlay(dt);
    else if (state === "crashing") updateCrash(dt);
    else if (state === "countdown") updateCountdown(dt);
    else if (state === "finishing") updateFinish(dt);
    if (state !== "paused") updateDebris(dt);   // los pedazos del choque desaparecen solos
    updatePlayerMesh(dt);
    if (run.mode === "race" || run.mode === "trial") {                       // línea de meta
      const z = run.dist - run.goal;
      finish.visible = z > -SPAWN - 60 && z < 40; finish.position.z = z;
    }
    if (state === "playing" || state === "crashing" || state === "countdown" || state === "finishing") {
      musicTick(clamp(run.speed / (run.st.vmax * run.st.nitroPower), 0, 1));
    }
    envUpdate(dt);
    updateCamera(dt);
  }
  drawFx(dt);
  renderPost();
  requestAnimationFrame(frame);
}

applyQuality();
showMenu();
requestAnimationFrame(frame);

// Apoyo para pruebas/depuración desde la consola del navegador
window.TurboRush = {
  get state() { return state; }, get run() { return run; }, save: () => save,
  input: { pad, keys }, LANE_W, ROAD_HALF,
  api: { startRun, openGarage, showMenu, openSettings, openProgress, renderGarage, setGarage: (i, t) => { gIdx = i; if (t) gTab = t; }, tutNext },
  dbg: { scene, camera, road, ground, renderer }
};
})();
