// Cour de château en 3D, de nuit, vue à la 3e personne : l'avatar se déplace par rapport à la caméra,
// qu'on fait tourner autour de lui (souris / doigt / flèches).
const AVATAR_URI = "data:image/png;base64,{{AVATAR}}";

// ---------- Réglages ----------
const ROOM = 26, HALF = ROOM / 2, WALL_H = 15.6;             // cour carrée de 26 m entourée de façades à 3 niveaux
const TILE = 2;                                              // une texture couvre 2 m x 2 m (répétée, jamais étirée)
const SPEED = 4.2;                                           // m/s (multipliée par la jauge de vitesse)
let speedMul = 1.6;
const FLY_SPEED = 7, CLIMB = 4.5;                             // vol libre : vitesse horizontale en l'air, montée / descente (m/s)
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
// pas de texture : matières unies
const plain = c => new THREE.MeshStandardMaterial({ color: new THREE.Color(c).convertSRGBToLinear(), roughness: 0.95, metalness: 0 });

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
const PILLAR_X = [-ROOM / 6, ROOM / 6];                                // 2 colonnes par façade : le mur est partagé en 3 parts égales
const PILLAR = { w: 0.7, out: 0.3, h: 5.0 };
// créneaux : 15 merlons par mur + merlons d'angle ; même pas sur la muraille intérieure et la muraille extérieure
const MERL_N = 15, MERL_W = 0.9, MERL_C = 0.55, MERL_EDGE = HALF - MERL_C / 2 + 0.12;
const MERL_GAP = (2 * MERL_EDGE - MERL_N * MERL_W) / (MERL_N + 1), MERL_P = MERL_W + MERL_GAP;
// muraille extérieure parallèle, à ~3 m : son merlon d'angle tombe à 2 pas au-delà du dernier merlon intérieur (vides tous égaux)
const OUT_OFF = (MERL_EDGE - MERL_GAP - MERL_W / 2) + 2 * MERL_P + MERL_W / 2 + MERL_GAP + MERL_C / 2 - HALF;
const COL = 0.8;                                                     // toutes les colonnes : fût carré de 0,8 m (murs et angles)
const PLINTH = { h: 0.32, out: 0.1 }, CORNICE = { y: 5.35, h: 0.26, out: 0.2 };
const WALL_CLEAR = 0.8;                                              // distance minimale avatar / mur
// Fenêtres (murs de gauche et de droite) : plein cintre, appui à 1,5 m, sommet à 3,4 m
const WIN = { w: 1.4, bottom: 1.5, spring: 2.7, depth: 0.45, ring: 0.3, out: 0.16 };
const WR = WIN.w / 2;
const WIN_X = [];                                                     // pas de fenêtre au rez-de-chaussée (arcades seulement)
const UPPER_LEVELS = [6.3, 10.5];                                     // appuis des fenêtres des 2 étages
const UPPER_X = [];                                                    // plus de fenêtres sur les façades
const STRING_Y = 9.6, TOP_CORNICE_Y = 14.45;                          // bandeau entre les étages, corniche sommitale
// Salles derrière les arches
// couloir : R = anneau de colonnes, O = ouvertures face à face vers 2 salles ; une position tous les 6 m
const CPATTERN = ["R", "R", "O", "R", "R", "R", "O", "R", "R"];   // 2e paire d'ouvertures décalée d'une colonne : place pour de grandes salles
const RD = 6 * (CPATTERN.length - 1);                                  // 48 m
const OP = { r: AR, s: ARCH.h, t: 1.0 };                              // ouvertures latérales : même taille que l'arche d'entrée (3 m x 4,5 m), mur de 1 m
const SR = { w: 20, d: 12, h: 7 };                                    // grandes salles : 20 m (le long du couloir) x 12 m, 7 m de haut

