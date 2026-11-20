// Junta index.html + style.css + three.min.js + config.js + game.js en UN solo archivo
// (dist/turbo-rush.html) que puedes abrir directamente en cualquier navegador.
const fs = require("fs"), path = require("path");
const www = __dirname;
const read = (f) => fs.readFileSync(path.join(www, f), "utf8");
let html = read("index.html");
html = html.replace('<link rel="stylesheet" href="style.css">', () => "<style>\n" + read("style.css") + "\n</style>");
html = html.replace('<script src="three.min.js"></script>', () => "<script>\n" + read("three.min.js") + "\n</script>");
html = html.replace('<script src="config.js"></script>', () => "<script>\n" + read("config.js") + "\n</script>");
html = html.replace('<script src="gfx.js"></script>', () => "<script>\n" + read("gfx.js") + "\n</script>");
html = html.replace('<script src="cars.js"></script>', () => "<script>\n" + read("cars.js") + "\n</script>");
html = html.replace('<script src="game.js"></script>', () => "<script>\n" + read("game.js") + "\n</script>");
const out = path.join(__dirname, "dist");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "turbo-rush.html"), html);
console.log("✔ dist/turbo-rush.html (" + Math.round(html.length / 1024) + " KB)");
