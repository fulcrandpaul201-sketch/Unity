// Pièce vide en 3D, vue à la 3e personne : l'avatar se déplace par rapport à la caméra,
// qu'on fait tourner autour de lui (souris / doigt / flèches).
const AVATAR_URI = "data:image/png;base64,{{AVATAR}}";
const BRICK_URI = "data:image/png;base64,{{BRICK}}";
const FLOOR_URI = "data:image/png;base64,{{FLOOR}}";

// ---------- Réglages ----------
const ROOM = 20, HALF = ROOM / 2, WALL_H = 10;               // pièce carrée de 20 m, murs très hauts qui se perdent dans le noir
const LIGHT_H = 3.2;                                         // hauteur de la lampe (à hauteur d'homme)
const TILE = 2;                                              // une texture couvre 2 m x 2 m (répétée, jamais étirée)
const SPEED = 4.2;                                           // m/s
const AV_H = 1.7;                                            // taille de l'avatar (m)
const FW = 172, FH = 303, SW = 688, SH = 1212;               // planche : images de 172x303 (voir avatar_sheet.json)
const ROW = { down: 0, left: 1, right: 2, up: 3 };
const COLORS = { bg: 0x07040b };                             // obscurité au-dessus des murs

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

// Obscurité en hauteur : chaque matériau des murs se fond dans le noir au-dessus de 2,2 m (pas de plafond visible)
const FADE_START = 2.2, FADE_END = 7.7;
function withHeightFade(mat) {
  mat.customProgramCacheKey = () => "heightFade";   // sinon Three.js réutilise le shader du sol, sans le fondu
  mat.onBeforeCompile = sh => {
    sh.uniforms.fadeColor = { value: new THREE.Color(COLORS.bg) };
    sh.vertexShader = "varying float vWorldY;\n" + sh.vertexShader.replace("#include <begin_vertex>",
      "#include <begin_vertex>\nvWorldY = (modelMatrix * vec4(transformed, 1.0)).y;");
    sh.fragmentShader = "varying float vWorldY;\nuniform vec3 fadeColor;\n" + sh.fragmentShader.replace("#include <dithering_fragment>",
      "#include <dithering_fragment>\nfloat fadeT = smoothstep(" + FADE_START.toFixed(2) + ", " + FADE_END.toFixed(2) + ", vWorldY);\n" +
      "gl_FragColor.rgb = mix(gl_FragColor.rgb, fadeColor, pow(fadeT, 0.8));");
  };
  return mat;
}

// ---------- Architecture : la même structure en pierre sur les 4 murs ----------
// Repère local d'un mur : x le long du mur, y vers le haut, z vers l'intérieur de la pièce (0 = surface du mur)
const ARCH = { w: 3.0, h: 3.0, depth: 1.4, ring: 0.42, out: 0.2 };   // ouverture 3 m, montants de 3 m, alcôve de 1,4 m
const AR = ARCH.w / 2;
const ARCH_X = [-6.5, 0, 6.5];                                       // 3 arches par mur
const PILLAR_X = [-HALF + 0.35, -3.25, 3.25, HALF - 0.35];           // piliers entre les arches et dans les angles
const PILLAR = { w: 0.7, out: 0.3, h: 5.0 };
const PLINTH = { h: 0.32, out: 0.1 }, CORNICE = { y: 5.35, h: 0.26, out: 0.2 };
const WALL_CLEAR = 0.8;                                              // distance minimale avatar / mur