const WALL_COLOR = 0x9c958a, FLOOR_COLOR = 0x7d7f86;
const floorMat = () => plain(FLOOR_COLOR);
const wallMat = withHeightFade(plain(WALL_COLOR));
wallMat.shadowSide = THREE.DoubleSide;                               // les murs (plans) projettent leur ombre au clair de lune
const nicheMat = withHeightFade(new THREE.MeshStandardMaterial({ color: new THREE.Color(0x857e74).convertSRGBToLinear(), roughness: 0.95, side: THREE.BackSide }));
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
function wallGeometry(windows, arches = ARCH_X) {         // mur entier avec les ouvertures des arches (et des fenêtres) découpées
  const sh = new THREE.Shape();
  sh.moveTo(-HALF, 0);
  for (const c of arches) {
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

// encadrement d'arche en pierre (montants alternés, claveaux, clé de voûte, socles)
function archFrame(W, cx, ai) {
  const rows = 6, bh = ARCH.h / rows, gap = 0.035;
  for (let i = 0; i < rows; i++) {
    const wdt = i % 2 ? 0.42 : 0.62;
    for (const side of [-1, 1]) boxStone(W, wdt, bh - gap, ARCH.out, cx + side * (AR + wdt / 2), i * bh + bh / 2, ARCH.out / 2, i + ai + (side > 0 ? 1 : 0));
  }
  VOUSSOIRS.forEach((geo, i) => stone(geo, W.clone().multiply(tmpM.makeTranslation(cx, ARCH.h, 0)), i + ai));
  for (const side of [-1, 1]) boxStone(W, 0.78, 0.26, ARCH.out + 0.08, cx + side * (AR + 0.36), 0.13, (ARCH.out + 0.08) / 2, 2);
}
// grande porte de château en chêne cloutée, fermée, dans un encadrement d'arche
const GATE_WOOD = [0x4a3020, 0x553824, 0x3f281b].map(c => new THREE.Color(c).convertSRGBToLinear());
const GATE_IRON = new THREE.Color(0x2a2726).convertSRGBToLinear();
function buildGate(W, cx) {
  archFrame(W, cx, 0);
  const n = 8, pw = ARCH.w / n;
  for (let i = 0; i < n; i++) {                                   // planches verticales qui suivent l'arc
    const x = cx - AR + pw * (i + 0.5), u = (x - cx) / AR, top = ARCH.h + AR * Math.sqrt(Math.max(0, 1 - u * u)) - 0.02;
    boxStone(W, pw - 0.025, top, 0.1, x, top / 2, -0.06, GATE_WOOD[i % 3]);
  }
  boxStone(W, 0.05, ARCH.h + AR - 0.05, 0.12, cx, (ARCH.h + AR) / 2, -0.04, GATE_IRON);   // jointure des deux battants
  for (const y of [0.55, 1.6, 2.65]) {                            // pentures en fer et clous
    for (const sx of [-1, 1]) {
      boxStone(W, AR - 0.25, 0.1, 0.03, cx + sx * (AR / 2 + 0.05), y, 0.0, GATE_IRON);
      for (let k = 0; k < 4; k++) boxStone(W, 0.05, 0.05, 0.04, cx + sx * (0.25 + k * 0.33), y, 0.02, GATE_IRON);
    }
  }
  for (const sx of [-1, 1]) {                                     // anneaux de tirage
    const r = new THREE.TorusGeometry(0.11, 0.02, 6, 16);
    stone(r, W.clone().multiply(tmpM.makeTranslation(cx + sx * 0.32, 1.25, 0.04)), GATE_IRON);
  }
}
// meurtrière : fente étroite dans un encadrement de pierre
function arrowSlit(W, x, y) {
  boxStone(W, 0.42, 1.6, 0.12, x, y, 0.06, 2);
  boxStone(W, 0.12, 1.25, 0.02, x, y, 0.125, new THREE.Color(0x0d0b10));
  boxStone(W, 0.36, 0.06, 0.03, x, y, 0.13, new THREE.Color(0x0d0b10));   // croisillon (fente en croix)
  boxStone(W, 0.52, 0.12, 0.2, x, y - 0.86, 0.1, 3);                       // appui
}
function buildWall(px, pz, ry, windows = false, arches = ARCH_X, gate = false) {
  const g = new THREE.Group(); g.position.set(px, 0, pz); g.rotation.y = ry; scene.add(g);
  g.updateMatrixWorld();
  const W = g.matrixWorld;
  const wall = new THREE.Mesh(wallGeometry(windows, arches), wallMat); wall.receiveShadow = wall.castShadow = true; g.add(wall);
  if (windows) for (const cx of WIN_X) buildWindow(g, W, cx);
  UPPER_LEVELS.forEach((b, li) => UPPER_X.forEach((cx, i) => {
    const lit = true;                                                 // même motif sur les 4 façades : toutes les fenêtres éclairées
    buildWindow(g, W, cx, b, lit ? glassMat : glassDark);
  }));

  arches.forEach((cx, ai) => {
    // passage voûté à travers le mur (ouvert aux deux bouts) vers la salle de derrière
    const tunnel = new THREE.Mesh(new THREE.ExtrudeGeometry(archOpening(AR), { depth: ARCH.depth, bevelEnabled: false, curveSegments: 32 }), [hiddenMat, nicheMat]);
    tunnel.position.set(cx, 0, -ARCH.depth); tunnel.receiveShadow = tunnel.castShadow = true; g.add(tunnel);
    const tf = new THREE.Mesh(new THREE.PlaneGeometry(ARCH.w, ARCH.depth), floorMat(ARCH.w, ARCH.depth));
    tf.rotation.x = -Math.PI / 2; tf.position.set(cx, 0.003, -ARCH.depth / 2); tf.receiveShadow = true; g.add(tf);
    archFrame(W, cx, ai);
  });

  // colonnes : même modèle partout (2 sur le mur + 1 dans l'angle) — fût carré en blocs alternés, base, chapiteau,
  // puis tourelle au-dessus du parapet avec petits créneaux
  const column = (cx, cz) => {
    const S = COL, top = TOP_CORNICE_Y - 0.2, rows = 26, bh = (top - 0.45) / rows, gap = 0.035;
    boxStone(W, S + 0.24, 0.3, S + 0.24, cx, 0.15, cz, 3); boxStone(W, S + 0.12, 0.15, S + 0.12, cx, 0.375, cz, 2);   // base moulurée
    for (let i = 0; i < rows; i++) { const w = i % 2 ? S - 0.08 : S; boxStone(W, w, bh - gap, w, cx, 0.45 + i * bh + bh / 2, cz, i); }
    boxStone(W, S + 0.16, 0.22, S + 0.16, cx, top + 0.11, cz, 2);                                                   // chapiteau
    for (let i = 0; i < 6; i++) { const w = i % 2 ? S - 0.08 : S; boxStone(W, w, 0.32, w, cx, top + 0.38 + i * 0.35, cz, i); }   // fût au-dessus de la corniche
    const ty = top + 0.22 + 6 * 0.35;
    boxStone(W, S + 0.3, 0.2, S + 0.3, cx, ty + 0.1, cz, 2);                                                        // plate-forme
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) boxStone(W, 0.3, 0.42, 0.3, cx + dx * (S / 2), ty + 0.41, cz + dz * (S / 2), 0);   // créneaux de la tourelle
    stone(new THREE.ConeGeometry((S + 0.2) * 0.72, 0.9, 4), W.clone().multiply(tmpM.makeTranslation(cx, ty + 0.85, cz)).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 4)), 3);   // toit en pyramide
  };
  for (const x of PILLAR_X) column(x, COL / 2);
  column(HALF - COL / 2, COL / 2);                                     // angle droit du mur (chaque coin en reçoit une)
  // meurtrières au milieu des travées latérales, à deux hauteurs (même motif sur les 4 murs)
  for (const x of [-(HALF + ROOM / 6) / 2, (HALF + ROOM / 6) / 2]) for (const y of [6.2, 10.6]) arrowSlit(W, x, y);
  for (const y of [6.2, 10.6]) arrowSlit(W, 0, y + 1.2);
  // mâchicoulis : consoles en pierre sous le parapet, régulièrement espacées
  for (let k = -9; k <= 9; k++) { const x = k * (HALF - 0.9) / 9.5; if (Math.abs(Math.abs(x) - ROOM / 6) < 0.6) continue;
    boxStone(W, 0.22, 0.35, 0.3, x, TOP_CORNICE_Y - 0.36, 0.15, 3); boxStone(W, 0.22, 0.2, 0.42, x, TOP_CORNICE_Y - 0.12, 0.21, 2); }
  if (gate) buildGate(W, 0);
  const blocked = [...(gate ? [0] : arches).map(c => [c - AR - 0.75, c + AR + 0.75]), ...PILLAR_X.map(x => [x - COL / 2 - 0.15, x + COL / 2 + 0.15]),
                   [-HALF - 1, -HALF + COL + 0.15], [HALF - COL - 0.15, HALF + 1]];
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
  // étages : pilastres dans l'axe des piliers, bandeau intermédiaire, corniche sommitale et créneaux
  // teinte symétrique : le bloc i et son vis-à-vis (même distance au centre du mur) ont la même couleur
  const sym = (k, n) => Math.round(Math.abs(k - (n - 1) / 2));
  for (let i = 0; i < cn; i++) {
    const x = -HALF + cl * (i + 0.5);
    boxStone(W, cl - 0.035, 0.34, 0.32, x, TOP_CORNICE_Y, 0.16, 2);
    boxStone(W, cl - 0.035, 0.18, 0.4, x, TOP_CORNICE_Y + 0.26, 0.05, sym(i, cn) % 2 ? 0 : 2);
  }
  // chemin de ronde puis créneaux, sans tour d'angle : un merlon carré dans chaque coin (centré sur la diagonale),
  // puis 15 merlons identiques et 16 vides égaux entre les deux coins — même motif sur les 4 murs
  boxStone(W, ROOM + 0.79, 0.5, 0.55, 0, WALL_H - 0.25, -0.12, 3);
  const MERLONS = 15, MW = 0.9, CW = 0.55, edge = HALF - CW / 2 + 0.12;     // bord intérieur du merlon d'angle
  const gapC = (2 * edge - MERLONS * MW) / (MERLONS + 1);
  for (let i = 0; i < MERLONS; i++) boxStone(W, MW, 0.75, 0.55, -edge + gapC + MW / 2 + i * (MW + gapC), WALL_H + 0.37, -0.12, sym(i, MERLONS) % 2 ? 0 : 2);
  for (const sx of [-1, 1]) boxStone(W, CW, 0.75, CW, sx * (HALF + 0.12), WALL_H + 0.37, -0.12, 2);   // merlon d'angle (partagé avec le mur voisin)
  // chemin de ronde entre les deux murailles (sol en pierre au niveau du haut des murs)
  boxStone(W, 2 * (HALF + OUT_OFF), 0.5, OUT_OFF - 0.395 + MERL_C / 2, 0, WALL_H - 0.25, -(0.395 + OUT_OFF + MERL_C / 2) / 2, 3);
  // muraille extérieure : parallèle, mêmes merlons en vis-à-vis + 2 de plus de chaque côté, merlon d'angle sur la diagonale
  const zo = -OUT_OFF;
  for (let i = -2; i < MERLONS + 2; i++) boxStone(W, MW, 0.75, MERL_C, -edge + gapC + MW / 2 + i * (MW + gapC), WALL_H + 0.37, zo, sym(Math.max(0, Math.min(MERLONS - 1, i)), MERLONS) % 2 ? 0 : 2);
  for (const sx of [-1, 1]) boxStone(W, CW, 0.75, CW, sx * (HALF + OUT_OFF), WALL_H + 0.37, zo, 2);
  // zones du chemin de ronde : on s'y pose en volant (au-dessus des créneaux pour passer de la cour au chemin)
  if (typeof WALKABLE !== "undefined") {
    WALKABLE.push(worldRect(g, -HALF - OUT_OFF, HALF + OUT_OFF, zo + MERL_C / 2, -0.4, { minY: WALL_H - 0.05, maxFly: WALL_H + 3 }));
    WALKABLE.push(worldRect(g, -HALF, HALF, -1.3, 1.4, { minY: WALL_H + 0.85, maxFly: WALL_H + 3 }));   // passage au-dessus des créneaux intérieurs
    WALKWAYS.push(worldRect(g, -HALF - OUT_OFF, HALF + OUT_OFF, zo, -0.395));
    CAM_ZONES.push(worldRect(g, -HALF - OUT_OFF, HALF + OUT_OFF, zo - 0.2, 0.5, { maxY: 40 }));
  }
  return g;
}

