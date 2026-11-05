"""Génère des salles de château vides en pixel art (perspective cohérente, symétrique).
Usage : python3 Tools/generate_rooms.py  -> Assets/Art/Rooms/*.png
"""
import math, os
import numpy as np
from PIL import Image

W, H = 320, 240            # résolution native (pixel art)
SCALE = 3                  # version agrandie pour aperçu
VPX, VPY = 160, 80         # point de fuite
BL, BR, BT, BB = 80, 240, 20, 136   # mur du fond (gauche, droite, haut, bas)
BARE = False
FOC = 160                  # profondeur du mur du fond (unités monde)

def hsh(*a):
    n = 2166136261
    for v in a:
        n ^= (int(v) & 0xffffffff); n = (n * 16777619) & 0xffffffff
    n ^= n >> 13; n = (n * 0x5bd1e995) & 0xffffffff; n ^= n >> 15
    return (n & 0xffff) / 65536

def mul(c, f): return tuple(min(255, max(0, v * f)) for v in c)
def mix(a, b, t): return tuple(a[i] * (1 - t) + b[i] * t for i in range(3))

# ---------- palette ----------
WALL   = (178, 168, 200); MORTAR = (124, 112, 148)
FLOOR  = (156, 142, 182); FMORT  = (110, 98, 138)
ROOF   = (100, 94, 120);  RMORT  = (70, 64, 88)
STONE  = (204, 196, 222); SMORT  = (140, 128, 162)
P_DK, P_MD, P_LT, P_HI = (78, 26, 102), (122, 46, 156), (160, 82, 196), (196, 136, 226)
G_DK, G_MD, G_LT = (150, 96, 24), (214, 160, 48), (250, 214, 110)
WOOD = [(120, 72, 40), (134, 82, 46), (112, 66, 36)]; WOOD_DK = (74, 42, 24)
IRON = (70, 66, 82)

def brick(u, v, bw, bh, base, mort, salt, round_corners=False):
    row = math.floor(v / bh)
    off = bw / 2 if row % 2 else 0
    col = math.floor((u + off) / bw)
    lx = (u + off) - col * bw; ly = v - row * bh
    if lx < 1 or ly < 1: return mort
    if round_corners and ((lx < 2 or lx > bw - 1) and (ly < 2 or ly > bh - 1)): return mort
    c = mul(base, 0.93 + 0.12 * hsh(row, col, salt))
    if ly < 2: c = mul(c, 1.08)
    elif ly > bh - 1: c = mul(c, 0.90)
    if hsh(int(u * 2), int(v * 2), salt + 9) < 0.035: c = mul(c, 0.94)
    return c

def in_arch(u, v, cu, half, top_c, bottom):
    """ouverture en plein cintre : demi-cercle centré (cu, top_c) + partie droite jusqu'à bottom"""
    if v > bottom or abs(u - cu) > half: return False
    if v >= top_c: return True
    return (u - cu) ** 2 + (v - top_c) ** 2 <= half ** 2

def voussoir(u, v, cu, cv, salt):
    ang = math.atan2(v - cv, u - cu)
    seg = math.floor((ang + math.pi) / (math.pi / 9))
    edge = ((ang + math.pi) / (math.pi / 9)) % 1
    if edge < 0.12 and v < cv: return SMORT
    return mul(STONE, 0.95 + 0.08 * hsh(seg, salt))

# ---------- emblèmes (g=or, l=or clair, d=or sombre, p=page) ----------
EMBLEMS = {
 "castle": ["....l.l.l....", "....lllll....", "l.l.lgggl.l.l", "lll.gg.gg.lll",
            "ggggggggggggg", "ggggggggggggg", "gg.ggggggg.gg", "gggggg.gggggg",
            "ggggg...ggggg", "ggggg...ggggg", "ggggg...ggggg"],
 "book":   ["lll.......lll", "llllll.llllll", "lddddldlddddl", "llllllglllll l".replace(" ", ""),
            "lddddlglddddl", "llllllgllllll", "lddddlglddddl", "llllllgllllll",
            "ggggggdgggggg", ".ggggg.ggggg."],
 "bed":    ["d............", "d...........d", "dll.........d", "dllllggggggggd"[:13],
            "dgggggggggggd", "ddddddddddddd", "d...........d"],
 "flask":  ["....dddd....", ".....ll.....", ".....ll.....", ".....ll.....",
            "....llll....", "..llllllll..", ".llllllllll.", ".gggggggggg.",
            ".gggggggggg.", "..gggggggg..", "...dddddd..."],
 "none":   [".....l.....", "....lgl....", "...lgggl...", "....lgl....", ".....l....."],
}
ECOL = {"g": G_MD, "l": G_LT, "d": G_DK}

