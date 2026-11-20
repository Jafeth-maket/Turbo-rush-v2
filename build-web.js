// Copia los archivos del juego a la carpeta www/, que es la que Capacitor
// empaqueta dentro del APK.
const fs = require("fs"), path = require("path");
const out = path.join(__dirname, "www");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ["index.html", "style.css", "three.min.js", "config.js", "gfx.js", "cars.js", "game.js"]) {
  fs.copyFileSync(path.join(__dirname, f), path.join(out, f));
}
console.log("✔ www/ listo (index.html, style.css, three.min.js, config.js, gfx.js, cars.js, game.js)");
