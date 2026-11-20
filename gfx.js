// ============================================================
//  TURBO RUSH - GRÁFICOS (shaders propios)
//  Pintura de auto con reflejos, cristales, cielo con montañas,
//  carretera con brillo, bloom y desenfoque de velocidad.
//  Se usa desde cars.js y game.js.
// ============================================================
const GFX = (() => {
  const T = THREE;
  const col = (h) => new T.Color(h);

  /* ---------------- Uniformes compartidos ---------------- */
  const U = {
    sunDir: { value: new T.Vector3(0.3, 0.42, -0.85).normalize() },
    sunCol: { value: col(0xfff2d8) },
    skyTop: { value: col(0x2f6fd0) },
    skyHor: { value: col(0xcfe6ff) },
    gndCol: { value: col(0x3f8f3a) },
    fogCol: { value: col(0xcfe6ff) },
    fogRange: { value: [70, 280] },
    time: { value: 0 },
    night: { value: 0 },
    encode: { value: 1 },          // 1 = dibuja directo a pantalla (aplica gamma); 0 = va a la textura del post-proceso
    scroll: { value: 0 }           // metros recorridos (para que la carretera "avance")
  };

  /* ---------------- GLSL común ---------------- */
  const COMMON = `
uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 skyTop; uniform vec3 skyHor; uniform vec3 gndCol; uniform vec3 fogCol;
uniform vec2 fogRange; uniform float time; uniform float night; uniform float encode; uniform float scroll;
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),f.x), mix(hash21(i+vec2(0.,1.)),hash21(i+vec2(1.,1.)),f.x), f.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*vnoise(p); p*=2.03; a*=0.5; } return v; }
vec3 envCol(vec3 r, float rough){
  float h = r.y;
  vec3 sky = mix(skyHor, skyTop, smoothstep(0.0, 0.85, h));
  vec3 gr = mix(gndCol*0.5, skyHor*0.3, smoothstep(-0.7, 0.0, h));
  vec3 c = mix(gr, sky, smoothstep(-0.05, 0.07, h));
  c += skyHor * 0.55 * exp(-abs(h)*12.0);
  float sd = max(dot(r, normalize(sunDir)), 0.0);
  c += sunCol * (pow(sd, 600.0)*14.0*(1.0-rough) + pow(sd, 22.0)*0.5*(1.0-rough));
  float band = smoothstep(0.28, 0.33, h) * (1.0 - smoothstep(0.36, 0.42, h));
  c += mix(skyHor, vec3(1.0), 0.5) * band * 0.4 * (1.0-rough) * (1.0-night*0.8);
  return c;
}
vec3 finishCol(vec3 c, float dist){
  float f = smoothstep(fogRange.x, fogRange.y, dist);
  c = mix(c, fogCol, f);
  if (encode > 0.5) c = pow(max(c, vec3(0.0)), vec3(1.0/2.2));
  return c;
}
`;

  /* ---------------- Pintura / metal / cristal de auto ---------------- */
  const CAR_VS = `
#ifdef USE_MASK
attribute vec3 aMask;
#endif
varying vec3 vN; varying vec3 vW; varying vec3 vL; varying vec3 vMask;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vL = position;
  vN = normalize(mat3(modelMatrix) * normal);
#ifdef USE_MASK
  vMask = aMask;
#else
  vMask = vec3(0.0);
#endif
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
  const CAR_FS = COMMON + `
uniform vec3 uColor; uniform vec3 uColor2; uniform vec3 uStripe; uniform vec3 uGlass;
uniform float uMetal; uniform float uRough; uniform float uClear; uniform float uFlake; uniform float uPearl;
uniform float uStripeStyle; uniform float uHood; uniform float uBeltY; uniform float uAO; uniform vec4 uArch;
varying vec3 vN; varying vec3 vW; varying vec3 vL; varying vec3 vMask;
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  if (!gl_FrontFacing) N = -N;
  float nv = max(dot(N, V), 0.0);
  float fres = pow(1.0 - nv, 4.0);
  vec3 R = reflect(-V, N);
  vec3 amb = mix(gndCol*0.5, mix(skyHor, skyTop, 0.5), N.y*0.5+0.5);
  float ndl = max(dot(N, normalize(sunDir)), 0.0);
  vec3 dif = amb*0.55 + sunCol*ndl*0.95;
  float gm = smoothstep(0.42, 0.58, vMask.x);
  float rm = smoothstep(0.42, 0.58, vMask.y);
  float hm = smoothstep(0.42, 0.58, vMask.z) * uHood;
  vec3 base = mix(uColor, uColor2, rm);
  // franjas pintadas
  float st = 0.0;
  if (uStripeStyle > 0.5 && gm < 0.5 && hm < 0.5) {
    float top = smoothstep(0.35, 0.7, N.y);
    if (uStripeStyle < 1.5) st = top * (1.0 - smoothstep(0.04, 0.055, abs(abs(vL.x) - 0.15)));
    else if (uStripeStyle < 2.5) st = top * (1.0 - smoothstep(0.15, 0.17, abs(vL.x)));
    else { float side = 1.0 - smoothstep(0.3, 0.6, abs(N.y)) ; float yy = vL.y - uBeltY;
           st = side * step(0.5, abs(N.x)) * ( (1.0 - smoothstep(0.012, 0.02, abs(yy + 0.12))) + (1.0 - smoothstep(0.03, 0.04, abs(yy + 0.2))) ); }
    base = mix(base, uStripe, clamp(st, 0.0, 1.0));
  }
  // cofre de carbono
  if (hm > 0.0) {
    vec2 cp = vW.xz * 90.0; float wv = step(0.5, fract(floor(cp.x)*0.5 + floor(cp.y)*0.5));
    vec3 carbon = vec3(0.025 + 0.02*wv);
    base = mix(base, carbon, hm);
  }
  vec3 env = envCol(R, uRough);
  vec3 c = base * dif;
  c = mix(c, env * base * 1.25, uMetal);
  c = pow(max(c, vec3(0.0)), vec3(1.06));
  if (uFlake > 0.01) {
    vec3 fp = floor(vW * 70.0);
    float fl = hash21(fp.xy + fp.z * 7.13);
    float sp = step(0.99, fl) * (0.35 + 0.65*ndl);
    c += sunCol * sp * uFlake * 0.35 * (0.3 + 0.7*nv);
  }
  c = mix(c, vec3(c.b, c.r, c.g) * 1.1 + base*0.15, fres * uPearl * 0.8);
  float cc = (0.04 + 0.96 * fres) * uClear * (1.0 - hm*0.3);
  c += env * cc;
  vec3 H = normalize(V + normalize(sunDir));
  float spec = pow(max(dot(N, H), 0.0), mix(320.0, 36.0, uRough));
  c += sunCol * spec * (1.0 - uRough) * 0.9 * (1.0 - night*0.5);
  c += skyHor * pow(1.0 - nv, 3.0) * 0.12;
  // cristales
  if (gm > 0.0) {
    vec3 gl = uGlass * (0.35 + 0.65*dif) * 0.35 + env * (0.14 + 0.86*fres) * 0.95;
    gl += sunCol * spec * 1.2;
    float trim = smoothstep(0.2, 0.45, vMask.x) * (1.0 - smoothstep(0.55, 0.8, vMask.x));
    c = mix(c, gl, gm);
    c = mix(c, vec3(0.012), trim * 0.85);
  }
  // arcos de las ruedas (huecos oscuros en los costados)
  if (uArch.w > 0.0) {
    float d = min(length(vec2(vL.z - uArch.x, vL.y - uArch.z)), length(vec2(vL.z - uArch.y, vL.y - uArch.z)));
    float inside = 1.0 - smoothstep(uArch.w - 0.02, uArch.w + 0.006, d);
    c = mix(c, vec3(0.006), inside * smoothstep(0.35, 0.6, abs(N.x)) * (1.0 - gm));
  }
  // sombra de contacto con el piso
  float ao = mix(1.0 - uAO, 1.0, smoothstep(0.05, 0.62, vW.y));
  c *= ao;
  gl_FragColor = vec4(finishCol(c, length(vW - cameraPosition)), 1.0);
}`;

  const matCache = new Map();
  // opciones: color, color2, metal, rough, clear, flake, pearl, glass(color), mask(bool), stripeStyle, stripeColor, hood, beltY, ao
  function carMat(o = {}) {
    const key = JSON.stringify(o);
    let m = matCache.get(key);
    if (m) return m;
    const u = Object.assign({}, U, {
      uColor: { value: col(o.color ?? 0x888888) }, uColor2: { value: col(o.color2 ?? o.color ?? 0x888888) },
      uStripe: { value: col(o.stripeColor ?? 0xffffff) }, uGlass: { value: col(o.glass ?? 0x0a1420) },
      uMetal: { value: o.metal ?? 0 }, uRough: { value: o.rough ?? 0.2 }, uClear: { value: o.clear ?? 0.7 },
      uFlake: { value: o.flake ?? 0 }, uPearl: { value: o.pearl ?? 0 },
      uStripeStyle: { value: o.stripeStyle ?? 0 }, uHood: { value: o.hood ? 1 : 0 }, uBeltY: { value: o.beltY ?? 0.7 }, uAO: { value: o.ao ?? 0.55 }, uArch: { value: o.arch || [0, 0, 0, 0] }
    });
    m = new T.ShaderMaterial({ uniforms: u, vertexShader: CAR_VS, fragmentShader: CAR_FS, defines: o.mask ? { USE_MASK: "" } : {}, side: 2 });
    matCache.set(key, m);
    return m;
  }

  // Material brillante que "brilla" con el bloom (faros, luces traseras, neón)
  const glowCache = new Map();
  function glowMat(color, opacity) {
    const key = color + "|" + (opacity || 1);
    let m = glowCache.get(key);
    if (!m) {
      m = new T.MeshBasicMaterial({ color });
      if (opacity) { m.transparent = true; m.opacity = opacity; m.depthWrite = false; m.blending = 2; }
      glowCache.set(key, m);
    }
    return m;
  }

  /* ---------------- Cielo con sol, nubes, montañas y ciudad ---------------- */
  const SKY = {
    mountCol: { value: col(0x5d7a9a) }, mode: { value: 0 }, cloudAmt: { value: 0.6 }, seed: { value: 3.0 }
  };
  const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const SKY_FS = COMMON + `
uniform vec3 mountCol; uniform float mode; uniform float cloudAmt; uniform float seed;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(skyHor, skyTop, pow(clamp(h, 0.0, 1.0), 0.55));
  col += skyHor * 0.3 * exp(-max(h, 0.0) * 9.0);
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  float disc = mix(smoothstep(0.9992, 0.9996, sd), smoothstep(0.9996, 0.9998, sd), night);
  col += sunCol * (pow(sd, 6.0)*0.07 + pow(sd, 48.0)*0.32 + disc * 5.0);
  if (h > 0.0) {
    vec2 cp = d.xz / (h + 0.25) * 1.7 + vec2(time * 0.012, 0.0);
    float cn = fbm(cp + seed);
    float cl = smoothstep(0.52, 0.80, cn) * cloudAmt * smoothstep(0.0, 0.22, h);
    vec3 cc = mix(vec3(1.0), skyHor, 0.35) * (0.78 + 0.35*pow(sd, 3.0));
    col = mix(col, cc * mix(1.0, 0.12, night), cl * 0.85);
  }
  if (night > 0.01 && h > 0.04) {
    vec2 sp = floor(vec2(atan(d.x, -d.z) * 160.0, h * 260.0));
    float s = step(0.9965, hash21(sp)) * smoothstep(0.04, 0.3, h);
    col += vec3(0.8, 0.85, 1.0) * s * night * 0.9;
  }
  float az = atan(d.x, -d.z);
  float ridge = -1.0; vec3 rc = mountCol; float snow = 0.0;
  if (mode < 0.5) {
    ridge = 0.012 + 0.085 * fbm(vec2(az * 1.5 + seed, 0.3)) + 0.025 * fbm(vec2(az * 6.0, 1.7));
  } else if (mode < 1.5) {
    ridge = 0.015 + 0.1 * smoothstep(0.48, 0.55, fbm(vec2(az * 2.2 + seed, 5.0))) + 0.01 * fbm(vec2(az * 12.0, 2.0));
  } else if (mode < 2.5) {
    float n = fbm(vec2(az * 2.0 + seed, 9.0));
    ridge = 0.03 + 0.2 * pow(n, 1.6);
    snow = smoothstep(ridge * 0.62, ridge * 0.72, h);
  } else if (mode < 3.5) {
    float cells = 70.0; float cell = floor(az * cells); float hg = 0.025 + 0.14 * pow(hash21(vec2(cell, 3.0)), 2.2);
    float gap = step(0.07, fract(az * cells));
    ridge = hg * gap;
    vec2 wc = vec2(az * cells * 6.0, h * 130.0);
    float win = step(0.62, hash21(floor(wc))) * step(0.15, fract(wc.x)) * step(0.2, fract(wc.y));
    rc = mix(vec3(0.02, 0.025, 0.05), vec3(1.0, 0.8, 0.45) * 1.4, win * night * 0.9);
    if (win > 0.5 && hash21(floor(wc) + 7.0) > 0.7) rc = vec3(0.4, 0.8, 1.3) * night;
  } else {
    ridge = -1.0;
  }
  if (h < ridge && h > -0.2) {
    float haze = 0.35 + 0.4 * (h / max(ridge, 0.001));
    vec3 mc = mode > 2.5 ? rc : mix(rc, fogCol, 0.4 + 0.2 * (1.0 - h / max(ridge, 0.001)));
    mc = mix(mc, vec3(0.95, 0.98, 1.0) * mix(1.0, 0.15, night), snow);
    col = mc;
  }
  if (h < -0.01) col = fogCol;
  gl_FragColor = vec4(finishCol(col, 0.0), 1.0);
}`;
  function makeSky() {
    const geo = new T.IcosahedronGeometry(1, 3);
    const m = new T.ShaderMaterial({ uniforms: Object.assign({}, U, SKY), vertexShader: SKY_VS, fragmentShader: SKY_FS, side: 1, depthTest: false, depthWrite: false, fog: false });
    const mesh = new T.Mesh(geo, m);
    mesh.scale.setScalar(380); mesh.renderOrder = -1000; mesh.frustumCulled = false;
    return mesh;
  }

  /* ---------------- Suelo, carretera y barandales ---------------- */
  const WORLD_VS = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const ROAD = { roadHalf: { value: 6 }, laneW: { value: 3 }, lanes: { value: 4 }, wet: { value: 0 }, roadLight: { value: 1 } };
  const GROUND_FS = COMMON + `
