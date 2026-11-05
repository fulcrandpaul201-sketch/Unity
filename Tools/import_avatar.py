"""Découpe la planche source (Assets/Art/Source/avatar_source.png : 3 lignes x 4 colonnes,
colonnes = face, dos, profil gauche, profil droit ; lignes = repos, pas A, pas B),
nettoie les contours et produit Assets/Resources/avatar_sheet.png au format du jeu :
4 lignes (bas, gauche, droite, haut) x 4 images (repos, pas A, repos, pas B)."""
import os, json
from collections import deque
import numpy as np
from PIL import Image

SRC = "Assets/Art/Source/avatar_source.png"

def spans(profile, min_gap=20):
    on = profile > 0
    out, start, gap = [], None, 0
    for i, v in enumerate(on):
        if v:
            if start is None: start = i
            gap = 0; end = i
        elif start is not None:
            gap += 1
            if gap >= min_gap: out.append((start, end + 1)); start = None
    if start is not None: out.append((start, end + 1))
    return out

def largest_component(mask):
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32); best, best_n, cur = 0, 0, 0
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]: continue
        cur += 1; n = 0; q = deque([(y0, x0)]); lab[y0, x0] = cur
        while q:
            y, x = q.popleft(); n += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                        lab[yy, xx] = cur; q.append((yy, xx))
        if n > best_n: best, best_n = cur, n
    return lab == best

def main():
    os.chdir(os.path.join(os.path.dirname(__file__), ".."))
    a = np.array(Image.open(SRC).convert("RGBA"))
    solid = a[..., 3] >= 128                       # le halo semi-transparent (rougeâtre) est supprimé
    cols = spans(solid.sum(0)); rows = spans(solid.sum(1))
    assert len(cols) == 4 and len(rows) == 3, (cols, rows)
    sprites = {}
    for r, (y0, y1) in enumerate(rows):
        for c, (x0, x1) in enumerate(cols):
            m = largest_component(solid[y0:y1, x0:x1])   # retire les points isolés
            ys, xs = np.nonzero(m)
            by0, by1, bx0, bx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            px = a[y0:y1, x0:x1].copy()
            px[..., 3] = np.where(m, 255, 0)
            px = px[by0:by1, bx0:bx1]
            mm = m[by0:by1, bx0:bx1]
            # axe vertical = centre de la tête (40 % supérieurs), stable pendant la marche
            top = mm[: int(mm.shape[0] * 0.4)]
            cx = np.nonzero(top)[1].mean()
            sprites[(r, c)] = (px, cx)
    hmax = max(p.shape[0] for p, _ in sprites.values())
    half = max(max(cx, p.shape[1] - cx) for p, cx in sprites.values())
    FW, FH = int(np.ceil(half * 2)) + 8, hmax + 8
    FW += FW % 2
    sheet = Image.new("RGBA", (FW * 4, FH * 4), (0, 0, 0, 0))
    # jeu : ligne 0 bas, 1 gauche, 2 droite, 3 haut  <-  source : col 0 face, 2 gauche, 3 droite, 1 dos
    for out_row, src_col in enumerate([0, 2, 3, 1]):
        for out_col, src_row in enumerate([0, 1, 0, 2]):
            px, cx = sprites[(src_row, src_col)]
            im = Image.fromarray(px)
            ox = int(round(FW / 2 - cx)); oy = FH - 4 - px.shape[0]   # pieds alignés en bas
            sheet.paste(im, (out_col * FW + ox, out_row * FH + oy), im)
    sheet.save("Assets/Resources/avatar_sheet.png", optimize=True)
    json.dump({"frameWidth": FW, "frameHeight": FH}, open("Assets/Resources/avatar_sheet.json", "w"))
    bg = Image.new("RGBA", sheet.size, (200, 190, 220, 255)); bg.alpha_composite(sheet)
    bg.save("Assets/Art/Preview/avatar_sheet.png")
    print("frame", FW, FH)

if __name__ == "__main__":
    main()