// sol en dalles
const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM, ROOM), floorMat(ROOM, ROOM));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

// ---------- Salles derrière les 4 arches ----------
// Dans le repère du mur : le couloir va de z = -ARCH.depth à z = -ARCH.depth - RD
const roomWallMat = withHeightFade(plain(WALL_COLOR)); roomWallMat.shadowSide = THREE.DoubleSide;
const ceilingMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2c2017).convertSRGBToLinear(), roughness: 0.9, side: THREE.DoubleSide });
const WALKABLE = [];                     // zones où l'avatar peut marcher (cour, passages, salles), en coordonnées monde
const CAM_ZONES = [];
const WALKWAYS = [];                     // sols du chemin de ronde                    // volumes où la caméra peut se placer
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
const COR_OFF = 5;                       // couloir = contour de l'ouverture agrandi de 5 m tout autour (sol au même niveau)
const COR_W = 15, COR_H = 5.5;   // couloir élargi à 15 m, murs droits de 5,5 m pour loger les grandes ouvertures, sommet à 13 m
//   // 13 m de large, voûte qui naît à 3 m comme l'arche, sommet à 9,5 m
function corridorProfile() {
  const r = COR_W / 2, sh = new THREE.Shape();
  sh.moveTo(-r, 0); sh.lineTo(r, 0); sh.lineTo(r, COR_H); sh.absarc(0, COR_H, r, 0, Math.PI, false); sh.closePath();
  return sh;
}
function buildRoom(g) {                  // long couloir voûté ; rythme : 2 anneaux de colonnes puis une ouverture (de chaque côté) vers une salle
  const z0 = -ARCH.depth, zb = z0 - RD, R = COR_W / 2, STEP = RD / (CPATTERN.length - 1);
  const posZ = s => z0 - s * STEP + (s === 0 ? -COL / 2 : s === CPATTERN.length - 1 ? COL / 2 : 0);
  const openZ = CPATTERN.map((c, s) => c === "O" ? z0 - s * STEP : null).filter(v => v !== null);
  // voûte : demi-cylindre au-dessus des murs droits
  const vg = new THREE.CylinderGeometry(R, R, RD, 64, 1, true, Math.PI / 2, Math.PI); vg.rotateX(Math.PI / 2);
  const vault = new THREE.Mesh(vg, nicheMat); vault.position.set(0, COR_H, z0 - RD / 2); vault.receiveShadow = true; g.add(vault);
  // murs droits (3 m) percés des ouvertures
  const sideShape = (u0, u1, cs) => {
    const sh = new THREE.Shape(); sh.moveTo(u0, 0);
    for (const c of cs.slice().sort((a, b) => a - b)) { sh.lineTo(c - OP.r, 0); sh.lineTo(c - OP.r, OP.s); sh.absarc(c, OP.s, OP.r, Math.PI, 0, true); sh.lineTo(c + OP.r, 0); }
    sh.lineTo(u1, 0); sh.lineTo(u1, COR_H); sh.lineTo(u0, COR_H); sh.closePath(); return sh;
  };
  const lw = new THREE.Mesh(new THREE.ShapeGeometry(sideShape(-z0, -zb, openZ.map(z => -z)), 24), roomWallMat); lw.rotation.y = Math.PI / 2; lw.position.x = -R; lw.receiveShadow = true; g.add(lw);
  const rw = new THREE.Mesh(new THREE.ShapeGeometry(sideShape(zb, z0, openZ), 24), roomWallMat); rw.rotation.y = -Math.PI / 2; rw.position.x = R; rw.receiveShadow = true; g.add(rw);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(COR_W, RD), floorMat()); fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0.003, z0 - RD / 2); fl.receiveShadow = true; g.add(fl);
  const end = new THREE.Mesh(new THREE.ShapeGeometry(corridorProfile(), 40), roomWallMat); end.position.z = zb; end.receiveShadow = true; g.add(end);   // fond du couloir
  const startShape = new THREE.Shape();                                                                         // mur d'entrée, contour qui passe autour de l'arche
  startShape.moveTo(-R, 0); startShape.lineTo(-AR, 0); startShape.lineTo(-AR, ARCH.h); startShape.absarc(0, ARCH.h, AR, Math.PI, 0, true);
  startShape.lineTo(AR, 0); startShape.lineTo(R, 0); startShape.lineTo(R, COR_H); startShape.absarc(0, COR_H, R, 0, Math.PI, false); startShape.closePath();
  const start = new THREE.Mesh(new THREE.ShapeGeometry(startShape, 40), roomWallMat); start.position.z = z0; start.rotation.y = Math.PI; start.receiveShadow = true; g.add(start);
  g.updateMatrixWorld();
  archFrame(g.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, z0)).multiply(new THREE.Matrix4().makeRotationY(Math.PI)), 0, 1);
  // anneaux de pierre (montés comme l'arche d'entrée : blocs grand / petit, claveaux alternés, clé de voûte)
  const W = g.matrixWorld, D = COL, BIG = 1.0, SMALL = 0.7, NB = 13, ga = 0.014, gap = 0.035;
  CPATTERN.forEach((c, s) => {
    if (c !== "R") return;
    const cz = posZ(s);
    for (const sx of [-1, 1]) {
      const rows = 4, bh = COR_H / rows;
      for (let i = 0; i < rows; i++) { const w = i % 2 ? SMALL : BIG; boxStone(W, w, bh - gap, D, sx * (R - w / 2), i * bh + bh / 2, cz, i + (sx > 0 ? 1 : 0)); }
    }
    for (let i = 0; i < NB; i++) {
      const key = i === (NB - 1) / 2, len = key ? BIG + 0.3 : i % 2 ? SMALL : BIG;
      const a0 = i * Math.PI / NB + ga, a1 = (i + 1) * Math.PI / NB - ga, sh = new THREE.Shape();
      sh.absarc(0, 0, R, a0, a1, false); sh.absarc(0, 0, R - len, a1, a0, true); sh.closePath();
      stone(new THREE.ExtrudeGeometry(sh, { depth: D + (key ? 0.1 : 0), bevelEnabled: false, curveSegments: 4 }),
            W.clone().multiply(tmpM.makeTranslation(0, COR_H, cz - (D + (key ? 0.1 : 0)) / 2)), i);
    }
  });
  // ---------- mise en valeur du couloir ----------
  const ALONG = (x, y, z, w, h, d, shade) => boxStone(W, w, h, d, x, y, z, shade);   // repère du couloir : x travers, z long
  const zMid = z0 - RD / 2, gapAt = z => openZ.some(oz => Math.abs(z - oz) < OP.r + 0.75);
  // corniche moulurée à la naissance de la voûte (3 ressauts), sur les deux murs, toute la longueur
  for (const sx of [-1, 1]) {
    ALONG(sx * (R - 0.14), COR_H - 0.45, zMid, 0.28, 0.22, RD, 3);
    ALONG(sx * (R - 0.24), COR_H - 0.22, zMid, 0.48, 0.24, RD, 2);
    ALONG(sx * (R - 0.32), COR_H + 0.02, zMid, 0.64, 0.16, RD, 0);
  }
  // nervure de faîte au sommet de la voûte
  ALONG(0, COR_H + R - 0.2, zMid, 0.7, 0.4, RD, 2);
  ALONG(0, COR_H + R - 0.45, zMid, 0.4, 0.2, RD, 0);
  // plinthe en pierre au pied des murs, interrompue aux ouvertures
  for (const sx of [-1, 1]) {
    let st = null;
    for (let z = z0; z >= zb - 0.01; z -= 0.1) {
      const ok = z > zb + 0.05 && !gapAt(z);
      if (ok && st === null) st = z;
      if (!ok && st !== null) { const len = st - z, n = Math.max(1, Math.round(len / 1.2)), bl = len / n;
        for (let i = 0; i < n; i++) ALONG(sx * (R - 0.09), 0.3, st - bl * (i + 0.5), 0.18, 0.6, bl - 0.03, i % 2 ? 3 : 2); st = null; }
    }
  }
  // sol : allée centrale de dalles claires bordée de pierres, rangées de dalles qui marquent chaque travée
  const RUN = 5;
  const runner = new THREE.Mesh(new THREE.PlaneGeometry(RUN, RD), plain(0x8e8f96)); runner.rotation.x = -Math.PI / 2; runner.position.set(0, 0.006, zMid); runner.receiveShadow = true; g.add(runner);
  for (const sx of [-1, 1]) ALONG(sx * (RUN / 2 + 0.15), 0.02, zMid, 0.3, 0.04, RD, 3);
  for (let s2 = 0; s2 < CPATTERN.length; s2++) ALONG(0, 0.02, posZ(s2), RUN, 0.04, 0.3, 3);
  // grande verrière au fond : arc en plein cintre, remplage en pierre (meneaux + rosace), lumière de lune
  {
    const ww = 4.4, wr = ww / 2, wb = 1.6, ws = 9.2, zf = zb + 0.02;
    const shape = new THREE.Shape(); shape.moveTo(-wr, wb); shape.lineTo(wr, wb); shape.lineTo(wr, ws); shape.absarc(0, ws, wr, 0, Math.PI, false); shape.closePath();
    const glass = new THREE.Mesh(new THREE.ShapeGeometry(shape, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fb8ec).convertSRGBToLinear() }));
    glass.position.z = zf; g.add(glass);
    const M = (x, y, w, h) => ALONG(x, y, zf + 0.08, w, h, 0.16, 2);
    for (const x of [-wr / 3, wr / 3]) M(x, (wb + ws) / 2, 0.16, ws - wb);                  // meneaux
    for (const y of [4.2, 6.8]) M(0, y, ww, 0.12);                                           // traverses
    M(0, ws, ww, 0.16);
    const rose = new THREE.TorusGeometry(1.0, 0.09, 8, 40); stone(rose, W.clone().multiply(tmpM.makeTranslation(0, ws + 0.95, zf + 0.08)), 2);
    const inner = new THREE.TorusGeometry(0.35, 0.07, 8, 24); stone(inner, W.clone().multiply(tmpM.makeTranslation(0, ws + 0.95, zf + 0.08)), 2);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; stone(new THREE.BoxGeometry(0.08, 0.65, 0.14), W.clone().multiply(tmpM.makeTranslation(Math.cos(a) * 0.68, ws + 0.95 + Math.sin(a) * 0.68, zf + 0.08)).multiply(new THREE.Matrix4().makeRotationZ(a + Math.PI / 2)), 0); }
    // encadrement : montants en blocs alternés et claveaux, comme l'arche d'entrée mais à l'échelle de la verrière
    const rows = 12, bh = (ws - wb) / rows;
    for (let i = 0; i < rows; i++) { const w = i % 2 ? 0.4 : 0.6; for (const sx of [-1, 1]) ALONG(sx * (wr + w / 2), wb + i * bh + bh / 2, zf + 0.12, w, bh - 0.03, 0.24, i); }
    ALONG(0, wb - 0.12, zf + 0.2, ww + 1.4, 0.24, 0.4, 3);                                  // appui
    const n = 13;
    for (let i = 0; i < n; i++) {
      const key = i === (n - 1) / 2, a0 = i * Math.PI / n + 0.012, a1 = (i + 1) * Math.PI / n - 0.012, sh = new THREE.Shape();
      sh.absarc(0, 0, wr + 0.55 + (key ? 0.2 : 0), a0, a1, false); sh.absarc(0, 0, wr, a1, a0, true); sh.closePath();
      stone(new THREE.ExtrudeGeometry(sh, { depth: 0.24, bevelEnabled: false, curveSegments: 4 }), W.clone().multiply(tmpM.makeTranslation(0, ws, zf)), i);
    }
    const ml = new THREE.PointLight(0xa8c0ff, 1.6, 26, 2); ml.position.set(0, 6, zb + 2.5); g.add(ml);
  }
  // ouvertures et salles (de chaque côté)
  for (const cz of openZ) for (const sx of [-1, 1]) buildSideRoom(g, sx, cz);
  for (let z = z0 - STEP / 2; z > zb; z -= STEP) {                   // éclairage chaud le long du couloir (sans objet visible)
    const l = new THREE.PointLight(0xffb260, 1.2, 15, 2); l.position.set(0, COR_H + 1.5, z); g.add(l); chandeliers.push({ l, seed: Math.random() * 100 });
  }
  WALKABLE.push(worldRect(g, -AR, AR, z0 - 0.6, 2.0, { maxFly: ARCH.h + AR - 2.0 }));                       // passage sous l'arche
  WALKABLE.push(worldRect(g, -R + 1.1, R - 1.1, zb + 0.2, z0, { maxFly: COR_H + R - 2.0 }));               // on reste entre les colonnes
  CAM_ZONES.push(worldRect(g, -AR + 0.15, AR - 0.15, z0 - 0.3, 0.6, { maxY: ARCH.h + AR - 0.3 }));
  CAM_ZONES.push(worldRect(g, -R + 0.3, R - 0.3, zb + 0.3, z0 - 0.05, { maxY: COR_H + R - 1 }));
}
// encadrement de pierre d'une ouverture latérale (même principe que l'arche d'entrée, à son échelle)
function sideArchFrame(Wm) {
  const rows = 4, bh = OP.s / rows;
  for (let i = 0; i < rows; i++) { const w = i % 2 ? 0.3 : 0.45; for (const side of [-1, 1]) boxStone(Wm, w, bh - 0.03, 0.18, side * (OP.r + w / 2), i * bh + bh / 2, 0.09, i + (side > 0 ? 1 : 0)); }
  const n = 7;
  for (let i = 0; i < n; i++) {
    const key = i === (n - 1) / 2, a0 = Math.PI - i * Math.PI / n - 0.018, a1 = Math.PI - (i + 1) * Math.PI / n + 0.018, sh = new THREE.Shape();
    sh.absarc(0, 0, OP.r + 0.32 + (key ? 0.1 : 0), a0, a1, true); sh.absarc(0, 0, OP.r, a1, a0, false); sh.closePath();
    stone(new THREE.ExtrudeGeometry(sh, { depth: 0.18 + (key ? 0.04 : 0), bevelEnabled: false, curveSegments: 6 }), Wm.clone().multiply(tmpM.makeTranslation(0, OP.s, 0)), i);
  }
}
function opShape() { const s = new THREE.Shape(); s.moveTo(-OP.r, 0); s.lineTo(OP.r, 0); s.lineTo(OP.r, OP.s); s.absarc(0, OP.s, OP.r, 0, Math.PI, false); s.closePath(); return s; }
function buildSideRoom(g, sx, cz) {
  const R = COR_W / 2, T = OP.t, tg = new THREE.Group();
  tg.position.set(sx * R, 0, cz); tg.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2; g.add(tg); tg.updateMatrixWorld();   // z local > 0 : vers le couloir
  const add = (geo, mat, x, y, z, ry = 0, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); m.receiveShadow = true; tg.add(m); return m; };
  const tun = add(new THREE.ExtrudeGeometry(opShape(), { depth: T, bevelEnabled: false, curveSegments: 24 }), [hiddenMat, nicheMat], 0, 0, -T);
  add(new THREE.PlaneGeometry(OP.r * 2, T), floorMat(), 0, 0.004, -T / 2, 0, -Math.PI / 2);
  const W = tg.matrixWorld;
  archFrame(W, 0, 0);                                                                                          // côté couloir (même encadrement que l'arche d'entrée)
  archFrame(W.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -T)).multiply(new THREE.Matrix4().makeRotationY(Math.PI)), 0, 1);   // côté salle
  // salle
  const zf = -T, zc = zf - SR.d / 2, zb = zf - SR.d;
  add(new THREE.PlaneGeometry(SR.w, SR.d), floorMat(), 0, 0.003, zc, 0, -Math.PI / 2);
  add(new THREE.PlaneGeometry(SR.w, SR.d), ceilingMat, 0, SR.h, zc, 0, Math.PI / 2);
  add(new THREE.PlaneGeometry(SR.w, SR.h), roomWallMat, 0, SR.h / 2, zb);                                     // fond
  for (const s2 of [-1, 1]) add(new THREE.PlaneGeometry(SR.d, SR.h), roomWallMat, s2 * SR.w / 2, SR.h / 2, zc, -s2 * Math.PI / 2);
  const fw = new THREE.Shape(), hw = SR.w / 2;                                                                 // mur côté couloir, percé de l'ouverture
  fw.moveTo(-hw, 0); fw.lineTo(-OP.r, 0); fw.lineTo(-OP.r, OP.s); fw.absarc(0, OP.s, OP.r, Math.PI, 0, true); fw.lineTo(OP.r, 0); fw.lineTo(hw, 0); fw.lineTo(hw, SR.h); fw.lineTo(-hw, SR.h); fw.closePath();
  add(new THREE.ShapeGeometry(fw, 24), roomWallMat, 0, 0, zf, Math.PI);
  const l = new THREE.PointLight(0xffb260, 1.1, 12, 2); l.position.set(0, SR.h - 1, zc); tg.add(l); chandeliers.push({ l, seed: Math.random() * 100 });
  WALKABLE.push(worldRect(tg, -OP.r + 0.05, OP.r - 0.05, -T - 0.6, 2.6, { maxFly: OP.s + OP.r - 1.9 }));    // passage (chevauche le couloir)
  WALKABLE.push(worldRect(tg, -hw + 0.2, hw - 0.2, zb + 0.2, zf, { maxFly: SR.h - 2 }));                    // salle
  CAM_ZONES.push(worldRect(tg, -OP.r + 0.15, OP.r - 0.15, -T - 0.3, 0.4, { maxY: OP.s + OP.r - 0.2 }));
  CAM_ZONES.push(worldRect(tg, -hw + 0.3, hw - 0.3, zb + 0.3, zf - 0.05, { maxY: SR.h - 0.4 }));
}
const IRON = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x26221f).convertSRGBToLinear(), roughness: 0.6, metalness: 0.4 });
const FLAME = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc56e).convertSRGBToLinear() });

