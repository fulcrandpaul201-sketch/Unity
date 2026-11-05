"""Salle vide (murs + sol) en haute définition, rendu anticrénelé.
Géométrie en unités (hauteur 480) ; mur du fond 900 de large ; sortie x1.5 = 1860x720 -> Assets/Resources/room_empty.png"""
import os
import numpy as np
from PIL import Image

W, H = 1240, 480           # unités de travail (vue complète de la salle)
OUT = 1.5                  # facteur de sortie -> 960x720
SS = 3                     # sur-échantillonnage (anticrénelage)
VPX, VPY = 620, 130        # point de fuite
BL, BR, BT, BB = 170, 1070, 60, 270   # mur du fond
FOC = 300                  # profondeur du mur du fond (unités monde)

WALL, MORTAR = np.array([180, 170, 202.]), np.array([116, 104, 140.])
FLOOR, FMORT = np.array([160, 146, 186.]), np.array([102, 90, 130.])
STONE, SMORT = np.array([206, 198, 224.]), np.array([132, 120, 156.])

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
    e = lambda d, w=1.6: np.clip(1 - d / w, 0, 1)
    bevel = 1 + 0.12 * e(dt) + 0.05 * e(dl) - 0.14 * e(db) - 0.06 * e(dr)
    grain = 1 + 0.05 * (hsh(np.floor(u * 1.3), np.floor(v * 1.3), salt + 5) - 0.5)
    stone = base * (var * bevel * grain)[..., None]
    mortar = mort * grain[..., None]
    return np.where(inside[..., None], stone, mortar)

def render():
    rows = [render_rows(r0, min(r0 + 60, int(H * OUT))) for r0 in range(0, int(H * OUT), 60)]
    return np.concatenate(rows, axis=0)

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
    img = img.reshape(h // SS, SS, w // SS, SS, 3).mean(axis=(1, 3))      # anticrénelage
    return np.clip(np.round(img), 0, 255).astype(np.uint8)

if __name__ == "__main__":
    os.chdir(os.path.join(os.path.dirname(__file__), ".."))
    os.makedirs("Assets/Resources", exist_ok=True)
    Image.fromarray(render()).save("Assets/Resources/room_empty.png", optimize=True)
    print("ok")
