//texturas del sobre: se calculan al cargar, pixel a pixel o sobre canvas (adaptado del proyecto del sobre)
(function () {
  const X = (window.Sobre = window.Sobre || {});

  //azar con semilla: el sobre sale igual en cada carga
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  X.rng = rng;

  const R = rng(20261225);
  const GRID = new Float32Array(65536);
  for (let i = 0; i < GRID.length; i++) GRID[i] = R();

  //ruido de valor periodico: px y py son el periodo de repeticion
  function noise(x, y, px, py) {
    const xf = Math.floor(x), yf = Math.floor(y);
    const fx = x - xf, fy = y - yf;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const x0 = ((xf % px) + px) % px, x1 = (x0 + 1) % px;
    const y0 = ((yf % py) + py) % py, y1 = (y0 + 1) % py;
    const a = GRID[x0 + y0 * 256], b = GRID[x1 + y0 * 256];
    const c = GRID[x0 + y1 * 256], d = GRID[x1 + y1 * 256];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct, px, py) {
    let sum = 0, amp = 0.5, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += noise(x, y, px, py) * amp;
      norm += amp;
      amp *= 0.5; x *= 2; y *= 2; px = Math.min(px * 2, 256); py = Math.min(py * 2, 256);
    }
    return sum / norm;
  }
  X.noise = noise;

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function dataTexture(rgba, w, h, srgb, repeat) {
    const flipped = new Uint8Array(rgba.length);
    const row = w * 4;
    for (let y = 0; y < h; y++) flipped.set(rgba.subarray(y * row, (y + 1) * row), (h - 1 - y) * row);
    const t = new THREE.DataTexture(flipped, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = X.maxAniso || 8;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.needsUpdate = true;
    return t;
  }

  function normalsFrom(h, w, hh, strength, wrap) {
    const out = new Uint8Array(w * hh * 4);
    const at = function (x, y) {
      if (wrap) return h[((x + w) % w) + ((y + hh) % hh) * w];
      return h[Math.max(0, Math.min(w - 1, x)) + Math.max(0, Math.min(hh - 1, y)) * w];
    };
    for (let y = 0, i = 0; y < hh; y++) {
      for (let x = 0; x < w; x++, i += 4) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
        const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
        const l = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        out[i] = (-dx * l * 0.5 + 0.5) * 255;
        out[i + 1] = (dy * l * 0.5 + 0.5) * 255;
        out[i + 2] = (l * 0.5 + 0.5) * 255;
        out[i + 3] = 255;
      }
    }
    return out;
  }

  function boxBlur(src, w, h, r) {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    const n = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let x = -r; x <= r; x++) s += src[Math.max(0, x) + y * w];
      for (let x = 0; x < w; x++) {
        tmp[x + y * w] = s / n;
        s += src[Math.min(w - 1, x + r + 1) + y * w] - src[Math.max(0, x - r) + y * w];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[x + Math.max(0, y) * w];
      for (let y = 0; y < h; y++) {
        out[x + y * w] = s / n;
        s += tmp[x + Math.min(h - 1, y + r + 1) * w] - tmp[x + Math.max(0, y - r) * w];
      }
    }
    return out;
  }

  //papel de algodon con fibras
  X.makePaper = function () {
    const S = 1024, r = rng(77);
    const fc = canvas(S, S), f = fc.getContext('2d', { willReadFrequently: true });
    f.fillStyle = '#000'; f.fillRect(0, 0, S, S);
    f.lineCap = 'round';
    for (let i = 0; i < 15000; i++) {
      const x = r() * S, y = r() * S, a = r() * Math.PI * 2, l = 5 + r() * 26, b = (r() - 0.5) * 14;
      f.strokeStyle = 'rgba(255,255,255,' + (0.05 + r() * 0.16) + ')';
      f.lineWidth = 0.5 + r() * 0.8;
      f.beginPath(); f.moveTo(x, y);
      f.quadraticCurveTo(x + Math.cos(a) * l * 0.5 - Math.sin(a) * b, y + Math.sin(a) * l * 0.5 + Math.cos(a) * b,
        x + Math.cos(a) * l, y + Math.sin(a) * l);
      f.stroke();
    }
    const fibres = f.getImageData(0, 0, S, S).data;
    const h = new Float32Array(S * S), col = new Uint8Array(S * S * 4), rough = new Uint8Array(S * S * 4);
    for (let y = 0, i = 0; y < S; y++) {
      for (let x = 0; x < S; x++, i++) {
        const u = x / S, v = y / S;
        const big = fbm(u * 6, v * 6, 3, 6, 6);
        const mid = fbm(u * 48, v * 48, 3, 48, 48);
        const fine = noise(u * 220, v * 220, 220, 220);
        const fb = fibres[i * 4] / 255;
        h[i] = big * 0.35 + mid * 0.42 + fine * 0.13 + fb * 0.55;
        const tone = 0.965 + (big - 0.5) * 0.09 + (mid - 0.5) * 0.045 + fb * 0.028;
        const k = i * 4;
        col[k] = Math.min(255, 236 * tone);
        col[k + 1] = Math.min(255, 224 * tone);
        col[k + 2] = Math.min(255, 198 * (tone - (big - 0.5) * 0.05));
        col[k + 3] = 255;
        const ro = 218 + (mid - 0.5) * 42 - fb * 16;
        rough[k] = rough[k + 1] = rough[k + 2] = ro; rough[k + 3] = 255;
      }
    }
    //motitas del algodon
    for (let n = 0; n < 170; n++) {
      const cx = (r() * S) | 0, cy = (r() * S) | 0, dark = 0.72 + r() * 0.2, len = 1 + ((r() * 5) | 0), a = r() * 6.28;
      for (let t = 0; t < len; t++) {
        const px = ((cx + Math.cos(a) * t + S) | 0) % S, py = ((cy + Math.sin(a) * t + S) | 0) % S, k = (px + py * S) * 4;
        col[k] *= dark; col[k + 1] *= dark * 0.98; col[k + 2] *= dark * 0.93;
      }
    }
    return {
      map: dataTexture(col, S, S, true, true),
      normalMap: dataTexture(normalsFrom(h, S, S, 2.1, true), S, S, false, true),
      roughnessMap: dataTexture(rough, S, S, false, true)
    };
  };

  //forro burdeos con damasco tono sobre tono
  X.makeLiner = function () {
    const S = 512, c = canvas(S, S), g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 1.5;
    const motif = function (cx, cy, s) {
      g.save(); g.translate(cx, cy);
      for (let k = 0; k < 4; k++) {
        g.rotate(Math.PI / 2);
        g.beginPath(); g.moveTo(0, 0);
        g.bezierCurveTo(s * 0.34, -s * 0.2, s * 0.3, -s * 0.66, 0, -s);
        g.bezierCurveTo(-s * 0.3, -s * 0.66, -s * 0.34, -s * 0.2, 0, 0);
        g.stroke();
        g.beginPath(); g.moveTo(0, -s * 0.18);
        g.bezierCurveTo(s * 0.12, -s * 0.34, s * 0.1, -s * 0.58, 0, -s * 0.74);
        g.bezierCurveTo(-s * 0.1, -s * 0.58, -s * 0.12, -s * 0.34, 0, -s * 0.18);
        g.fill();
        g.save(); g.rotate(Math.PI / 4);
        g.beginPath(); g.moveTo(0, -s * 0.16); g.quadraticCurveTo(s * 0.16, -s * 0.42, 0, -s * 0.62);
        g.quadraticCurveTo(-s * 0.16, -s * 0.42, 0, -s * 0.16); g.stroke();
        g.restore();
      }
      g.restore();
    };
    for (let y = -1; y <= 2; y++) for (let x = -1; x <= 2; x++) { motif(x * 256, y * 256, 75); motif(x * 256 + 128, y * 256 + 128, 75); }
    const d = g.getImageData(0, 0, S, S).data;
    const m = new Float32Array(S * S);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4] / 255;
    const soft = boxBlur(m, S, S, 1);
    const col = new Uint8Array(S * S * 4), rough = new Uint8Array(S * S * 4), h = new Float32Array(S * S);
    for (let y = 0, i = 0; y < S; y++) {
      for (let x = 0; x < S; x++, i++) {
        const u = x / S, v = y / S, k = i * 4;
        const weave = noise(u * 256, v * 256, 256, 256);
        const big = fbm(u * 5, v * 5, 3, 5, 5);
        const t = 0.92 + (big - 0.5) * 0.2 + (weave - 0.5) * 0.09 + soft[i] * 0.34;
        col[k] = 82 * t; col[k + 1] = 15 * t; col[k + 2] = 26 * t; col[k + 3] = 255;
        h[i] = soft[i] * 0.55 + weave * 0.28;
        const ro = 188 - soft[i] * 54 + (weave - 0.5) * 22;
        rough[k] = rough[k + 1] = rough[k + 2] = ro; rough[k + 3] = 255;
      }
    }
    return {
      map: dataTexture(col, S, S, true, true),
      normalMap: dataTexture(normalsFrom(h, S, S, 1.8, true), S, S, false, true),
      roughnessMap: dataTexture(rough, S, S, false, true)
    };
  };

  //lacre: relieve, color y mapa de rugosidad/metal (el relieve tambien da forma a la malla)
  X.makeSeal = function () {
    const S = 512, c = canvas(S, S), g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2);
    //el dibujo esta pensado para 1024 px
    g.scale(S / 1024, S / 1024);
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = 8; g.beginPath(); g.arc(0, 0, 356, 0, 7); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 318, 0, 7); g.stroke();
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      g.beginPath(); g.arc(Math.cos(a) * 337, Math.sin(a) * 337, i % 4 === 0 ? 7 : 4.2, 0, 7); g.fill();
    }
    //estrella de ocho puntas en relieve
    for (let k = 0; k < 8; k++) {
      g.save(); g.rotate((k / 8) * Math.PI * 2);
      const major = k % 2 === 0, L = major ? 258 : 176;
      g.lineWidth = major ? 13 : 8;
      g.beginPath(); g.moveTo(0, -38); g.lineTo(0, -L); g.stroke();
      const steps = major ? [0.42, 0.62, 0.8] : [0.56, 0.8];
      steps.forEach(function (p, n) {
        const b = (major ? 66 : 34) * (1 - n * 0.24);
        g.lineWidth = major ? 8 : 5;
        g.beginPath(); g.moveTo(-b, -L * p - b * 0.86); g.lineTo(0, -L * p); g.lineTo(b, -L * p - b * 0.86); g.stroke();
      });
      g.beginPath(); g.moveTo(0, -L - 19); g.lineTo(12, -L); g.lineTo(0, -L + 19); g.lineTo(-12, -L); g.closePath(); g.fill();
      g.restore();
    }
    g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 46, 0, 7); g.stroke();
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, rad = i % 2 ? 11 : 33;
      g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rad, Math.sin(a) * rad);
    }
    g.closePath(); g.fill();
    g.setTransform(1, 0, 0, 1, 0, 0);

    const d = g.getImageData(0, 0, S, S).data;
    const raw = new Float32Array(S * S);
    for (let i = 0; i < raw.length; i++) raw[i] = d[i * 4] / 255;
    const relief = boxBlur(raw, S, S, 1);
    const col = new Uint8Array(S * S * 4), orm = new Uint8Array(S * S * 4), h = new Float32Array(S * S);
    for (let y = 0, i = 0; y < S; y++) {
      for (let x = 0; x < S; x++, i++) {
        const u = x / S, v = y / S, k = i * 4;
        const big = fbm(u * 7, v * 7, 4, 7, 7), fine = noise(u * 160, v * 160, 160, 160);
        //lo que sobresale lleva pan de oro gastado
        const gold = Math.min(1, Math.max(0, (relief[i] - 0.34) * 3.4));
        const wear = gold * (0.76 + 0.3 * big + (fine - 0.5) * 0.28);
        const w = 0.72 + big * 0.62 + (fine - 0.5) * 0.08;
        col[k] = (72 * w) * (1 - wear) + 201 * wear;
        col[k + 1] = (9 * w) * (1 - wear) + 154 * wear;
        col[k + 2] = (15 * w) * (1 - wear) + 82 * wear;
        col[k + 3] = 255;
        orm[k] = 255;
        orm[k + 1] = (0.34 + big * 0.14) * 255 * (1 - wear) + (0.3 + fine * 0.14) * 255 * wear;
        orm[k + 2] = wear * 245;
        orm[k + 3] = 255;
        h[i] = relief[i] * 1.0 + big * 0.2 + fine * 0.012;
      }
    }
    X.sealRelief = { data: relief, S: S };
    return {
      map: dataTexture(col, S, S, true, false),
      normalMap: dataTexture(normalsFrom(h, S, S, 2.6, false), S, S, false, false),
      orm: dataTexture(orm, S, S, false, false)
    };
  };

  //lo escrito en el sobre: a lapiz y con letra de niño, como la carta
  X.makeInscription = function (texto, fuente) {
    const W = 1472, H = 384, c = canvas(W, H), g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = fuente;
    //un niño no escribe recto
    g.translate(W / 2, H / 2 + 6);
    g.rotate(-0.025);
    g.fillText(texto, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    const d = g.getImageData(0, 0, W, H).data, a = new Float32Array(W * H);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4] / 255;
    const soft = boxBlur(a, W, H, 1);
    const col = new Uint8Array(W * H * 4), rough = new Uint8Array(W * H * 4), hh = new Float32Array(W * H);
    for (let y = 0, i = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i++) {
        //el grafito no cubre del todo: deja ver el grano del papel
        const k = i * 4, n = noise((x / W) * 360, (y / H) * 94, 256, 256);
        const v = 0.85 + n * 0.3;
        col[k] = 52 * v; col[k + 1] = 54 * v; col[k + 2] = 62 * v;
        col[k + 3] = Math.min(255, a[i] * 255 * (0.55 + n * 0.4));
        hh[i] = -soft[i] + n * 0.05;
        rough[k] = rough[k + 1] = rough[k + 2] = 120 + n * 50; rough[k + 3] = 255;
      }
    }
    return {
      map: dataTexture(col, W, H, true, false),
      normalMap: dataTexture(normalsFrom(hh, W, H, 1.6, false), W, H, false, false),
      roughnessMap: dataTexture(rough, W, H, false, false)
    };
  };

  //sombra difusa dibujada en canvas: los pliegues del sobre se oscurecen un poco
  X.makeShadowDecal = function (draw, w, h, blur, alpha) {
    const c = canvas(w, h), g = c.getContext('2d');
    g.shadowColor = 'rgba(18,8,3,' + alpha + ')';
    g.shadowBlur = blur;
    g.shadowOffsetX = w * 2;
    g.translate(-w * 2, 0);
    g.fillStyle = '#000';
    draw(g);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  };
})();
