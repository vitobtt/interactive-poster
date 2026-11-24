//================ elementos del cartel ================
const marco = document.querySelector('#marco');
const cartel = document.querySelector('#cartel');
const lienzo = document.querySelector('#escena');
const lienzoNieve = document.querySelector('#nieve');
const luz = document.querySelector('#luz');
const punto = document.querySelector('#punto');
const zonaCarta = document.querySelector('#zona-carta');
const fecha = document.querySelector('#fecha');
const pista = document.querySelector('#pista');
const titular = document.querySelector('#titular');

//medidas del enunciado
const ANCHO = 848;
const ALTO = 1200;
//pixeles reales por pixel del cartel: en pantallas retina el dibujo se hace al doble
const ESCALA = Math.min(window.devicePixelRatio || 1, 2);
//si el usuario pide menos movimiento: el cartel no se borra y la nieve no cae
const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

//colores del dibujo
const COLOR = {
  crema: '#f3efe6',
  rojo: '#ff412c',
  oro: '#f5c35a',
  papel: '#f4f0e6',
  respuesta: '#c4261b',
  grafito: '#2c2e35'
};

//los dos estados del cartel: lo que dice el titular y como esta la carta
//en el texto, \n fuerza un salto de linea; tam es el tamaño maximo (se reduce solo si una linea no cabe)
const ESTADOS = {
  OLVIDO: {
    //saltos elegidos a mano: tres lineas rectas y dos en cursiva, sin palabras sueltas
    tam: 104,
    partes: [
      { texto: 'Esta Navidad\nhay niños que\nsolo piden\n', color: COLOR.crema },
      { texto: 'que alguien se\nacuerde de ellos.', color: COLOR.rojo, cursiva: true }
    ],
    respondida: false,
    lectores: 'Esta Navidad hay niños que solo piden que alguien se acuerde de ellos.'
  },
  RECUERDO: {
    tam: 172,
    partes: [
      { texto: 'Ningún\nniño', color: COLOR.crema },
      { texto: 'sin\nregalo.', color: COLOR.oro, cursiva: true }
    ],
    respondida: true,
    lectores: 'Ningún niño sin regalo.'
  }
};

//================ dibujo del cartel (canvas 2d) ================
//numeros aleatorios con semilla: el garabato del arbol sale igual en los dos estados
let semilla = 1;
function azarFijo() {
  semilla = (semilla * 16807) % 2147483647;
  return (semilla - 1) / 2147483646;
}

//crea un canvas 2d del tamaño del cartel, ya escalado
function nuevoLienzo() {
  const c = document.createElement('canvas');
  c.width = ANCHO * ESCALA;
  c.height = ALTO * ESCALA;
  const ctx = c.getContext('2d');
  ctx.scale(ESCALA, ESCALA);
  return { canvas: c, ctx: ctx };
}

//la letra de cada palabra: Fraunces, recta o cursiva
function letra(tam, cursiva) {
  return (cursiva ? 'italic ' : '') + '700 ' + tam + 'px Fraunces, Georgia, serif';
}

//ancho de una palabra con su letra
function medir(ctx, p, tam) {
  ctx.font = letra(tam, p.cursiva);
  return ctx.measureText(p.texto).width;
}

//reparte las palabras en lineas de como mucho 768 px; con saltos forzados (\n) solo corta ahi
function partirLineas(ctx, palabras, tam, soloForzados) {
  ctx.font = letra(tam, false);
  const espacio = ctx.measureText(' ').width;
  const lineas = [[]];
  let ancho = 0;
  palabras.forEach(function (p) {
    if (p.salto) {
      lineas.push([]);
      ancho = 0;
      return;
    }
    const medida = medir(ctx, p, tam);
    if (!soloForzados && ancho > 0 && ancho + espacio + medida > 768) {
      lineas.push([]);
      ancho = 0;
    }
    lineas[lineas.length - 1].push(p);
    ancho += (ancho > 0 ? espacio : 0) + medida;
  });
  return { lineas: lineas, espacio: espacio, ancho: ancho };
}

//titular: cada parte tiene su color; si una palabra sola no cabe en 768 px, baja el tamaño
function dibujarTitular(ctx, estado) {
  const palabras = [];
  estado.partes.forEach(function (parte) {
    parte.texto.split('\n').forEach(function (trozo, i) {
      if (i > 0) palabras.push({ salto: true });
      trozo.split(' ').forEach(function (p) {
        if (p) palabras.push({ texto: p, color: parte.color, cursiva: !!parte.cursiva });
      });
    });
  });
  let tam = estado.tam;
  let reparto;
  //si el texto trae sus saltos, las lineas no se rehacen: se reduce la letra hasta que quepan
  const soloForzados = palabras.some(function (p) { return p.salto; });
  do {
    reparto = partirLineas(ctx, palabras, tam, soloForzados);
    const masAncha = Math.max.apply(null, reparto.lineas.map(function (linea) {
      return linea.reduce(function (total, p) { return total + medir(ctx, p, tam); }, 0)
        + reparto.espacio * Math.max(0, linea.length - 1);
    }));
    if (masAncha <= 768) break;
    tam -= 2;
  } while (tam > 40);
  //en Fraunces las mayusculas miden 0.7 del tamaño; interlineado 1.04 para que las colas de g, q y p no toquen la linea de abajo
  ctx.textBaseline = 'alphabetic';
  reparto.lineas.forEach(function (linea, i) {
    let x = 40;
    const y = 76 + tam * 0.72 + i * tam * 1.04;
    linea.forEach(function (p) {
      ctx.fillStyle = p.color;
      ctx.font = letra(tam, p.cursiva);
      ctx.fillText(p.texto, x, y);
      x += ctx.measureText(p.texto).width + reparto.espacio;
    });
  });
}

