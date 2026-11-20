// Ajusta el proyecto Android generado por Capacitor:
//   - pantalla siempre en horizontal (se puede girar a ambos lados)
//   - pantalla completa (sin barra de estado)
//   - ícono propio (icons/foreground.png)
// Es seguro ejecutarlo varias veces.
const fs = require("fs");
const path = require("path");

const root = __dirname;
const res = path.join(root, "android", "app", "src", "main", "res");
const manifestPath = path.join(root, "android", "app", "src", "main", "AndroidManifest.xml");
const BG = "#2e7d32"; // color de fondo del ícono

if (!fs.existsSync(manifestPath)) {
  console.error("No existe la carpeta android/. Ejecuta primero: npx cap add android");
  process.exit(1);
}

// 1) Orientación horizontal (reemplaza cualquier orientación anterior)
let m = fs.readFileSync(manifestPath, "utf8");
if (/android:screenOrientation="[^"]*"/.test(m)) {
  m = m.replace(/android:screenOrientation="[^"]*"/, 'android:screenOrientation="sensorLandscape"');
} else {
  m = m.replace('android:name=".MainActivity"', 'android:name=".MainActivity"\n            android:screenOrientation="sensorLandscape"');
}
if (!m.includes("android.permission.VIBRATE")) {
  m = m.replace("<application", '<uses-permission android:name="android.permission.VIBRATE" />\n    <application');
}
fs.writeFileSync(manifestPath, m);
console.log("✔ Orientación horizontal + vibración");

// 2) Pantalla completa
const stylesPath = path.join(res, "values", "styles.xml");
let s = fs.readFileSync(stylesPath, "utf8");
if (!s.includes("windowFullscreen")) {
  s = s.replace('<item name="android:background">@null</item>',
    '<item name="android:background">@null</item>\n        <item name="android:windowFullscreen">true</item>');
  fs.writeFileSync(stylesPath, s);
  console.log("✔ Pantalla completa");
}

// 3) Ícono
(async () => {
  let sharp;
  try { sharp = require("sharp"); } catch (e) { console.warn("(sharp no instalado: se deja el ícono por defecto)"); return; }
  const fg = path.join(root, "icon-foreground.png");
  if (!fs.existsSync(fg)) { console.warn("(no hay icon-foreground.png: se deja el ícono por defecto)"); return; }

  fs.writeFileSync(path.join(res, "values", "ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);

  const dens = { mdpi: [108, 48], hdpi: [162, 72], xhdpi: [216, 96], xxhdpi: [324, 144], xxxhdpi: [432, 192] };
  const bg = { r: 0x2e, g: 0x7d, b: 0x32, alpha: 1 };
  for (const [d, [fgSize, icSize]] of Object.entries(dens)) {
    const dir = path.join(res, `mipmap-${d}`);
    // capa de frente (adaptativo)
    await sharp(fg).resize(fgSize, fgSize).png().toFile(path.join(dir, "ic_launcher_foreground.png"));
    // ícono clásico: se recorta la zona central y se pone sobre el color de fondo
    const square = await sharp(fg).extract({ left: 60, top: 60, width: 312, height: 312 }).resize(icSize, icSize).png().toBuffer();
    const flat = await sharp({ create: { width: icSize, height: icSize, channels: 4, background: bg } })
      .composite([{ input: square }]).png().toBuffer();
    await sharp(flat).png().toFile(path.join(dir, "ic_launcher.png"));
    const mask = Buffer.from(`<svg width="${icSize}" height="${icSize}"><circle cx="${icSize / 2}" cy="${icSize / 2}" r="${icSize / 2}" fill="#fff"/></svg>`);
    await sharp(flat).composite([{ input: mask, blend: "dest-in" }]).png().toFile(path.join(dir, "ic_launcher_round.png"));
  }
  console.log("✔ Ícono");
})();
