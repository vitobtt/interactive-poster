//geometria del sobre, lacre que se rompe y carta plegada (adaptado del proyecto del sobre)
//todo se mide en unidades del sobre; main.js lo escala a pixeles del cartel
(function () {
  const X = window.Sobre;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  X.smooth = smooth;

  const W = 3.5, H = 2.4;
  const PIVOT_Z = 0.012;

  //altura de la cara del sobre: abombado por la carta y hundido en los bordes
  function P(x, y) {
    const d = Math.min(W / 2 - Math.abs(x), H / 2 - Math.abs(y));
    const ramp = smooth(0, 0.2, d);
    const nx = x / (W / 2), ny = y / (H / 2);
    const swell = 0.05 + 0.045 * (1 - nx * nx) * (1 - ny * ny);
    const wrinkle = 0.0035 * Math.sin(x * 2.1 + y * 1.3 + 0.6) * Math.sin(y * 2.7 - x * 0.8) +
      0.0014 * Math.sin(x * 7.3 - y * 4.1) * Math.cos(y * 6.2 + x * 1.7);
    return 0.016 + (swell + wrinkle) * ramp;
  }

  function roundedShape(pts, radii) {
    const s = new THREE.Shape(), n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
      const r = Array.isArray(radii) ? radii[i] : radii;
      const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const ra = Math.min(r, la * 0.45), rb = Math.min(r, lb * 0.45);
      const ix = p[0] + ((a[0] - p[0]) / la) * ra, iy = p[1] + ((a[1] - p[1]) / la) * ra;
      const ox = p[0] + ((b[0] - p[0]) / lb) * rb, oy = p[1] + ((b[1] - p[1]) / lb) * rb;
      if (i === 0) s.moveTo(ix, iy); else s.lineTo(ix, iy);
      s.quadraticCurveTo(p[0], p[1], ox, oy);
    }
    s.closePath();
    return s;
  }

  //subdivide por la arista mas larga, sin dejar grietas entre triangulos vecinos
  function tessellate(geo, maxEdge) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const P0 = g.attributes.position.array, N0 = g.attributes.normal.array, U0 = g.attributes.uv.array;
    const pos = [], nor = [], uv = [], groups = [];
    const vert = (i) => [P0[i * 3], P0[i * 3 + 1], P0[i * 3 + 2], N0[i * 3], N0[i * 3 + 1], N0[i * 3 + 2], U0[i * 2], U0[i * 2 + 1]];
    const mid = (a, b) => a.map((v, i) => (v + b[i]) * 0.5);
    const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    const max2 = maxEdge * maxEdge;
    const emit = (v) => { pos.push(v[0], v[1], v[2]); nor.push(v[3], v[4], v[5]); uv.push(v[6], v[7]); };
    const split = (a, b, c) => {
      const ab = d2(a, b), bc = d2(b, c), ca = d2(c, a), m = Math.max(ab, bc, ca);
      if (m <= max2) { emit(a); emit(b); emit(c); return; }
      if (m === ab) { const q = mid(a, b); split(a, q, c); split(q, b, c); }
      else if (m === bc) { const q = mid(b, c); split(b, q, a); split(q, c, a); }
      else { const q = mid(c, a); split(c, q, b); split(q, a, b); }
    };
    const src = g.groups.length ? g.groups : [{ start: 0, count: P0.length / 3, materialIndex: 0 }];
    src.forEach((gr) => {
      const start = pos.length / 3;
      for (let i = gr.start; i < gr.start + gr.count; i += 3) split(vert(i), vert(i + 1), vert(i + 2));
      groups.push({ start, count: pos.length / 3 - start, materialIndex: gr.materialIndex });
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    groups.forEach((x) => out.addGroup(x.start, x.count, x.materialIndex));
    return out;
  }

  function sheet(pts, radius, depth, zFn, uvOffset, bevel = 0.0016, maxEdge = 0.055) {
    const shape = roundedShape(pts, radius);
    const raw = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
      bevelOffset: -bevel, bevelSegments: 1, curveSegments: 6
    });
    const g = tessellate(raw, maxEdge);
    raw.dispose();
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    const e = 0.004;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      u.setXY(i, x * 0.33 + uvOffset, y * 0.33 + uvOffset * 0.7);
      if (!zFn) continue;
      p.setZ(i, z + zFn(x, y));
      const nz = n.getZ(i);
      if (Math.abs(nz) > 0.7) {
        const dx = (zFn(x + e, y) - zFn(x - e, y)) / (2 * e), dy = (zFn(x, y + e) - zFn(x, y - e)) / (2 * e);
        const s = Math.sign(nz), l = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        n.setXYZ(i, -dx * s * l, -dy * s * l, s * l);
      }
    }
    return g;
  }

  function decal(w, h, cx, cy, zOff, material, order) {
    const g = new THREE.PlaneGeometry(w, h, Math.ceil(w / 0.05), Math.ceil(h / 0.05));
    const p = g.attributes.position, n = g.attributes.normal, e = 0.004;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + cx, y = p.getY(i) + cy;
      p.setXYZ(i, x, y, P(x, y) + zOff);
      const dx = (P(x + e, y) - P(x - e, y)) / (2 * e), dy = (P(x, y + e) - P(x, y - e)) / (2 * e);
      const l = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      n.setXYZ(i, -dx * l, -dy * l, l);
    }
    const m = new THREE.Mesh(g, material);
    m.renderOrder = order;
    return m;
  }

  //lacre
  const SEAL_R = 0.37, UV_SPAN = 0.43;
  const sealOutline = (a) => SEAL_R * (1 + 0.052 * Math.sin(3 * a + 1.1) + 0.034 * Math.sin(5 * a + 2.4) + 0.018 * Math.sin(9 * a + 0.3) + 0.009 * Math.sin(17 * a));

  function sealHeight(x, y) {
    const a = Math.atan2(y, x), rho = Math.hypot(x, y) / sealOutline(a);
    if (rho >= 1) return 0.002;
    const edge = Math.pow(clamp(1 - rho), 0.5);
    const rim = 0.058 * Math.min(1, edge * 2.05);
    const press = 0.024 * smooth(0.86, 0.74, rho);
    const R = X.sealRelief, S = R.S;
    const px = clamp((x / (2 * UV_SPAN) + 0.5) * (S - 1), 0, S - 1), py = clamp((0.5 - y / (2 * UV_SPAN)) * (S - 1), 0, S - 1);
    const x0 = px | 0, y0 = py | 0, x1 = Math.min(S - 1, x0 + 1), y1 = Math.min(S - 1, y0 + 1), fx = px - x0, fy = py - y0;
    const r = (R.data[x0 + y0 * S] * (1 - fx) + R.data[x1 + y0 * S] * fx) * (1 - fy) + (R.data[x0 + y1 * S] * (1 - fx) + R.data[x1 + y1 * S] * fx) * fy;
    const organic = 0.0022 * Math.sin(x * 19 + 1.2) * Math.cos(y * 23);
    return 0.003 + rim - press + r * 0.0105 * smooth(0.97, 0.88, rho) + organic * smooth(1, 0.8, rho);
  }

  function buildSealMesh(mat) {
    const rings = 96, seg = 220, pos = [], uv = [], idx = [];
    for (let j = 0; j <= rings; j++) {
      const t = Math.pow(j / rings, 0.82);
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2, rr = sealOutline(a) * t;
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        pos.push(x, y, j === rings ? 0.001 : sealHeight(x, y));
        uv.push(x / (2 * UV_SPAN) + 0.5, y / (2 * UV_SPAN) + 0.5);
      }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  //fractura de voronoi: cada grieta es irregular pero coincide entre piezas vecinas
  function buildShards(mat, breakMat) {
    const r = X.rng(1225), seeds = [[0.03, -0.02]];
    for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283 + r() * 0.8, q = 0.13 + r() * 0.05; seeds.push([Math.cos(a) * q, Math.sin(a) * q]); }
    for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.283 + r() * 0.5, q = 0.29 + r() * 0.05; seeds.push([Math.cos(a) * q, Math.sin(a) * q]); }
    const outline = [];
    for (let i = 0; i < 96; i++) { const a = (i / 96) * Math.PI * 2, q = sealOutline(a); outline.push([Math.cos(a) * q, Math.sin(a) * q, 1]); }

    const clip = (poly, m, nx, ny) => {
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const A = poly[i], B = poly[(i + 1) % poly.length];
        const da = (A[0] - m[0]) * nx + (A[1] - m[1]) * ny, db = (B[0] - m[0]) * nx + (B[1] - m[1]) * ny;
        if (da <= 0) out.push(A);
        if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
          const t = da / (da - db);
          out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, 0]);
        }
      }
      return out;
    };
    const jag = (x, y) => [
      (X.noise(x * 26 + 9, y * 26, 256, 256) - 0.5) * 0.034 + (X.noise(x * 74, y * 74 + 4, 256, 256) - 0.5) * 0.012,
      (X.noise(x * 26, y * 26 + 31, 256, 256) - 0.5) * 0.034 + (X.noise(x * 74 + 8, y * 74, 256, 256) - 0.5) * 0.012
    ];

    const group = new THREE.Group(), shards = [];
    seeds.forEach((s, k) => {
      let poly = outline.slice();
      seeds.forEach((o, j) => {
        if (j === k) return;
        const m = [(s[0] + o[0]) / 2, (s[1] + o[1]) / 2];
        const nx = o[0] - s[0], ny = o[1] - s[1], l = Math.hypot(nx, ny);
        poly = clip(poly, m, nx / l, ny / l);
      });
      if (poly.length < 3) return;
      const pts = [];
      for (let i = 0; i < poly.length; i++) {
        const A = poly[i], B = poly[(i + 1) % poly.length];
        const onRim = A[2] === 1 && B[2] === 1;
        const len = Math.hypot(B[0] - A[0], B[1] - A[1]), steps = onRim ? 1 : Math.max(1, Math.ceil(len / 0.016));
        for (let t = 0; t < steps; t++) {
          const f = t / steps, x = A[0] + (B[0] - A[0]) * f, y = A[1] + (B[1] - A[1]) * f;
          const isRim = A[2] === 1 && t === 0;
          if (isRim) pts.push(new THREE.Vector2(x, y));
          else { const q = jag(x, y); const c = Math.min(1, (SEAL_R * 0.98 - Math.hypot(x, y)) / 0.04); pts.push(new THREE.Vector2(x + q[0] * Math.max(0, c), y + q[1] * Math.max(0, c))); }
        }
      }
      const shape = new THREE.Shape(pts);
      const raw = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps: 1 });
      const g = tessellate(raw, 0.021);
      raw.dispose();
      const p = g.attributes.position, u = g.attributes.uv, n = g.attributes.normal, e = 0.0025;
      let cx = 0, cy = 0, c = 0;
      for (let i = 0; i < p.count; i++) { cx += p.getX(i); cy += p.getY(i); c++; }
      cx /= c; cy /= c;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), top = sealHeight(x, y);
        u.setXY(i, x / (2 * UV_SPAN) + 0.5, y / (2 * UV_SPAN) + 0.5);
        p.setXYZ(i, x - cx, y - cy, top * z);
        if (n.getZ(i) > 0.7) {
          const dx = (sealHeight(x + e, y) - sealHeight(x - e, y)) / (2 * e), dy = (sealHeight(x, y + e) - sealHeight(x, y - e)) / (2 * e);
          const l = 1 / Math.sqrt(dx * dx + dy * dy + 1);
          n.setXYZ(i, -dx * l, -dy * l, l);
        }
      }
      const mesh = new THREE.Mesh(g, [mat, breakMat]);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.position.set(cx, cy, 0);
      const ang = Math.atan2(cy, cx) + (r() - 0.5) * 0.7, dist = 0.45 + r() * 0.95;
      mesh.userData = {
        home: new THREE.Vector3(cx, cy, 0),
        dir: new THREE.Vector2(Math.cos(ang), Math.sin(ang) - 0.25).normalize(),
        dist, up: 0.34 + r() * 0.46, delay: r() * 0.16,
        spin: new THREE.Vector3((r() - 0.5) * 9, (r() - 0.5) * 9, (r() - 0.5) * 5)
      };
      group.add(mesh); shards.push(mesh);
    });
    return { group, shards };
  }

  //carta: una hoja doblada por la mitad; la mitad de abajo se pliega sobre la de arriba
  //materiales: { frente, dorso } los pone main.js con la carta del niño
  function buildLetter(materiales, LW, PH) {
    const geo = new THREE.PlaneGeometry(LW, PH * 2, 32, 110);
    const base = geo.attributes.position.array.slice();
    //arrugas pequeñas fijas: solo se notan con la hoja abierta
    const arrugas = new Float32Array(base.length / 3);
    for (let i = 0; i < arrugas.length; i++) {
      const x = base[i * 3], y = base[i * 3 + 1];
      arrugas[i] = 0.006 * (X.noise(x * 2.6 + 7, y * 2.6, 256, 256) - 0.5) + 0.003 * (X.noise(x * 7 + 3, y * 7 + 9, 256, 256) - 0.5);
    }
    const root = new THREE.Group();
    const front = new THREE.Mesh(geo, materiales.frente), back = new THREE.Mesh(geo, materiales.dorso);
    front.castShadow = true; front.receiveShadow = true; back.receiveShadow = true;
    root.add(front, back);

    const rad = 0.011;
    //phi: angulo del doblez (pi cerrada, 0 abierta); flutter: ondula al moverse; curl: comba que queda al abrirla
    function setFold(phi, flutter, curl) {
      const p = geo.attributes.position.array, n = geo.attributes.normal.array;
      for (let i = 0, c = p.length / 3; i < c; i++) {
        const x = base[i * 3], s = base[i * 3 + 1];
        const ripple = flutter * 0.03 * Math.sin(x * 1.7 + s * 1.2) * smooth(0, 1.9, Math.abs(s)) + arrugas[i] * curl;
        let y, z, ny, nz;
        if (s >= 0) { y = s; z = 0; ny = 0; nz = 1; }
        else {
          const L = -s, arc = rad * phi;
          if (L <= arc) {
            const t = L / rad;
            y = -rad * Math.sin(t); z = rad * (1 - Math.cos(t)); ny = Math.sin(t); nz = Math.cos(t);
          } else {
            const ey = -rad * Math.sin(phi), ez = rad * (1 - Math.cos(phi)), q = L - arc;
            y = ey - Math.cos(phi) * q; z = ez + Math.sin(phi) * q; ny = Math.sin(phi); nz = Math.cos(phi);
          }
        }
        //el papel conserva una ligera curvatura al abrirse
        const nxx = x / (LW / 2), bow = curl * 0.055 * nxx * nxx, slope = curl * 0.055 * 2 * nxx / (LW / 2);
        const nl = 1 / Math.sqrt(slope * slope * nz * nz + ny * ny + nz * nz);
        p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z + ripple - bow;
        n[i * 3] = slope * nz * nl; n[i * 3 + 1] = ny * nl; n[i * 3 + 2] = nz * nl;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.normal.needsUpdate = true;
      geo.computeBoundingSphere();
    }
    return { root: root, setFold: setFold, width: LW, panel: PH };
  }

  //conjunto: sobre, solapa, lacre y carta
  //t: texturas del sobre; carta: { materiales, ancho, panel }
  X.buildEnvelope = function (t, carta) {
    const group = new THREE.Group();
    const paperMat = new THREE.MeshPhysicalMaterial({
      map: t.paper.map, normalMap: t.paper.normalMap, normalScale: new THREE.Vector2(0.72, 0.72),
      roughnessMap: t.paper.roughnessMap, roughness: 1, metalness: 0,
      sheen: 0.32, sheenRoughness: 0.72, sheenColor: new THREE.Color('#fff1da'), envMapIntensity: 0.72
    });
    const linerMat = new THREE.MeshPhysicalMaterial({
      map: t.liner.map, normalMap: t.liner.normalMap, normalScale: new THREE.Vector2(0.34, 0.34),
      roughnessMap: t.liner.roughnessMap, roughness: 1, metalness: 0,
      sheen: 0.8, sheenRoughness: 0.5, sheenColor: new THREE.Color('#a4404c'), envMapIntensity: 0.7
    });
    const add = (g, m, parent = group) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = true; mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const hw = W / 2, hh = H / 2;

    add(sheet([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]], 0.022, 0.012, null, 0.12), paperMat);
    const inset = 0.11;
    add(sheet([[-hw + inset, -hh + inset], [hw - inset, -hh + inset], [hw - inset, hh - 0.012], [-hw + inset, hh - 0.012]], 0.01, 0.0006, () => 0.0142, 0.31, 0), linerMat);

    add(sheet([[-hw, hh], [-hw, -hh], [0.08, -0.03]], [0.02, 0.02, 0.05], 0.006, P, 0.47), paperMat);
    add(sheet([[hw, -hh], [hw, hh], [-0.08, -0.03]], [0.02, 0.02, 0.05], 0.006, P, 0.71), paperMat);
    add(sheet([[-hw, -hh], [hw, -hh], [0, 0.2]], [0.022, 0.022, 0.1], 0.006, (x, y) => P(x, y) + 0.0105, 0.93), paperMat);

    //sombras de contacto en los pliegues
    const tmW = 1024, tmH = Math.round((tmW * H) / W);
    const toPx = (x, y) => [(x / W + 0.5) * tmW, (0.5 - y / H) * tmH];
    const tri = (g, a, b, c) => { g.beginPath(); g.moveTo(...toPx(...a)); g.lineTo(...toPx(...b)); g.lineTo(...toPx(...c)); g.closePath(); g.fill(); };
    const pocketAO = X.makeShadowDecal((g) => tri(g, [-hw, -hh], [hw, -hh], [0, 0.2]), tmW, tmH, 20, 0.62);
    const pocketAOMat = new THREE.MeshBasicMaterial({ map: pocketAO, transparent: true, depthWrite: false, toneMapped: false });
    group.add(decal(W - 0.006, H - 0.006, 0, 0, 0.0084, pocketAOMat, 1));

    const flapAO = X.makeShadowDecal((g) => tri(g, [-hw, hh], [hw, hh], [0, -0.17]), tmW, tmH, 30, 0.66);
    const flapAOMat = new THREE.MeshBasicMaterial({ map: flapAO, transparent: true, depthWrite: false, toneMapped: false, opacity: 1 });
    const flapShadow = decal(W - 0.006, H - 0.006, 0, 0, 0.0198, flapAOMat, 3);
    group.add(flapShadow);

    //lo escrito a lapiz: el grafito brilla un poco con luz rasante
    const inscMat = new THREE.MeshStandardMaterial({
      map: t.inscription.map, normalMap: t.inscription.normalMap, normalScale: new THREE.Vector2(0.5, 0.5),
      roughnessMap: t.inscription.roughnessMap, roughness: 1, metalness: 0.25, transparent: true,
      depthWrite: false, envMapIntensity: 0.9, alphaTest: 0.02
    });
    const inscription = decal(2.3, 0.6, 0, -0.81, 0.019, inscMat, 2);
    inscription.receiveShadow = true;
    group.add(inscription);

    //solapa articulada
    const flapPivot = new THREE.Group();
    flapPivot.position.set(0, hh, PIVOT_Z);
    group.add(flapPivot);
    const flapZ = (x, y) => P(x, y + hh) + 0.036 - PIVOT_Z;
    const flapPts = [[-hw, 0], [0, -hh - 0.16], [hw, 0]];
    const makeFlapPart = (g, m, shiftZ) => {
      const pos = g.attributes.position, nor = g.attributes.normal;
      const raw = new Float32Array(pos.count), closed = new Float32Array(pos.count), n0 = nor.array.slice();
      for (let i = 0; i < pos.count; i++) {
        const c = flapZ(pos.getX(i), pos.getY(i));
        raw[i] = pos.getZ(i) - c + shiftZ;
        closed[i] = c;
        pos.setZ(i, raw[i] + c);
      }
      const mesh = add(g, m, flapPivot);
      return { pos, nor, raw, closed, n0, mesh };
    };
    const flapParts = [
      makeFlapPart(sheet(flapPts, [0.016, 0.075, 0.016], 0.01, flapZ, 0.18, 0.002, 0.045), paperMat, -0.01),
      makeFlapPart(sheet([[-hw + 0.2, -0.045], [0, -hh + 0.03], [hw - 0.2, -0.045]], [0.012, 0.055, 0.012], 0.0006, flapZ, 0.57, 0, 0.045), linerMat, -0.0128)
    ];
    function setFlap(open, bend) {
      flapPivot.rotation.x = -open * (Math.PI - 0.012);
      const o = smooth(0.05, 0.8, open);
      flapShadow.visible = open < 0.5;
      flapAOMat.opacity = 1 - smooth(0, 0.42, open);
      flapParts.forEach((f) => {
        const p = f.pos.array, n = f.nor.array;
        for (let i = 0; i < f.pos.count; i++) {
          const y = p[i * 3 + 1], b = bend * 0.11 * y * y;
          p[i * 3 + 2] = f.raw[i] + f.closed[i] * (1 - o) + b;
          const nz = f.n0[i * 3 + 2];
          if (Math.abs(nz) < 0.5) continue; //los cantos conservan su normal
          const nx = f.n0[i * 3] * (1 - o), ny = f.n0[i * 3 + 1] * (1 - o) - 2 * bend * 0.11 * y * nz;
          const l = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
          n[i * 3] = nx * l; n[i * 3 + 1] = ny * l; n[i * 3 + 2] = nz * l;
        }
        f.pos.needsUpdate = true; f.nor.needsUpdate = true;
        f.mesh.geometry.computeBoundingSphere();
      });
    }

    //lacre
    const sealMat = new THREE.MeshPhysicalMaterial({
      map: t.seal.map, normalMap: t.seal.normalMap, normalScale: new THREE.Vector2(0.72, 0.72),
      roughnessMap: t.seal.orm, metalnessMap: t.seal.orm, roughness: 1, metalness: 1,
      clearcoat: 0.42, clearcoatRoughness: 0.3, envMapIntensity: 1.25, emissive: new THREE.Color('#3d0508'), emissiveIntensity: 0
    });
    const breakMat = new THREE.MeshStandardMaterial({ color: '#3a070c', roughness: 0.68, metalness: 0, envMapIntensity: 0.6 });
    const sealGroup = new THREE.Group();
    const sealY = -0.1;
    sealGroup.position.set(0, sealY, P(0, sealY) + 0.0375);
    group.add(sealGroup);
    const seal = buildSealMesh(sealMat);
    sealGroup.add(seal);
    const { group: shardGroup, shards } = buildShards(sealMat, breakMat);
    shardGroup.visible = false;
    sealGroup.add(shardGroup);

    function setSeal(crack, shatter) {
      const broken = crack >= 0.98;
      seal.visible = !broken;
      shardGroup.visible = broken && shatter < 1;
      seal.scale.setScalar(1 + Math.sin(crack * Math.PI) * 0.018);
      seal.rotation.z = Math.sin(crack * 22) * 0.012 * crack;
      const floorZ = 0.018;
      shards.forEach((s) => {
        const u = s.userData, q = clamp((shatter - u.delay) / (1 - u.delay));
        const fly = 1 - Math.pow(1 - q, 2.1);
        s.position.x = u.home.x + u.dir.x * (0.012 * crack + fly * u.dist);
        s.position.y = u.home.y + u.dir.y * (0.012 * crack + fly * u.dist);
        const hop = u.up * 4 * q * (1 - q) * (1 - q * 0.45);
        s.position.z = Math.max(floorZ * q, u.home.z + hop);
        s.rotation.set(u.spin.x * fly, u.spin.y * fly, u.spin.z * fly);
        s.scale.setScalar(Math.max(0.0001, 1 - smooth(0.62, 1, q)));
      });
    }

    const letter = buildLetter(carta.materiales, carta.ancho, carta.panel);
    letter.setFold(Math.PI, 0, 0);

    setFlap(0, 0);
    setSeal(0, 0);
    return {
      group, setFlap, setSeal, letter, sealMat, W, H,
      letterHome: new THREE.Vector3(0, -1.04, 0.028)
    };
  };
})();