uniform float roadHalf; uniform vec3 shoulder; varying vec3 vW;
void main(){
  vec2 p = vec2(vW.x, vW.z - scroll);
  float n1 = vnoise(p * 0.22), n2 = vnoise(p * 1.3), n3 = vnoise(p * 5.0);
  vec3 c = gndCol * (0.78 + 0.38 * n1 + 0.14 * n2 + 0.08 * n3);
  float stripe = step(0.5, fract(p.y / 18.0)) * 0.05;
  c *= 1.0 - stripe;
  float d = abs(vW.x) - roadHalf - 1.0;
  float sh = 1.0 - smoothstep(0.2, 3.5, d);
  c = mix(c, shoulder * (0.8 + 0.4 * n2), sh * 0.8);
  c *= 1.0 - 0.25 * smoothstep(0.0, 1.5, d) * (1.0 - smoothstep(1.5, 4.0, d));
  gl_FragColor = vec4(finishCol(c, length(vW - cameraPosition)), 1.0);
}`;
  const ROAD_FS = COMMON + `
uniform float roadHalf; uniform float laneW; uniform float lanes; uniform float wet; uniform float roadLight; varying vec3 vW;
void main(){
  float x = vW.x, z = vW.z - scroll;
  float g1 = vnoise(vec2(x, z) * 3.2), g2 = vnoise(vec2(x, z) * 0.35), g3 = vnoise(vec2(x, z) * 14.0);
  vec3 c = vec3(0.16, 0.165, 0.18) * (0.8 + 0.3 * g1 + 0.2 * g2 + 0.1 * g3) * roadLight;
  float lf = fract((x + roadHalf) / laneW);
  float tr = (1.0 - smoothstep(0.0, 0.12, abs(lf - 0.3))) + (1.0 - smoothstep(0.0, 0.12, abs(lf - 0.7)));
  c *= 1.0 - 0.14 * tr;
  // líneas de carril discontinuas y bordes
  float lw = 0.075;
  float k = floor((x + roadHalf) / laneW + 0.5);
  float lx = abs(x + roadHalf - k * laneW);
  float inner = (1.0 - smoothstep(lw * 0.7, lw, lx)) * step(0.5, k) * step(k, lanes - 0.5) * step(mod(z, 14.0), 4.5);
  float ex = abs(abs(x) - (roadHalf - 0.2));
  float edge = 1.0 - smoothstep(lw * 0.8, lw * 1.2, ex);
  float curb = step(roadHalf - 0.1, abs(x)) * step(abs(x), roadHalf + 1.0);
  vec3 cu = mix(vec3(0.85, 0.1, 0.1), vec3(0.95), step(0.5, fract(z / 1.6)));
  c = mix(c, vec3(0.85, 0.86, 0.88), clamp(inner + edge, 0.0, 1.0) * (0.75 + 0.25 * g1));
  c = mix(c, cu * 0.8, curb);
  // brillo del asfalto (reflejo del cielo y de las luces)
  vec3 V = normalize(cameraPosition - vW);
  vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
  float fr = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
  vec3 env = envCol(R, 0.5);
  c += env * (0.05 + 0.85 * fr * (0.15 + 0.85 * wet)) * (0.6 + 0.4 * g1);
  c += sunCol * pow(max(dot(R, normalize(sunDir)), 0.0), 30.0) * (0.15 + 0.6 * wet);
  gl_FragColor = vec4(finishCol(c, length(vW - cameraPosition)), 1.0);
}`;
  const RAIL_FS = COMMON + `