//trazo de cera: la misma linea varias veces con un poco de temblor
function cera(ctx, puntos, color, grosor) {
  ctx.strokeStyle = color;
  ctx.lineWidth = grosor;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.55;
  for (let pasada = 0; pasada < 3; pasada++) {
    ctx.beginPath();
    puntos.forEach(function (p, i) {
      const x = p[0] + (azarFijo() - 0.5) * 2.4;
      const y = p[1] + (azarFijo() - 0.5) * 2.4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

//relleno de niño: rayas en zigzag dentro de un triangulo
function rayarTriangulo(ctx, cx, arriba, abajo, mitad, color) {
  const puntos = [];
  const filas = Math.round((abajo - arriba) / 5);
  for (let i = 0; i <= filas; i++) {
    const y = arriba + (abajo - arriba) * i / filas;
    const medio = mitad * (y - arriba) / (abajo - arriba);
    puntos.push(i % 2 ? [cx - medio, y] : [cx + medio, y]);
  }
  cera(ctx, puntos, color, 3.2);
}

//dibujo del niño: un arbol de Navidad; con la carta respondida aparecen regalos debajo
function dibujarArbol(ctx, x, y, conRegalos) {
  semilla = 21;
  //suelo
  cera(ctx, [[x - 92, y + 132], [x - 30, y + 129], [x + 40, y + 133], [x + 96, y + 130]], '#5b6b3a', 2.6);
  //tronco
  cera(ctx, [[x - 9, y + 130], [x - 9, y + 108], [x + 9, y + 108], [x + 9, y + 130]], '#7a4a24', 3);
  //tres pisos de ramas
  rayarTriangulo(ctx, x, y - 6, y + 46, 46, '#2f8f4e');
  rayarTriangulo(ctx, x, y + 24, y + 80, 58, '#2f8f4e');
  rayarTriangulo(ctx, x, y + 54, y + 110, 70, '#2f8f4e');
  //estrella
  const puntas = [];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const r = i % 2 ? 6 : 15;
    puntas.push([x + Math.cos(a) * r, y - 16 + Math.sin(a) * r]);
  }
  cera(ctx, puntas, '#e8b528', 3);
  //bolas
  [[-18, 30, '#e8402c'], [16, 62, '#2b5bd6'], [-28, 92, '#e8b528'], [30, 96, '#e8402c']].forEach(function (b) {
    const circulo = [];
    for (let i = 0; i <= 8; i++) circulo.push([x + b[0] + Math.cos(i * 0.8) * 4, y + b[1] + Math.sin(i * 0.8) * 4]);
    cera(ctx, circulo, b[2], 3);
  });
  if (!conRegalos) return;
  //regalos de cera: cuadrado, cinta en cruz y lazo
  [[-62, 104, 30, '#e8402c'], [52, 100, 34, '#2b5bd6'], [-26, 112, 22, '#e8b528'], [86, 110, 22, '#e8402c']].forEach(function (r) {
    const rx = x + r[0], ry = y + r[1] + 18, t = r[2] / 2;
    cera(ctx, [[rx - t, ry + t], [rx - t, ry - t], [rx + t, ry - t], [rx + t, ry + t], [rx - t, ry + t]], r[3], 3);
    cera(ctx, [[rx, ry - t], [rx, ry + t]], '#e8b528', 2.4);
    cera(ctx, [[rx - t, ry], [rx + t, ry]], '#e8b528', 2.4);
    cera(ctx, [[rx, ry - t], [rx - 8, ry - t - 8], [rx - 2, ry - t - 2], [rx + 8, ry - t - 8], [rx, ry - t]], '#e8b528', 2);
  });
}

//================ la carta: texturas (canvas 2d) ================
//la hoja se dibuja a 3 px por px del cartel para que se lea de cerca
//medidas y giro de la carta abierta; .zona-carta en style.css usa el mismo giro
const CARTA = { x: 416, y: 652, ancho: 392, alto: 420, giro: -0.06 };
const TEX = 3;
//lo que escribe el niño: texto, x y linea base (los renglones estan cada 34 px desde y = 70)
const LINEAS_NINO = [
  ['Querido Papá Noel:', 66, 64],
  ['este año no te pido', 70, 98],
  ['juguetes. Solo pido', 70, 132],
  ['que alguien se', 70, 166],
  ['acuerde de mí.', 70, 200]
];
//canvas de la carta: papel solo, papel con la respuesta, relieve y aspereza
const carta = {};

function lienzoCarta() {
  const c = document.createElement('canvas');
  c.width = CARTA.ancho * TEX;
  c.height = CARTA.alto * TEX;
  const ctx = c.getContext('2d');
  ctx.scale(TEX, TEX);
  return { canvas: c, ctx: ctx };
}

//suma a cada pixel un gris al azar: el grano del papel
function granular(ctx, fuerza) {
  const img = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 2 * fuerza;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

//canvas transparente con puntos al azar; con destination-out deja huecos en el lapiz y la cera
function puntosAlAzar(maximo) {
  const l = lienzoCarta();
  const img = l.ctx.createImageData(l.canvas.width, l.canvas.height);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = Math.random() * maximo;
  l.ctx.putImageData(img, 0, 0);
  return l.canvas;
}

//la misma forma de un canvas pintada de un solo color (para el relieve y la aspereza)
function silueta(canvas, color) {
  const l = lienzoCarta();
  l.ctx.setTransform(1, 0, 0, 1, 0, 0);
  l.ctx.drawImage(canvas, 0, 0);
  l.ctx.globalCompositeOperation = 'source-in';
  l.ctx.fillStyle = color;
  l.ctx.fillRect(0, 0, l.canvas.width, l.canvas.height);
  return l.canvas;
}

//dibuja un canvas de la carta encima de otro
function pegar(ctx, canvas, opacidad) {
  ctx.save();
  ctx.globalAlpha = opacidad === undefined ? 1 : opacidad;
  ctx.drawImage(canvas, 0, 0, CARTA.ancho, CARTA.alto);
  ctx.restore();
}

//borde izquierdo arrancado de una libreta de espiral: entre agujero y agujero queda una pestaña rota
function recortarBorde(ctx) {
  semilla = 7;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(-1, -1);
  for (let y = 0; y <= CARTA.alto; y += 0.75) {
    const fase = y % 8.5;
    const pestana = fase > 2 && fase < 5.5 ? 0.6 : 4.2;
    ctx.lineTo(pestana + azarFijo() * 1.6, y);
  }
  ctx.lineTo(-1, CARTA.alto + 1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function dibujarPapel(ctx) {
  const w = CARTA.ancho, h = CARTA.alto;
  ctx.fillStyle = COLOR.papel;
  ctx.fillRect(0, 0, w, h);
  //manchas muy suaves: el papel nunca es de un solo color
  semilla = 3;
  for (let i = 0; i < 46; i++) {
    const x = azarFijo() * w, y = azarFijo() * h, r = 30 + azarFijo() * 120;
    const tono = azarFijo() < 0.55 ? '120,100,60' : '255,255,250';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + tono + ',.05)');
    g.addColorStop(1, 'rgba(' + tono + ',0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  //los bordes amarillean con el tiempo
  const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.78);
  v.addColorStop(0, 'rgba(150,118,60,0)');
  v.addColorStop(1, 'rgba(150,118,60,.14)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  //fibras sueltas
  ctx.lineWidth = 0.25;
  for (let i = 0; i < 320; i++) {
    const x = azarFijo() * w, y = azarFijo() * h, l = 3 + azarFijo() * 8, a = azarFijo() * 6.3;
    ctx.strokeStyle = 'rgba(110,95,70,' + (0.04 + azarFijo() * 0.06) + ')';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.6, y + Math.sin(a + 0.6) * l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  granular(ctx, 7);
  //renglones impresos y margen
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = 'rgba(92,132,200,.55)';
  for (let y = 70; y < h - 8; y += 34) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(214,80,80,.6)';
  ctx.beginPath(); ctx.moveTo(52, 0); ctx.lineTo(52, h); ctx.stroke();
}

//lapiz del niño: grafito gris con grano, y lo que borro y aun se adivina
function dibujarLapiz() {
  const l = lienzoCarta();
  const c = l.ctx;
  c.fillStyle = COLOR.grafito;
  c.font = '25px Schoolbell';
  LINEAS_NINO.forEach(function (linea) { c.fillText(linea[0], linea[1], linea[2]); });
  //el grafito no cubre del todo: deja ver el grano del papel
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'destination-out';
  c.drawImage(puntosAlAzar(110), 0, 0);
  c.restore();
  return l.canvas;
}

//lo que el niño escribio primero y borro: "quiero una bici"
function dibujarBorrado(ctx) {
  ctx.save();
  ctx.fillStyle = COLOR.grafito;
  ctx.globalAlpha = 0.1;
  ctx.font = '25px Schoolbell';
  ctx.fillText('quiero una bici', 70, 234);
  //rastro de la goma: trazos grises muy suaves
  semilla = 11;
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = COLOR.grafito;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const x = 68 + i * 17 + azarFijo() * 6;
    ctx.moveTo(x, 214 + azarFijo() * 4);
    ctx.lineTo(x + 12, 238 + azarFijo() * 4);
  }
  ctx.stroke();
  ctx.restore();
}

//ceras del arbol con huecos: la cera no entra en el fondo del grano del papel
function dibujarCeras() {
  const l = lienzoCarta();
  dibujarArbol(l.ctx, 290, 222, false);
  l.ctx.save();
  l.ctx.setTransform(1, 0, 0, 1, 0, 0);
  l.ctx.globalCompositeOperation = 'destination-out';
  l.ctx.drawImage(puntosAlAzar(210), 0, 0);
  l.ctx.restore();
  return l.canvas;
}

//trazo de boli: una linea fina, dos pasadas con muy poco temblor
function boli(ctx, puntos) {
  ctx.strokeStyle = COLOR.respuesta;
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let pasada = 0; pasada < 2; pasada++) {
    ctx.globalAlpha = pasada ? 0.45 : 0.9;
    ctx.beginPath();
    puntos.forEach(function (p, i) {
      const x = p[0] + (azarFijo() - 0.5) * 0.8;
      const y = p[1] + (azarFijo() - 0.5) * 0.8;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

//la respuesta en boli rojo, en el orden en que se escribe: tres lineas y cuatro regalos bajo el arbol
//cada trazo tiene su posicion, su giro y la caja que se va descubriendo de izquierda a derecha
function prepararTrazos(ctx) {
  ctx.font = '44px "Reenie Beanie"';
  const trazos = [['Yo me', 0, 0], ['acuerdo', 8, 38], ['de ti.', 22, 76]].map(function (t) {
    return {
      x: 70, y: 268, giro: -0.08,
      caja: [t[1] - 4, t[2] - 40, ctx.measureText(t[0]).width + 10, 54],
      dibujar: function (c) {
        c.font = '44px "Reenie Beanie"';
        c.fillStyle = COLOR.respuesta;
        c.globalAlpha *= 0.92;
        c.fillText(t[0], t[1], t[2]);
        //donde el boli aprieta mas, la tinta se carga
        c.globalAlpha *= 0.35;
        c.fillText(t[0], t[1] + 0.3, t[2] + 0.2);
      }
    };
  });
  [[-62, 104, 30], [52, 100, 34], [-26, 112, 22], [86, 110, 22]].forEach(function (r, i) {
    const rx = 290 + r[0], ry = 222 + r[1] + 18, t = r[2] / 2;
    trazos.push({
      x: 0, y: 0, giro: 0,
      caja: [rx - t - 10, ry - t - 14, t * 2 + 20, t * 2 + 26],
      dibujar: function (c) {
        semilla = 40 + i;
        boli(c, [[rx - t, ry + t], [rx - t, ry - t], [rx + t, ry - t], [rx + t, ry + t], [rx - t, ry + t]]);
        boli(c, [[rx, ry - t], [rx, ry + t]]);
        boli(c, [[rx - t, ry], [rx + t, ry]]);
        boli(c, [[rx, ry - t], [rx - 8, ry - t - 8], [rx - 2, ry - t - 2], [rx + 8, ry - t - 8], [rx, ry - t]]);
      }
    });
  });
  return trazos;
}

//prepara una vez todos los canvas de la carta
function prepararCarta() {
  const base = lienzoCarta();
  dibujarPapel(base.ctx);
  dibujarBorrado(base.ctx);
  const lapiz = dibujarLapiz();
  const ceras = dibujarCeras();
  //el grafito se corre un poco con la mano
  pegar(base.ctx, lapiz, 0.08);
  base.ctx.save();
  base.ctx.translate(0.6, 0.9);
  pegar(base.ctx, lapiz, 0.06);
  base.ctx.restore();
  pegar(base.ctx, lapiz, 0.95);
  pegar(base.ctx, ceras, 1);
  recortarBorde(base.ctx);
  carta.base = base.canvas;

  //relieve: gris medio con grano; el lapiz hunde el papel y la cera queda encima
  const relieve = lienzoCarta();
  relieve.ctx.fillStyle = '#808080';
  relieve.ctx.fillRect(0, 0, CARTA.ancho, CARTA.alto);
  granular(relieve.ctx, 26);
  pegar(relieve.ctx, silueta(lapiz, '#3a3a3a'), 0.8);
  pegar(relieve.ctx, silueta(ceras, '#b0b0b0'), 0.7);
  //la marca del doblez: la carta ha estado doblada por la mitad dentro del sobre
  relieve.ctx.strokeStyle = 'rgba(30,30,30,.7)';
  relieve.ctx.lineWidth = 0.7;
  relieve.ctx.beginPath(); relieve.ctx.moveTo(0, CARTA.alto / 2); relieve.ctx.lineTo(CARTA.ancho, CARTA.alto / 2); relieve.ctx.stroke();
  carta.relieve = relieve.canvas;

  //dorso: papel con renglones y el lapiz que se transparenta un poco (visto por detras sale al reves, como en la realidad)
  const dorso = lienzoCarta();
  dibujarPapel(dorso.ctx);
  pegar(dorso.ctx, silueta(lapiz, 'rgb(120,118,125)'), 0.1);
  recortarBorde(dorso.ctx);
  carta.dorso = dorso.canvas;

  //aspereza: el papel es mate; el grafito y la cera brillan un poco con la luz rasante
  const aspereza = lienzoCarta();
  aspereza.ctx.fillStyle = 'rgb(225,225,225)';
  aspereza.ctx.fillRect(0, 0, CARTA.ancho, CARTA.alto);
  pegar(aspereza.ctx, silueta(lapiz, 'rgb(105,105,105)'), 0.9);
  pegar(aspereza.ctx, silueta(ceras, 'rgb(150,150,150)'), 0.9);
  carta.aspereza = aspereza.canvas;

  //compuesto: lo que se ve (papel + respuesta a medio escribir)
  carta.compuesto = lienzoCarta();
  carta.trazos = prepararTrazos(carta.compuesto.ctx);
  componerCarta(0, 0);
}

//papel + la respuesta escrita hasta "progreso" (0 a 1)
function componerCarta(progreso, opacidad) {
  const c = carta.compuesto.ctx;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, c.canvas.width, c.canvas.height);
  c.drawImage(carta.base, 0, 0);
  c.restore();
  if (opacidad <= 0 || progreso <= 0) return;
  const n = carta.trazos.length;
  carta.trazos.forEach(function (t, k) {
    const parte = Math.min(1, Math.max(0, progreso * n - k));
    if (parte <= 0) return;
    c.save();
    c.globalAlpha = opacidad;
    c.translate(t.x, t.y);
    c.rotate(t.giro);
    c.beginPath();
    c.rect(t.caja[0], t.caja[1], t.caja[2] * parte, t.caja[3]);
    c.clip();
    t.dibujar(c);
    c.restore();
  });
}

//sin webgl: la carta plana, girada y con sombra
function dibujarCartaPlana(ctx, respondida) {
  componerCarta(respondida ? 1 : 0, 1);
  ctx.save();
  ctx.translate(CARTA.x + CARTA.ancho / 2, CARTA.y + CARTA.alto / 2);
  ctx.rotate(CARTA.giro);
  ctx.shadowColor = 'rgba(0,0,0,.55)';
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 14;
  ctx.drawImage(carta.compuesto.canvas, -CARTA.ancho / 2, -CARTA.alto / 2, CARTA.ancho, CARTA.alto);
  ctx.restore();
}

//dibuja un estado: el titular sobre transparente; el fondo es la niebla y la carta va en 3d
//sin webgl (conFondo) pinta tambien la carta plana; el cielo de css se ve detras
function dibujarCartel(estado, conFondo) {
  const l = nuevoLienzo();
  const ctx = l.ctx;
  dibujarTitular(ctx, estado);
  if (conFondo) dibujarCartaPlana(ctx, estado.respondida);
  return l.canvas;
}

//================ webgl: el cartel que se olvida ================
//cinco pases por fotograma:
//1 memoria: donde ha pasado el cursor hace poco (se apaga sola)
//2 niebla: una bruma que se mueve despacio y tapa el cielo (cuanto mas se olvida, mas lo tapa); con un amanecer ambar al recordar
//3 carta: el sobre y la carta en 3d con sus luces y su sombra (ver mas abajo)
//4 olvido: el fotograma anterior con bloques que se deslizan hacia abajo (datamosh) y se disuelven en la niebla; donde hay memoria vuelve el dibujo limpio
//5 pantalla: junta niebla y cartel, con la luz calida y grano
//uPasos son los fotogramas de 60 Hz que han pasado: asi el cartel se olvida igual de rapido a 30, 60 o 120 fps
const VERTICES = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

//aleatorio sin sin(): con sin() y numeros grandes muchas graficas pierden precision y devuelven 0
const AZAR_GLSL = `
float azar(vec2 p){
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}`;

const PASE_MEMORIA = `
uniform sampler2D tMemoria;
uniform vec2 uRaton;      //cursor en coordenadas 0..1
uniform vec2 uTam;        //tamaño del cartel en px
uniform float uActivo;    //1 si el cursor esta dentro del cartel
uniform float uTodo;      //1 recuerda el cartel entero
uniform float uRadio;     //radio del pincel en px del cartel
uniform float uPasos;
varying vec2 vUv;
void main(){
  //la memoria se apaga poco a poco: en un par de segundos esa zona se vuelve a olvidar
  float m = texture2D(tMemoria, vUv).r * pow(0.99, uPasos);
  float d = length((vUv - uRaton) * uTam);
  float pincel = (1.0 - smoothstep(uRadio * 0.35, uRadio, d)) * uActivo;
  m = max(m, pincel);
  m = max(m, uTodo);
  gl_FragColor = vec4(m, m, m, 1.0);
}`;

const PASE_NIEBLA = AZAR_GLSL + `
uniform float uTiempo;
uniform float uCalor;     //0 olvido, 1 recuerdo
uniform float uEspesor;   //cuanto se olvida: la niebla se espesa
varying vec2 vUv;
//ruido suave: mezcla de cuatro valores al azar en las esquinas de cada celda
float ruido(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = azar(i), b = azar(i + vec2(1.0, 0.0)), c = azar(i + vec2(0.0, 1.0)), d = azar(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
//cinco capas de ruido cada vez mas pequeñas: da la textura de humo
float humo(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * ruido(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
void main(){
  vec2 p = vUv * vec2(2.12, 3.0);
  float t = uTiempo;
  //el humo se deforma con otro humo: asi parece que fluye
  vec2 deriva = vec2(humo(p + t * 0.03), humo(p + vec2(5.2, 1.3) - t * 0.025));
  float n = humo(p * 1.3 + deriva * 1.6 + vec2(0.0, t * 0.02));
  vec3 bruma = mix(vec3(0.17, 0.18, 0.33), vec3(0.25, 0.15, 0.30), smoothstep(0.55, 0.95, deriva.x) * 0.5);
  //cuanto tapa el cielo: jirones que pasan, un suelo de niebla abajo y mas espesa cuanto mas se olvida
  float velo = smoothstep(0.4, 0.95, n) * (0.28 + uEspesor * 0.4);
  velo += (1.0 - vUv.y) * (0.22 + uEspesor * 0.25) * n;
  velo = clamp(velo, 0.0, 0.85);
  //se guarda premultiplicado: el color ya multiplicado por lo que tapa
  vec3 c = bruma * velo;
  //al recordar: un resplandor ambar que nace detras del sobre
  float resplandor = smoothstep(0.8, 0.0, distance(vUv * vec2(1.0, 1.4), vec2(0.72, 0.39)));
  c += vec3(1.0, 0.55, 0.22) * resplandor * (0.25 + 0.3 * n) * uCalor;
  //los bordes se pierden en la oscuridad: una capa negra que tapa el cielo
  float centro = smoothstep(1.15, 0.3, length((vUv - vec2(0.5, 0.55)) * vec2(1.0, 0.85)));
  float oscuro = 0.5 * (1.0 - centro);
  c *= 1.0 - oscuro;
  float a = velo + oscuro * (1.0 - velo);
  gl_FragColor = vec4(c, a);
}`;

//el cartel se guarda con transparencia premultiplicada: color ya multiplicado por su opacidad
const PASE_OLVIDO = AZAR_GLSL + `
uniform sampler2D tPrevio;    //el fotograma anterior
uniform sampler2D tOlvido;    //dibujo del primer estado
uniform sampler2D tRecuerdo;  //dibujo del segundo estado
uniform sampler2D tCarta;     //la carta 3d, en luz lineal y premultiplicada
uniform sampler2D tMemoria;
uniform float uMezcla;        //0 primer estado, 1 segundo
uniform float uPaso;          //cambia 8 veces por segundo: cada bloque elige movimiento nuevo
uniform float uPasos;
uniform float uFuerza;        //cuanto se olvida (0 = nada)
uniform float uSacudida;      //1 durante el cambio de estado: mas bloques moviendose
uniform float uEscala;        //pixeles reales por pixel del cartel
uniform vec2 uRes;            //tamaño del buffer en pixeles reales
varying vec2 vUv;
void main(){
  //rejilla de bloques de 16 px del cartel, como los macrobloques de un video
  vec2 bloque = floor(vUv * vec2(53.0, 75.0));
  float memoria = texture2D(tMemoria, vUv).r;
  float olvido = (1.0 - memoria) * uFuerza;
  float mueve = max(olvido, uSacudida);
  //vector de movimiento del bloque: hacia abajo (se derrite) y a veces de lado
  vec2 mov = vec2(floor((azar(bloque.yx + uPaso) - 0.5) * 2.4), -floor(1.0 + azar(bloque + uPaso * 0.37) * 1.6));
  //solo se mueve una parte de los bloques, mas cuanto mas olvidada esta la zona; con 0 no se mueve ninguno
  mov *= float(azar(bloque * 0.71 - uPaso * 1.7) < mueve * 0.24 * uPasos);
  vec4 previo = texture2D(tPrevio, vUv - mov * uEscala / uRes);
  vec4 titular = mix(texture2D(tOlvido, vUv), texture2D(tRecuerdo, vUv), uMezcla);
  //three.js pinta la carta en luz lineal: se pasa a srgb como el resto del cartel
  vec4 hoja = texture2D(tCarta, vUv);
  vec3 lineal = hoja.rgb / max(hoja.a, 0.0001);
  vec3 srgb = mix(lineal * 12.92, 1.055 * pow(lineal, vec3(0.41667)) - 0.055, step(0.0031308, lineal));
  hoja.rgb = srgb * hoja.a;
  vec4 fuente = titular + hoja * (1.0 - titular.a);
  //bloques clave: unos pocos se refrescan de golpe con el dibujo limpio
  float clave = float(azar(bloque * 1.7 + uPaso * 0.9) > 0.993 - uSacudida * 0.05);
  float refresco = clamp(memoria * 0.28 + 0.011 + clave * 0.7, 0.0, 1.0);
  refresco = 1.0 - pow(1.0 - refresco, uPasos);
  //donde se recuerda del todo, el dibujo es el de ahora: la carta se mueve sin dejar estela
  refresco = max(refresco, smoothstep(0.88, 1.0, memoria));
  vec4 color = mix(previo, fuente, refresco);
  //lo olvidado pierde el color y se disuelve en la niebla (baja su opacidad)
  float gris = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  color.rgb = mix(color.rgb, vec3(gris), min(1.0, olvido * 0.01 * uPasos));
  color *= 1.0 - min(1.0, olvido * 0.0028 * uPasos);
  gl_FragColor = color;
}`;

const PASE_PANTALLA = AZAR_GLSL + `
uniform sampler2D tNiebla;
uniform sampler2D tCuadro;
uniform sampler2D tMemoria;
uniform float uPaso;
varying vec2 vUv;
void main(){
  vec4 cartel = texture2D(tCuadro, vUv);
  vec4 niebla = texture2D(tNiebla, vUv);
  float m = texture2D(tMemoria, vUv).r;
  //donde miras, la niebla se aparta y se ven las estrellas
  niebla *= 1.0 - m * 0.5;
  //el cartel encima de la niebla; lo que queda transparente deja ver el cielo (capa css de debajo)
  vec3 c = cartel.rgb + niebla.rgb * (1.0 - cartel.a);
  float a = cartel.a + niebla.a * (1.0 - cartel.a);
  //donde te acuerdas, el cartel se calienta un poco
  c += vec3(1.0, 0.62, 0.32) * m * 0.05;
  //grano de pelicula: una capa muy fina encima de todo
  c += (azar(gl_FragCoord.xy + uPaso * 13.0) - 0.5) * 0.04;
  c = max(c, 0.0);
  a = max(a, 0.06);
  //premultiplicado valido: ningun color puede pasar de su opacidad
  a = max(a, max(c.r, max(c.g, c.b)));
  gl_FragColor = vec4(c, a);
}`;

let renderer = null;
try {
  //alpha: el canvas es transparente y deja ver el cielo, que es una imagen en css
  renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: false, alpha: true, premultipliedAlpha: true });
  renderer.setClearColor(0x000000, 0);
} catch (error) {
  renderer = null;
}

const camara = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const plano = new THREE.PlaneGeometry(2, 2);

//un pase es una escena con un solo rectangulo que cubre la pantalla y su shader
function crearPase(fragmento, uniformes) {
  const material = new THREE.ShaderMaterial({ vertexShader: VERTICES, fragmentShader: fragmento, uniforms: uniformes });
  const escena = new THREE.Scene();
  escena.add(new THREE.Mesh(plano, material));
  return { escena: escena, uniformes: uniformes };
}

//buffer de colores con decimales (half float): con 8 bits los cambios tan pequeños se perderian
function crearBuffer(ancho, alto, filtro) {
  return new THREE.WebGLRenderTarget(ancho, alto, {
    type: THREE.HalfFloatType, minFilter: filtro, magFilter: filtro, depthBuffer: false
  });
}

//textura a partir de un canvas 2d
function texturaDe(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.premultiplyAlpha = true;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

const BUF_ANCHO = ANCHO * ESCALA;
const BUF_ALTO = ALTO * ESCALA;
//dos buffers de cada: se lee de uno y se escribe en el otro, y en el siguiente fotograma al reves
let memoriaA, memoriaB, cuadroA, cuadroB, niebla, paseMemoria, paseNiebla, paseOlvido, pasePantalla;

function prepararEscena(texOlvido, texRecuerdo) {
  renderer.setPixelRatio(1);
  renderer.setSize(BUF_ANCHO, BUF_ALTO, false);
  memoriaA = crearBuffer(ANCHO / 4, ALTO / 4, THREE.LinearFilter);
  memoriaB = crearBuffer(ANCHO / 4, ALTO / 4, THREE.LinearFilter);
  cuadroA = crearBuffer(BUF_ANCHO, BUF_ALTO, THREE.NearestFilter);
  cuadroB = crearBuffer(BUF_ANCHO, BUF_ALTO, THREE.NearestFilter);
  //la niebla es borrosa: basta con la mitad de resolucion
  niebla = crearBuffer(ANCHO / 2, ALTO / 2, THREE.LinearFilter);
  paseNiebla = crearPase(PASE_NIEBLA, {
    uTiempo: { value: 0 }, uCalor: { value: 0 }, uEspesor: { value: 0 }
  });
  paseMemoria = crearPase(PASE_MEMORIA, {
    tMemoria: { value: null }, uRaton: { value: new THREE.Vector2(0.5, 0.5) },
    uTam: { value: new THREE.Vector2(ANCHO, ALTO) },
    uActivo: { value: 0 }, uTodo: { value: 1 }, uRadio: { value: 150 }, uPasos: { value: 1 }
  });
  paseOlvido = crearPase(PASE_OLVIDO, {
    tPrevio: { value: null }, tOlvido: { value: texOlvido }, tRecuerdo: { value: texRecuerdo }, tCarta: { value: null },
    tMemoria: { value: null }, uMezcla: { value: 0 }, uPaso: { value: 0 }, uPasos: { value: 1 },
    uFuerza: { value: 1 }, uSacudida: { value: 0 }, uEscala: { value: ESCALA },
    uRes: { value: new THREE.Vector2(BUF_ANCHO, BUF_ALTO) }
  });
  pasePantalla = crearPase(PASE_PANTALLA, {
    tNiebla: { value: niebla.texture }, tCuadro: { value: null }, tMemoria: { value: null }, uPaso: { value: 0 }
  });
}

//un fotograma: memoria, niebla, carta 3d, olvido y pantalla
function pintarFotograma(pasos, tiempo) {
  //el paso vuelve a 0 cada 1000: los numeros pequeños mantienen la precision en la grafica
  const paso = Math.floor(tiempo * 8) % 1000;

  paseMemoria.uniformes.tMemoria.value = memoriaA.texture;
  paseMemoria.uniformes.uPasos.value = pasos;
  renderer.setRenderTarget(memoriaB);
  renderer.render(paseMemoria.escena, camara);
  [memoriaA, memoriaB] = [memoriaB, memoriaA];

  paseNiebla.uniformes.uTiempo.value = tiempo % 1000;
  renderer.setRenderTarget(niebla);
  renderer.render(paseNiebla.escena, camara);

  pintarCarta();
  paseOlvido.uniformes.tCarta.value = c3d.buffer.texture;

  paseOlvido.uniformes.tPrevio.value = cuadroA.texture;
  paseOlvido.uniformes.tMemoria.value = memoriaA.texture;
  paseOlvido.uniformes.uPaso.value = paso;
  paseOlvido.uniformes.uPasos.value = pasos;
  renderer.setRenderTarget(cuadroB);
  renderer.render(paseOlvido.escena, camara);
  [cuadroA, cuadroB] = [cuadroB, cuadroA];

  pasePantalla.uniformes.tCuadro.value = cuadroA.texture;
  pasePantalla.uniformes.tMemoria.value = memoriaA.texture;
  pasePantalla.uniformes.uPaso.value = paso;
  renderer.setRenderTarget(null);
  renderer.render(pasePantalla.escena, camara);
}

//================ el sobre y la carta en 3d (three.js) ================
//la camara en perspectiva esta colocada para que el plano z = 0 coincida pixel a pixel con el cartel
//el sobre y la carta se pintan en su propio buffer con transparencia y entran en el pase del olvido como un dibujo mas
//la geometria del sobre esta en sobre/sobre.js y sus texturas en sobre/texturas.js
const c3d = {};
const ALTURA_FOCO = 2400;
//k: pixeles por unidad del sobre (el sobre mide 3.5 x 2.4 unidades: 413 x 283 px)
//bajada: el sobre cerrado queda un poco por debajo del centro de la carta
//lectura: a que altura se levanta la carta para leerla (px hacia la camara)
const MEDIDA = { k: 118, bajada: 30, lectura: 140, anchoCarta: 3.15, salida: 2.35 };
//apertura al pasar el raton: cada fase con su inicio y su duracion en segundos
const FASES = {
  romper: [0, 0.25],
  esparcir: [0.25, 0.9],
  solapa: [0.45, 1],
  sacar: [1.3, 1],
  levantar: [2, 1.1],
  desdoblar: [2.35, 1],
  //cuando la carta sale del sobre, el cartel se recuerda
  recuerdo: 2,
  duracion: 3.35
};
//t: segundos de apertura; sentido: 1 abre, -1 cierra (al doble de velocidad), 0 quieto
const apertura = { t: 0, sentido: 0 };
//estado animado del sobre y la carta
const animCarta = { hover: 0, rx: 0, ry: 0, foco: 0, calor: 0, escrito: 0, opacidadTinta: 0, progreso: -1, opacidad: -1, pliegue: -1, solapa: -1 };

//de pixeles del cartel (y hacia abajo) a coordenadas 3d (y hacia arriba, centro en 0)
function aMundo(px, py) {
  return new THREE.Vector3(px - ANCHO / 2, ALTO / 2 - py, 0);
}

function limitar(v) {
  return Math.max(0, Math.min(1, v));
}

//curvas de aceleracion
const CURVA = {
  lineal: function (x) { return x; },
  entra: function (x) { return x * x * x; },
  suave: function (x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; },
  seno: function (x) { return -(Math.cos(Math.PI * x) - 1) / 2; },
  frena: function (x) { return Math.sin(x * Math.PI / 2); }
};

//avance de 0 a 1 de una fase en el segundo t
function fase(t, tramo, curva) {
  return curva(limitar((t - tramo[0]) / tramo[1]));
}

//todo lo que pasa en el segundo t de la apertura
function estadoSobre(t) {
  return {
    romper: fase(t, FASES.romper, CURVA.entra),
    esparcir: fase(t, FASES.esparcir, CURVA.lineal),
    solapa: fase(t, FASES.solapa, CURVA.suave),
    //la solapa se comba al levantarse y se endereza al caer
    comba: fase(t, [0.45, 0.5], CURVA.frena) - fase(t, [0.95, 0.6], CURVA.seno),
    sacar: fase(t, FASES.sacar, CURVA.seno),
    levantar: fase(t, FASES.levantar, CURVA.suave),
    desdoblar: fase(t, FASES.desdoblar, CURVA.suave)
  };
}

//reflejos: una sala oscura con una ventana fria y una lampara calida, para el brillo del grafito y del lacre
function crearEntorno() {
  const sala = new THREE.Scene();
  sala.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0x0d1024, side: THREE.BackSide })));
  [[-2.5, 3, 4, 4, 3, new THREE.Color(1.6, 1.25, 0.9)], [3, 1, 3, 2, 4, new THREE.Color(0.5, 0.6, 1.1)]].forEach(function (p) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(p[3], p[4]), new THREE.MeshBasicMaterial({ color: p[5] }));
    panel.position.set(p[0], p[1], p[2]);
    panel.lookAt(0, 0, 0);
    sala.add(panel);
  });
  const pmrem = new THREE.PMREMGenerator(renderer);
  const textura = pmrem.fromScene(sala, 0.04).texture;
  pmrem.dispose();
  return textura;
}

function texturaCarta(canvas, color) {
  const t = new THREE.CanvasTexture(canvas);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (color) t.encoding = THREE.sRGBEncoding;
  return t;
}

//sombras con luz de area aproximada: VSM permite difuminarlas
function sombraSuave(luz, cerca, lejos, radio) {
  luz.castShadow = true;
  luz.shadow.mapSize.set(1024, 1024);
  luz.shadow.camera.near = cerca;
  luz.shadow.camera.far = lejos;
  luz.shadow.radius = radio;
  luz.shadow.blurSamples = 16;
  luz.shadow.bias = -0.0005;
}

//los dos lados de la carta del niño: delante lo escrito, detras el papel con el lapiz transparentandose
function materialesCarta() {
  c3d.mapa = texturaCarta(carta.compuesto.canvas, true);
  const relieve = texturaCarta(carta.relieve, false);
  const comun = {
    bumpMap: relieve, bumpScale: 1.4, roughness: 1, metalness: 0,
    sheen: 0.35, sheenRoughness: 0.85, sheenColor: new THREE.Color(1, 1, 1), envMapIntensity: 0.45,
    //el borde arrancado: lo transparente del dibujo no se pinta
    alphaTest: 0.5
  };
  const frente = new THREE.MeshPhysicalMaterial(Object.assign({
    map: c3d.mapa, roughnessMap: texturaCarta(carta.aspereza, false),
    side: THREE.FrontSide, shadowSide: THREE.DoubleSide
  }, comun));
  const dorso = new THREE.MeshPhysicalMaterial(Object.assign({
    map: texturaCarta(carta.dorso, true), side: THREE.BackSide
  }, comun));
  return { frente: frente, dorso: dorso };
}

function prepararCarta3D() {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;

  const fov = 18;
  const distancia = (ALTO / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
  c3d.camara = new THREE.PerspectiveCamera(fov, ANCHO / ALTO, distancia - 1500, distancia + 500);
  c3d.camara.position.set(0, 0, distancia);
  c3d.escena = new THREE.Scene();
  c3d.escena.environment = crearEntorno();

  //buffer propio con antialias (4 muestras) y profundidad
  c3d.buffer = new THREE.WebGLRenderTarget(BUF_ANCHO, BUF_ALTO, {
    type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, samples: 4
  });

  //el sobre: papel de algodon, forro burdeos, lacre y "Para Papá Noel" a lapiz con la letra del niño
  Sobre.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const texturas = {
    paper: Sobre.makePaper(),
    liner: Sobre.makeLiner(),
    seal: Sobre.makeSeal(),
    inscription: Sobre.makeInscription('Para Papá Noel', '190px Schoolbell, "Comic Sans MS", cursive')
  };
  //la carta mide lo mismo que la del cartel (392 x 420) y va doblada por la mitad
  const ancho = MEDIDA.anchoCarta;
  c3d.sobre = Sobre.buildEnvelope(texturas, {
    materiales: materialesCarta(), ancho: ancho, panel: ancho * CARTA.alto / CARTA.ancho / 2
  });

  //grupo: sitio y giro en el cartel. escala: de unidades del sobre a pixeles
  //rig: el sobre, que se inclina con el raton. la carta va aparte porque sale del sobre
  const centro = aMundo(CARTA.x + CARTA.ancho / 2, CARTA.y + CARTA.alto / 2);
  c3d.centro = centro;
  const grupo = new THREE.Group();
  grupo.position.copy(centro);
  //en el canvas el giro es al reves porque la y va hacia abajo
  grupo.rotation.z = -CARTA.giro;
  const escala = new THREE.Group();
  escala.scale.setScalar(MEDIDA.k);
  c3d.rig = new THREE.Group();
  c3d.rig.add(c3d.sobre.group);
  escala.add(c3d.rig, c3d.sobre.letter.root);
  grupo.add(escala);
  c3d.escena.add(grupo);

  //plano invisible detras: solo enseña la sombra del sobre y la carta sobre la niebla
  //esta un poco por debajo para que la sombra se separe y se difumine
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1800), new THREE.ShadowMaterial({ color: 0x02030a, opacity: 0.72 }));
  suelo.position.set(centro.x, centro.y, -24);
  suelo.receiveShadow = true;
  c3d.escena.add(suelo);

  //luz del cielo: fria de noche, calida al recordar
  c3d.cielo = new THREE.HemisphereLight(0xaebbe8, 0x2a2436, 0.5);
  c3d.escena.add(c3d.cielo);
  //la luna, arriba a la izquierda: su sombra cae abajo a la derecha
  c3d.luna = new THREE.DirectionalLight(0xdce4ff, 0.55);
  c3d.luna.position.set(centro.x - 600, centro.y + 800, 1500);
  c3d.luna.target.position.copy(centro);
  sombraSuave(c3d.luna, 500, 3500, 20);
  c3d.luna.shadow.normalBias = 1;
  const caja = c3d.luna.shadow.camera;
  caja.left = -420; caja.right = 420; caja.top = 420; caja.bottom = -420;
  c3d.escena.add(c3d.luna, c3d.luna.target);
  //tu luz: un foco calido muy alto encima del cursor; asi su sombra cae casi debajo
  c3d.foco = new THREE.SpotLight(0xffc48c, 0, 0, 0.13, 1, 0);
  c3d.foco.position.set(centro.x, centro.y, ALTURA_FOCO);
  c3d.foco.target.position.copy(centro);
  sombraSuave(c3d.foco, 1800, 3000, 16);
  c3d.foco.shadow.normalBias = 1;
  c3d.escena.add(c3d.foco, c3d.foco.target);

  c3d.firma = '';
  c3d.colorFrio = new THREE.Color(0xaebbe8);
  c3d.colorCalido = new THREE.Color(0xffd6ad);
  c3d.pA = new THREE.Vector3();
  c3d.pB = new THREE.Vector3();
  c3d.qB = new THREE.Quaternion();
  c3d.giro = new THREE.Euler();
}

//abre o cierra el sobre: la animacion la avanza moverCarta()
function abrirSobre() {
  apertura.sentido = 1;
  zonaCarta.classList.add('abierta');
}

function cerrarSobre() {
  apertura.sentido = -1;
  zonaCarta.classList.remove('abierta');
}

//un paso del sobre y la carta: apertura, inclinacion, la luz del cursor y la respuesta escribiendose
function moverCarta(dt) {
  const a = animCarta;
  const s3d = c3d.sobre;
  const k = Math.min(1, dt * 6);

  //avanza la apertura; sin movimiento es casi instantanea
  const velocidad = sinMovimiento ? 20 : (apertura.sentido > 0 ? 1 : 2);
  apertura.t = Math.max(0, Math.min(FASES.duracion, apertura.t + dt * velocidad * apertura.sentido));
  const e = estadoSobre(apertura.t);
  if (apertura.sentido > 0 && apertura.t >= FASES.recuerdo) aplicarEstado('RECUERDO');
  const abierta = apertura.t >= FASES.duracion;

  //donde esta el cursor respecto a la carta (-1 a 1)
  let ox = 0, oy = 0;
  if (raton.dentro) {
    ox = Math.max(-1, Math.min(1, (raton.x - (CARTA.x + CARTA.ancho / 2)) / CARTA.ancho));
    oy = Math.max(-1, Math.min(1, (raton.y - (CARTA.y + CARTA.alto / 2)) / CARTA.alto));
  }
  const aire = sinMovimiento ? 0 : 1;
  a.vaiven = (a.vaiven || 0) + dt;

  //el sobre cerrado se levanta un poco y se inclina hacia el cursor; al romperse el lacre se queda quieto
  a.hover += ((sobreCarta ? 1 : 0) - a.hover) * k;
  const calma = 1 - Math.min(1, (e.romper + e.solapa) / 0.08);
  const respira = Math.sin(a.vaiven * 0.72) * 0.02 * aire;
  c3d.rig.position.set(0, -MEDIDA.bajada / MEDIDA.k, (a.hover * 0.12 + respira * a.hover) * calma);
  c3d.rig.rotation.set(oy * 0.05 * a.hover * calma * aire, ox * 0.06 * a.hover * calma * aire, 0);
  c3d.rig.updateMatrix();
  s3d.sealMat.emissiveIntensity = a.hover * 0.4 * calma;

  //lacre y solapa (la solapa solo se recalcula si cambia)
  s3d.setSeal(e.romper, e.esparcir);
  const solapa = Math.round(e.solapa * 1000) + ',' + Math.round(e.comba * 1000);
  if (solapa !== a.solapa) {
    s3d.setFlap(e.solapa, e.comba);
    a.solapa = solapa;
  }

  //la carta: se desdobla al levantarse (solo se recalcula si cambia)
  const pliegue = Math.round(e.desdoblar * 1000);
  if (pliegue !== a.pliegue) {
    const d = e.desdoblar;
    s3d.letter.setFold(0.045 + (Math.PI - 0.045) * (1 - d), Math.sin(d * Math.PI), d);
    a.pliegue = pliegue;
  }

  //la carta va de dentro del sobre (pA) a delante del cartel para leerla (pB)
  const raiz = s3d.letter.root;
  const casa = s3d.letterHome;
  c3d.pA.set(casa.x, casa.y + e.sacar * MEDIDA.salida, casa.z + e.sacar * 0.052).applyMatrix4(c3d.rig.matrix);
  //al leerla, alguien la coge: se inclina hacia el cursor y respira con el aire de la habitacion
  const inclinacion = sinMovimiento ? 0 : 0.22;
  a.rx += (oy * inclinacion - a.rx) * k;
  a.ry += (ox * inclinacion - a.ry) * k;
  c3d.pB.set(0, Math.sin(a.vaiven * 0.62) * 0.02 * aire, MEDIDA.lectura / MEDIDA.k);
  c3d.giro.set(a.rx + Math.sin(a.vaiven * 0.7) * 0.012 * aire, a.ry + Math.sin(a.vaiven * 0.53 + 1) * 0.015 * aire, 0);
  c3d.qB.setFromEuler(c3d.giro);
  raiz.position.lerpVectors(c3d.pA, c3d.pB, e.levantar);
  //en el camino se acerca un poco mas a ti
  raiz.position.z += Math.sin(e.levantar * Math.PI) * 0.32;
  raiz.quaternion.copy(c3d.rig.quaternion).slerp(c3d.qB, e.levantar);
  raiz.visible = e.solapa > 0.2;

  //el foco sigue al cursor y se apaga cuando sale del cartel
  a.foco += ((raton.dentro ? 0.75 : 0) - a.foco) * Math.min(1, dt * 4);
  const sitio = aMundo(luzSuave.x, luzSuave.y);
  c3d.foco.intensity = a.foco;
  c3d.foco.position.set(sitio.x, sitio.y, ALTURA_FOCO);
  c3d.foco.target.position.set(sitio.x, sitio.y - 30, 0);
  c3d.foco.target.updateMatrixWorld();

  const recuerdo = estado === 'RECUERDO';
  a.calor += ((recuerdo ? 1 : 0) - a.calor) * Math.min(1, dt * 2);
  c3d.cielo.color.copy(c3d.colorFrio).lerp(c3d.colorCalido, a.calor);
  c3d.cielo.intensity = 0.5 + 0.1 * a.calor;

  //con la carta ya abierta, la respuesta se escribe en unos 2 s; al irse, la tinta se borra rapido
  if (recuerdo) {
    if (abierta) a.escrito += dt;
    a.opacidadTinta = 1;
  } else {
    a.opacidadTinta = Math.max(0, a.opacidadTinta - dt * 3);
    if (a.opacidadTinta === 0) a.escrito = 0;
  }
  const progreso = sinMovimiento ? (recuerdo && abierta ? 1 : 0) : Math.min(1, Math.max(0, (a.escrito - 0.35) / 2.2));
  const opacidad = Math.round(a.opacidadTinta * 50) / 50;
  if (progreso !== a.progreso || opacidad !== a.opacidad) {
    a.progreso = progreso;
    a.opacidad = opacidad;
    componerCarta(progreso, opacidad);
    c3d.mapa.needsUpdate = true;
  }
}

//pinta el sobre y la carta en su buffer solo si algo ha cambiado
function pintarCarta() {
  const a = animCarta;
  const firma = [apertura.t, a.hover, a.rx, a.ry, a.vaiven, a.foco, a.calor, a.progreso, a.opacidad, luzSuave.x, luzSuave.y]
    .map(function (n) { return Math.round(n * 1000); }).join(',');
  if (firma === c3d.firma) return;
  c3d.firma = firma;
  renderer.setRenderTarget(c3d.buffer);
  renderer.setClearColor(0x000000, 0);
  renderer.render(c3d.escena, c3d.camara);
  renderer.setClearColor(0x000000, 0);
}

//================ nieve (canvas 2d) ================
//cada copo tiene profundidad (z de 0 lejos a 1 cerca): los cercanos son grandes, borrosos, rapidos y se mueven mas con el raton
const ctxNieve = lienzoNieve.getContext('2d');
lienzoNieve.width = ANCHO * ESCALA;
lienzoNieve.height = ALTO * ESCALA;
ctxNieve.scale(ESCALA, ESCALA);

//un copo dibujado una vez: centro blanco y borde que se desvanece; luego se copia a cada tamaño
const molde = document.createElement('canvas');
molde.width = molde.height = 64;
(function () {
  const c = molde.getContext('2d');
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
})();

const copos = [];
for (let i = 0; i < 180; i++) {
  const z = Math.pow(Math.random(), 1.8);
  copos.push({
    x: Math.random() * ANCHO, y: Math.random() * ALTO, z: z,
    r: 1.2 + z * z * 9, vx: 0, vy: 0.2 + z * 1.1,
    fase: Math.random() * 6.3
  });
}
//desplazamiento de paralaje que sigue al raton con suavidad
const paralaje = { x: 0, y: 0 };

function pintarNieve() {
  ctxNieve.clearRect(0, 0, ANCHO, ALTO);
  copos.forEach(function (c) {
    ctxNieve.globalAlpha = 0.85 - c.z * 0.45;
    const x = c.x + paralaje.x * c.z;
    const y = c.y + paralaje.y * c.z;
    ctxNieve.drawImage(molde, x - c.r, y - c.r, c.r * 2, c.r * 2);
  });
  ctxNieve.globalAlpha = 1;
}

//caen despacio, se balancean y se apartan del cursor
function moverNieve(dt) {
  const pasos = dt * 60;
  const objetivoX = raton.dentro ? (ANCHO / 2 - raton.x) * 0.06 : 0;
  const objetivoY = raton.dentro ? (ALTO / 2 - raton.y) * 0.04 : 0;
  paralaje.x += (objetivoX - paralaje.x) * Math.min(1, dt * 3);
  paralaje.y += (objetivoY - paralaje.y) * Math.min(1, dt * 3);
  copos.forEach(function (c) {
    if (raton.dentro) {
      const dx = c.x + paralaje.x * c.z - raton.x;
      const dy = c.y + paralaje.y * c.z - raton.y;
      const d = Math.hypot(dx, dy);
      if (d < 110 && d > 0.1) {
        const empuje = (110 - d) / 110 * 0.9 * pasos;
        c.vx += dx / d * empuje;
        c.vy += dy / d * empuje * 0.5;
      }
    }
    c.vx *= Math.pow(0.94, pasos);
    c.vy += (0.2 + c.z * 1.1 - c.vy) * Math.min(1, 0.05 * pasos);
    c.fase += dt;
    c.x += (c.vx + Math.sin(c.fase) * 0.25) * pasos;
    c.y += c.vy * pasos;
    if (c.y > ALTO + 20) { c.y = -20; c.x = Math.random() * ANCHO; }
    if (c.x < -20) c.x = ANCHO + 20;
    if (c.x > ANCHO + 20) c.x = -20;
  });
  pintarNieve();
}

//================ raton y estados ================
const raton = { dentro: false, x: ANCHO / 2, y: ALTO / 2 };
//la luz va un poco por detras del cursor, con suavidad; el punto va exacto
const luzSuave = { x: ANCHO / 2, y: ALTO / 2 };
let estado = 'OLVIDO';
let mezclaObjetivo = 0;
let sacudida = 0;
let todoObjetivo = 0;
let temporizadorRecuerdo = null;
let temporizadorCarta = null;
//sobre la carta, la luz la pone el foco 3d: el halo de css se atenua para no lavar el lapiz
let sobreCarta = false;
//segundos sin mover el raton: cuanto mas tiempo nadie mira, mas rapido se olvida
let quieto = 0;
//sin webgl se enseña el dibujo quieto de cada estado en un canvas 2d
const dibujosFijos = {};
let lienzoFijo = null;

//pasa la posicion del raton (o del dedo) a pixeles del cartel; sirve aunque el cartel este escalado
//se limita a los bordes del cartel para que nada se salga
function situarRaton(evento) {
  const caja = cartel.getBoundingClientRect();
  raton.x = Math.max(0, Math.min(ANCHO, (evento.clientX - caja.left) / caja.width * ANCHO));
  raton.y = Math.max(0, Math.min(ALTO, (evento.clientY - caja.top) / caja.height * ALTO));
}

//coloca un elemento en un punto del cartel (con transform, que no recoloca la pagina)
function colocar(elemento, x, y) {
  elemento.style.transform = 'translate(' + x.toFixed(1) + 'px, ' + y.toFixed(1) + 'px)';
}

//cada fotograma la luz recorre una parte del camino hasta el cursor: movimiento fluido y sin saltos
function moverLuz(dt) {
  const k = sinMovimiento ? 1 : Math.min(1, dt * 12);
  luzSuave.x += (raton.x - luzSuave.x) * k;
  luzSuave.y += (raton.y - luzSuave.y) * k;
  colocar(luz, luzSuave.x, luzSuave.y);
}

//cambia de estado: el dibujo nuevo entra por bloques, como un video que salta
function aplicarEstado(nombre) {
  if (nombre === estado) return;
  estado = nombre;
  const recuerdo = nombre === 'RECUERDO';
  mezclaObjetivo = recuerdo ? 1 : 0;
  sacudida = sinMovimiento ? 0 : 1;
  clearTimeout(temporizadorRecuerdo);
  todoObjetivo = 0;
  //medio segundo de bloques sueltos y despues, si es el recuerdo, todo se ve limpio
  if (recuerdo) {
    temporizadorRecuerdo = setTimeout(function () { todoObjetivo = 1; }, 550);
  }
  //lo que cambia en el html
  fecha.style.color = recuerdo ? COLOR.oro : COLOR.crema;
  pista.style.opacity = recuerdo ? 0 : 1;
  titular.textContent = ESTADOS[nombre].lectores;
  //sin webgl: cambia el dibujo quieto
  if (lienzoFijo) {
    //el dibujo es transparente (deja ver el cielo): hay que borrar el anterior
    const ctx = lienzoFijo.getContext('2d');
    ctx.clearRect(0, 0, lienzoFijo.width, lienzoFijo.height);
    ctx.drawImage(dibujosFijos[nombre], 0, 0);
  }
}

//opacidad del halo: apagado fuera del cartel y mas tenue encima del sobre (alli alumbra el foco 3d)
function brilloLuz() {
  if (!raton.dentro) return 0;
  return sobreCarta ? 0.3 : 1;
}

//la luz crece cuando esta sobre el sobre
function crecerLuz(grande) {
  sobreCarta = grande;
  luz.style.opacity = brilloLuz();
  luz.style.width = grande ? '560px' : '360px';
  luz.style.height = grande ? '560px' : '360px';
  luz.style.margin = grande ? '-280px 0 0 -280px' : '-180px 0 0 -180px';
}

//================ interacciones ================
//interaccion 1 · mouseenter: el sobre se levanta y la luz crece al momento; si el cursor se queda 120 ms, se rompe el lacre y la carta sale
//la espera evita que el cartel salte cuando el cursor solo cruza el sobre de paso
function entrarCarta() {
  crecerLuz(true);
  clearTimeout(temporizadorCarta);
  temporizadorCarta = setTimeout(function () {
    //sin webgl no hay sobre: se ve la carta y el cartel se recuerda directamente
    if (renderer) abrirSobre();
    else aplicarEstado('RECUERDO');
  }, 120);
}

//interaccion 2 · mouseleave: al irse, la carta se dobla y vuelve al sobre, y el cartel vuelve a olvidarse
function salirCarta() {
  crecerLuz(false);
  clearTimeout(temporizadorCarta);
  if (renderer) cerrarSobre();
  aplicarEstado('OLVIDO');
}

//interaccion 3 · mousemove: el cursor es una luz; donde pasa, el cartel se recuerda y la nieve se aparta
function moverRaton(evento) {
  situarRaton(evento);
  //al entrar en el cartel la luz aparece en el cursor, no viene volando desde donde se fue
  if (!raton.dentro) {
    luzSuave.x = raton.x;
    luzSuave.y = raton.y;
  }
  raton.dentro = true;
  quieto = 0;
  colocar(punto, raton.x, raton.y);
  punto.style.opacity = 1;
  luz.style.opacity = brilloLuz();
}

//al salir del cartel se apagan la luz y el punto
function salirCartel() {
  raton.dentro = false;
  luz.style.opacity = 0;
  punto.style.opacity = 0;
}

//teclado: enter o espacio abren el sobre y escape lo cierra (el foco ya lo abre al llegar con tabulador)
function teclaCarta(evento) {
  if (evento.key === 'Enter' || evento.key === ' ') {
    evento.preventDefault();
    entrarCarta();
  } else if (evento.key === 'Escape') {
    salirCarta();
  }
}

//en movil: el dedo hace de cursor
function moverDedo(evento) {
  moverRaton(evento.touches[0]);
}

//encoge el cartel entero si la ventana es mas pequeña, sin deformarlo
function escalarCartel() {
  const escala = Math.min(
    (window.innerWidth - 32) / ANCHO,
    (window.innerHeight - 32) / ALTO,
    1
  );
  cartel.style.transform = 'scale(' + escala + ')';
  marco.style.width = ANCHO * escala + 'px';
  marco.style.height = ALTO * escala + 'px';
}

//================ bucle ================
const reloj = { inicio: performance.now(), anterior: performance.now() };

function animar() {
  const ahora = performance.now();
  const dt = Math.min((ahora - reloj.anterior) / 1000, 1 / 20);
  reloj.anterior = ahora;
  avanzar(dt, (ahora - reloj.inicio) / 1000);
  requestAnimationFrame(animar);
}

//un paso de animacion; separado de animar() para poder probarlo
function avanzar(dt, tiempo) {
  if (renderer) {
    const u = paseOlvido.uniformes;
    u.uMezcla.value += (mezclaObjetivo - u.uMezcla.value) * Math.min(1, dt * 6);
    sacudida = Math.max(0, sacudida - dt * 1.6);
    u.uSacudida.value = sacudida;
    //siempre se olvida un poco (0.35); sin nadie mirando, en 20 s llega al maximo
    quieto += dt;
    u.uFuerza.value = sinMovimiento ? 0 : 0.35 + 0.65 * Math.min(1, quieto / 20);
    //la niebla se calienta con el recuerdo y se espesa con el olvido
    const n = paseNiebla.uniformes;
    n.uCalor.value += (mezclaObjetivo - n.uCalor.value) * Math.min(1, dt * 2);
    n.uEspesor.value = u.uFuerza.value;
    const m = paseMemoria.uniformes;
    //los primeros 1.5 s el cartel se ve limpio; despues la memoria se apaga y empieza el olvido
    const intro = tiempo < 1.5 ? 1 : 0;
    m.uTodo.value = Math.max(todoObjetivo, intro, m.uTodo.value - dt * 0.6);
    m.uActivo.value = raton.dentro ? 1 : 0;
    m.uRaton.value.set(raton.x / ANCHO, 1 - raton.y / ALTO);
    moverCarta(dt);
    pintarFotograma(dt * 60, tiempo);
  }
  moverLuz(dt);
  if (!sinMovimiento) moverNieve(dt);
}

//================ arranque ================
function arrancar() {
  prepararCarta();
  const olvido = dibujarCartel(ESTADOS.OLVIDO, !renderer);
  const recuerdo = dibujarCartel(ESTADOS.RECUERDO, !renderer);
  if (renderer) {
    prepararEscena(texturaDe(olvido), texturaDe(recuerdo));
    prepararCarta3D();
  } else {
    //sin webgl: el lienzo pasa a ser un canvas 2d y enseña el dibujo del estado actual
    dibujosFijos.OLVIDO = olvido;
    dibujosFijos.RECUERDO = recuerdo;
    const fijo = document.createElement('canvas');
    fijo.className = 'escena';
    fijo.width = ANCHO * ESCALA;
    fijo.height = ALTO * ESCALA;
    fijo.setAttribute('aria-hidden', 'true');
    lienzo.replaceWith(fijo);
    fijo.getContext('2d').drawImage(olvido, 0, 0);
    lienzoFijo = fijo;
    //sin webgl no hay sobre en 3d: se ve la carta directamente
    pista.innerHTML = 'Mueve el ratón: tu luz lo recuerda<br>Pasa por la carta y léela';
  }
  pintarNieve();
  animar();
}

escalarCartel();
//hay que esperar a las fuentes: el canvas no espera solo y dibujaria con otra letra
//si alguna falla, arranca igual con la de repuesto
Promise.all([
  document.fonts.load('700 100px Fraunces'),
  document.fonts.load('italic 700 100px Fraunces'),
  document.fonts.load('25px Schoolbell'),
  document.fonts.load('46px "Reenie Beanie"')
]).catch(function () {}).then(arrancar);

zonaCarta.addEventListener('mouseenter', entrarCarta);
zonaCarta.addEventListener('mouseleave', salirCarta);
cartel.addEventListener('mousemove', moverRaton);
cartel.addEventListener('mouseleave', salirCartel);
//teclado: el sobre se puede enfocar con tabulador y hace lo mismo que el raton
zonaCarta.addEventListener('focus', entrarCarta);
zonaCarta.addEventListener('blur', salirCarta);
zonaCarta.addEventListener('keydown', teclaCarta);
//movil: el dedo mueve la luz; tocar el sobre ya lanza mouseenter en los navegadores moviles
cartel.addEventListener('touchmove', moverDedo, { passive: true });
cartel.addEventListener('touchend', salirCartel);
window.addEventListener('resize', escalarCartel);
