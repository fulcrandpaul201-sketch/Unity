// Cour de château en 3D, de nuit, vue à la 3e personne : l'avatar se déplace par rapport à la caméra,
// qu'on fait tourner autour de lui (souris / doigt / flèches).
const AVATAR_URI = "data:image/png;base64,{{AVATAR}}";
const BRICK_URI = "data:image/png;base64,{{BRICK}}";
const FLOOR_URI = "data:image/png;base64,{{FLOOR}}";

// ---------- Réglages ----------
const ROOM = 26, HALF = ROOM / 2, WALL_H = 15.6;             // cour carrée de 26 m entourée de façades à 3 niveaux
const TILE = 2;                                              // une texture couvre 2 m x 2 m (répétée, jamais étirée)
const SPEED = 4.2;                                           // m/s
const JUMP_SPEED = 5.4, GRAVITY = 15;                        // saut : environ 1 m de haut
const FLY_SPEED = 7.5, FLY_CLIMB = 4.5;                        // vol en balai (m/s)
const PLAYER_R = 0.3;                                        // rayon de collision de l'avatar
const COLORS = { bg: 0x0b1020 };                             // ciel de nuit au-dessus des murs

// ---------- Scène ----------
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.bg);
const camera = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 100);

// Texture pixel art répétée en mosaïque : le nombre de répétitions suit la taille de la surface
const loader = new THREE.TextureLoader();
function tiled(uri, width, height) {
  const t = loader.load(uri);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(width / TILE, height / TILE);
  t.magFilter = THREE.NearestFilter;                 // pixels nets de près
  t.minFilter = THREE.LinearMipmapLinearFilter;      // pas de scintillement de loin
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.encoding = THREE.sRGBEncoding;
  return t;
}
const surface = map => new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 });

// Pénombre en hauteur : les étages restent visibles mais s'assombrissent doucement vers le ciel de nuit
const FADE_START = 9, FADE_END = 24;
function withHeightFade(mat) {
  mat.customProgramCacheKey = () => "heightFade";   // sinon Three.js réutilise le shader du sol, sans le fondu
  mat.onBeforeCompile = sh => {
    sh.uniforms.fadeColor = { value: new THREE.Color(COLORS.bg) };
    sh.vertexShader = "varying float vWorldY;\n" + sh.vertexShader.replace("#include <begin_vertex>",
      "#include <begin_vertex>\nvWorldY = (modelMatrix * vec4(transformed, 1.0)).y;");
    sh.fragmentShader = "varying float vWorldY;\nuniform vec3 fadeColor;\n" + sh.fragmentShader.replace("#include <dithering_fragment>",
      "#include <dithering_fragment>\nfloat fadeT = smoothstep(" + FADE_START.toFixed(2) + ", " + FADE_END.toFixed(2) + ", vWorldY);\n" +
      "gl_FragColor.rgb = mix(gl_FragColor.rgb, fadeColor, 0.6 * pow(fadeT, 0.8));");
  };
  return mat;
}

// ---------- Architecture : la même structure en pierre sur les 4 murs ----------
// Repère local d'un mur : x le long du mur, y vers le haut, z vers l'intérieur de la pièce (0 = surface du mur)
const ARCH = { w: 3.0, h: 3.0, depth: 1.4, ring: 0.42, out: 0.2 };   // ouverture 3 m, montants de 3 m, passage voûté de 1,4 m
const AR = ARCH.w / 2;
const ARCH_X = [0];                                                  // une arche au centre de chaque mur
const PILLAR_X = [-HALF + 0.35, -9.75, -3.25, 3.25, 9.75, HALF - 0.35];   // piliers réguliers et dans les angles
const PILLAR = { w: 0.7, out: 0.3, h: 5.0 };
const PLINTH = { h: 0.32, out: 0.1 }, CORNICE = { y: 5.35, h: 0.26, out: 0.2 };
const WALL_CLEAR = 0.8;                                              // distance minimale avatar / mur
// Fenêtres (murs de gauche et de droite) : plein cintre, appui à 1,5 m, sommet à 3,4 m
const WIN = { w: 1.4, bottom: 1.5, spring: 2.7, depth: 0.45, ring: 0.3, out: 0.16 };
const WR = WIN.w / 2;
const WIN_X = [];                                                     // pas de fenêtre au rez-de-chaussée (arcades seulement)
const UPPER_LEVELS = [6.3, 10.5];                                     // appuis des fenêtres des 2 étages
const UPPER_X = [-6.5, 0, 6.5];                                        // pas de fenêtre trop près des angles
const STRING_Y = 9.6, TOP_CORNICE_Y = 14.45;                          // bandeau entre les étages, corniche sommitale
// Salles derrière les arches
const RW = 12, RD = 10, RH = 5;                                       // largeur, profondeur, hauteur sous plafond

const metersBrick = () => tiled(BRICK_URI, 1, 1);                    // UV en mètres -> 1 répétition tous les 2 m
const floorMat = (w, d) => surface(tiled(FLOOR_URI, w, d));
const wallMat = withHeightFade(surface(metersBrick()));
wallMat.shadowSide = THREE.DoubleSide;                               // les murs (plans) projettent leur ombre au clair de lune
const nicheMat = withHeightFade(new THREE.MeshStandardMaterial({ map: metersBrick(), color: new THREE.Color(0x7d766d).convertSRGBToLinear(), roughness: 0.95, side: THREE.BackSide }));
const stoneMat = withHeightFade(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
const STONES = [0xb9b1a5, 0xafa699, 0xc3bbb0, 0xa79f93].map(c => new THREE.Color(c).convertSRGBToLinear());
const WOOD = [0x5e3d26, 0x553722, 0x66442b].map(c => new THREE.Color(c).convertSRGBToLinear());   // chêne foncé
const WOOD_DARK = new THREE.Color(0x2f2b2a).convertSRGBToLinear();
const LEAD = -1, LEAD_COLOR = new THREE.Color(0x2e2a28).convertSRGBToLinear();   // croisillons des fenêtres
const glassMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffbe63).convertSRGBToLinear() });   // fenêtres éclairées de l'intérieur
const glassDark = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x283044).convertSRGBToLinear() });  // pièces éteintes
const glassMoon = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8fa6d8).convertSRGBToLinear() });  // vue sur la nuit depuis les salles
const hiddenMat = new THREE.MeshBasicMaterial({ visible: false });

const WIN_H = WIN.spring - WIN.bottom;
function windowShape(cx, bottom = WIN.bottom) {   // contour d'une fenêtre (rectangle + demi-cercle)
  const sh = new THREE.Shape(), spring = bottom + WIN_H;
  sh.moveTo(cx - WR, bottom); sh.lineTo(cx + WR, bottom); sh.lineTo(cx + WR, spring);
  sh.absarc(cx, spring, WR, 0, Math.PI, false); sh.lineTo(cx - WR, bottom);
  return sh;
}
function wallGeometry(windows) {         // mur entier avec les ouvertures des arches (et des fenêtres) découpées
  const sh = new THREE.Shape();
  sh.moveTo(-HALF, 0);
  for (const c of ARCH_X) {
    sh.lineTo(c - AR, 0); sh.lineTo(c - AR, ARCH.h);
    sh.absarc(c, ARCH.h, AR, Math.PI, 0, true);
    sh.lineTo(c + AR, 0);
  }
  sh.lineTo(HALF, 0); sh.lineTo(HALF, WALL_H); sh.lineTo(-HALF, WALL_H); sh.closePath();
  if (windows) for (const cx of WIN_X) sh.holes.push(windowShape(cx));
  for (const b of UPPER_LEVELS) for (const cx of UPPER_X) sh.holes.push(windowShape(cx, b));
  return new THREE.ShapeGeometry(sh, 32);
}
function archOpening(r) {                // contour d'une ouverture (rectangle + demi-cercle)
  const sh = new THREE.Shape();
  sh.moveTo(-r, 0); sh.lineTo(r, 0); sh.lineTo(r, ARCH.h); sh.absarc(0, ARCH.h, r, 0, Math.PI, false); sh.closePath();
  return sh;
}

// Toutes les pierres de la pièce sont fusionnées en un seul maillage (rapide, même sur téléphone)
const stoneParts = [];
const tmpM = new THREE.Matrix4();
function stone(geo, matrix, shade) {
  const n = STONES.length;
  const c = shade instanceof THREE.Color ? shade : shade === LEAD ? LEAD_COLOR : STONES[((Math.round(shade) % n) + n) % n];
  stoneParts.push([geo, matrix.clone(), c]);
}
function boxStone(wallM, w, h, d, x, y, z, shade) {
  stone(new THREE.BoxGeometry(w, h, d), wallM.clone().multiply(tmpM.makeTranslation(x, y, z)), shade);
}
function mergeStones() {
  const pos = [], nor = [], col = [];
  const nm = new THREE.Matrix3();
  for (const [g0, m, c] of stoneParts) {
    const g = g0.index ? g0.toNonIndexed() : g0.clone();   // copie : les formes partagées ne doivent pas être déplacées
    g.applyMatrix4(m);
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(g, stoneMat); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
}

// claveaux en éventail (clé de voûte plus grande au milieu) : formes partagées
function makeVoussoirs(r, ring, out, n, keyExtra) {
  const list = [], ga = 0.018;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI - i * Math.PI / n - ga, a1 = Math.PI - (i + 1) * Math.PI / n + ga;
    const key = i === (n - 1) / 2;
    const sh = new THREE.Shape();
    sh.absarc(0, 0, r + ring + (key ? keyExtra : 0), a0, a1, true); sh.absarc(0, 0, r, a1, a0, false); sh.closePath();
    list.push(new THREE.ExtrudeGeometry(sh, { depth: out + (key ? 0.05 : 0), bevelEnabled: false, curveSegments: 6 }));
  }
  return list;
}
const VOUSSOIRS = makeVoussoirs(AR, ARCH.ring, ARCH.out, 9, 0.16);
const WIN_VOUSSOIRS = makeVoussoirs(WR, WIN.ring, WIN.out, 7, 0.1);

function buildWindow(g, W, cx, bottom = WIN.bottom, glassM = glassMat) {
  const B = bottom, S = bottom + WIN_H;
  // tableau (épaisseur du mur) vu de l'intérieur + vitrage au fond
  const reveal = new THREE.Mesh(new THREE.ExtrudeGeometry(windowShape(cx, B), { depth: WIN.depth, bevelEnabled: false, curveSegments: 24 }), [hiddenMat, nicheMat]);
  reveal.position.z = -WIN.depth; reveal.receiveShadow = true; g.add(reveal);
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(windowShape(cx, B), 24), glassM);
  glass.position.z = -WIN.depth + 0.02; g.add(glass);
  // croisillons
  const top = S + WR, zc = -WIN.depth + 0.05;
  boxStone(W, 0.07, top - B, 0.05, cx, (B + top) / 2, zc, LEAD);
  boxStone(W, WIN.w, 0.07, 0.05, cx, S, zc, LEAD);
  boxStone(W, WIN.w, 0.06, 0.05, cx, (B + S) / 2, zc, LEAD);
  // encadrement : montants alternés, appui saillant, claveaux et clé
  const rows = 4, bh = (S - B) / rows, gap = 0.03;
  for (let i = 0; i < rows; i++) {
    const wdt = i % 2 ? 0.22 : 0.32;
    for (const side of [-1, 1]) boxStone(W, wdt, bh - gap, WIN.out, cx + side * (WR + wdt / 2), B + i * bh + bh / 2, WIN.out / 2, i + (side > 0 ? 1 : 0));
  }
  boxStone(W, WIN.w + 0.8, 0.16, WIN.out + 0.16, cx, B - 0.08, (WIN.out + 0.16) / 2, 2);   // appui
  boxStone(W, WIN.w + 0.4, 0.14, WIN.out, cx, B - 0.23, WIN.out / 2, 3);                   // sous l'appui
  WIN_VOUSSOIRS.forEach((geo, i) => stone(geo, W.clone().multiply(tmpM.makeTranslation(cx, S, 0)), i));
}

