"""Textures pixel art raccordables (seamless) pour la pièce 3D.
Chaque texture fait 160x160 pixels et représente 2 m x 2 m : on la répète en mosaïque, sans jamais l'étirer.
Sorties : Assets/Resources/tex_brick.png (murs), Assets/Resources/tex_floor.png (sol)."""
import os
import numpy as np
from PIL import Image

N = 160                                    # pixels par carreau (= 2 m)

def hsh(a, b, salt):
    n = (np.asarray(a, np.int64) * 374761393 + np.asarray(b, np.int64) * 668265263 + salt * 1442695041) & 0xffffffff
    n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
    n ^= n >> 16
    return (n & 0xffff) / 65536.0

def ramp(base, n=8, lo=0.45, hi=1.2):
    """dégradé façon pixel art : ombres froides, lumières chaudes"""
    out = []
    for f in np.linspace(lo, hi, n):
        c = np.array(base, float) * f
        c = c + (np.array([-4, -2, 14]) * (1 - f) if f < 1 else np.array([10, 8, -6]) * (f - 1) * 4)
        out.append(np.clip(c, 0, 255))
    return out

def quantize(img, palette):
    d = ((img[:, :, None, :] - palette[None, None]) ** 2).sum(-1)
    return palette[d.argmin(-1)]

def masonry(bw, bh, base, mort, salt, rounded=0):
    """motif de blocs décalés d'une demi-largeur une rangée sur deux ; périodique sur N pixels"""
    assert N % bw == 0 and N % bh == 0 and (N // bh) % 2 == 0
    y, x = np.mgrid[0:N, 0:N]
    row = y // bh
    xx = (x + (row % 2) * (bw // 2)) % N
    col = xx // bw
    lx, ly = xx % bw, y % bh
    dl, dr, dt, db = lx - 1, bw - 1 - lx, ly - 1, bh - 1 - ly       # joint de 1 pixel en haut et à gauche
    inside = (dl >= 0) & (dt >= 0)
    if rounded:
        cx = np.maximum(rounded - np.minimum(dl, dr), 0); cy = np.maximum(rounded - np.minimum(dt, db), 0)
        inside &= (cx * cx + cy * cy) <= rounded * rounded
    var = 0.9 + 0.16 * hsh(row, col, salt)
    shade = np.ones((N, N))
    shade += 0.16 * (dt == 0) + 0.06 * (dl == 0)                       # arête haute / gauche éclairée
    shade -= 0.22 * (db <= 1) + 0.10 * (dr == 0)                       # arête basse / droite dans l'ombre
    blot = 1 + 0.08 * (hsh(x // 4, y // 4, salt + 5) - 0.5)             # taches (période 4 -> raccord parfait)
    chip = np.where(hsh(x // 2, y // 2, salt + 11) < 0.03, 0.84, 1.0)   # petits éclats
    stone = np.array(base, float) * (var * shade * blot * chip)[..., None]
    img = np.where(inside[..., None], stone, np.array(mort, float))
    pal = np.array(ramp(base) + ramp(mort, 3, 0.8, 1.2))
    return quantize(img, pal).astype(np.uint8)

if __name__ == "__main__":
    os.chdir(os.path.join(os.path.dirname(__file__), ".."))
    os.makedirs("Assets/Resources", exist_ok=True)
    # murs : pierres de taille gris chaud de 50 x 25 cm (40 x 20 px)
    Image.fromarray(masonry(40, 20, (156, 148, 136), (66, 60, 56), 1)).save("Assets/Resources/tex_brick.png")
    # sol : grandes dalles gris-bleu de 50 x 50 cm (40 x 40 px), angles légèrement adoucis
    Image.fromarray(masonry(40, 40, (128, 130, 136), (56, 56, 62), 21, rounded=2)).save("Assets/Resources/tex_floor.png")
    # aperçu : 2 x 2 carreaux côte à côte pour vérifier le raccord
    prev = Image.new("RGB", (N * 4, N * 2))
    for i, name in enumerate(["tex_brick", "tex_floor"]):
        t = Image.open(f"Assets/Resources/{name}.png")
        for a in range(2):
            for b in range(2): prev.paste(t, (i * N * 2 + a * N, b * N))
    os.makedirs("Assets/Art/Preview", exist_ok=True)
    prev.resize((prev.width * 2, prev.height * 2), Image.NEAREST).save("Assets/Art/Preview/textures_tiled.png")
    print("ok")