const metersBrick = () => tiled(BRICK_URI, 1, 1);                    // UV en mètres -> 1 répétition tous les 2 m
const wallMat = withHeightFade(surface(metersBrick()));
const nicheMat = withHeightFade(new THREE.MeshStandardMaterial({ map: metersBrick(), color: 0x8f86a8, roughness: 0.95, side: THREE.BackSide }));
const stoneMat = withHeightFade(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
const STONES = [0xcfc6df, 0xc5bad8, 0xd6cee5, 0xc2b8d6].map(c => new THREE.Color(c).convertSRGBToLinear());

function wallGeometry() {                // mur entier avec les ouvertures des arches découpées
  const sh = new THREE.Shape();
  sh.moveTo(-HALF, 0);
  for (const c of ARCH_X) {
    sh.lineTo(c - AR, 0); sh.lineTo(c - AR, ARCH.h);
    sh.absarc(c, ARCH.h, AR, Math.PI, 0, true);
    sh.lineTo(c + AR, 0);
  }
  sh.lineTo(HALF, 0); sh.lineTo(HALF, WALL_H); sh.lineTo(-HALF, WALL_H); sh.closePath();
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
function stone(geo, matrix, shade) { stoneParts.push([geo, matrix.clone(), STONES[shade % STONES.length]]); }
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

// claveaux : formes partagées par toutes les arches
const VOUSSOIRS = [];
{
  const n = 9, ga = 0.018;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI - i * Math.PI / n - ga, a1 = Math.PI - (i + 1) * Math.PI / n + ga;
    const key = i === (n - 1) / 2;
    const sh = new THREE.Shape();
    sh.absarc(0, 0, AR + ARCH.ring + (key ? 0.16 : 0), a0, a1, true); sh.absarc(0, 0, AR, a1, a0, false); sh.closePath();
    VOUSSOIRS.push(new THREE.ExtrudeGeometry(sh, { depth: ARCH.out + (key ? 0.06 : 0), bevelEnabled: false, curveSegments: 6 }));
  }
}

function buildWall(px, pz, ry) {
  const g = new THREE.Group(); g.position.set(px, 0, pz); g.rotation.y = ry; scene.add(g);
  g.updateMatrixWorld();
  const W = g.matrixWorld;
  const wall = new THREE.Mesh(wallGeometry(), wallMat); wall.receiveShadow = true; g.add(wall);

  ARCH_X.forEach((cx, ai) => {
    // alcôve : volume extrudé derrière le mur, vu de l'intérieur (faces arrière) + marche en pierre
    const niche = new THREE.Mesh(new THREE.ExtrudeGeometry(archOpening(AR), { depth: ARCH.depth, bevelEnabled: false, curveSegments: 32 }), nicheMat);
    niche.position.set(cx, 0, -ARCH.depth); niche.receiveShadow = true; g.add(niche);
    boxStone(W, ARCH.w, 0.22, ARCH.depth, cx, 0.11, -ARCH.depth / 2, 3);
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
  const cn = 16, cl = ROOM / cn;
  for (let i = 0; i < cn; i++) boxStone(W, cl - 0.035, CORNICE.h, CORNICE.out, -HALF + cl * (i + 0.5), CORNICE.y, CORNICE.out / 2, i);
}

// sol en pavés
const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM, ROOM), surface(tiled(FLOOR_URI, ROOM, ROOM)));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

buildWall(0, -HALF, 0);
buildWall(0, HALF, Math.PI);
buildWall(-HALF, 0, Math.PI / 2);
buildWall(HALF, 0, -Math.PI / 2);
mergeStones();

scene.add(new THREE.HemisphereLight(0xeee6ff, 0x4a3c66, 0.42));
const lamp = new THREE.PointLight(0xfff1dc, 1.0, 34, 1.5);
lamp.position.set(0, LIGHT_H, 0); lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024);
scene.add(lamp);

// ---------- Avatar (sprite toujours face à la caméra) ----------
const tex = new THREE.Texture();
tex.encoding = THREE.sRGBEncoding;
tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
tex.repeat.set((FW - 2) / SW, (FH - 2) / SH);
const avatar = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.3 }));
avatar.center.set(0.5, 0);
avatar.scale.set(AV_H * FW / FH, AV_H, 1);
scene.add(avatar);
const blob = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24), new THREE.MeshBasicMaterial({ color: 0x281838, transparent: true, opacity: 0.35, depthWrite: false }));
blob.rotation.x = -Math.PI / 2; blob.scale.set(1, 0.7, 1); scene.add(blob);

function setFrame(row, col) {
  tex.offset.set((col * FW + 1) / SW, 1 - ((row + 1) * FH - 1) / SH);
}

// ---------- État ----------
const p = { x: 0, z: 3, facing: Math.PI, t: 0, moving: false };   // facing : angle de la direction regardée
const cam = { yaw: 0, pitch: 0.35, dist: 5.5 };

// ---------- Entrées ----------
const keys = new Set();
addEventListener("keydown", e => { keys.add(e.code); if (e.code.startsWith("Arrow")) e.preventDefault(); });
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
    cam.pitch = Math.max(0.05, Math.min(1.25, cam.pitch + (e.clientY - look.y) * 0.004));
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
    const lim = HALF - WALL_CLEAR;                       // l'avatar reste devant les piliers et les arches
    p.x = Math.max(-lim, Math.min(lim, p.x + mx * SPEED * dt));
    p.z = Math.max(-lim, Math.min(lim, p.z + mz * SPEED * dt));
    p.facing = Math.atan2(mx, mz);
    p.t += dt;
  } else p.t = 0;

  // caméra en orbite autour de l'avatar, gardée à l'intérieur de la pièce
  const tx = p.x, ty = 1.1, tz = p.z;
  let cx = tx + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
  let cy = ty + Math.sin(cam.pitch) * cam.dist;
  let cz = tz + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
  const m = HALF - 0.45;                               // la caméra ne rentre pas dans les piliers
  cx = Math.max(-m, Math.min(m, cx)); cz = Math.max(-m, Math.min(m, cz)); cy = Math.max(0.3, Math.min(WALL_H - 0.25, cy));
  camera.position.set(cx, cy, cz); camera.lookAt(tx, ty, tz);

  // image de l'avatar selon l'angle entre sa direction et la caméra
  const vx = p.x - cx, vz = p.z - cz, vl = Math.hypot(vx, vz) || 1;
  const dfx = Math.sin(p.facing), dfz = Math.cos(p.facing);
  const dot = (dfx * vx + dfz * vz) / vl, side = (dfx * -vz + dfz * vx) / vl;
  const row = dot < -0.7 ? ROW.down : dot > 0.7 ? ROW.up : side > 0 ? ROW.right : ROW.left;
  setFrame(row, p.moving ? Math.floor(p.t * 8) % 4 : 0);
  avatar.position.set(p.x, 0, p.z);
  blob.position.set(p.x, 0.01, p.z);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

const img = new Image();
img.onload = () => { tex.image = img; tex.needsUpdate = true; requestAnimationFrame(frame); };
img.src = AVATAR_URI;