function buildWall(px, pz, ry, windows = false) {
  const g = new THREE.Group(); g.position.set(px, 0, pz); g.rotation.y = ry; scene.add(g);
  g.updateMatrixWorld();
  const W = g.matrixWorld;
  const wall = new THREE.Mesh(wallGeometry(windows), wallMat); wall.receiveShadow = wall.castShadow = true; g.add(wall);
  if (windows) for (const cx of WIN_X) buildWindow(g, W, cx);
  UPPER_LEVELS.forEach((b, li) => UPPER_X.forEach((cx, i) => {
    const lit = ((i * 7 + li * 3 + Math.round(px + pz * 3)) % 5) < 3;     // certaines pièces éclairées, d'autres éteintes
    buildWindow(g, W, cx, b, lit ? glassMat : glassDark);
  }));

  ARCH_X.forEach((cx, ai) => {
    // passage voûté à travers le mur (ouvert aux deux bouts) vers la salle de derrière
    const tunnel = new THREE.Mesh(new THREE.ExtrudeGeometry(archOpening(AR), { depth: ARCH.depth, bevelEnabled: false, curveSegments: 32 }), [hiddenMat, nicheMat]);
    tunnel.position.set(cx, 0, -ARCH.depth); tunnel.receiveShadow = tunnel.castShadow = true; g.add(tunnel);
    const tf = new THREE.Mesh(new THREE.PlaneGeometry(ARCH.w, ARCH.depth), floorMat(ARCH.w, ARCH.depth));
    tf.rotation.x = -Math.PI / 2; tf.position.set(cx, 0.003, -ARCH.depth / 2); tf.receiveShadow = true; g.add(tf);
    // montants : blocs alternés large / étroit
    const rows = 6, bh = ARCH.h / rows, gap = 0.035;
    for (let i = 0; i < rows; i++) {
      const wdt = i % 2 ? 0.42 : 0.62;
      for (const side of [-1, 1]) boxStone(W, wdt, bh - gap, ARCH.out, cx + side * (AR + wdt / 2), i * bh + bh / 2, ARCH.out / 2, i + ai + (side > 0 ? 1 : 0));
    }
    // claveaux en éventail + clé de voûte
    VOUSSOIRS.forEach((geo, i) => stone(geo, W.clone().multiply(tmpM.makeTranslation(cx, ARCH.h, 0)), i + ai));
    // socles au pied des montants
    for (const side of [-1, 1]) boxStone(W, 0.78, 0.26, ARCH.out + 0.08, cx + side * (AR + 0.36), 0.13, (ARCH.out + 0.08) / 2, 2);
  });

  // piliers : blocs empilés en alternance, base et chapiteau plus larges
  for (const x of PILLAR_X) {
    const rows = 9, bh = (PILLAR.h - 0.6) / rows, gap = 0.035;
    boxStone(W, PILLAR.w + 0.22, 0.34, PILLAR.out + 0.1, x, 0.17, (PILLAR.out + 0.1) / 2, 2);              // base
    for (let i = 0; i < rows; i++) {
      const wdt = i % 2 ? PILLAR.w - 0.08 : PILLAR.w;
      boxStone(W, wdt, bh - gap, PILLAR.out, x, 0.34 + i * bh + bh / 2, PILLAR.out / 2, i);
    }
    boxStone(W, PILLAR.w + 0.24, 0.26, PILLAR.out + 0.12, x, PILLAR.h - 0.13, (PILLAR.out + 0.12) / 2, 2); // chapiteau
  }

  // soubassement : rangée de dalles au pied du mur, interrompue par les arches et les piliers
  const blocked = [...ARCH_X.map(c => [c - AR - 0.75, c + AR + 0.75]), ...PILLAR_X.map(x => [x - 0.46, x + 0.46])];
  const free = x => !blocked.some(([a, b]) => x > a && x < b);
  const step = 0.05;
  let start = null;
  for (let x = -HALF; x <= HALF + 1e-6; x += step) {
    const ok = x < HALF - 1e-6 && free(x + step / 2);
    if (ok && start === null) start = x;
    if (!ok && start !== null) {
      const len = x - start, n = Math.max(1, Math.round(len / 1.1)), bl = len / n;
      for (let i = 0; i < n; i++) boxStone(W, bl - 0.035, PLINTH.h, PLINTH.out, start + bl * (i + 0.5), PLINTH.h / 2, PLINTH.out / 2, i);
      start = null;
    }
  }
  // corniche : bandeau de pierre au-dessus des arches, sur toute la longueur
  const cn = Math.round(ROOM / 1.25), cl = ROOM / cn;
  for (let i = 0; i < cn; i++) boxStone(W, cl - 0.035, CORNICE.h, CORNICE.out, -HALF + cl * (i + 0.5), CORNICE.y, CORNICE.out / 2, i);
  // étages : pilastres dans l'axe des piliers, bandeau intermédiaire, corniche sommitale et créneaux
  for (const x of PILLAR_X) {
    const rows = 12, y0 = CORNICE.y + CORNICE.h / 2, bh = (TOP_CORNICE_Y - y0) / rows;
    for (let i = 0; i < rows; i++) boxStone(W, i % 2 ? 0.46 : 0.54, bh - 0.03, 0.14, x, y0 + i * bh + bh / 2, 0.07, i);
  }
  for (let i = 0; i < cn; i++) {
    const x = -HALF + cl * (i + 0.5);
    boxStone(W, cl - 0.035, 0.22, 0.16, x, STRING_Y, 0.08, i + 1);
    boxStone(W, cl - 0.035, 0.34, 0.32, x, TOP_CORNICE_Y, 0.16, i + 2);
    boxStone(W, cl - 0.035, 0.18, 0.4, x, TOP_CORNICE_Y + 0.26, 0.05, i);
  }
  for (let x = -HALF + 0.55; x < HALF - 0.3; x += 1.6) boxStone(W, 0.9, 0.75, 0.55, x, WALL_H + 0.37, -0.12, Math.round(x));   // merlons
  boxStone(W, ROOM, 0.5, 0.55, 0, WALL_H - 0.25 + 0.0, -0.12, 3);                                                              // chemin de ronde
  // gargouilles perchées au-dessus de la corniche, dans l'axe des pilastres
  for (const x of [-9.75, -3.25, 3.25, 9.75]) gargoyle(W, x, TOP_CORNICE_Y + 0.62);
  return g;
}

// ---------- Gargouille en pierre : créature accroupie sur une console, ailes repliées ----------
const GARG = [0x8d877f, 0x7f7a73, 0x989188].map(c => new THREE.Color(c).convertSRGBToLinear());
function gargoyle(W, x, y) {
  const base = W.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, 0)).multiply(new THREE.Matrix4().makeScale(1.8, 1.8, 1.8));   // taille lisible depuis la cour
  const part = (geo, px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, c = 0) => {
    const m = base.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
    stone(geo, m, GARG[c]);
  };
  part(new THREE.BoxGeometry(0.56, 0.3, 0.75), 0, -0.2, 0.37, 0, 0, 0, 1, 1, 1, 2);                         // console
  part(new THREE.BoxGeometry(0.46, 0.12, 0.62), 0, -0.4, 0.28, 0, 0, 0, 1, 1, 1, 1);
  part(new THREE.IcosahedronGeometry(0.27, 1), 0, 0.17, 0.42, -0.35, 0, 0, 1, 0.82, 1.25, 0);              // corps
  for (const sx of [-1, 1]) {
    part(new THREE.IcosahedronGeometry(0.14, 0), sx * 0.17, 0.05, 0.25, 0, 0, 0, 1, 1.1, 1.3, 1);          // cuisses
    part(new THREE.BoxGeometry(0.08, 0.32, 0.09), sx * 0.13, -0.0, 0.72, 0.25, 0, 0, 1, 1, 1, 1);           // pattes avant
    part(new THREE.BoxGeometry(0.12, 0.05, 0.13), sx * 0.13, -0.15, 0.78, 0, 0, 0, 1, 1, 1, 0);             // griffes
    const wing = new THREE.Shape(); wing.moveTo(0, 0); wing.lineTo(0.5, 0.12); wing.lineTo(0.42, 0.34); wing.lineTo(0.3, 0.3);
    wing.lineTo(0.24, 0.5); wing.lineTo(0.08, 0.42); wing.closePath();
    part(new THREE.ExtrudeGeometry(wing, { depth: 0.04, bevelEnabled: false }), sx * 0.16, 0.18, 0.2,
         0.2, sx > 0 ? -1.75 : -1.39, sx * 0.55, sx, 1, 1, 2);                                              // ailes repliées
    part(new THREE.ConeGeometry(0.045, 0.2, 5), sx * 0.1, 0.62, 0.86, -0.7, 0, sx * -0.35, 1, 1, 1, 2);     // cornes
    part(new THREE.ConeGeometry(0.035, 0.1, 4), sx * 0.15, 0.52, 0.8, 0, 0, sx * -1.2, 1, 1, 1, 1);         // oreilles pointues
  }
  part(new THREE.BoxGeometry(0.3, 0.26, 0.28), 0, 0.42, 0.88, 0.15, 0, 0, 1, 1, 1, 0);                     // tête
  part(new THREE.BoxGeometry(0.2, 0.1, 0.22), 0, 0.4, 1.07, 0.1, 0, 0, 1, 1, 1, 2);                        // museau
  part(new THREE.BoxGeometry(0.18, 0.06, 0.2), 0, 0.29, 1.05, -0.25, 0, 0, 1, 1, 1, 1);                   // mâchoire ouverte
  part(new THREE.BoxGeometry(0.24, 0.05, 0.05), 0, 0.53, 0.99, 0, 0, 0, 1, 1, 1, 1);                       // arcades sourcilières
}

// sol en dalles
const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM, ROOM), floorMat(ROOM, ROOM));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