varying vec3 vW;
void main(){
  float z = vW.z - scroll;
  float y = vW.y;
  vec3 steel = vec3(0.62, 0.66, 0.72);
  float band = smoothstep(0.35, 0.45, y) * (1.0 - smoothstep(0.7, 0.8, y));
  vec3 c = mix(vec3(0.18, 0.2, 0.24), steel, band);
  c += envCol(vec3(0.0, 0.3, -1.0), 0.4) * 0.15 * band;
  float stripe = step(0.5, fract(z / 8.0));
  c = mix(c, vec3(0.95, 0.35, 0.1), band * stripe * 0.25);
  gl_FragColor = vec4(finishCol(c * (0.65 + 0.35 * (1.0 - night * 0.5)), length(vW - cameraPosition)), 1.0);
}`;
  function worldMat(fs, extra) {
    return new T.ShaderMaterial({ uniforms: Object.assign({}, U, ROAD, extra || {}), vertexShader: WORLD_VS, fragmentShader: fs });
  }
  const groundMat = () => worldMat(GROUND_FS, { shoulder: { value: col(0x8a8274) } });
  const roadMat = () => { const m = worldMat(ROAD_FS); m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; return m; };
  const railMat = () => worldMat(RAIL_FS);
  const FLOOR_FS = COMMON + `uniform vec3 accent; varying vec3 vW;