WALKABLE.push({ minX: -HALF + 0.5, maxX: HALF - 0.5, minZ: -HALF + 0.5, maxZ: HALF - 0.5, court: true, maxFly: WALL_H + 3 });   // la cour (on peut voler jusqu'au chemin de ronde)
CAM_ZONES.push({ minX: -HALF + 0.45, maxX: HALF - 0.45, minZ: -HALF + 0.45, maxZ: HALF - 0.45, maxY: 40 });
// une seule ouverture (au nord, face au départ) avec sa salle ; les 3 autres murs sont pleins
buildRoom(buildWall(0, -HALF, 0, false));
buildWall(-HALF, 0, Math.PI / 2, false, []);
buildWall(HALF, 0, -Math.PI / 2, false, []);
// obstacles en boîtes alignées (vide pour l'instant : pièce vide)
const OBSTACLES = [];
for (const c of [-HALF + COL / 2, ...PILLAR_X, HALF - COL / 2]) for (const e of [-1, 1]) {   // colonnes (murs et angles) : on ne les traverse pas
  const along = [c - COL / 2, c + COL / 2], across = e > 0 ? [HALF - COL, HALF] : [-HALF, -HALF + COL];
  OBSTACLES.push({ minX: along[0], maxX: along[1], minZ: across[0], maxZ: across[1], top: 99, standable: false });
  OBSTACLES.push({ minX: across[0], maxX: across[1], minZ: along[0], maxZ: along[1], top: 99, standable: false });
}