// ---------- Salles derrière les 4 arches ----------
// Dans le repère du mur : la salle va de z = -ARCH.depth à z = -ARCH.depth - RD, x de -RW/2 à RW/2
const roomWallMat = withHeightFade(surface(metersBrick())); roomWallMat.shadowSide = THREE.DoubleSide;
const ceilingMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2c2017).convertSRGBToLinear(), roughness: 0.9, side: THREE.DoubleSide });
const WALKABLE = [];                     // zones où l'avatar peut marcher (cour, passages, salles), en coordonnées monde
const CAM_ZONES = [];                    // volumes où la caméra peut se placer
function worldRect(g, x0, x1, z0, z1, extra = {}) {
  const a = g.localToWorld(new THREE.Vector3(x0, 0, z0)), b = g.localToWorld(new THREE.Vector3(x1, 0, z1));
  return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z), ...extra };
}
function roomWallGeometry(w, h, arch) {  // mur intérieur, avec ou sans ouverture d'arche en bas au centre (UV en mètres)
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, 0);
  if (arch) { sh.lineTo(-AR, 0); sh.lineTo(-AR, ARCH.h); sh.absarc(0, ARCH.h, AR, Math.PI, 0, true); sh.lineTo(AR, 0); }
  sh.lineTo(w / 2, 0); sh.lineTo(w / 2, h); sh.lineTo(-w / 2, h); sh.closePath();
  return sh;
}
const chandeliers = [];
function buildRoom(g) {
  const z0 = -ARCH.depth, zc = z0 - RD / 2, zb = z0 - RD;
  const add = (geo, mat, x, y, z, ry = 0, rx = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); m.receiveShadow = m.castShadow = true; g.add(m); return m;
  };
  add(new THREE.PlaneGeometry(RW, RD), floorMat(RW, RD), 0, 0.002, zc, 0, -Math.PI / 2);                       // sol
  add(new THREE.ShapeGeometry(roomWallGeometry(RW, RH, true), 32), roomWallMat, 0, 0, z0, Math.PI);            // mur côté cour (arche)
  const back = roomWallGeometry(RW, RH, false); back.holes.push(windowShape(0));
  add(new THREE.ShapeGeometry(back, 24), roomWallMat, 0, 0, zb);                                              // mur du fond (fenêtre)
  for (const sx of [-1, 1])                                                                                   // murs latéraux
    add(new THREE.ShapeGeometry(roomWallGeometry(RD, RH, false)), roomWallMat, sx * RW / 2, 0, zc, -sx * Math.PI / 2);
  add(new THREE.PlaneGeometry(RW, RD), ceilingMat, 0, RH, zc, 0, Math.PI / 2);                                 // plafond
  g.updateMatrixWorld();
  const W = g.matrixWorld;
  for (let x = -RW / 2 + 1; x < RW / 2; x += 2) boxStone(W, 0.26, 0.32, RD, x, RH - 0.16, zc, WOOD[(x + 7) % 3 | 0]);   // poutres
  for (const sx of [-1, 1]) boxStone(W, 0.3, 0.36, RD, sx * (RW / 2 - 0.15), RH - 0.18, zc, WOOD_DARK);           // sablières
  // fenêtre au fond (vue sur la nuit) : construite dans un repère tourné vers l'intérieur de la salle
  const wg = new THREE.Group(); wg.position.z = zb; g.add(wg); wg.updateMatrixWorld();
  buildWindow(wg, wg.matrixWorld, 0, WIN.bottom, glassMoon);
  // plinthe en pierre autour de la salle
  for (const [w, x, z, ry] of [[RW, 0, zb, 0], [RD, -RW / 2, zc, Math.PI / 2], [RD, RW / 2, zc, -Math.PI / 2], [RW / 2 - AR - 0.2, -(RW / 2 + AR + 0.2) / 2, z0, Math.PI], [RW / 2 - AR - 0.2, (RW / 2 + AR + 0.2) / 2, z0, Math.PI]]) {
    const m = W.clone().multiply(new THREE.Matrix4().makeTranslation(x, 0, z)).multiply(new THREE.Matrix4().makeRotationY(ry))
      .multiply(new THREE.Matrix4().makeTranslation(0, 0.16, 0.05));
    stone(new THREE.BoxGeometry(w, 0.32, 0.1), m, 3);
  }
  // lustre en fer forgé avec bougies, au centre de la salle
  const cy = RH - 1.4;
  const ring = add(new THREE.TorusGeometry(0.55, 0.035, 6, 24), IRON, 0, cy, zc, 0, Math.PI / 2);
  add(new THREE.CylinderGeometry(0.02, 0.02, RH - cy, 6), IRON, 0, cy + (RH - cy) / 2, zc);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, x = Math.cos(a) * 0.55, z = zc + Math.sin(a) * 0.55;
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 6), CANDLE, x, cy + 0.09, z);
    add(new THREE.ConeGeometry(0.025, 0.07, 5), FLAME, x, cy + 0.2, z).castShadow = false;
  }
  const l = new THREE.PointLight(0xffb260, 1.3, 16, 2); l.position.set(0, cy - 0.1, zc); g.add(l);
  chandeliers.push({ l, seed: Math.random() * 100 });
  // zones praticables : passage et salle
  WALKABLE.push(worldRect(g, -AR, AR, z0 - 0.6, 2.0, { maxFly: ARCH.h + AR - 2.0 }));     // chevauche la cour et la salle pour passer de l'une à l'autre
  WALKABLE.push(worldRect(g, -RW / 2 + 0.2, RW / 2 - 0.2, zb + 0.2, z0, { maxFly: RH - 2.0 }));
  CAM_ZONES.push(worldRect(g, -AR + 0.15, AR - 0.15, z0 - 0.3, 0.6, { maxY: ARCH.h + AR - 0.3 }));
  CAM_ZONES.push(worldRect(g, -RW / 2 + 0.3, RW / 2 - 0.3, zb + 0.3, z0 - 0.3, { maxY: RH - 0.5 }));
}
const IRON = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x26221f).convertSRGBToLinear(), roughness: 0.6, metalness: 0.4 });
const FLAME = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc56e).convertSRGBToLinear() });
const CANDLE = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xe9e0cc).convertSRGBToLinear(), roughness: 0.7 });

WALKABLE.push({ minX: -HALF + 0.5, maxX: HALF - 0.5, minZ: -HALF + 0.5, maxZ: HALF - 0.5, court: true, maxFly: 13.5 });   // la cour (on vole sous les créneaux)
CAM_ZONES.push({ minX: -HALF + 0.45, maxX: HALF - 0.45, minZ: -HALF + 0.45, maxZ: HALF - 0.45, maxY: 40 });
for (const [px, pz, ry, win] of [[0, -HALF, 0, false], [0, HALF, Math.PI, false], [-HALF, 0, Math.PI / 2, true], [HALF, 0, -Math.PI / 2, true]])
  buildRoom(buildWall(px, pz, ry, win));      // fenêtres du rez-de-chaussée sur les deux murs parallèles de gauche et de droite
// ---------- Fontaine au centre : 3 niveaux en pierre, eau animée, gazon fleuri ----------
const FOUNT = { basinIn: 1.6, basinOut: 1.95, basinH: 0.55, water0: 0.42, grassOut: 2.9, collide: 2.3 };
const BOWL1 = { y: 1.25, r: 0.98, water: 1.42 }, BOWL2 = { y: 1.95, r: 0.48, water: 2.07 }, SPOUT_Y = 2.38;

// bloc en secteur d'anneau, posé à plat (extrudé vers le haut)
function ringBlock(r1, r2, a0, a1, y, h, shade) {
  const sh = new THREE.Shape();
  sh.absarc(0, 0, r2, a0, a1, false); sh.absarc(0, 0, r1, a1, a0, true); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 4 });
  stone(geo, new THREE.Matrix4().makeTranslation(0, y, 0).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)), shade);
}
function stoneRing(r1, r2, y, h, n, shade0, offset = 0) {
  const ga = 0.012;
  for (let i = 0; i < n; i++) {
    const a0 = (i + offset) * Math.PI * 2 / n + ga, a1 = (i + 1 + offset) * Math.PI * 2 / n - ga;
    ringBlock(r1, r2, a0, a1, y, h, i + shade0);
  }
}
function lathe(points, y, shade) {
  const geo = new THREE.LatheGeometry(points.map(([r, h]) => new THREE.Vector2(r, h)), 32);
  stone(geo, new THREE.Matrix4().makeTranslation(0, y, 0), shade);
}
// grand bassin : socle, deux rangées de pierres décalées, margelle
stoneRing(FOUNT.basinIn - 0.05, FOUNT.basinOut + 0.12, 0, 0.12, 16, 3);
stoneRing(FOUNT.basinIn, FOUNT.basinOut, 0.12, 0.2, 14, 0);
stoneRing(FOUNT.basinIn, FOUNT.basinOut, 0.32, 0.2, 14, 1, 0.5);
stoneRing(FOUNT.basinIn - 0.06, FOUNT.basinOut + 0.06, 0.52, 0.11, 12, 2);
lathe([[0, 0], [FOUNT.basinIn, 0], [FOUNT.basinIn, 0.3], [0, 0.3]], 0.0, 3);           // fond du bassin
// colonne et vasque du milieu
lathe([[0, 0], [0.42, 0], [0.42, 0.14], [0.3, 0.2], [0.3, 0.75], [0.36, 0.82], [0.36, 0.9], [0, 0.9]], 0.3, 0);
lathe([[0.1, -0.12], [0.45, -0.08], [0.85, 0.04], [BOWL1.r, 0.14], [BOWL1.r, 0.22], [BOWL1.r - 0.1, 0.22], [0.8, 0.12], [0, 0.1]], BOWL1.y, 2);
// colonne et vasque du haut, fleuron
lathe([[0, 0], [0.2, 0], [0.16, 0.08], [0.16, 0.5], [0.22, 0.58], [0, 0.58]], BOWL1.y + 0.12, 1);
lathe([[0.06, -0.08], [0.25, -0.05], [0.42, 0.04], [BOWL2.r, 0.11], [BOWL2.r, 0.16], [BOWL2.r - 0.07, 0.16], [0.38, 0.08], [0, 0.07]], BOWL2.y, 0);
lathe([[0, 0], [0.09, 0], [0.06, 0.12], [0.1, 0.2], [0.04, 0.3], [0, 0.34]], BOWL2.y + 0.05, 2);