def render(kind, emblem, door=True, bare=False):
    global BARE
    BARE = bare
    img = np.zeros((H, W, 3), float)
    for y in range(H):
        yc = y + 0.5
        for x in range(W):
            xc = x + 0.5
            mx = xc if xc < 160 else 320 - xc          # symétrie gauche/droite
            side = (xc < BL) or (xc > BR)
            if side:
                k = (VPX - mx) / (VPX - BL)            # échelle de perspective du mur latéral
                z = FOC / k; t = VPY + (yc - VPY) / k
                if t < BT: img[y, x] = above(kind, xc, yc); continue
                if t < BB: img[y, x] = side_wall(z, t, xc < 160); continue
            else:
                if yc < BT: img[y, x] = above(kind, xc, yc); continue
                if yc < BB: img[y, x] = back_wall(xc, yc, door); continue
            img[y, x] = floor_px(xc, yc, kind)
    if not bare: decorate(img, kind, emblem)
    return np.clip(np.round(img), 0, 255).astype(np.uint8)

def above(kind, xc, yc):
    if kind == "courtyard":
        # feuillage
        best = None
        for cx in range(-8, 330, 7):
            for cy in range(-6, 30, 6):
                ox = cx + 3 * hsh(cx, cy, 1); oy = cy + 3 * hsh(cx, cy, 2); r = 4 + 2 * hsh(cx, cy, 3)
                d = ((xc - ox) ** 2 + (yc - oy) ** 2) / r ** 2
                if d <= 1 and (best is None or oy > best[0]): best = (oy, d, xc - ox, yc - oy)
        if best is None: return (34, 74, 40)
        _, d, dx, dy = best
        if d > 0.75: return (40, 88, 44)
        if dx + dy < -2.5: return (130, 196, 80)
        if dx + dy < 0.5: return (88, 156, 64)
        return (60, 122, 52)
    return brick(xc, yc, 16, 8, ROOF, RMORT, 5)

def cap(c, t):  # chaperon (pierres de couronnement) en haut des murs
    if t < BT + 4: return mul(STONE, 1.0 if t > BT + 0.8 else 0.85)
    return c

def back_wall(xc, yc, door):
    c = brick(xc, yc, 12, 6, WALL, MORTAR, 1)
    c = cap(c, yc)
    # fenêtres
    for cx in (() if BARE else (126, 194)):
        if in_arch(xc, yc, cx, 9.5, 49, 70):
            if in_arch(xc, yc, cx, 7, 49, 66):
                g = (yc - 42) / 24
                c = mix((150, 214, 246), (206, 238, 252), g)
                if abs(xc - cx) < 0.6 or abs(yc - 57) < 0.6: c = (88, 78, 104)
                elif xc < cx and yc < 57 and (xc - cx + yc) % 7 < 1.2: c = mix(c, (255, 255, 255), .6)
            elif yc >= 66: c = mul(STONE, 1.05 if yc < 67.5 else 0.82)   # appui
            else: c = voussoir(xc, yc, cx, 49, cx)
    # porte
    if door and in_arch(xc, yc, 160, 17.5, 110, 136):
        if in_arch(xc, yc, 160, 14, 110, 136):
            p = math.floor((xc - 146) / 4)
            c = WOOD[p % 3]
            if (xc - 146) % 4 < 0.9 or abs(xc - 160) < 0.6: c = WOOD_DK
            if 103 <= yc < 106 or 125 <= yc < 128:
                c = IRON if (yc % 3) >= 1 else mul(IRON, 1.3)
            for hx in (156, 164):
                d = math.hypot(xc - hx, yc - 117)
                if 1.2 <= d <= 2.4: c = G_MD if yc < 117 else G_DK
            if in_arch(xc, yc, 160, 14, 110, 136) and not in_arch(xc, yc, 160, 13, 111, 136): c = WOOD_DK
        elif yc < 110: c = voussoir(xc, yc, 160, 110, 3)
        else: c = brick(xc, yc, 4, 6, STONE, SMORT, 4)
    # ombre dans les angles et en pied de mur
    edge = min(xc - BL, BR - xc)
    if edge < 3: c = mul(c, 0.78 + 0.07 * edge)
    if yc > BB - 4: c = mul(c, 0.92)
    return c