// ---------- Entrée du château : porte ouverte, passage voûté, herse relevée, pont-levis, douves, extérieur ----------
const lanterns = [];                                                 // lumières chaudes qui vacillent
const SHELL = MERL_C;                                                 // épaisseur de la muraille extérieure (= profondeur des merlons)
const FP = { x0: -HALF - OUT_OFF - SHELL / 2, x1: HALF + OUT_OFF + SHELL / 2, z0: -HALF - ARCH.depth - RD - 0.4, z1: HALF + OUT_OFF + SHELL / 2 };   // emprise du château
const MO = FP;                                                       // zone exclue de l'extérieur : l'emprise du château
const OUT = 90;                                                       // terrain extérieur
{
  const southG = buildWall(0, HALF, Math.PI, false, [0]);           // mur sud : ouverture d'arche + passage voûté
  const W = southG.matrixWorld;                                       // repère du mur : z < 0 = vers l'extérieur
  { const ext = OUT_OFF - SHELL / 2 - ARCH.depth;                    // prolongement du passage jusqu'à la muraille extérieure
    const t = new THREE.Mesh(new THREE.ExtrudeGeometry(archOpening(AR), { depth: ext, bevelEnabled: false, curveSegments: 32 }), [hiddenMat, nicheMat]);
    t.position.z = -ARCH.depth - ext; t.receiveShadow = t.castShadow = true; southG.add(t);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(ARCH.w, ext + SHELL), floorMat()); f.rotation.x = -Math.PI / 2; f.position.set(0, 0.003, -ARCH.depth - (ext + SHELL) / 2); southG.add(f); }
  const shellMat = withHeightFade(plain(WALL_COLOR));
  // parement extérieur : 4 murs épais, celui du sud percé de l'arche d'entrée
  const outerWall = (x0, x1, z0, z1, hole) => {
    if (!hole) { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, WALL_H, z1 - z0), shellMat); m.position.set((x0 + x1) / 2, WALL_H / 2, (z0 + z1) / 2); m.castShadow = m.receiveShadow = true; scene.add(m); return; }
    const sh = new THREE.Shape(); sh.moveTo(x0, 0); sh.lineTo(x1, 0); sh.lineTo(x1, WALL_H); sh.lineTo(x0, WALL_H); sh.closePath();
    const h = new THREE.Shape(); h.moveTo(-AR, 0); h.lineTo(-AR, ARCH.h); h.absarc(0, ARCH.h, AR, Math.PI, 0, true); h.lineTo(AR, 0); h.closePath(); sh.holes.push(h);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false, curveSegments: 32 }), shellMat);
    m.position.z = z0; m.castShadow = m.receiveShadow = true; scene.add(m);
  };
  outerWall(FP.x0, FP.x1, FP.z1 - SHELL, FP.z1, true);
  outerWall(FP.x0, FP.x1, FP.z0, FP.z0 + 0.4);
  outerWall(FP.x0, FP.x0 + SHELL, FP.z0, FP.z1);
  outerWall(FP.x1 - SHELL, FP.x1, FP.z0, FP.z1);
  // créneaux extérieurs, même rythme que dans la cour
  const merl = (x, z, rot) => boxStone(new THREE.Matrix4(), rot ? 0.55 : 0.9, 0.75, rot ? 0.9 : 0.55, x, WALL_H + 0.37, z, 2);
  for (let x = FP.x0 + 0.9; x < FP.x1 - 0.5; x += 1.6) merl(x, FP.z0 + 0.28, false);

  // terrain extérieur (sol plein autour du château)
  const gm = new THREE.Mesh(new THREE.PlaneGeometry(OUT * 2, OUT * 2), plain(0x3d4636)); gm.rotation.x = -Math.PI / 2; gm.position.y = -0.01; gm.receiveShadow = true; scene.add(gm);
  // zones praticables : passage vers l'extérieur
  WALKABLE.push({ minX: -AR, maxX: AR, minZ: HALF - 2.0, maxZ: FP.z1 + 1.2, maxFly: ARCH.h + AR - 2.0 });
  CAM_ZONES.push({ minX: -AR + 0.15, maxX: AR - 0.15, minZ: HALF - 0.6, maxZ: FP.z1 + 0.3, maxY: ARCH.h + AR - 0.3 });
}
// extérieur : tout le terrain hors douves et hors château
const outsideOk = (x, z, m = 0) => Math.abs(x) <= OUT - 1 && Math.abs(z) <= OUT - 1 && !(x > MO.x0 - m && x < MO.x1 + m && z > MO.z0 - m && z < MO.z1 + m);

