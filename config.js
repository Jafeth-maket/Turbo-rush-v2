// ============================================================
//  TURBO RUSH - CONFIGURACIÓN
//  Todo lo importante del juego se controla desde este archivo:
//  dinero, velocidad del motor, autos, mejoras, tráfico...
//  Cambia los números, guarda, y listo.
// ============================================================
const CONFIG = {
  nombreJuego: "Turbo Rush",
  saveKey: "turborush_save_v1",   // si lo cambias, el progreso guardado se reinicia

  // ---------- DINERO ----------
  dineroInicial: 0,        // dinero con el que empieza una partida nueva
  valorMoneda: 10,         // dinero por cada moneda recogida
  dineroPorBloque: 5,      // dinero extra por cada 100 m recorridos

  // ---------- CARRERA ----------
  carriles: 4,
  velocidadInicial: 90,    // km/h al arrancar
  velocidadLateral: 11,    // qué tan rápido gira el auto a los lados (metros/segundo)

  // ---------- NITRO ----------
  nitroBase: 1.30,         // multiplicador de velocidad máxima con nitro (sin mejoras)
  nitroCapacidad: 100,     // capacidad del tanque de nitro (sin mejoras)
  nitroConsumo: 30,        // cuánto se gasta por segundo
  nitroRegen: 7,           // cuánto se recarga por segundo
  nitroMinimo: 0.15,       // tras vaciarse, el nitro vuelve a poder usarse al soltar el botón y recargar este % (0.15 = 15%)

  // ---------- MODO CARRERA ----------
  carrera: {
    metaMetros: 3000,        // distancia hasta la meta
    cuentaRegresiva: 3,      // segundos de cuenta regresiva
    velSalida: 60,           // km/h al arrancar o al reaparecer tras un choque
    invulnerable: 2.0,       // segundos sin poder chocar al reaparecer (el auto parpadea)
    ventajaMax: 170,         // si un bot va más de esta distancia (m) delante tuyo, se frena
    retrasoMax: 100,         // si va más de esta distancia atrás, se acelera para alcanzarte
    premios: [500, 250, 120, 50],   // dinero por puesto (1º, 2º, 3º, 4º)
    // nivel: velocidad del bot respecto a TU auto (1.0 = igual) | error: probabilidad de NO esquivar un carro
    rivales: [
      { nombre: "Rayo",  color: "#00e5ff", nivel: 0.93, error: 0.30 },
      { nombre: "Cobra", color: "#76ff03", nivel: 0.97, error: 0.22 },
      { nombre: "Turbo", color: "#ff6d00", nivel: 1.00, error: 0.15 }
    ]
  },

  // ---------- TRÁFICO ----------
  trafico: {
    velMin: 40,            // km/h del tráfico (debe ser menor que velocidadInicial)
    velMax: 80,
    probCamion: 0.18,      // probabilidad de que un vehículo sea camión
    probDobleInicial: 0.15,// probabilidad de 2 autos en la misma fila (sube con la distancia)
    probDobleMax: 0.55,
    separacionBase: 36,    // distancia mínima entre filas de tráfico (metros)
    separacionPorVel: 0.25 // metros extra por cada km/h de velocidad
  },

  // ---------- AUTOS ----------
  // modelo: forma del auto (hatch, coupe, sedan, gtr, super) | color: pintura de fábrica
  // velMax: velocidad máxima (km/h) | aceleracion: km/h por segundo | agarre: giro lateral
  autos: [
    { id: "rojo",    nombre: "Kaze Hachi",    modelo: "hatch", precio: 0,     color: "#e53935", velMax: 200, aceleracion: 30, agarre: 1.00 },
    { id: "azul",    nombre: "Hayate RX",     modelo: "coupe", precio: 1500,  color: "#1e88e5", velMax: 240, aceleracion: 38, agarre: 1.15 },
    { id: "sedan",   nombre: "Kitsune Drift", modelo: "sedan", precio: 3200,  color: "#00bfa5", velMax: 262, aceleracion: 42, agarre: 1.25 },
    { id: "morado",  nombre: "Ryu GT",        modelo: "gtr",   precio: 6000,  color: "#8e24aa", velMax: 285, aceleracion: 46, agarre: 1.30 },
    { id: "dorado",  nombre: "Shinobi LM",    modelo: "super", precio: 15000, color: "#fbc02d", velMax: 330, aceleracion: 55, agarre: 1.45 }
  ],

  // ---------- PERSONALIZACIÓN: precios ----------
  // Cada lista es el precio de cada opción, en orden (0 = gratis). Se compra una vez POR AUTO y queda desbloqueada.
  // Los colores de pintura, acentos, rines y franjas son gratis. "unlock" = precio de desbloquear esa función (luego sus colores son gratis).
  personalizar: {
    acabado:    [0, 400, 900, 1500, 600],       // Normal, Metálico, Perlado, Cromo, Mate
    techo:      { unlock: 250 },                // techo de otro color
    llanta:     [0, 150, 250, 300, 400, 600],   // estilos de rin
    llantaTam:  [0, 100, 250, 450],             // 15", 16", 17", 18"
    pinza:      { unlock: 200 },                // pinzas de freno de color
    aleron:     [0, 200, 500, 900, 1600],
    kit:        [0, 400, 800, 1500],            // labio+faldones, +aerodinámica, ensanchado
    cofre:      [0, 250, 350, 600],
    suspension: [0, 200, 450, 800],
    franja:     [0, 150, 150, 200],
    vidrio:     [0, 100, 150],
    neon:       { unlock: 500 },                // luz neón bajo el auto
    faros:      { unlock: 100 },                // color de los faros
    escape:     [0, 200, 500],
    llama:      { unlock: 200 }                 // color de la llama del nitro
  },

  // ---------- MEJORAS (por auto) ----------
  // costo del nivel N = costoBase * crecimiento^N
  mejoras: {
    motor:   { nombre: "Motor",   icono: "⚙️", info: "Más velocidad máxima y aceleración",
               max: 10, costoBase: 200, crecimiento: 1.55, velPorNivel: 18, accelPorNivel: 4 },
    nitro:   { nombre: "Nitro",   icono: "🔥", info: "Más potencia y capacidad de nitro",
               max: 10, costoBase: 150, crecimiento: 1.50, potenciaPorNivel: 0.04, capacidadPorNivel: 8 },
    llantas: { nombre: "Llantas", icono: "🛞", info: "Cambios de carril más rápidos",
               max: 10, costoBase: 120, crecimiento: 1.45, agarrePorNivel: 0.08 }
  },

  // ---------- DIFICULTAD DE LOS BOTS (se elige en Ajustes) ----------
  // nivel: multiplica la velocidad de los bots | error: multiplica su probabilidad de chocar | premio: multiplica el premio por puesto
  dificultad: [
    { nombre: "Fácil",   nivel: 0.86, error: 1.7, premio: 0.7 },
    { nombre: "Normal",  nivel: 1.00, error: 1.0, premio: 1.0 },
    { nombre: "Difícil", nivel: 1.07, error: 0.5, premio: 1.5 }
  ],

  // ---------- OTROS MODOS ----------
  contrarreloj: { metaMetros: 2000, premioBase: 200, premioMejora: 300 },   // corres solo contra tu fantasma (tu mejor tiempo)
  supervivencia: { vidas: 3, rampaSegundos: 90 },                          // el tráfico se pone más denso con el tiempo
  distancias: [1500, 3000, 5000],      // opciones de distancia para Carrera y Contrarreloj (la de Contrarreloj usa la de arriba)

  // ---------- CASI-CHOQUES ----------
  casiChoque: {
    margen: 0.8,       // metros de separación (por fuera del choque) en los que cuenta como casi-choque
    monedas: 2,        // monedas de bonus (se multiplican por el combo, hasta x5)
    nitro: 6,          // % de nitro que recuperas
    comboSegundos: 2.5 // tiempo para encadenar el siguiente
  },

  // ---------- POWER-UPS EN LA PISTA ----------
  powerups: {
    prob: 0.14,            // probabilidad por fila de tráfico (modo libre y otros)
    probCarrera: 0.26,     // en modo Carrera
    escudo:  { duracion: 15, icono: "🛡️", nombre: "Escudo",      color: 0x29d3ff },   // aguanta 1 choque
    iman:    { duracion: 9,  icono: "🧲", nombre: "Imán",        color: 0xff4081, radio: 22 },
    nitro:   { duracion: 4,  icono: "⚡", nombre: "Nitro gratis", color: 0xffc400 },   // nitro infinito
    doble:   { duracion: 12, icono: "💰", nombre: "Monedas x2",  color: 0x69f0ae }
  },

  // ---------- MISIONES DIARIAS (3 por día) ----------
  // stat: qué cuenta | metas: [fácil, media, difícil] | premios por dificultad
  misiones: {
    premios: [200, 350, 600],
    pool: [
      { id: "monedas",   texto: "Junta {n} monedas",         stat: "monedas",     metas: [60, 120, 200] },
      { id: "metros",    texto: "Recorre {n} m",             stat: "metros",      metas: [4000, 8000, 14000] },
      { id: "casi",      texto: "Haz {n} casi-choques",      stat: "casiChoques", metas: [8, 16, 30] },
      { id: "victorias", texto: "Gana {n} carrera(s)",         stat: "victorias",   metas: [1, 2, 3] },
      { id: "nitro",     texto: "Usa nitro {n} segundos",    stat: "nitroSeg",    metas: [25, 50, 90] },
      { id: "vel",       texto: "Alcanza {n} km/h",          stat: "vmaxRun",     metas: [200, 260, 320], max: true },
      { id: "powerups",  texto: "Recoge {n} power-ups",      stat: "powerups",    metas: [3, 6, 10] }
    ]
  },

  // ---------- LOGROS (dan dinero una sola vez) ----------
  logros: [
    { id: "victoria1", nombre: "Primera victoria",   desc: "Gana una carrera",              stat: "victorias",   meta: 1,      premio: 300 },
    { id: "victoria5", nombre: "Campeón",            desc: "Gana 5 carreras",               stat: "victorias",   meta: 5,      premio: 1000 },
    { id: "vel300",    nombre: "Demonio de velocidad", desc: "Alcanza 300 km/h",            stat: "vmax",        meta: 300,    premio: 800 },
    { id: "casi50",    nombre: "Rey del casi",       desc: "50 casi-choques",               stat: "casiChoques", meta: 50,     premio: 500 },
    { id: "casi300",   nombre: "Sin miedo",          desc: "300 casi-choques",              stat: "casiChoques", meta: 300,    premio: 2000 },
    { id: "metros50k", nombre: "Maratonista",        desc: "Recorre 50.000 m en total",     stat: "metros",      meta: 50000,  premio: 1500 },
    { id: "monedas1k", nombre: "Cazamonedas",        desc: "Junta 1.000 monedas",           stat: "monedas",     meta: 1000,   premio: 1000 },
    { id: "tuner",     nombre: "Tuner",              desc: "Compra 15 piezas de tuning",    stat: "tuning",      meta: 15,     premio: 1200 },
    { id: "coleccion", nombre: "Coleccionista",      desc: "Ten 3 autos distintos",         stat: "autos",       meta: 3,      premio: 1500 },
    { id: "power20",   nombre: "Cargado de energía", desc: "Recoge 20 power-ups",           stat: "powerups",    meta: 20,     premio: 600 },
    { id: "surv",      nombre: "Superviviente",      desc: "2.000 m en Supervivencia",      stat: "survBest",    meta: 2000,   premio: 1200 }
  ],

  // ---------- CALIDAD GRÁFICA (se cambia en Ajustes) ----------
  // resolucion: máximo de píxeles por pixel de pantalla | decor: % de árboles/edificios | lineas: líneas de velocidad
  calidad: [
    { nombre: "Baja",  resolucion: 1.0, decor: 0.5, lineas: 14 },
    { nombre: "Media", resolucion: 1.25, decor: 0.8, lineas: 28 },
    { nombre: "Alta",  resolucion: 1.75, decor: 1.0, lineas: 44 }
  ],

  // ---------- PISTAS (ambientes que puedes fijar en Ajustes) ----------
  pistas: ["Automático", "Campo", "Desierto", "Nieve", "Ciudad de noche", "Atardecer"],

  // ---------- AMBIENTES (cambian cada cierta distancia) ----------
  metrosPorAmbiente: 1500,

  sonido: true,
  musica: true,
  vibracion: true
};
