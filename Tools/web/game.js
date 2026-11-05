// Salle carrée vue de dessus : déplacement libre haut / bas / gauche / droite.
const sheet = new Image(); sheet.src = "data:image/png;base64,{{AVATAR}}";

// Dimensions (pixels du canevas 960x720)
const W = 960, H = 720;
const FLOOR = 560;                      // côté du sol carré
const SIDE = 40, TOP = 120, BOTTOM = 40; // épaisseur des murs (le mur du haut montre sa face)
const FACE = 64;                        // hauteur de la face visible du mur du haut
const RX = (W - FLOOR) / 2, RY = TOP;   // coin haut-gauche du sol
const COLORS = { bg: "#2a2038", wallTop: "#5b4c78", wallFace: "#8778a6", floor: "#b9b0cf", shade: "rgba(40,28,60,0.16)" };

// Avatar
const FW = 172, FH = 303;               // taille d'une image de la planche (voir avatar_sheet.json)
const AV_H = 120;                       // hauteur affichée
const AV_W = AV_H * FW / FH;
const FOOT_W = 22, FOOT_H = 24;         // demi-largeur / hauteur de la zone de collision aux pieds
const SPEED = 230;                      // pixels / seconde
const DIR = { down: 0, left: 1, right: 2, up: 3 };

const cv = document.getElementById("c"), ctx = cv.getContext("2d");
ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
const p = { x: FLOOR / 2, y: FLOOR / 2 + 60, dir: DIR.down, t: 0, moving: false };

// Clavier : flèches, ZQSD (AZERTY) ou WASD (codes physiques des touches)
const keys = new Set();
addEventListener("keydown", e => { keys.add(e.code); if (e.code.startsWith("Arrow")) e.preventDefault(); });
addEventListener("keyup", e => keys.delete(e.code));
addEventListener("blur", () => keys.clear());

// Joystick virtuel : appuyer n'importe où et glisser
let stick = null;
const toCanvas = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
addEventListener("pointerdown", e => { const [x, y] = toCanvas(e); stick = { id: e.pointerId, ox: x, oy: y, x, y }; });
addEventListener("pointermove", e => { if (stick && e.pointerId === stick.id) [stick.x, stick.y] = toCanvas(e); });
const endStick = e => { if (stick && e.pointerId === stick.id) stick = null; };
addEventListener("pointerup", endStick); addEventListener("pointercancel", endStick);

function input() {
  let x = 0, y = 0;
  const k = c => keys.has(c);
  if (k("ArrowLeft") || k("KeyA")) x -= 1;
  if (k("ArrowRight") || k("KeyD")) x += 1;
  if (k("ArrowUp") || k("KeyW")) y -= 1;
  if (k("ArrowDown") || k("KeyS")) y += 1;
  if (stick) {
    const dx = stick.x - stick.ox, dy = stick.y - stick.oy, d = Math.hypot(dx, dy);
    if (d > 12) { const m = Math.min(1, d / 60); x = dx / d * m; y = dy / d * m; }
  }
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  return [x, y];
}

function drawRoom() {
  ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = COLORS.wallTop;                                   // dessus des murs
  ctx.fillRect(RX - SIDE, 0, FLOOR + SIDE * 2, TOP + FLOOR + BOTTOM);
  ctx.fillStyle = COLORS.wallFace;                                  // face du mur du haut
  ctx.fillRect(RX, TOP - FACE, FLOOR, FACE);
  ctx.fillStyle = COLORS.floor;                                     // sol
  ctx.fillRect(RX, RY, FLOOR, FLOOR);
  ctx.fillStyle = COLORS.shade;                                     // ombre au pied du mur du haut
  ctx.fillRect(RX, RY, FLOOR, 14);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const [ix, iy] = input();
  p.moving = ix !== 0 || iy !== 0;
  if (p.moving) {
    p.x = Math.max(FOOT_W, Math.min(FLOOR - FOOT_W, p.x + ix * SPEED * dt));
    p.y = Math.max(FOOT_H, Math.min(FLOOR, p.y + iy * SPEED * dt));
    if (Math.abs(ix) > Math.abs(iy)) p.dir = ix < 0 ? DIR.left : DIR.right;
    else if (Math.abs(iy) > Math.abs(ix)) p.dir = iy < 0 ? DIR.up : DIR.down;
    p.t += dt;
  } else p.t = 0;

  drawRoom();
  const fx = RX + p.x, fy = RY + p.y;     // position des pieds à l'écran
  ctx.fillStyle = "rgba(40,24,56,0.25)";
  ctx.beginPath(); ctx.ellipse(fx, fy - 2, AV_W * 0.3, AV_W * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  const col = p.moving ? Math.floor(p.t * 8) % 4 : 0;
  ctx.drawImage(sheet, col * FW + 1, p.dir * FH + 1, FW - 2, FH - 2, fx - AV_W / 2, fy - AV_H, AV_W, AV_H);

  if (stick) {
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(stick.ox, stick.oy, 60, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    const dx = stick.x - stick.ox, dy = stick.y - stick.oy, d = Math.max(1, Math.hypot(dx, dy)), m = Math.min(d, 60);
    ctx.beginPath(); ctx.arc(stick.ox + dx / d * m, stick.oy + dy / d * m, 22, 0, Math.PI * 2); ctx.fill();
  }
  requestAnimationFrame(frame);
}
sheet.decode().then(() => requestAnimationFrame(frame));
