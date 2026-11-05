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

const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM, ROOM), surface(tiled(FLOOR_URI, ROOM, ROOM)));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

// Murs du fond et de devant : plans simples (UV 0..1 -> texture répétée selon la taille)
const wallMat = withHeightFade(surface(tiled(BRICK_URI, ROOM, WALL_H)));
for (const [z, ry] of [[-HALF, 0], [HALF, Math.PI]]) {
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM, WALL_H), wallMat);
  wall.position.set(0, WALL_H / 2, z); wall.rotation.y = ry; wall.receiveShadow = true; scene.add(wall);
}

// ---------- Arches sur les murs de côté ----------
// Repère local : x le long du mur, y vers le haut, z vers l'intérieur de la pièce (0 = surface du mur)
const ARCH = { w: 3.0, h: 3.0, depth: 1.4, ring: 0.42, out: 0.2 };   // ouverture 3 m, montants de 3 m, alcôve de 1,4 m
const AR = ARCH.w / 2;
const metersBrick = () => tiled(BRICK_URI, 1, 1);                    // UV en mètres -> 1 répétition tous les 2 m
const sideWallMat = withHeightFade(surface(metersBrick()));
const nicheMat = withHeightFade(new THREE.MeshStandardMaterial({ map: metersBrick(), color: 0x8f86a8, roughness: 0.95, side: THREE.BackSide }));
const stoneMats = [0xcfc6df, 0xc5bad8, 0xd6cee5].map(c => withHeightFade(new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })));
const stepMat = withHeightFade(new THREE.MeshStandardMaterial({ color: 0xc2b8d6, roughness: 0.9 }));

function sideWallGeometry() {          // mur entier avec l'ouverture de l'arche découpée
  const s = new THREE.Shape();
  s.moveTo(-HALF, 0); s.lineTo(-AR, 0); s.lineTo(-AR, ARCH.h);
  s.absarc(0, ARCH.h, AR, Math.PI, 0, true);
  s.lineTo(AR, 0); s.lineTo(HALF, 0); s.lineTo(HALF, WALL_H); s.lineTo(-HALF, WALL_H); s.closePath();
  return new THREE.ShapeGeometry(s, 32);
}
function archOpening(r) {              // contour de l'ouverture (rectangle + demi-cercle)
  const s = new THREE.Shape();
  s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, ARCH.h); s.absarc(0, ARCH.h, r, 0, Math.PI, false); s.closePath();
  return s;
}
function block(geo, x, y, z, i) {
  const m = new THREE.Mesh(geo, stoneMats[i % stoneMats.length]);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}

function buildArchWall() {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(sideWallGeometry(), sideWallMat); wall.receiveShadow = true; g.add(wall);

  // alcôve : volume extrudé derrière le mur, vu de l'intérieur (faces arrière)
  const niche = new THREE.Mesh(new THREE.ExtrudeGeometry(archOpening(AR), { depth: ARCH.depth, bevelEnabled: false, curveSegments: 32 }), nicheMat);
  niche.position.z = -ARCH.depth; niche.receiveShadow = true; g.add(niche);
  const step = new THREE.Mesh(new THREE.BoxGeometry(ARCH.w, 0.22, ARCH.depth), stepMat);   // marche en pierre au fond
  step.position.set(0, 0.11, -ARCH.depth / 2); step.receiveShadow = true; g.add(step);

  // montants : blocs alternés large / étroit, séparés par un joint fin
  const rows = 6, bh = ARCH.h / rows, gap = 0.035;
  for (let i = 0; i < rows; i++) {
    const wdt = i % 2 ? 0.42 : 0.62;
    const geo = new THREE.BoxGeometry(wdt, bh - gap, ARCH.out);
    for (const side of [-1, 1])
      g.add(block(geo, side * (AR + wdt / 2), i * bh + bh / 2, ARCH.out / 2, i + (side > 0 ? 1 : 0)));
  }
  // claveaux : pierres en éventail sur l'arc, clé de voûte plus grande au sommet
  const n = 9, ga = 0.018;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI - i * Math.PI / n - ga, a1 = Math.PI - (i + 1) * Math.PI / n + ga;
    const key = i === (n - 1) / 2;
    const r2 = AR + ARCH.ring + (key ? 0.16 : 0);
    const s = new THREE.Shape();
    s.absarc(0, 0, r2, a0, a1, true); s.absarc(0, 0, AR, a1, a0, false); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: ARCH.out + (key ? 0.06 : 0), bevelEnabled: false, curveSegments: 6 });
    g.add(block(geo, 0, ARCH.h, 0, i));
  }
  // socles un peu plus larges au pied des montants
  const base = new THREE.BoxGeometry(0.78, 0.26, ARCH.out + 0.08);
  for (const side of [-1, 1]) g.add(block(base, side * (AR + 0.36), 0.13, (ARCH.out + 0.08) / 2, 2));
  return g;
}
for (const [x, ry] of [[-HALF, Math.PI / 2], [HALF, -Math.PI / 2]]) {
  const g = buildArchWall(); g.position.x = x; g.rotation.y = ry; scene.add(g);
}

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
    const lim = HALF - 0.35 - (Math.abs(p.z) < AR + 1.0 ? ARCH.out + 0.1 : 0);   // recul devant les arches
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
  const m = HALF - 0.25;
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
