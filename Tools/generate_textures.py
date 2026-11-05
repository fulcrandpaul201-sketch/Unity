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
    # briques de 40 x 20 cm (32 x 16 px)
    Image.fromarray(masonry(32, 16, (176, 164, 198), (62, 46, 80), 1)).save("Assets/Resources/tex_brick.png")
    # pavés de 40 x 25 cm (32 x 20 px), coins arrondis
    Image.fromarray(masonry(32, 20, (150, 134, 176), (56, 42, 74), 21, rounded=3)).save("Assets/Resources/tex_floor.png")
    # aperçu : 2 x 2 carreaux côte à côte pour vérifier le raccord
    prev = Image.new("RGB", (N * 4, N * 2))
    for i, name in enumerate(["tex_brick", "tex_floor"]):
        t = Image.open(f"Assets/Resources/{name}.png")
        for a in range(2):
            for b in range(2): prev.paste(t, (i * N * 2 + a * N, b * N))
    os.makedirs("Assets/Art/Preview", exist_ok=True)
    prev.resize((prev.width * 2, prev.height * 2), Image.NEAREST).save("Assets/Art/Preview/textures_tiled.png")
    print("ok")

# ---------- Marelle à la craie (pixel art, fond transparent) ----------
# 64 px par mètre ; cases de 0,6 m ; de bas en haut : 1, 2, 3, 4|5, 6, 7|8, puis le « CIEL » en demi-cercle
GLYPHS = {
    "1": ["010", "110", "010", "010", "111"], "2": ["111", "001", "111", "100", "111"], "3": ["111", "001", "011", "001", "111"],
    "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"], "6": ["111", "100", "111", "101", "111"],
    "7": ["111", "001", "010", "010", "010"], "8": ["111", "101", "111", "101", "111"],
    "C": ["111", "100", "100", "100", "111"], "I": ["111", "010", "010", "010", "111"], "E": ["111", "100", "110", "100", "111"],
    "L": ["100", "100", "100", "100", "111"],
}

def hopscotch():
    PX, CELL = 64, 0.6
    w, h = int(2 * CELL * PX) + 4, int(7 * CELL * PX) + 4          # 2 cases de large, 6 rangées + ciel
    img = np.zeros((h, w, 4), np.uint8)
    rng = np.random.default_rng(3)
    def chalk(x, y):
        if 0 <= x < w and 0 <= y < h and rng.random() > 0.12:      # trait de craie un peu irrégulier
            img[y, x] = (240, 236, 246, 215 + int(rng.random() * 40))
    def line(x0, y0, x1, y1):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for t in np.linspace(0, 1, n):
            x, y = int(round(x0 + (x1 - x0) * t)), int(round(y0 + (y1 - y0) * t))
            for dx in (0, 1):
                for dy in (0, 1): chalk(x + dx, y + dy)
    def rect(x0, y0, x1, y1):
        line(x0, y0, x1, y0); line(x1, y0, x1, y1); line(x1, y1, x0, y1); line(x0, y1, x0, y0)
    def text(s, cx, cy, scale=4):
        tw = len(s) * 4 * scale - scale
        x = cx - tw // 2
        for ch in s:
            for j, row in enumerate(GLYPHS[ch]):
                for i, bit in enumerate(row):
                    if bit == "1":
                        for a in range(scale):
                            for b in range(scale): chalk(x + i * scale + a, cy - 5 * scale // 2 + j * scale + b)
            x += 4 * scale
    c = int(CELL * PX); mid = w // 2
    rows = [["1"], ["2"], ["3"], ["4", "5"], ["6"], ["7", "8"]]
    for r, labels in enumerate(rows):                                 # rangée 0 en bas de l'image
        y1 = h - 2 - r * c; y0 = y1 - c
        if len(labels) == 1:
            rect(mid - c // 2, y0, mid + c // 2, y1); text(labels[0], mid, (y0 + y1) // 2)
        else:
            rect(mid - c, y0, mid, y1); rect(mid, y0, mid + c, y1)
            text(labels[0], mid - c // 2, (y0 + y1) // 2); text(labels[1], mid + c // 2, (y0 + y1) // 2)
    ytop = h - 2 - 6 * c                                              # demi-cercle du ciel
    for a in np.linspace(0, np.pi, 160):
        x, y = mid + np.cos(a) * c, ytop - np.sin(a) * (c - 2)
        chalk(int(x), int(y)); chalk(int(x) + 1, int(y))
    line(mid - c, ytop, mid + c, ytop)
    text("CIEL", mid, ytop - c // 2 + 4, 3)
    Image.fromarray(img, "RGBA").save("Assets/Resources/tex_hopscotch.png")

if __name__ == "__main__":
    hopscotch()
    print("marelle ok")