void main(){
  float r = length(vW.xz);
  vec3 c = mix(vec3(0.035, 0.05, 0.1), vec3(0.008, 0.01, 0.025), smoothstep(2.0, 10.0, r));
  float ring = (1.0 - smoothstep(0.0, 0.035, abs(r - 3.4))) + (1.0 - smoothstep(0.0, 0.05, abs(r - 5.0))) * 0.7 + (1.0 - smoothstep(0.0, 0.07, abs(r - 7.2))) * 0.4;
  c += accent * ring * 1.1;
  c += accent * 0.1 * exp(-r * r / 7.0);
  float a = mix(0.7, 0.97, smoothstep(0.0, 9.0, r));
  gl_FragColor = vec4(finishCol(c, 0.0), a);
}`;
  const floorMat = () => { const m = worldMat(FLOOR_FS, { accent: { value: col(0x2aa8ff) } }); m.transparent = true; m.depthWrite = false; return m; };

  /* ---------------- Biomas: parámetros del ambiente ---------------- */
  const ENV = [
    { name: "Campo",    skyTop: 0x2f6fd0, skyHor: 0xcfe6ff, gnd: 0x3f8f3a, fog: 0xcfe6ff, sun: 0xfff2d8, dir: [0.3, 0.42, -0.85], mount: 0x5d7a9a, mode: 0, cloud: 0.65, night: 0, wet: 0.0, road: 1.0, bloom: 0.4, shoulder: 0x8a8274, light: 1.0 },
    { name: "Desierto", skyTop: 0x4a8fd8, skyHor: 0xffe0b0, gnd: 0xd2a060, fog: 0xf4dcb4, sun: 0xfff0c0, dir: [0.2, 0.36, -0.9], mount: 0xb5723e, mode: 1, cloud: 0.25, night: 0, wet: 0.0, road: 1.05, bloom: 0.45, shoulder: 0xb09868, light: 1.05 },
    { name: "Nieve",    skyTop: 0x7fa6cf, skyHor: 0xe4eef7, gnd: 0xeaf1f6, fog: 0xdde8f2, sun: 0xffffff, dir: [0.2, 0.3, -0.9], mount: 0x9fb4c8, mode: 2, cloud: 0.85, night: 0, wet: 0.15, road: 0.95, bloom: 0.3, shoulder: 0xcfd8e0, light: 1.0 },
    { name: "Ciudad",   skyTop: 0x050816, skyHor: 0x2a1b52, gnd: 0x0c0e1e, fog: 0x1a1438, sun: 0x9fb4ff, dir: [-0.3, 0.5, -0.8], mount: 0x0a0c1c, mode: 3, cloud: 0.0, night: 1, wet: 0.7, road: 0.7, bloom: 1.15, shoulder: 0x2a2c3c, light: 0.4 },
    { name: "Atardecer", skyTop: 0x2b2f7a, skyHor: 0xff9a5a, gnd: 0x4a3a40, fog: 0xff9a6a, sun: 0xffb070, dir: [0.0, 0.13, -1.0], mount: 0x2a1f3d, mode: 0, cloud: 0.7, night: 0.25, wet: 0.3, road: 0.85, bloom: 0.95, shoulder: 0x6a5a58, light: 0.7 },
    { name: "Estudio", skyTop: 0x070b1c, skyHor: 0x1d3170, gnd: 0x05060c, fog: 0x070b1c, sun: 0xbcd0ff, dir: [0.4, 0.55, -0.7], mount: 0x05060c, mode: 4, cloud: 0.0, night: 0.5, wet: 0.0, road: 1.0, bloom: 1.0, shoulder: 0x000000, light: 0.9 }
  ];
  const cur = { skyTop: col(0), skyHor: col(0), gnd: col(0), fog: col(0), sun: col(0), mount: col(0), shoulder: col(0), dir: new T.Vector3(), mode: 0, cloud: 0, night: 0, wet: 0, road: 1, bloom: 0.5, light: 1 };
  let curIdx = -1;
  function applyEnv(i, k) {
    const e = ENV[i];
    if (curIdx < 0) k = 1;
    cur.skyTop.lerp(col(e.skyTop), k); cur.skyHor.lerp(col(e.skyHor), k); cur.gnd.lerp(col(e.gnd), k); cur.fog.lerp(col(e.fog), k);
    cur.sun.lerp(col(e.sun), k); cur.mount.lerp(col(e.mount), k); cur.shoulder.lerp(col(e.shoulder), k);
    const d = new T.Vector3(e.dir[0], e.dir[1], e.dir[2]); cur.dir.lerp(d, k).normalize();
    for (const n of ["cloud", "night", "wet", "road", "bloom", "light"]) cur[n] += (e[n] - cur[n]) * k;
    if (curIdx !== i) { curIdx = i; cur.mode = e.mode; }          // la forma del horizonte cambia de golpe (queda oculta por la bruma)
    U.skyTop.value.copy(cur.skyTop); U.skyHor.value.copy(cur.skyHor); U.gndCol.value.copy(cur.gnd); U.fogCol.value.copy(cur.fog);
    U.sunCol.value.copy(cur.sun); U.sunDir.value.copy(cur.dir); U.night.value = cur.night;
    SKY.mountCol.value.copy(cur.mount); SKY.mode.value = cur.mode; SKY.cloudAmt.value = cur.cloud;
    ROAD.wet.value = cur.wet; ROAD.roadLight.value = cur.road;
    return cur;
  }

  /* ---------------- Post-proceso: bloom + desenfoque de velocidad + viñeta ---------------- */
  const QUAD_VS = `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const BRIGHT_FS = `uniform sampler2D tex; uniform vec2 texel; uniform float thr; varying vec2 vUv;
void main(){
  vec3 c = (texture2D(tex, vUv + texel*vec2(-1.,-1.)).rgb + texture2D(tex, vUv + texel*vec2(1.,-1.)).rgb + texture2D(tex, vUv + texel*vec2(-1.,1.)).rgb + texture2D(tex, vUv + texel*vec2(1.,1.)).rgb) * 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(thr, thr + 0.25, l);
  gl_FragColor = vec4(c * k, 1.0);
}`;
  const BLUR_FS = `uniform sampler2D tex; uniform vec2 dir; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tex, vUv).rgb * 0.227;
  c += (texture2D(tex, vUv + dir*1.385).rgb + texture2D(tex, vUv - dir*1.385).rgb) * 0.3162;
  c += (texture2D(tex, vUv + dir*3.231).rgb + texture2D(tex, vUv - dir*3.231).rgb) * 0.0703;
  gl_FragColor = vec4(c, 1.0);
}`;
  const COMP_FS = `uniform sampler2D tScene; uniform sampler2D tBloomA; uniform sampler2D tBloomB; uniform vec2 texel;
uniform float bloom; uniform float speed; uniform float nitro; uniform float time; uniform float vign; uniform float night; uniform float useFx;
varying vec2 vUv;
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 fetch(vec2 uv){ return texture2D(tScene, uv).rgb; }
vec3 fxaa(vec2 uv, vec2 px){
  vec3 nw = fetch(uv + vec2(-1.,-1.)*px), ne = fetch(uv + vec2(1.,-1.)*px), sw = fetch(uv + vec2(-1.,1.)*px), se = fetch(uv + vec2(1.,1.)*px), m = fetch(uv);
  float lnw = luma(nw), lne = luma(ne), lsw = luma(sw), lse = luma(se), lm = luma(m);
  float lmin = min(lm, min(min(lnw, lne), min(lsw, lse))), lmax = max(lm, max(max(lnw, lne), max(lsw, lse)));
  vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), ((lnw + lsw) - (lne + lse)));
  float dr = max((lnw + lne + lsw + lse) * 0.03125, 0.0078125);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + dr);
  dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * px;
  vec3 a = 0.5 * (fetch(uv + dir * (1.0/3.0 - 0.5)) + fetch(uv + dir * (2.0/3.0 - 0.5)));
  vec3 b = a * 0.5 + 0.25 * (fetch(uv + dir * -0.5) + fetch(uv + dir * 0.5));
  float lb = luma(b);
  return (lb < lmin || lb > lmax) ? a : b;
}
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
void main(){
  vec2 c = vUv - 0.5; float r = length(c);
  vec3 col = fxaa(vUv, texel);
  float amt = (speed * 0.032 + nitro * 0.06) * useFx;
  if (amt > 0.002) {
    vec3 acc = col; float w = 1.0;
    for (int i = 1; i < 7; i++) { float t = float(i) / 6.0; acc += fetch(vUv - c * amt * t * r * 2.2); w += 1.0; }
    vec3 rb = acc / w;
    col = mix(col, rb, clamp(r * 3.0, 0.0, 1.0));
    float ca = amt * r * 0.18;
    col.r = mix(col.r, fetch(vUv - c * ca).r, 0.8);
    col.b = mix(col.b, fetch(vUv + c * ca).b, 0.8);
  }
  col += (texture2D(tBloomA, vUv).rgb * 0.7 + texture2D(tBloomB, vUv).rgb * 0.9) * bloom;
  col = mix(col, aces(col * 1.3), 0.7);
  float l = luma(col);
  col = mix(vec3(l), col, 1.12 + 0.1 * night);
  col *= 1.0 - vign * smoothstep(0.32, 0.9, r * 1.35);
  col += vec3(1.0, 0.42, 0.08) * nitro * smoothstep(0.25, 0.85, r) * 0.32;
  col = pow(max(col, vec3(0.0)), vec3(1.0 / 2.2));
  gl_FragColor = vec4(col, 1.0);
}`;

  const post = { on: false, ready: false, bloomOn: true, fxOn: true, nitro: 0, speed: 0 };
  function initPost() {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    post.quad = new T.Mesh(g, null); post.quad.frustumCulled = false;
    post.scene = new T.Scene(); post.scene.add(post.quad);
    post.cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mk = (fs, u) => new T.ShaderMaterial({ uniforms: u, vertexShader: QUAD_VS, fragmentShader: fs, depthTest: false, depthWrite: false });
    post.mBright = mk(BRIGHT_FS, { tex: { value: null }, texel: { value: [0, 0] }, thr: { value: 0.62 } });
    post.mBlur = mk(BLUR_FS, { tex: { value: null }, dir: { value: [0, 0] } });
    post.mComp = mk(COMP_FS, { tScene: { value: null }, tBloomA: { value: null }, tBloomB: { value: null }, texel: { value: [0, 0] }, bloom: { value: 0.5 }, speed: { value: 0 }, nitro: { value: 0 }, time: { value: 0 }, vign: { value: 0.35 }, night: { value: 0 }, useFx: { value: 1 } });
    post.ready = true;
  }
  function resizePost(w, h) {
    if (!post.ready) initPost();
    for (const k of ["rt", "a1", "a2", "b1", "b2"]) if (post[k]) post[k].dispose();
    const w4 = Math.max(2, w >> 2), h4 = Math.max(2, h >> 2), w8 = Math.max(2, w >> 3), h8 = Math.max(2, h >> 3);
    post.rt = new T.WebGLRenderTarget(w, h, { depthBuffer: true });
    post.a1 = new T.WebGLRenderTarget(w4, h4, { depthBuffer: false }); post.a2 = new T.WebGLRenderTarget(w4, h4, { depthBuffer: false });
    post.b1 = new T.WebGLRenderTarget(w8, h8, { depthBuffer: false }); post.b2 = new T.WebGLRenderTarget(w8, h8, { depthBuffer: false });
    post.w = w; post.h = h; post.w4 = w4; post.h4 = h4; post.w8 = w8; post.h8 = h8;
  }
  function pass(renderer, mat, target) {
    post.quad.material = mat; renderer.setRenderTarget(target); renderer.render(post.scene, post.cam);
  }
  function render(renderer, scene, camera) {
    if (!post.on || !post.rt) { U.encode.value = 1; renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
    U.encode.value = 0;
    renderer.setRenderTarget(post.rt); renderer.render(scene, camera);
    const bm = post.mBright, bl = post.mBlur, cm = post.mComp;
    if (post.bloomOn) {
      bm.uniforms.thr.value = 0.95 - 0.38 * cur.night;
      bm.uniforms.tex.value = post.rt.texture; bm.uniforms.texel.value = [1 / post.w, 1 / post.h];
      pass(renderer, bm, post.a1);
      bl.uniforms.tex.value = post.a1.texture; bl.uniforms.dir.value = [1 / post.w4, 0]; pass(renderer, bl, post.a2);
      bl.uniforms.tex.value = post.a2.texture; bl.uniforms.dir.value = [0, 1 / post.h4]; pass(renderer, bl, post.a1);
      bl.uniforms.tex.value = post.a1.texture; bl.uniforms.dir.value = [1 / post.w8 * 1.5, 0]; pass(renderer, bl, post.b1);
      bl.uniforms.tex.value = post.b1.texture; bl.uniforms.dir.value = [0, 1 / post.h8 * 1.5]; pass(renderer, bl, post.b2);
    }
    cm.uniforms.tScene.value = post.rt.texture; cm.uniforms.tBloomA.value = post.a1.texture; cm.uniforms.tBloomB.value = post.b2.texture;
    cm.uniforms.texel.value = [1 / post.w, 1 / post.h];
    cm.uniforms.bloom.value = post.bloomOn ? cur.bloom * post.bloomK : 0;
    cm.uniforms.speed.value = post.speed; cm.uniforms.nitro.value = post.nitro; cm.uniforms.useFx.value = post.fxOn ? 1 : 0;
    cm.uniforms.night.value = cur.night; cm.uniforms.time.value = U.time.value;
    pass(renderer, cm, null);
  }
  post.bloomK = 1;

  return { U, ENV, cur, carMat, glowMat, makeSky, groundMat, roadMat, railMat, floorMat, ROAD, applyEnv, post, resizePost, render };
})();
