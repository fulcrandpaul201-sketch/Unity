"""Salle vide (murs + sol) en pixel art (même densité de pixels que l'avatar).
Géométrie en unités (hauteur 480) ; mur du fond 900 de large ; 1 pixel = 1 unité -> 1240x480.
Palette limitée avec ombres teintées et tramage ordonné, sans anticrénelage -> Assets/Resources/room_empty.png"""
import os
import numpy as np
from PIL import Image

W, H = 1240, 480           # unités de travail (vue complète de la salle)
OUT = 1                    # 1 pixel par unité
SS = 1                     # pas d'anticrénelage : pixels nets
VPX, VPY = 620, 130        # point de fuite
BL, BR, BT, BB = 170, 1070, 60, 270   # mur du fond
FOC = 300                  # profondeur du mur du fond (unités monde)

WALL, MORTAR = np.array([176, 164, 198.]), np.array([62, 46, 80.])
FLOOR, FMORT = np.array([150, 134, 176.]), np.array([56, 42, 74.])
STONE, SMORT = np.array([204, 194, 224.]), np.array([70, 54, 90.])

def hsh(a, b, salt):
    n = (a.astype(np.int64) * 374761393 + b.astype(np.int64) * 668265263 + np.int64(salt) * 1442695041) & 0xffffffff
    n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
    n ^= n >> 16
    return (n & 0xffff) / 65536.0

def masonry(u, v, bw, bh, base, mort, salt, m=1.3, r=0.0):
    row = np.floor(v / bh)
    uu = u + np.where(row % 2 == 1, bw / 2, 0)
    col = np.floor(uu / bw)
    lx, ly = uu - col * bw, v - row * bh
    dl, dr, dt, db = lx - m, bw - lx, ly - m, bh - ly
    inside = (dl > 0) & (dr > 0) & (dt > 0) & (db > 0)
    if r > 0:
        cx = np.maximum(r - np.minimum(dl, dr), 0); cy = np.maximum(r - np.minimum(dt, db), 0)
        inside &= np.hypot(cx, cy) < r
    var = 0.92 + 0.14 * hsh(row, col, salt)
    e = lambda d, w: (d < w).astype(float)                   # arêtes nettes, 1 à 2 pixels
    bevel = 1 + 0.16 * e(dt, 1.2) + 0.07 * e(dl, 1.2) - 0.22 * e(db, 2.0) - 0.10 * e(dr, 1.6)
    # taches de matière (blocs de 3 unités) et petits éclats sombres
    blot = 1 + 0.07 * (hsh(np.floor(u / 3), np.floor(v / 3), salt + 5) - 0.5)
    chip = np.where(hsh(np.floor(u / 2), np.floor(v / 2), salt + 11) < 0.035, 0.84, 1.0)
    stone = base * (var * bevel * blot * chip)[..., None]
    mortar = mort * np.ones_like(u)[..., None]
    return np.where(inside[..., None], stone, mortar)

BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0 - 0.47

def ramp(base, n=8, lo=0.42, hi=1.18):
    """dégradé façon pixel art : ombres froides (violet/bleu), lumières chaudes"""
    out = []
    for f in np.linspace(lo, hi, n):
        c = np.array(base) * f
        if f < 1: c = c + np.array([-4, -2, 14]) * (1 - f)
        else: c = c + np.array([10, 8, -6]) * (f - 1) * 4
        out.append(np.clip(c, 0, 255))
    return out

PALETTE = np.array(ramp(WALL) + ramp(FLOOR) + ramp(STONE, 5, 0.6, 1.1) + ramp((52, 44, 70), 4, 0.7, 1.3) + ramp((60, 45, 78), 3, 0.8, 1.2) +
                   [np.array(c, float) for c in [(38, 28, 52), (58, 44, 76), (82, 66, 104)]])

def quantize(img):
    """couleur la plus proche de la palette, avec tramage ordonné 4x4"""
    h, w = img.shape[:2]
    by = BAYER[np.arange(h)[:, None] % 4, np.arange(w)[None, :] % 4]
    out = np.empty_like(img)
    for r0 in range(0, h, 40):
        c = img[r0:r0 + 40] + by[r0:r0 + 40, :, None] * 7
        d = ((c[:, :, None, :] - PALETTE[None, None]) ** 2).sum(-1)
        out[r0:r0 + 40] = PALETTE[d.argmin(-1)]
    return out

def render():
    rows = [render_rows(r0, min(r0 + 60, int(H * OUT))) for r0 in range(0, int(H * OUT), 60)]
    return np.clip(np.round(quantize(np.concatenate(rows, axis=0).astype(float))), 0, 255).astype(np.uint8)

def render_rows(r0, r1):
    w, h = int(W * OUT * SS), (r1 - r0) * SS
    x = (np.arange(w) + 0.5) / (OUT * SS); y = (np.arange(r0 * SS, r1 * SS) + 0.5) / (OUT * SS)
    x, y = np.meshgrid(x, y)
    mx = np.where(x < VPX, x, 2 * VPX - x)
    side = (x < BL) | (x > BR)
    ks = np.maximum((VPX - mx) / (VPX - BL), 1e-6)
    zs, ts = FOC / ks, VPY + (y - VPY) / ks
    t = np.where(side, ts, y)

    # murs
    back = masonry(x, y, 26, 13, WALL, MORTAR, 1)
    sw = masonry(zs, ts, 26, 13, WALL, MORTAR, 2) * 0.86
    wall = np.where(side[..., None], sw, back)
    capc = masonry(np.where(side, zs, x), t, 40, 7, STONE, SMORT, 4)
    wall = np.where((t < BT + 7)[..., None], capc, wall)
    f = 0.9 + 0.1 * np.clip((t - BT) / (BB - BT), 0, 1)
    f *= 1 - 0.18 * np.clip(1 - (BB - t) / 10, 0, 1)                    # pied de mur
    corner = np.where(side, (FOC - zs), np.minimum(x - BL, BR - x))
    f *= 1 - 0.22 * np.clip(1 - corner / 9, 0, 1)                        # angles
    f *= np.where((t >= BT + 7) & (t < BT + 9), 0.8, 1)                  # ombre sous le chaperon
    wall = wall * f[..., None]

    # sol
    k = np.maximum((y - VPY) / (BB - VPY), 1e-6)
    z, wx = FOC / k, VPX + (x - VPX) / k
    fl = masonry(wx, z, 24, 16, FLOOR, FMORT, 21, m=1.6, r=3.5)
    g = 1 + 0.07 * np.exp(-((wx - VPX) / 420) ** 2 - ((z - 190) / 80) ** 2)
    g *= 1 - 0.28 * np.clip(1 - (FOC - z) / 16, 0, 1)
    g *= 1 - 0.28 * np.clip(1 - ((BR - BL) / 2 - np.abs(wx - VPX)) / 16, 0, 1)
    fl = fl * g[..., None]

    # au-dessus des murs : pénombre
    top = np.array([46, 40, 60.]) + np.array([20, 18, 26.]) * np.clip(y / BT, 0, 1)[..., None]

    img = np.where((t < BT)[..., None], top, np.where((t < BB)[..., None], wall, fl))
    return img

if __name__ == "__main__":
    os.chdir(os.path.join(os.path.dirname(__file__), ".."))
    os.makedirs("Assets/Resources", exist_ok=True)
    Image.fromarray(render()).save("Assets/Resources/room_empty.png", optimize=True)
    print("ok")