mergeStones();   // toutes les pierres (piliers, encadrements, corniches, poutres) en un seul maillage

// ---------- Nuit : ciel étoilé, clair de lune, éclairage chaud ----------
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

function lantern(wallX, wallZ, ry, x, withLight) {   // éclairage chaud le long des murs (sans objet visible)
  if (!withLight) return;
  const g = new THREE.Group(); g.position.set(wallX, 0, wallZ); g.rotation.y = ry; scene.add(g);
  const l = new THREE.PointLight(0xffa654, 0.9, 10, 2); l.position.set(x, 2.75, COL + 0.5); g.add(l);
  lanterns.push({ l, seed: Math.random() * 100 });
}
for (const [wx, wz, ry] of [[0, -HALF, 0], [0, HALF, Math.PI], [-HALF, 0, Math.PI / 2], [HALF, 0, -Math.PI / 2]])
  for (const x of PILLAR_X) lantern(wx, wz, ry, x, true);   // éclairage chaud sur chaque colonne
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
  else if (p.moving) { HERO.phase += dt * SPEED * speedMul * 2.0; col = Math.floor(HERO.phase) % 4; }
  showCharacter(HERO, p.x, p.y, p.z, heroYaw, col, ground);
}

// ---------- État ----------
const p = { x: 0, y: 0, vy: 0, z: 5, facing: Math.PI, t: 0, moving: false };   // facing : angle de la direction regardée
const cam = { yaw: 0, pitch: 0.35, dist: 5.5 };