def side_wall(z, t, left):
    c = brick(z, t, 12, 6, WALL, MORTAR, 2 if left else 3)
    c = cap(c, t)
    # alcôve en arc
    cz, hw, tc = 118, 13, 88
    if not BARE and in_arch(z, t, cz, hw + 3, tc, BB):
        if in_arch(z, t, cz, hw, tc, BB):
            inner = in_arch(z + 4, t, cz, hw, tc + 2, BB)
            if inner:
                c = mul(brick(z * 1.0, t, 12, 6, WALL, MORTAR, 7), 0.52 + 0.25 * (t - tc + 14) / 62)
            else:
                c = mul(brick(t, z, 6, 12, WALL, MORTAR, 8), 0.80)      # tableau (côté éclairé)
        elif t < tc: c = voussoir(z, t, cz, tc, 11)
        else: c = brick(z, t, 3, 6, STONE, SMORT, 12)
    c = mul(c, 0.86)
    if t > BB - 4: c = mul(c, 0.92)
    if t < BT + 4 and t >= BT + 3: c = mul(c, 0.8)
    return c

def floor_px(xc, yc, kind):
    k = (yc - VPY) / (BB - VPY)
    z = FOC / k; wx = VPX + (xc - VPX) / k
    c = brick(wx, z, 10, 7, FLOOR, FMORT, 21, round_corners=True)
    # lumière des fenêtres
    sun = 1.22 if kind == "courtyard" else 1.16
    for cx in (() if BARE else (126, 194)):
        sk = (140 - z) * 0.45
        if 92 <= z <= 140 and abs(wx - (cx - sk)) <= 8:
            on_mull = abs(wx - (cx - sk)) < 0.9 or abs(z - 118) < 1.4
            if not on_mull: c = mix(mul(c, sun), (255, 240, 210), 0.14)
    # occlusion ambiante
    f = 1 - 0.28 * max(0, 1 - (FOC - z) / 10)
    f *= 1 - 0.28 * max(0, 1 - (80 - abs(wx - 160)) / 8)
    return mul(c, f)

# ---------- éléments décoratifs fixes ----------
def put(img, x, y, c):
    if 0 <= x < img.shape[1] and 0 <= y < img.shape[0]: img[y, x] = c

def shade(img, x, y, f=0.72):
    if 0 <= x < img.shape[1] and 0 <= y < img.shape[0] and img[y, x][0] >= 0: img[y, x] = mul(img[y, x], f)

def draw_mask(img, pts, color_fn, shadow=True):
    s = set(pts)
    if shadow:
        for (x, y) in pts:
            if (x + 2, y + 2) not in s: shade(img, x + 2, y + 2)
    for (x, y) in pts: put(img, x, y, color_fn(x, y))
    # contour sombre
    for (x, y) in pts:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if (x + dx, y + dy) not in s: put(img, x, y, mul(color_fn(x, y), 0.55)); break

def curtain(img, mirror):
    pts = []
    for x in range(80, 124):
        if x < 89: bottom = 96 + (89 - x) * 0.6
        else: bottom = 20 + 76 * ((123 - x) / 34) ** 2
        for y in range(20, int(bottom)):
            pts.append((x, y))
    def col(x, y):
        if x < 89: f = math.sin((x - 80) * 2 * math.pi / 5)
        else:
            b = 20 + 76 * ((123 - x) / 34) ** 2
            f = math.sin(((y - 20) / max(1, b - 20)) ** 0.8 * 2 * math.pi * 2.5)
        c = P_MD if f > -0.3 else P_DK
        if f > 0.6: c = P_LT
        if f > 0.92: c = P_HI
        return c
    if mirror: pts = [(319 - x, y) for x, y in pts]
    cf = (lambda x, y: col(319 - x, y)) if mirror else col
    draw_mask(img, pts, cf)
    # embrasse dorée + tringle
    tx = 319 - 86 if mirror else 86
    for dx in range(-3, 4):
        for dy in range(2):
            put(img, tx + dx, 74 + dy, G_LT if dy == 0 else G_DK)
    for x in range(80, 126):
        xx = 319 - x if mirror else x
        put(img, xx, 19, G_LT); put(img, xx, 20, G_DK)