// ---------- Eau : surfaces ondulantes, nappes qui coulent, jet, éclaboussures (animation continue) ----------
const WATER_VS = `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const WATER_FS = `
uniform float time; uniform float ringR; varying vec2 vP;
void main(){
  float r = length(vP);
  float waves = sin(vP.x * 9.0 + time * 1.3) * sin(vP.y * 11.0 - time * 1.1);
  float rip = sin((r - ringR) * 38.0 - time * 7.0) * exp(-abs(r - ringR) * 5.0);   // ronds dans l'eau là où tombe la nappe
  float center = sin(r * 22.0 - time * 3.0) * exp(-r * 2.5);
  vec3 deep = vec3(0.07, 0.22, 0.42), light = vec3(0.32, 0.6, 0.85);
  float k = 0.38 + 0.18 * waves + 0.28 * rip + 0.15 * center;
  vec3 col = mix(deep, light, clamp(k, 0.0, 1.0));
  col += vec3(0.9, 0.95, 1.0) * pow(max(0.0, waves * 0.5 + 0.5 + 0.35 * rip), 9.0) * 0.5;   // reflets
  gl_FragColor = vec4(col, 0.93);
}`;
const FALL_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FALL_FS = `
uniform float time; uniform float speed; varying vec2 vUv;
void main(){
  float streak = 0.55 + 0.45 * sin(vUv.x * 260.0 + sin(vUv.x * 41.0) * 4.0);
  float flow = 0.5 + 0.5 * sin(vUv.y * 26.0 - time * speed + vUv.x * 70.0);
  float a = (0.18 + 0.42 * streak * (0.55 + 0.45 * flow)) * smoothstep(0.0, 0.12, vUv.y + 0.05) * (1.0 - smoothstep(0.8, 1.0, vUv.y) * 0.6);
  gl_FragColor = vec4(mix(vec3(0.62, 0.78, 0.95), vec3(0.95, 0.98, 1.0), streak * flow), a);
}`;
const waterMats = [];
function waterSurface(r, y, ringR) {
  const m = new THREE.ShaderMaterial({ vertexShader: WATER_VS, fragmentShader: WATER_FS, transparent: true, uniforms: { time: { value: 0 }, ringR: { value: ringR } } });
  waterMats.push(m);
  const w = new THREE.Mesh(new THREE.CircleGeometry(r, 64), m); w.rotation.x = -Math.PI / 2; w.position.y = y; scene.add(w);
}
// nappe d'eau qui déborde d'une vasque : profil parabolique (vitesse horizontale vx, chute jusqu'à yEnd)
function fallProfile(r0, y0, vx, yEnd, start = []) {
  const pts = start.slice(), T = Math.sqrt(2 * (y0 - yEnd) / 9.8);
  for (let i = 0; i <= 14; i++) { const t = T * i / 14; pts.push(new THREE.Vector2(r0 + vx * t, y0 - 4.9 * t * t)); }
  return pts;
}
function fallSheet(pts, speed) {
  const m = new THREE.ShaderMaterial({ vertexShader: FALL_VS, fragmentShader: FALL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, speed: { value: speed } } });
  waterMats.push(m);
  scene.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 64), m));
}
const C2 = fallProfile(BOWL2.r + 0.005, BOWL2.y + 0.16, 0.35, BOWL1.water);       // vasque du haut -> vasque du milieu
const C1 = fallProfile(BOWL1.r + 0.005, BOWL1.y + 0.22, 0.35, FOUNT.water0);      // vasque du milieu -> bassin
fallSheet(C2, 9); fallSheet(C1, 11);
// jet : colonne qui monte puis retombe en ombrelle dans la vasque du haut
const JET_TOP = SPOUT_Y + 0.36;
fallSheet(fallProfile(0.045, JET_TOP, 0.8, BOWL2.water + 0.01,
  [new THREE.Vector2(0.012, SPOUT_Y), new THREE.Vector2(0.018, SPOUT_Y + 0.18), new THREE.Vector2(0.024, SPOUT_Y + 0.31), new THREE.Vector2(0.035, JET_TOP)]), 8);
waterSurface(FOUNT.basinIn, FOUNT.water0, C1[C1.length - 1].x);
waterSurface(BOWL1.r - 0.1, BOWL1.water, C2[C2.length - 1].x);
waterSurface(BOWL2.r - 0.07, BOWL2.water, 0.3);

// éclaboussures : fines gouttelettes rondes là où l'eau retombe
const dotCanvas = document.createElement("canvas"); dotCanvas.width = dotCanvas.height = 32;
{ const c = dotCanvas.getContext("2d"), g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.5, "rgba(220,235,255,0.6)"); g.addColorStop(1, "rgba(220,235,255,0)");
  c.fillStyle = g; c.fillRect(0, 0, 32, 32); }
const DROPS = 360;
const dropPos = new Float32Array(DROPS * 3), drops = [];
const dropGeo = new THREE.BufferGeometry(); dropGeo.setAttribute("position", new THREE.BufferAttribute(dropPos, 3));
scene.add(new THREE.Points(dropGeo, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(dotCanvas), color: 0xdfeeff, size: 0.045,
  transparent: true, opacity: 0.8, depthWrite: false })));
const SPLASH = [[C1[C1.length - 1].x, FOUNT.water0], [C2[C2.length - 1].x, BOWL1.water], [0.3, BOWL2.water]];
function spawnDrop(d) {
  const [r, y] = SPLASH[d.kind], a = Math.random() * Math.PI * 2, out = 0.15 + Math.random() * 0.35;
  d.x = Math.cos(a) * r; d.y = y; d.z = Math.sin(a) * r; d.floor = y - 0.01;
  d.vx = Math.cos(a) * out; d.vz = Math.sin(a) * out; d.vy = 0.5 + Math.random() * 0.9;
}
for (let i = 0; i < DROPS; i++) {
  const d = { kind: i % 3 }; spawnDrop(d);
  for (let k = Math.random() * 30; k > 0; k--) { d.vy -= 9.8 / 60; d.x += d.vx / 60; d.y += d.vy / 60; d.z += d.vz / 60; if (d.y < d.floor) spawnDrop(d); }
  drops.push(d);
}
function updateFountain(dt, now) {
  const t = now / 1000;
  for (const m of waterMats) m.uniforms.time.value = t;
  for (let i = 0; i < DROPS; i++) {
    const d = drops[i];
    d.vy -= 9.8 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
    if (d.y < d.floor) spawnDrop(d);
    dropPos[i * 3] = d.x; dropPos[i * 3 + 1] = d.y; dropPos[i * 3 + 2] = d.z;
  }
  dropGeo.attributes.position.needsUpdate = true;
}

// ---------- Mobilier : bancs en chêne le long des murs ----------
// obstacles en boîtes alignées : l'avatar les contourne, ou monte dessus si « standable » (sauter sur un banc)
const OBSTACLES = [];
function woodBox(w, h, d, x, y, z, color, rotZ = 0, cx = 0, cz = 0, ry = 0) {
  const m = new THREE.Matrix4().makeTranslation(cx, 0, cz).multiply(new THREE.Matrix4().makeRotationY(ry))
    .multiply(new THREE.Matrix4().makeTranslation(x, y, z)).multiply(new THREE.Matrix4().makeRotationZ(rotZ));
  stone(new THREE.BoxGeometry(w, h, d), m, color);
}
const BENCH = { len: 2.2, seat: 0.45, depth: 0.46 };
function bench(cx, cz) {                       // banc en bois le long d'un mur (axe x)
  for (let i = 0; i < 3; i++)                  // 3 planches d'assise
    woodBox(BENCH.len, 0.05, 0.14, 0, BENCH.seat, -0.16 + i * 0.16, WOOD[i], 0, cx, cz);
  for (const sx of [-0.92, 0.92]) {
    woodBox(0.09, BENCH.seat - 0.025, 0.4, sx, (BENCH.seat - 0.025) / 2, 0, WOOD_DARK, 0, cx, cz);   // pieds
    woodBox(0.1, 0.06, 0.48, sx, BENCH.seat - 0.06, 0, WOOD_DARK, 0, cx, cz);                         // traverse sous l'assise
  }
  woodBox(1.84, 0.06, 0.06, 0, 0.14, 0, WOOD_DARK, 0, cx, cz);                                        // entretoise
  OBSTACLES.push({ minX: cx - BENCH.len / 2, maxX: cx + BENCH.len / 2, minZ: cz - BENCH.depth / 2, maxZ: cz + BENCH.depth / 2,
                   top: BENCH.seat + 0.025, standable: true });
}
for (const x of [-11.2, -6.5, 6.5, 11.2]) { if (x !== -6.5) bench(x, -HALF + 1.25); bench(x, HALF - 1.25); }   // la statue prend la place d'un banc


mergeStones();

// ---------- Statue d'un ancien élève illustre, façon statue grecque en marbre ----------
// Orateur barbu couronné de laurier, drapé d'un himation, bras droit levé, rouleau dans la main gauche.
// Sculptée à l'échelle d'un humain (1,8 m) puis agrandie x3,2, sur un socle de 1,6 m.
const STATUE = { x: -6.5, z: -HALF + 1.8 };                       // contre la façade nord, entre deux piliers
{
  const marble = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xe9e4da).convertSRGBToLinear(), roughness: 0.42 });
  const marbleS = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xd8d1c4).convertSRGBToLinear(), roughness: 0.55 });
  const root = new THREE.Group(); root.position.set(STATUE.x, 0, STATUE.z);
  // tournée vers la cour
  scene.add(root);
  const put = (geo, m, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = o.receiveShadow = true; parent.add(o); return o;
  };
  // socle : marches, dé, corniche
  const PED_H = 1.6;
  put(new THREE.BoxGeometry(3.0, 0.22, 3.0), marbleS, root, 0, 0.11, 0);
  put(new THREE.BoxGeometry(2.6, 0.22, 2.6), marble, root, 0, 0.33, 0);
  put(new THREE.BoxGeometry(2.1, 0.12, 2.1), marbleS, root, 0, 0.5, 0);
  put(new THREE.BoxGeometry(1.9, 0.86, 1.9), marble, root, 0, 0.99, 0);
  put(new THREE.BoxGeometry(2.1, 0.1, 2.1), marbleS, root, 0, 1.47, 0);
  put(new THREE.BoxGeometry(2.25, 0.08, 2.25), marble, root, 0, PED_H - 0.04, 0);
  // plaque en bronze gravée
  const pc = document.createElement("canvas"); pc.width = 512; pc.height = 160;
  { const c = pc.getContext("2d");
    const g = c.createLinearGradient(0, 0, 0, 160); g.addColorStop(0, "#8a6a32"); g.addColorStop(1, "#5e4520");
    c.fillStyle = g; c.fillRect(0, 0, 512, 160); c.strokeStyle = "#c9a45a"; c.lineWidth = 6; c.strokeRect(8, 8, 496, 144);
    c.fillStyle = "#f0d58a"; c.textAlign = "center"; c.font = "bold 46px Georgia, serif"; c.fillText("ALDRIC VALMORE", 256, 72);
    c.font = "italic 26px Georgia, serif"; c.fillText("Ancien élève · Maître des savoirs", 256, 118); }
  const plaqueTex = new THREE.CanvasTexture(pc); plaqueTex.encoding = THREE.sRGBEncoding;
  put(new THREE.PlaneGeometry(1.3, 0.4), new THREE.MeshStandardMaterial({ map: plaqueTex, metalness: 0.6, roughness: 0.4 }), root, 0, 1.0, 0.951);

  const fig = new THREE.Group(); fig.position.y = PED_H; fig.scale.setScalar(2.4); root.add(fig);   // ≈ 4,3 m de haut, sous les fenêtres du 1er étage
  window.STATUE_FIG = fig;
  // tissu à plis : surface de révolution dont le rayon ondule (plis verticaux qui s'estompent vers le haut)
  function cloth(profile, n, amp, phiStart = 0, phiLen = Math.PI * 2) {
    const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 120, phiStart, phiLen);
    const P = g.attributes.position, y0 = profile[0][1], y1 = profile[profile.length - 1][1];
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i), y = P.getY(i), a = Math.atan2(x, z), t = (y - y0) / (y1 - y0);
      const k = 1 + amp * (1 - 0.75 * t) * (Math.sin(a * n + Math.sin(a * 3) * 1.5) * 0.7 + Math.sin(a * n * 2.1 + 1.3) * 0.3);
      P.setX(i, x * k); P.setZ(i, z * k);
    }
    g.computeVertexNormals(); return g;
  }
  const capsule = (r1, r2, len) => {
    const pts = [];
    for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + i / 6 * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * r2), -len + Math.sin(a) * r2)); }
    for (let i = 1; i <= 6; i++) { const a = i / 6 * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * r1), Math.sin(a) * r1)); }
    return new THREE.LatheGeometry(pts, 24);
  };
  // pieds en sandales, le droit légèrement avancé
  for (const sx of [-1, 1]) put(new THREE.SphereGeometry(0.055, 16, 10), marble, fig, sx * 0.1, 0.035, 0.22 + (sx > 0 ? 0.06 : 0)).scale.set(0.85, 0.6, 2);
  // chiton : une seule draperie continue, des chevilles à la poitrine
  put(cloth([[0.3, 0.0], [0.29, 0.1], [0.255, 0.45], [0.2, 0.8], [0.17, 0.95], [0.18, 1.1], [0.195, 1.25], [0.19, 1.33], [0.13, 1.42], [0.06, 1.47], [0.001, 1.48]], 15, 0.06), marble, fig)
    .scale.set(1, 1, 0.78);
  // himation : grande écharpe de tissu en diagonale, de l'épaule gauche à la hanche droite, autour du corps
  // boucle inclinée qui épouse le buste : épaule gauche -> devant -> hanche droite -> dos -> épaule gauche
  const sash = [];
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * Math.PI * 2, x = Math.sin(a) * 0.215, z = Math.cos(a) * 0.17;
    sash.push(new THREE.Vector3(x, 1.17 - x * 0.95, z));
  }
  const sashGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sash, true), 96, 0.03, 10, true);
  put(sashGeo, marbleS, fig).scale.set(1, 1, 1);
  // pan du manteau qui tombe de l'épaule gauche jusqu'aux mollets, dans le dos
  put(cloth([[0.11, 0.25], [0.12, 0.6], [0.1, 1.0], [0.085, 1.3], [0.05, 1.4]], 7, 0.14), marbleS, fig, -0.12, 0, -0.1).scale.set(1, 1, 0.6);
  // bras droit levé vers l'avant (geste de l'orateur)
  const rs = new THREE.Group(); rs.position.set(0.2, 1.36, 0); rs.rotation.set(-1.35, 0, -0.12); fig.add(rs);
  put(new THREE.SphereGeometry(0.068, 16, 12), marble, rs);
  put(capsule(0.062, 0.05, 0.29), marble, rs);
  const re = new THREE.Group(); re.position.y = -0.29; re.rotation.x = -0.45; rs.add(re);
  put(capsule(0.05, 0.04, 0.25), marble, re);
  put(new THREE.SphereGeometry(0.048, 14, 10), marble, re, 0, -0.3, 0).scale.set(0.95, 1.3, 0.45);
  // bras gauche le long du corps, avant-bras replié tenant un rouleau, drapé qui retombe
  const ls = new THREE.Group(); ls.position.set(-0.2, 1.36, 0); ls.rotation.set(-0.1, 0, 0.1); fig.add(ls);
  put(new THREE.SphereGeometry(0.07, 16, 12), marbleS, ls);
  put(capsule(0.064, 0.055, 0.29), marbleS, ls);
  const le = new THREE.Group(); le.position.y = -0.29; le.rotation.x = -1.3; ls.add(le);
  put(capsule(0.05, 0.042, 0.23), marble, le);
  put(new THREE.CylinderGeometry(0.033, 0.033, 0.28, 16), marble, le, 0, -0.27, 0.015, 0, 0, Math.PI / 2);
  put(cloth([[0.04, -0.05], [0.09, -0.35], [0.12, -0.6]].map(([r, y]) => [r, y]).reverse().map(([r, y]) => [r, y]), 6, 0.2), marbleS, le, 0.01, -0.12, -0.06).rotation.x = 1.3;
  // cou et tête : visage, barbe courte, cheveux bouclés serrés, couronne de laurier
  put(new THREE.CylinderGeometry(0.055, 0.065, 0.1, 18), marble, fig, 0, 1.5, 0);
  const head = new THREE.Group(); head.position.set(0, 1.62, 0.015); head.rotation.set(-0.1, 0.25, 0); fig.add(head);
  window.STATUE_HEAD = head;
  put(new THREE.SphereGeometry(0.1, 32, 24), marble, head).scale.set(0.88, 1.1, 1);
  put(new THREE.SphereGeometry(0.08, 24, 16), marble, head, 0, -0.045, 0.02).scale.set(0.85, 0.8, 0.95);       // mâchoire
  put(new THREE.ConeGeometry(0.017, 0.05, 10), marble, head, 0, -0.005, 0.1, Math.PI / 2 - 0.2);                 // nez
  for (const sx of [-1, 1]) {
    put(new THREE.SphereGeometry(0.016, 10, 8), marbleS, head, sx * 0.034, 0.018, 0.08).scale.set(1.3, 0.75, 0.5);   // orbites
    put(new THREE.BoxGeometry(0.04, 0.008, 0.015), marble, head, sx * 0.035, 0.038, 0.088, 0, 0, sx * -0.1);       // arcades
    put(new THREE.SphereGeometry(0.022, 10, 8), marble, head, sx * 0.088, 0.0, -0.005).scale.set(0.4, 1, 0.7);     // oreilles
  }
  const beard = put(new THREE.SphereGeometry(0.088, 24, 14, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.45), marbleS, head, 0, -0.03, 0.022);
  beard.scale.set(1.0, 1.3, 1.12);
  put(new THREE.SphereGeometry(0.106, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), marbleS, head, 0, 0.012, -0.01).scale.set(0.92, 1.1, 1.02);   // chevelure
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 34; i++) {                                     // petites boucles sur le dessus et l'arrière
    const a = rnd() * Math.PI * 2, e = rnd() * 1.25;
    if (Math.cos(a) > 0.2 && e > 0.75) continue;
    put(new THREE.SphereGeometry(0.02, 8, 6), marbleS, head, Math.sin(a) * Math.sin(e) * 0.098, 0.022 + Math.cos(e) * 0.112, Math.cos(a) * Math.sin(e) * 0.1 - 0.01);
  }
  for (let i = 0; i < 24; i++) {                                     // couronne de laurier
    const a = i / 24 * Math.PI * 2; if (Math.cos(a) > 0.93) continue;
    put(new THREE.SphereGeometry(0.02, 8, 6), marble, head, Math.sin(a) * 0.1, 0.06 + 0.006 * Math.sin(i * 2.3), Math.cos(a) * 0.106, 0, a + Math.PI / 2, 0.5).scale.set(0.5, 0.3, 1.5);   // feuilles le long de la couronne
  }
  // socle : on peut s'y poser (en volant) ; la statue elle-même bloque le passage
  OBSTACLES.push({ minX: STATUE.x - 1.5, maxX: STATUE.x + 1.5, minZ: STATUE.z - 1.5, maxZ: STATUE.z + 1.5, top: PED_H, standable: true });
  OBSTACLES.push({ minX: STATUE.x - 0.75, maxX: STATUE.x + 0.75, minZ: STATUE.z - 0.75, maxZ: STATUE.z + 0.75, top: PED_H + 1.8 * 2.4, standable: false });
  // éclairage de mise en valeur depuis le pied du socle
  for (const s of [-1, 1]) {
    const spot = new THREE.SpotLight(0xffd9a0, 1.6, 14, 0.45, 0.6, 1.5);
    spot.position.set(s * 1.6, 0.3, 2.6); root.add(spot);
    spot.target.position.set(0, 4.2, 0); root.add(spot.target);
  }
}

// ---------- Balai magique : posé dans la cour, on l'enfourche (E) pour voler, on le lâche (E) ----------
const BROOM = { equipped: false, x: 2.6, y: 0.3, z: 7.4, vy: 0, yaw: 0.7, tilt: 0 };
const broom = new THREE.Group(); scene.add(broom);
{
  const wood = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x5a3a22).convertSRGBToLinear(), roughness: 0.55 });
  const straw = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xc9a25a).convertSRGBToLinear(), roughness: 0.85 });
  const band = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x6a35a6).convertSRGBToLinear(), roughness: 0.5, emissive: 0x2a0f50 });
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; broom.add(o); return o; };
  add(new THREE.CylinderGeometry(0.02, 0.026, 1.55, 10), wood, 0, 0, 0.12, Math.PI / 2);          // manche (axe z = avant)
  add(new THREE.SphereGeometry(0.032, 10, 8), wood, 0, 0, 0.9);                                  // pommeau
  add(new THREE.TorusGeometry(0.03, 0.008, 6, 14), band, 0, 0, 0.78);                           // anneau violet
  add(new THREE.CylinderGeometry(0.05, 0.045, 0.07, 12), band, 0, 0, -0.62, Math.PI / 2);       // ligatures
  add(new THREE.CylinderGeometry(0.06, 0.055, 0.04, 12), band, 0, 0, -0.74, Math.PI / 2);
  let seed = 9; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 46; i++) {                                                                  // brindilles en éventail
    const a = rnd() * Math.PI * 2, r = 0.02 + rnd() * 0.04, spread = 1.6 + rnd() * 1.2, len = 0.42 + rnd() * 0.12;
    const s = add(new THREE.CylinderGeometry(0.006, 0.009, len, 4), straw, 0, 0, 0, 0, 0, 0);
    const dir = new THREE.Vector3(Math.cos(a) * r * spread, Math.sin(a) * r * spread, -1).normalize();
    s.position.set(Math.cos(a) * r, Math.sin(a) * r, -0.66).addScaledVector(dir, len / 2);
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  }
  const glow = new THREE.PointLight(0xa07cff, 0.7, 4, 2); glow.position.set(0, 0.1, 0); broom.add(glow);
}
// étincelles magiques autour du balai et en traînée pendant le vol
const SPARKS = 90, sparkPos = new Float32Array(SPARKS * 3), sparks = [];
const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
scene.add(new THREE.Points(sparkGeo, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(dotCanvas), color: 0xc8b0ff, size: 0.07,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
for (let i = 0; i < SPARKS; i++) sparks.push({ life: Math.random(), x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0 });
function updateBroom(dt, now) {
  const t = now / 1000;
  if (BROOM.equipped) {
    BROOM.x = p.x; BROOM.z = p.z; BROOM.y = p.y + 0.62;
    let d = heroYaw - BROOM.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); BROOM.yaw += d * Math.min(1, dt * 12);
    BROOM.tilt += (-p.vy * 0.08 - BROOM.tilt) * Math.min(1, dt * 6);
    broom.position.set(BROOM.x, BROOM.y, BROOM.z); broom.rotation.set(BROOM.tilt, BROOM.yaw, 0);
  } else {
    // lâché : il retombe doucement puis flotte à 30 cm du sol en tournant lentement
    const floorY = groundAt(BROOM.x, BROOM.z, BROOM.y) + 0.3 + Math.sin(t * 2) * 0.04;
    if (BROOM.y > floorY + 0.01) { BROOM.vy -= 6 * dt; BROOM.y = Math.max(floorY, BROOM.y + BROOM.vy * dt); } else { BROOM.vy = 0; BROOM.y = floorY; }
    BROOM.yaw += dt * 0.35;
    broom.position.set(BROOM.x, BROOM.y, BROOM.z); broom.rotation.set(0, BROOM.yaw, Math.sin(t * 1.3) * 0.06);
  }
  broom.updateMatrixWorld();
  const tail = broom.localToWorld(new THREE.Vector3(0, 0, -0.95));
  for (let i = 0; i < SPARKS; i++) {
    const s = sparks[i];
    s.life -= dt * (BROOM.equipped ? 1.6 : 0.8);
    if (s.life <= 0) {
      s.life = 1;
      if (BROOM.equipped && p.moving) { s.x = tail.x; s.y = tail.y; s.z = tail.z; s.vx = (Math.random() - 0.5) * 0.4; s.vy = (Math.random() - 0.5) * 0.4; s.vz = (Math.random() - 0.5) * 0.4; }
      else { const a = Math.random() * 6.28; s.x = BROOM.x + Math.cos(a) * 0.5; s.y = BROOM.y + (Math.random() - 0.5) * 0.3; s.z = BROOM.z + Math.sin(a) * 0.5; s.vx = 0; s.vy = 0.3; s.vz = 0; }
    }
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    sparkPos[i * 3] = s.x; sparkPos[i * 3 + 1] = s.y; sparkPos[i * 3 + 2] = s.z;
  }
  sparkGeo.attributes.position.needsUpdate = true;
  // indication à l'écran
  const near = Math.hypot(p.x - BROOM.x, p.z - BROOM.z) < 1.8 && Math.abs(p.y - (BROOM.y - 0.3)) < 1.5;
  const msg = BROOM.equipped ? "E : lâcher le balai · Espace : monter · Maj : descendre" : near ? "E : enfourcher le balai magique" : "";
  if (prompt.textContent !== msg) prompt.textContent = msg;
  prompt.hidden = !msg;
  broomBtn.hidden = !(BROOM.equipped || near);
  broomBtn.textContent = BROOM.equipped ? "Lâcher" : "Balai";
  downBtn.hidden = !BROOM.equipped;
  jumpBtn.textContent = BROOM.equipped ? "Monter" : "Sauter";
}
function toggleBroom() {
  if (BROOM.equipped) {                                         // on le lâche : il tombe sous nous, on retombe aussi
    BROOM.equipped = false; BROOM.vy = 0; p.vy = 0;
  } else if (Math.hypot(p.x - BROOM.x, p.z - BROOM.z) < 1.8) {
    BROOM.equipped = true; p.vy = 0; p.y += 0.3;
  }
}

// ---------- Nuit : ciel étoilé, clair de lune, lanternes ----------
scene.add(new THREE.HemisphereLight(0x8090c0, 0x3a332c, 0.42));
const moon = new THREE.DirectionalLight(0xc4d2ff, 0.55);
moon.position.set(18, 44, 14); moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048); moon.shadow.bias = -0.0008; moon.shadow.normalBias = 0.03;
Object.assign(moon.shadow.camera, { left: -HALF - 13, right: HALF + 13, top: HALF + 13, bottom: -HALF - 13, near: 1, far: 90 });
scene.add(moon);
{ // étoiles
  const n = 700, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, e = 0.12 + Math.random() * 1.3, r = 70;
    pos[i * 3] = Math.cos(a) * Math.cos(e) * r; pos[i * 3 + 1] = 20 + Math.sin(e) * r; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 0.35, sizeAttenuation: true, fog: false })));
  const moonDisk = new THREE.Mesh(new THREE.CircleGeometry(3.2, 32), new THREE.MeshBasicMaterial({ color: 0xf2f0e2 }));
  moonDisk.position.set(27, 52, 21); moonDisk.lookAt(0, 0, 0); scene.add(moonDisk);
}
// lanternes en fer forgé sur les piliers : lueur chaude qui vacille
const lanterns = [];
function lantern(wallX, wallZ, ry, x, withLight) {
  const g = new THREE.Group(); g.position.set(wallX, 0, wallZ); g.rotation.y = ry; scene.add(g);
  const z0 = PILLAR.out, y = 2.75;
  const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = mat === IRON; g.add(m); return m; };
  add(new THREE.BoxGeometry(0.05, 0.05, 0.36), IRON, x, y + 0.26, z0 + 0.18);          // potence
  add(new THREE.BoxGeometry(0.05, 0.3, 0.05), IRON, x, y + 0.12, z0 + 0.02);
  add(new THREE.BoxGeometry(0.2, 0.03, 0.2), IRON, x, y - 0.16, z0 + 0.34);             // fond
  add(new THREE.BoxGeometry(0.15, 0.26, 0.15), FLAME, x, y - 0.02, z0 + 0.34);          // verre éclairé
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])                           // montants
    add(new THREE.BoxGeometry(0.025, 0.3, 0.025), IRON, x + dx * 0.09, y - 0.02, z0 + 0.34 + dz * 0.09);
  const cap = add(new THREE.ConeGeometry(0.16, 0.16, 4), IRON, x, y + 0.2, z0 + 0.34); cap.rotation.y = Math.PI / 4;
  add(new THREE.TorusGeometry(0.035, 0.012, 4, 8), IRON, x, y + 0.31, z0 + 0.34);       // anneau
  if (withLight) {
    const l = new THREE.PointLight(0xffa654, 0.9, 10, 2);
    l.position.set(x, y, z0 + 0.6); g.add(l);
    lanterns.push({ l, seed: Math.random() * 100 });
  }
}
for (const [wx, wz, ry] of [[0, -HALF, 0], [0, HALF, Math.PI], [-HALF, 0, Math.PI / 2], [HALF, 0, -Math.PI / 2]])
  for (const x of [-9.75, -3.25, 3.25, 9.75]) lantern(wx, wz, ry, x, Math.abs(x) < 5);
function updateLights(now) {
  const t = now / 1000;
  for (const { l, seed } of [...lanterns, ...chandeliers])
    l.intensity = 0.9 * (0.88 + 0.08 * Math.sin(t * 7.3 + seed) + 0.05 * Math.sin(t * 13.1 + seed * 2));
}

// ---------- Personnages en pixel art (héros et PNJ) ----------
// Sprites dessinés en code, proportions de collégien / lycéen (≈ 7 têtes). Images de 40 x 80 pixels :
// lignes = face, gauche, droite, dos ; colonnes = repos, 4 pas de marche, saut, assis.
// Dans la scène, chaque personnage est un panneau toujours tourné vers la caméra (style « HD-2D »).
const FW = 40, FH = 80, COLS = 7;
const OUTLINE = "#1b1420";
const hex = c => "#" + c.toString(16).padStart(6, "0");
function tone(c, f) {
  const r = Math.min(255, ((c >> 16) & 255) * f), g = Math.min(255, ((c >> 8) & 255) * f), b = Math.min(255, (c & 255) * f);
  return "#" + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
}
function palette(o) {
  return { skin: hex(o.skin), skinS: tone(o.skin, 0.8), lips: tone(o.skin, 0.7), hair: hex(o.hair), hairS: tone(o.hair, 0.7), hairL: tone(o.hair, 1.35),
    eye: hex(o.eyes), white: "#f2efe8", coat: hex(o.coat), coatS: tone(o.coat, 0.72), coatL: tone(o.coat, 1.35), trim: hex(o.trim),
    shirt: hex(o.shirt), shirtS: tone(o.shirt, 0.82), tie: o.tie ? hex(o.tie) : null, tieS: o.tie ? tone(o.tie, 0.75) : null,
    pants: hex(o.pants), pantsS: tone(o.pants, 0.7), shoes: hex(o.shoes), shoesS: tone(o.shoes, 0.7), sole: "#141010",
    scarf: o.scarf ? hex(o.scarf) : null, scarfS: o.scarf ? tone(o.scarf, 0.72) : null, belt: "#3a2618",
    style: o.hairStyle, highBoots: o.highBoots };
}
function drawSheet(o) {
  const P = palette(o);
  const cv = document.createElement("canvas"); cv.width = FW * COLS; cv.height = FH * 4;
  const ctx = cv.getContext("2d");
  const frame = document.createElement("canvas"); frame.width = FW; frame.height = FH;
  const f = frame.getContext("2d");
  const kinds = ["idle", "walk0", "walk1", "walk2", "walk3", "jump", "sit"];
  for (let row = 0; row < 4; row++) for (let col = 0; col < COLS; col++) {
    f.clearRect(0, 0, FW, FH);
    const dir = ["front", "side", "side", "back"][row];
    if (dir === "side") drawSide(f, P, kinds[col]); else drawFrontBack(f, P, kinds[col], dir === "back");
    outline(f);
    ctx.save();
    if (row === 1) { ctx.translate((col + 1) * FW, row * FH); ctx.scale(-1, 1); ctx.drawImage(frame, 0, 0); }   // gauche = miroir de droite
    else ctx.drawImage(frame, col * FW, row * FH);
    ctx.restore();
  }
  return cv;
}
function outline(f) {
  const img = f.getImageData(0, 0, FW, FH), d = img.data, solid = i => d[i * 4 + 3] > 0;
  const add = [];
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const i = y * FW + x;
    if (solid(i)) continue;
    if ((x > 0 && solid(i - 1)) || (x < FW - 1 && solid(i + 1)) || (y > 0 && solid(i - FW)) || (y < FH - 1 && solid(i + FW))) add.push(i);
  }
  for (const i of add) { d[i * 4] = 0x1b; d[i * 4 + 1] = 0x14; d[i * 4 + 2] = 0x20; d[i * 4 + 3] = 255; }
  f.putImageData(img, 0, 0);
}
const R = (f, x, y, w, h, c) => { if (c) { f.fillStyle = c; f.fillRect(x, y, w, h); } };
function limb(f, x0, y0, x1, y1, w, c) {               // segment épais (membre) entre deux points
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) + 1;
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + (x1 - x0) * i / n - w / 2 + 0.5), y = Math.round(y0 + (y1 - y0) * i / n);
    R(f, x, y, w, 1, c);
  }
}
// --- face / dos ---
function drawFrontBack(f, P, kind, back) {
  const step = kind.startsWith("walk") ? +kind[4] : -1;
  const sit = kind === "sit", jump = kind === "jump";
  const T = sit ? 16 : 2 + (step === 0 || step === 2 ? 1 : 0);
  const lift = [step === 1 ? 2 : jump ? 3 : 0, step === 3 ? 2 : jump ? 3 : 0];
  if (back) lift.reverse();
  // jambes
  for (let i = 0; i < 2; i++) {
    const x0 = i === 0 ? 15 : 21;
    if (sit) {                                           // assis : cuisses vers l'avant (raccourcies), tibias à la verticale
      R(f, x0 - 1, T + 38, 6, 5, back ? P.coatS : P.pants); R(f, x0, T + 43, 4, 16, P.pants); R(f, x0 + 3, T + 43, 1, 16, P.pantsS);
      if (P.highBoots) R(f, x0, T + 49, 4, 10, P.shoes);
      R(f, x0 - (i ? 0 : 1), T + 59, 5, 3, P.shoes); R(f, x0 - (i ? 0 : 1), T + 62, 5, 1, P.sole);
      continue;
    }
    const yTop = T + 38, yAnk = T + 72 - lift[i];
    R(f, x0, yTop, 4, yAnk - yTop, P.pants); R(f, i ? x0 + 3 : x0 + 3, yTop, 1, yAnk - yTop, P.pantsS);
    if (P.highBoots) { R(f, x0, yAnk - 13, 4, 13, P.shoes); R(f, x0 + 3, yAnk - 13, 1, 13, P.shoesS); R(f, x0, yAnk - 13, 4, 1, P.shoesS); }
    R(f, x0 - (i ? 0 : 1), yAnk, 5, 3, P.shoes); R(f, x0 - (i ? 0 : 1), yAnk + 3, 5, 1, P.sole);
  }
  // robe : trapèze des épaules à l'ourlet (genoux), ouverte devant
  const hem = sit ? T + 42 : T + 53;
  for (let y = T + 13; y <= hem; y++) {
    const u = (y - T - 13) / 40;
    let hw = y < T + 16 ? 8 : u < 0.45 ? 8 - u * 2.5 : 7 + (u - 0.45) * 6;
    if (sit && y > T + 37) hw = 9;
    hw = Math.round(hw);
    const sway = (step === 1 || step === 3) && y > T + 46 ? (step === 1 ? 1 : -1) : 0;
    const x0 = 20 - hw + sway, x1 = 20 + hw - 1 + sway;
    R(f, x0, y, x1 - x0 + 1, 1, P.coat); R(f, x0, y, 1, 1, P.coatL); R(f, x1 - 1, y, 2, 1, P.coatS);
    if (y === hem) R(f, x0, y, x1 - x0 + 1, 1, P.trim);
    if (!back && y > T + 14) {                           // ouverture devant
      const ow = y <= T + 33 ? 2 : sit ? 0 : 1;
      if (ow) {
        R(f, 20 - ow - 1 + sway, y, 1, 1, P.trim); R(f, 20 + ow + sway, y, 1, 1, P.trim);
        if (y <= T + 33) R(f, 20 - ow, y, ow * 2, 1, P.shirt); else f.clearRect(20 - ow + sway, y, ow * 2, 1);
      }
    }
    if (back && y > T + 38 && !sit) R(f, 20 + sway, y, 1, 1, P.coatS);   // fente dans le dos
  }
  if (!back) {
    R(f, 18, T + 33, 4, 1, P.belt);
    if (P.tie) { R(f, 19, T + 15, 2, 1, P.tieS); R(f, 19, T + 16, 2, 11, P.tie); R(f, 20, T + 16, 1, 11, P.tieS); R(f, 19, T + 27, 2, 1, P.tieS); }
    else R(f, 18, T + 15, 4, 18, P.shirtS);
  }
  R(f, 15, T + 13, 10, 2, P.coat); R(f, 15, T + 13, 1, 2, P.coatL); R(f, 23, T + 13, 2, 2, P.coatS);       // col
  // bras
  for (let i = 0; i < 2; i++) {
    const sx = i === 0 ? 10 : 29, side = i === 0 ? -1 : 1;
    const sw = step < 0 ? 0 : ((step === 0) === (i === 0) ? 1 : step === 2 ? ((i === 0) ? -1 : 1) : 0);
    if (jump) { limb(f, sx, T + 16, sx + side * 4, T + 27, 3, P.coat); R(f, sx + side * 4 - 1, T + 27, 3, 1, P.trim); R(f, sx + side * 4 - 1, T + 28, 3, 3, P.skin); continue; }
    if (sit) { limb(f, sx, T + 16, sx - side * 1, T + 33, 3, P.coat); R(f, sx - side - 1, T + 34, 3, 1, P.trim); R(f, sx - side - 1, T + 35, 3, 3, P.skin); continue; }
    const len = 18 - Math.abs(sw);
    R(f, sx - 1, T + 15, 3, len, P.coat); R(f, sx - 1, T + 15, 1, len, i ? P.coatL : P.coatL); R(f, sx + 1, T + 15, 1, len, P.coatS);
    R(f, sx - 1, T + 15 + len, 3, 1, P.trim); R(f, sx - 1, T + 16 + len, 3, 3, P.skin); R(f, sx + 1, T + 16 + len, 1, 3, P.skinS);
  }
  // cou, écharpe
  R(f, 18, T + 11, 4, 2, P.skinS);
  if (P.scarf) {
    R(f, 15, T + 11, 10, 3, P.scarf); R(f, 22, T + 11, 3, 3, P.scarfS);
    if (!back) { R(f, 17, T + 14, 2, 13, P.scarf); R(f, 18, T + 14, 1, 13, P.scarfS); R(f, 17, T + 27, 2, 1, P.trim); }
  }
  // tête
  if (back) {
    R(f, 16, T, 8, 1, P.hair); R(f, 15, T + 1, 10, 10, P.hair); R(f, 16, T + 11, 8, 1, P.hairS); R(f, 22, T + 1, 3, 10, P.hairS); R(f, 17, T + 1, 3, 2, P.hairL);
    if (P.style !== "long") { R(f, 14, T + 6, 1, 2, P.skin); R(f, 25, T + 6, 1, 2, P.skinS); }
  } else {
    R(f, 16, T + 3, 8, 8, P.skin); R(f, 17, T + 11, 6, 1, P.skin); R(f, 23, T + 4, 1, 7, P.skinS);
    R(f, 16, T, 8, 1, P.hair); R(f, 15, T + 1, 10, 3, P.hair); R(f, 17, T + 1, 3, 1, P.hairL); R(f, 23, T + 1, 2, 3, P.hairS);
    if (P.style !== "long") { R(f, 15, T + 6, 1, 2, P.skin); R(f, 24, T + 6, 1, 2, P.skinS); }
    R(f, 17, T + 5, 2, 1, P.hairS); R(f, 21, T + 5, 2, 1, P.hairS);
    R(f, 17, T + 6, 1, 1, P.white); R(f, 18, T + 6, 1, 1, P.eye); R(f, 21, T + 6, 1, 1, P.eye); R(f, 22, T + 6, 1, 1, P.white);
    R(f, 20, T + 8, 1, 1, P.skinS); R(f, 19, T + 10, 2, 1, P.lips);
  }
  if (P.style === "messy") { R(f, 16, T - 1, 1, 1, P.hair); R(f, 19, T - 1, 1, 1, P.hair); R(f, 22, T - 1, 1, 1, P.hair); if (!back) { R(f, 16, T + 4, 1, 1, P.hair); R(f, 18, T + 4, 2, 1, P.hair); R(f, 21, T + 4, 1, 1, P.hair); R(f, 23, T + 4, 1, 1, P.hairS); } }
  if (P.style === "short" && !back) { R(f, 16, T + 4, 3, 1, P.hair); R(f, 21, T + 4, 3, 1, P.hair); }
  if (P.style === "long") { R(f, 14, T + 2, 2, 14, P.hair); R(f, 24, T + 2, 2, 14, P.hairS); if (back) R(f, 15, T + 11, 10, 5, P.hair); else { R(f, 16, T + 4, 2, 1, P.hair); R(f, 22, T + 4, 2, 1, P.hair); } }
  if (P.style === "bun") { R(f, 18, T - 3, 4, 3, P.hair); R(f, 20, T - 3, 2, 3, P.hairS); }
}
// --- profil (regarde vers la droite) ---
const SIDE_LEGS = {      // [cuisse, plié] pour la jambe proche puis la jambe éloignée (radians, + = vers l'avant)
  idle: [[0.02, 0], [-0.02, 0]], walk0: [[0.4, 0.05], [-0.4, 0.25]], walk1: [[0, 0], [0.2, 0.9]],
  walk2: [[-0.4, 0.25], [0.4, 0.05]], walk3: [[0.2, 0.9], [0, 0]], jump: [[0.7, 1.3], [-0.15, 0.9]],
};
function drawSide(f, P, kind) {
  const sit = kind === "sit";
  const legs = SIDE_LEGS[kind] || SIDE_LEGS.idle;
  const leg = ([a, k]) => { const kx = Math.sin(a) * 17, ky = Math.cos(a) * 17; return [kx, ky, kx + Math.sin(a - k) * 18, ky + Math.cos(a - k) * 18]; };
  const L = legs.map(leg);
  const T = sit ? 18 : kind === "jump" ? 2 : 2 + Math.round(35 - Math.max(L[0][3], L[1][3]));
  const hx = 19, hy = T + 38;
  const drawLeg = (g, near) => {
    const pc = near ? P.pants : P.pantsS, sc = near ? P.shoes : P.shoesS;
    if (sit) {
      limb(f, hx, hy, hx + 14, hy, 5, near ? P.coat : P.coatS); limb(f, hx + 14, hy, hx + 14, hy + 16, 4, pc);
      if (P.highBoots) limb(f, hx + 14, hy + 6, hx + 14, hy + 16, 4, sc);
      R(f, hx + 12, hy + 17, 7, 2, sc); R(f, hx + 12, hy + 19, 7, 1, P.sole); return;
    }
    const kx = hx + g[0], ky = hy + g[1], ax = hx + g[2], ay = hy + g[3];
    limb(f, hx, hy, kx, ky, 5, pc); limb(f, kx, ky, ax, ay, 4, pc);
    if (P.highBoots) limb(f, kx + (ax - kx) * 0.3, ky + (ay - ky) * 0.3, ax, ay, 4, sc);
    R(f, Math.round(ax) - 2, Math.round(ay), 7, 2, sc); R(f, Math.round(ax) - 2, Math.round(ay) + 2, 7, 1, P.sole);
  };
  const armA = sit ? [0.5, 0.5] : kind === "jump" ? [2.3, 1.9] : [-legs[0][0] * 0.8, -legs[1][0] * 0.8];
  const drawArm = (a, near) => {
    const sx = 19, sy = T + 15, ex = sx + Math.sin(a) * 9, ey = sy + Math.cos(a) * 9, hx2 = ex + Math.sin(a + 0.35) * 8, hy2 = ey + Math.cos(a + 0.35) * 8;
    const c = near ? P.coat : P.coatS;
    limb(f, sx, sy, ex, ey, 3, c); limb(f, ex, ey, hx2, hy2, 3, c);
    R(f, Math.round(hx2) - 1, Math.round(hy2), 3, 1, P.trim); R(f, Math.round(hx2) - 1, Math.round(hy2) + 1, 3, 3, near ? P.skin : P.skinS);
  };
  drawArm(armA[1], false); drawLeg(L[1], false); drawLeg(L[0], true);
  // robe de profil
  const hem = sit ? hy + 2 : T + 53;
  for (let y = T + 13; y <= hem; y++) {
    const u = (y - T - 13) / 40;
    const xb = Math.round(u < 0.5 ? 15 + u * 2 : 16 - (u - 0.5) * 4), xf = Math.round(u < 0.5 ? 23 : 23 + (u - 0.5) * 5);
    R(f, xb, y, xf - xb + 1, 1, P.coat); R(f, xb, y, 1, 1, P.coatL); R(f, xf, y, 1, 1, P.trim);
    if (y === hem) R(f, xb, y, xf - xb + 1, 1, P.trim);
  }
  if (P.scarf) { R(f, 23, T + 13, 2, 14, P.scarf); R(f, 24, T + 13, 1, 14, P.scarfS); R(f, 23, T + 27, 2, 1, P.trim); }
  else if (P.tie) { R(f, 24, T + 14, 1, 18, P.shirt); R(f, 25, T + 15, 1, 11, P.tie); }
  R(f, 18, T + 11, 3, 3, P.skinS);
  if (P.scarf) R(f, 16, T + 11, 9, 3, P.scarf);
  // tête de profil
  R(f, 18, T + 3, 6, 8, P.skin); R(f, 19, T + 11, 4, 1, P.skin); R(f, 24, T + 7, 1, 2, P.skin);
  R(f, 16, T, 6, 1, P.hair); R(f, 15, T + 1, 8, 3, P.hair); R(f, 15, T + 4, 4, 6, P.hair); R(f, 16, T + 1, 3, 1, P.hairL); R(f, 15, T + 7, 2, 3, P.hairS);
  R(f, 22, T + 4, 2, 1, P.hair);
  R(f, 18, T + 6, 1, 2, P.skinS);
  R(f, 21, T + 5, 2, 1, P.hairS); R(f, 22, T + 6, 1, 1, P.eye); R(f, 21, T + 6, 1, 1, P.white); R(f, 22, T + 10, 1, 1, P.lips);
  if (P.style === "messy") { R(f, 15, T, 1, 1, P.hair); R(f, 18, T - 1, 1, 1, P.hair); R(f, 21, T - 1, 1, 1, P.hair); R(f, 14, T + 3, 1, 1, P.hair); }
  if (P.style === "long") { R(f, 13, T + 3, 5, 13, P.hair); R(f, 13, T + 10, 2, 6, P.hairS); }
  if (P.style === "bun") { R(f, 12, T + 1, 3, 4, P.hair); R(f, 12, T + 3, 3, 2, P.hairS); }
  drawArm(armA[0], true);
}

// panneau dans la scène
const blobGeo = new THREE.CircleGeometry(0.3, 24), blobMat = new THREE.MeshBasicMaterial({ color: 0x14100c, transparent: true, opacity: 0.32, depthWrite: false });
function makeCharacter(o) {
  const tex = new THREE.CanvasTexture(drawSheet(o));
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.encoding = THREE.sRGBEncoding;
  tex.repeat.set(1 / COLS, 1 / 4);
  const h = o.height * FH / 76, w = h * FW / FH;
  const geo = new THREE.PlaneGeometry(w, h); geo.translate(0, h / 2 - h * 2 / FH, 0);    // pieds (ligne 78) au sol
  const m = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0x4a4650, emissiveMap: tex });
  const mesh = new THREE.Mesh(geo, m); scene.add(mesh);
  const shadow = new THREE.Mesh(blobGeo, blobMat.clone()); shadow.rotation.x = -Math.PI / 2; shadow.scale.set(1, 0.7, 1); scene.add(shadow);
  return { mesh, tex, shadow, phase: Math.random() * 4 };
}
// place le panneau, le tourne vers la caméra et choisit l'image (direction + pose)
function showCharacter(C, x, y, z, yaw, col, groundY = 0) {
  C.mesh.position.set(x, y, z);
  const vx = x - camera.position.x, vz = z - camera.position.z, vl = Math.hypot(vx, vz) || 1;
  C.mesh.rotation.y = Math.atan2(-vx, -vz);
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const dot = (fx * vx + fz * vz) / vl, side = (fx * -vz + fz * vx) / vl;
  const row = dot < -0.7 ? 0 : dot > 0.7 ? 3 : side > 0 ? 2 : 1;
  const cols = C.cols || COLS, rows = C.rows || 4;
  C.tex.offset.set((col + 1 / C.fw) / cols, 1 - (row + 1) / rows + 1 / (C.fh * rows));
  const sh = 1 / (1 + (y - groundY) * 0.7);
  C.shadow.position.set(x, groundY + 0.012, z); C.shadow.scale.set(sh, 0.7 * sh, 1); C.shadow.material.opacity = 0.32 * sh;
}

// ---------- Héros : la planche de sprites fournie (Assets/Resources/avatar_sheet.png) ----------
// 4 lignes (face, gauche, droite, dos) x 4 colonnes (repos, pas A, repos, pas B), images de 172 x 303, pieds à 4 px du bas
const HERO_FW = 172, HERO_FH = 303, HERO_H = 1.6;             // taille du personnage dans la cour (m)
function makeSheetCharacter(uri, cols, rows, fw, fh, height, feetPx) {
  const tex = new THREE.TextureLoader().load(uri);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.encoding = THREE.sRGBEncoding;
  tex.repeat.set(1 / cols - 2 / (fw * cols), 1 / rows - 2 / (fh * rows));   // marge d'1 px : pas de débord entre images
  const h = height * fh / (fh - feetPx - 8), w = h * fw / fh;
  const geo = new THREE.PlaneGeometry(w, h); geo.translate(0, h / 2 - h * feetPx / fh, 0);
  const m = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0x4a4650, emissiveMap: tex });
  const mesh = new THREE.Mesh(geo, m); scene.add(mesh);
  const shadow = new THREE.Mesh(blobGeo, blobMat.clone()); shadow.rotation.x = -Math.PI / 2; shadow.scale.set(1, 0.7, 1); scene.add(shadow);
  return { mesh, tex, shadow, phase: 0, cols, rows, fw, fh };
}
const HERO = makeSheetCharacter(AVATAR_URI, 4, 4, HERO_FW, HERO_FH, HERO_H, 4);
let heroYaw = Math.PI;
function animateHero(dt, now, airborne, ground) {
  let d = p.facing - heroYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  heroYaw += d * Math.min(1, dt * 14);
  let col = 0;
  if (airborne) col = 1;                                          // en l'air : jambes écartées
  else if (p.moving) { HERO.phase += dt * SPEED * 2.0; col = Math.floor(HERO.phase) % 4; }
  showCharacter(HERO, p.x, p.y + (BROOM.equipped ? 0.06 * Math.sin(now / 300) : 0), p.z, heroYaw, col, ground);
}

// ---------- État ----------
let jumpRequested = false;
const p = { x: 0, y: 0, vy: 0, z: 5, facing: Math.PI, t: 0, moving: false };   // facing : angle de la direction regardée
const cam = { yaw: 0, pitch: 0.35, dist: 5.5 };

// ---------- Entrées ----------
const keys = new Set();
addEventListener("keydown", e => {
  keys.add(e.code);
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
  if (e.code === "Space" && !e.repeat) jumpRequested = true;
  if (e.code === "KeyE" && !e.repeat) toggleBroom();
});
const jumpBtn = document.getElementById("jump"), broomBtn = document.getElementById("broomBtn"), downBtn = document.getElementById("down");
const prompt = document.getElementById("prompt");
let touchUp = false, touchDown = false;
jumpBtn.addEventListener("pointerdown", e => { e.preventDefault(); jumpRequested = true; touchUp = true; });
downBtn.addEventListener("pointerdown", e => { e.preventDefault(); touchDown = true; });
for (const [b, f] of [[jumpBtn, () => touchUp = false], [downBtn, () => touchDown = false]])
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(ev, f);
broomBtn.addEventListener("pointerdown", e => { e.preventDefault(); toggleBroom(); });
addEventListener("keyup", e => keys.delete(e.code));
addEventListener("blur", () => keys.clear());

let stick = null, look = null;
const knob = document.getElementById("knob"), ring = document.getElementById("ring");
canvas.addEventListener("pointerdown", e => {
  canvas.setPointerCapture(e.pointerId);
  const r = canvas.getBoundingClientRect();
  if (e.pointerType !== "mouse" && e.clientX - r.left < r.width / 2 && !stick) {
    stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
    ring.hidden = knob.hidden = false;
    ring.style.left = knob.style.left = (e.clientX - r.left) + "px";
    ring.style.top = knob.style.top = (e.clientY - r.top) + "px";
  } else if (!look) look = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
canvas.addEventListener("pointermove", e => {
  if (stick && e.pointerId === stick.id) {
    const r = canvas.getBoundingClientRect();
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const d = Math.hypot(dx, dy);
    if (d > 50) { dx *= 50 / d; dy *= 50 / d; }
    stick.dx = dx / 50; stick.dy = dy / 50;
    knob.style.left = (stick.ox - r.left + dx) + "px"; knob.style.top = (stick.oy - r.top + dy) + "px";
  } else if (look && e.pointerId === look.id) {
    cam.yaw -= (e.clientX - look.x) * 0.006;
    cam.pitch = Math.max(-0.45, Math.min(1.25, cam.pitch + (e.clientY - look.y) * 0.004));   // vers le bas : on regarde les étages
    look.x = e.clientX; look.y = e.clientY;
  }
});
const release = e => {
  if (stick && e.pointerId === stick.id) { stick = null; ring.hidden = knob.hidden = true; }
  if (look && e.pointerId === look.id) look = null;
};
canvas.addEventListener("pointerup", release); canvas.addEventListener("pointercancel", release);
canvas.addEventListener("wheel", e => { e.preventDefault(); cam.dist = Math.max(2.5, Math.min(10, cam.dist * (1 + e.deltaY * 0.001))); }, { passive: false });

function readMove() {
  let f = 0, s = 0;
  const k = c => keys.has(c);
  if (k("KeyW") || k("ArrowUp")) f += 1;        // Z sur AZERTY
  if (k("KeyS") || k("ArrowDown")) f -= 1;
  if (k("KeyA")) s -= 1;                        // Q sur AZERTY
  if (k("KeyD")) s += 1;
  if (stick) { f = -stick.dy; s = stick.dx; }
  const len = Math.hypot(f, s);
  if (len > 1) { f /= len; s /= len; }
  return [f, s];
}

// ---------- Collisions avec le décor ----------
const COURT_CLEAR = WALL_CLEAR - 0.5;    // dans la cour : rester devant piliers et soubassement
function canMove(x, z, y) {               // position atteignable à cette hauteur (vol : plafond des passages et des salles)
  return WALKABLE.some(r => {
    const m = r.court ? PLAYER_R + COURT_CLEAR : PLAYER_R;
    return x >= r.minX + m && x <= r.maxX - m && z >= r.minZ + m && z <= r.maxZ - m && y <= (r.maxFly || 0) + 1e-3;
  });
}
function ceilingAt(x, z) { let c = 0; for (const r of WALKABLE) if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) c = Math.max(c, r.maxFly || 0); return c; }
function groundAt(x, z, y) {               // pavés, ou dessus d'un banc / du socle sous cette position
  let g = 0;
  for (const o of OBSTACLES) if (o.standable && x > o.minX - 0.1 && x < o.maxX + 0.1 && z > o.minZ - 0.1 && z < o.maxZ + 0.1 && y >= o.top - 0.12) g = Math.max(g, o.top);
  return g;
}
function canStand(x, z) {
  return WALKABLE.some(r => {
    const m = r.court ? PLAYER_R + COURT_CLEAR : PLAYER_R;
    return x >= r.minX + m && x <= r.maxX - m && z >= r.minZ + m && z <= r.maxZ - m;
  });
}
function camOk(x, y, z) {
  return y > 0.25 && CAM_ZONES.some(r => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ && y <= r.maxY);
}


// ---------- Boucle ----------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  resize();
  if (keys.has("ArrowLeft")) cam.yaw += 2.2 * dt;
  if (keys.has("ArrowRight")) cam.yaw -= 2.2 * dt;

  const [f, s] = readMove();
  p.moving = Math.hypot(f, s) > 0.05;
  if (p.moving) {
    // avant = direction de la caméra (à plat), droite = perpendiculaire
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    const mx = fx * f + rx * s, mz = fz * f + rz * s;
    // déplacement limité aux zones praticables (cour, passages sous les arches, salles)
    const sp = BROOM.equipped ? FLY_SPEED : SPEED;
    const nx = p.x + mx * sp * dt, nz = p.z + mz * sp * dt;
    if (canMove(nx, nz, p.y)) { p.x = nx; p.z = nz; }
    else if (canMove(nx, p.z, p.y)) p.x = nx;
    else if (canMove(p.x, nz, p.y)) p.z = nz;
    // on fait le tour de la fontaine sans la traverser
    const fd = Math.hypot(p.x, p.z);
    if (fd < FOUNT.collide && p.y < 2.9) { const k = FOUNT.collide / (fd || 1); p.x *= k; p.z *= k; }
    for (const o of OBSTACLES) {                         // contourner les bancs (sauf si on est dessus) et la bascule
      if (p.y >= o.top - (o.standable ? 0.12 : 0)) continue;   // on passe au-dessus en volant
      const x0 = o.minX - PLAYER_R, x1 = o.maxX + PLAYER_R, z0 = o.minZ - PLAYER_R, z1 = o.maxZ + PLAYER_R;
      if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) {
        const pen = [p.x - x0, x1 - p.x, p.z - z0, z1 - p.z], i = pen.indexOf(Math.min(...pen));
        if (i === 0) p.x = x0; else if (i === 1) p.x = x1; else if (i === 2) p.z = z0; else p.z = z1;
      }
    }
    p.facing = Math.atan2(mx, mz);
    p.t += dt;
  } else p.t = 0;

  // hauteur du sol sous l'avatar : pavés, ou dessus d'un banc
  const ground = groundAt(p.x, p.z, p.y);
  if (BROOM.equipped) {
    // vol : Espace / bouton Monter pour monter, Maj / C / bouton Descendre pour descendre, pas de gravité
    const up = keys.has("Space") || touchUp, down = keys.has("ShiftLeft") || keys.has("ShiftRight") || keys.has("KeyC") || touchDown;
    const target = ((up ? 1 : 0) - (down ? 1 : 0)) * FLY_CLIMB;
    p.vy += (target - p.vy) * Math.min(1, dt * 5);
    p.y = Math.max(ground, Math.min(ceilingAt(p.x, p.z), p.y + p.vy * dt));
  } else {
    // saut : impulsion vers le haut si l'avatar touche le sol, puis gravité
    if (jumpRequested && p.y <= ground + 1e-3) p.vy = JUMP_SPEED;
    p.vy -= GRAVITY * dt; p.y += p.vy * dt;
    if (p.y < ground) { p.y = ground; p.vy = 0; }
  }
  jumpRequested = false;
  const airborne = BROOM.equipped || p.y > ground + 1e-3;

  // caméra en orbite autour de l'avatar, gardée à l'intérieur de la pièce
  const tx = p.x, ty = 1.1 + (BROOM.equipped ? p.y : p.y * 0.5), tz = p.z;   // en vol la caméra suit l'altitude
  let cx = tx + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
  let cy = ty + Math.sin(cam.pitch) * cam.dist;
  let cz = tz + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
  // la caméra se rapproche si un mur s'interpose (on avance le long du segment avatar -> caméra)
  cy = Math.max(0.3, cy);
  let k = 1;
  for (let i = 1; i <= 24; i++) {
    const t = i / 24;
    if (!camOk(tx + (cx - tx) * t, ty + (cy - ty) * t, tz + (cz - tz) * t)) { k = (i - 1) / 24; break; }
  }
  k = Math.max(k, 0.12);
  camera.position.set(tx + (cx - tx) * k, ty + (cy - ty) * k, tz + (cz - tz) * k); camera.lookAt(tx, ty, tz);

  animateHero(dt, now, airborne, ground);

  updateFountain(dt, now);
  updateLights(now);
  updateBroom(dt, now);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