// ---------- Entrées ----------
{ // jauge de vitesse
  const sl = document.getElementById("speed"), out = document.getElementById("speedVal");
  const upd = () => { speedMul = +sl.value; out.textContent = "×" + speedMul.toFixed(1); };
  sl.addEventListener("input", upd); sl.addEventListener("change", () => sl.blur()); upd();
}
const keys = new Set();
addEventListener("keydown", e => {
  keys.add(e.code);
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
});
// boutons tactiles maintenus : Monter / Descendre
let touchUp = false, touchDown = false;
for (const [id, set] of [["jump", v => touchUp = v], ["down", v => touchDown = v]]) {
  const b = document.getElementById(id);
  b.addEventListener("pointerdown", e => { e.preventDefault(); set(true); });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(ev, () => set(false));
}
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
  if (y <= 13 && outsideOk(x, z, PLAYER_R)) return true;   // dehors
  return WALKABLE.some(r => {
    const m = r.court ? PLAYER_R + COURT_CLEAR : PLAYER_R;
    return x >= r.minX + m && x <= r.maxX - m && z >= r.minZ + m && z <= r.maxZ - m && y <= (r.maxFly || 0) + 1e-3 && y >= (r.minY ?? -1);
  });
}
function ceilingAt(x, z) { let c = outsideOk(x, z) ? 13 : 0; for (const r of WALKABLE) if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) c = Math.max(c, r.maxFly || 0); return c; }
function groundAt(x, z, y) {               // pavés, ou dessus d'un banc / du socle sous cette position
  let g = 0;
  for (const r of WALKWAYS) if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ && y >= WALL_H - 0.15) g = Math.max(g, WALL_H);
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
  if (y > 0.25 && y < 40 && outsideOk(x, z, 0.2)) return true;
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
    const sp = (p.y > groundAt(p.x, p.z, p.y) + 0.05 ? FLY_SPEED : SPEED) * speedMul;   // plus rapide en vol, réglable avec la jauge
    const nx = p.x + mx * sp * dt, nz = p.z + mz * sp * dt;
    if (canMove(nx, nz, p.y)) { p.x = nx; p.z = nz; }
    else if (canMove(nx, p.z, p.y)) p.x = nx;
    else if (canMove(p.x, nz, p.y)) p.z = nz;
    // on fait le tour de la fontaine sans la traverser
    const fd = Math.hypot(p.x, p.z);
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
  // vol libre : Espace (ou Monter) pour s'élever, Maj / C (ou Descendre) pour descendre ; sinon on reste en l'air, sans gravité
  const up = keys.has("Space") || touchUp, down = keys.has("ShiftLeft") || keys.has("ShiftRight") || keys.has("KeyC") || touchDown;
  p.vy += (((up ? 1 : 0) - (down ? 1 : 0)) * CLIMB - p.vy) * Math.min(1, dt * 6);
  { const ny = Math.max(ground, Math.min(ceilingAt(p.x, p.z), p.y + p.vy * dt)); if (canMove(p.x, p.z, ny) || ny > p.y) p.y = ny; else p.vy = 0; }   // pas de descente dans un mur
  if (p.y <= ground && p.vy < 0) p.vy = 0;
  const airborne = p.y > ground + 1e-3;

  // caméra en orbite autour de l'avatar, gardée à l'intérieur de la pièce
  const tx = p.x, ty = 1.1 + p.y, tz = p.z;            // la caméra suit l'altitude
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

  updateLights(now);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