def banner(img, x0, x1, top, body_bottom, tip, swallow, emblem, shadow=True):
    cx = (x0 + x1 - 1) / 2
    pts = []
    for y in range(top, tip + 1):
        for x in range(x0, x1):
            if y <= body_bottom: pts.append((x, y)); continue
            d = (y - body_bottom) / (tip - body_bottom)
            half = (x1 - x0) / 2
            if swallow:
                if abs(x - cx) > d * half * 0.9 - 0.5 or y < body_bottom: pts.append((x, y)) if abs(x - cx) <= half else None
            elif abs(x - cx) <= half * (1 - d) + 0.3: pts.append((x, y))
    s = set(pts)
    def inset(x, y, n):
        return all((x + dx, y + dy) in s for dx in range(-n, n + 1) for dy in range(-n, n + 1) if abs(dx) + abs(dy) == n)
    def col(x, y):
        if (x, y) in s and not inset(x, y, 2) and inset(x, y, 1): return G_MD
        g = (y - top) / (tip - top)
        c = mix(P_MD, P_DK, g * 0.6)
        if x - x0 < 2: c = mul(c, 1.15)
        return c
    draw_mask(img, pts, col, shadow)
    for x in range(x0 - 3, x1 + 3):                      # hampe
        put(img, x, top - 2, G_LT); put(img, x, top - 1, G_DK)
    for ex in (x0 - 4, x1 + 3):
        put(img, ex, top - 2, G_LT); put(img, ex, top - 1, G_MD); put(img, ex, top - 3, G_MD)
    # emblème
    rows = EMBLEMS[emblem]
    ew = max(len(r) for r in rows); eh = len(rows)
    ex0 = int(round(cx - ew / 2 + 0.5)); ey0 = top + (body_bottom - top - eh) // 2 + 2
    es = {(ex0 + i, ey0 + j): ch for j, r in enumerate(rows) for i, ch in enumerate(r) if ch != "."}
    for (x, y) in es:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1)):
            if (x + dx, y + dy) not in es: put(img, x + dx, y + dy, P_DK)
    for (x, y), ch in es.items(): put(img, x, y, ECOL[ch])

def small_banner_emblem(img, cx, y0):
    for j in range(13):
        w = 3 - abs(j - 6) // 2 if 3 <= j <= 9 else 0
        for i in range(-w + 1, w):
            put(img, cx + i, y0 + j, G_MD if abs(i) < w - 1 else G_LT)
    for j in (0, 1, 11, 12): put(img, cx, y0 + j, G_MD)

def side_banner_canvas():
    cv = np.full((60, 22, 3), -1.0)
    banner(cv, 4, 18, 3, 46, 56, True, "none", shadow=False)
    for y in range(10, 40):
        for x in range(7, 15): cv[y, x] = mix(P_MD, P_DK, (y - 3) / 53 * 0.6)
    small_banner_emblem(cv, 11, 18)
    return cv

def project_on_side_wall(img, cv, z0, t0):
    """plaque le canevas sur le mur gauche (et en miroir à droite), z0/t0 = coin haut-gauche,
    1 pixel canevas = 1/KREF unité monde pour garder une taille de pixel proche de 1:1"""
    KREF = FOC / (z0 + 6)
    ch, cw = cv.shape[:2]
    for y in range(H):
        for x in range(int(BL)):
            k = (VPX - (x + 0.5)) / (VPX - BL)
            z = FOC / k; t = VPY + (y + 0.5 - VPY) / k
            u = int((z - z0) * KREF); v = int((t - t0) * KREF)
            if 0 <= u < cw and 0 <= v < ch and cv[v, u][0] >= 0:
                for xx in (x, W - 1 - x): img[y, xx] = cv[v, u]
            # ombre portée
            u2 = int((z - z0 + 1.2) * KREF); v2 = int((t - t0 - 1.2) * KREF)
            if 0 <= u2 < cw and 0 <= v2 < ch and cv[v2, u2][0] >= 0 and not (0 <= u < cw and 0 <= v < ch and cv[v, u][0] >= 0):
                for xx in (x, W - 1 - x): img[y, xx] = mul(img[y, xx], 0.75)

def decorate(img, kind, emblem):
    project_on_side_wall(img, side_banner_canvas(), 87, 36)
    banner(img, 142, 178, 26, 58, 68, False, emblem)
    curtain(img, False); curtain(img, True)

def save(name, arr):
    out = "Assets/Art/Rooms"
    im = Image.fromarray(arr)
    im.save(f"{out}/{name}.png")
    im.resize((W * SCALE, H * SCALE), Image.NEAREST).save(f"{out}/{name}_x{SCALE}.png")
    return im

if __name__ == "__main__":
    os.chdir(os.path.join(os.path.dirname(__file__), ".."))
    save("room_empty", render("indoor", "none", door=False, bare=True))
    print("ok")
