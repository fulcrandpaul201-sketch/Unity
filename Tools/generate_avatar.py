"""Avatar pixel art 16x24 : 4 directions x 4 images de marche -> Assets/Resources/avatar_sheet.png
Lignes de la planche : 0=bas, 1=gauche, 2=droite, 3=haut. Colonnes : repos, pas A, repos, pas B."""
import os
from PIL import Image

PAL = {
    "o": (40, 24, 56), "h": (110, 66, 38), "H": (156, 102, 58), "s": (244, 202, 166),
    "S": (214, 164, 132), "e": (40, 24, 56), "r": (122, 46, 156), "R": (162, 86, 198),
    "d": (84, 30, 110), "g": (226, 172, 56), "w": (236, 232, 244), "b": (80, 50, 34),
    "p": (236, 150, 150),
}

def sym(half):  # vue de face/dos : moitié gauche miroir
    return [r + r[::-1] for r in half]

FRONT = sym([
    "......oo", "....oohh", "...ohhhH", "..ohhHhh", "..ohhhhh", "..ohhsss",
    "..ohssss", "..ohsess", "..ohpsss", "...oosss", "....owww", "...orrrR",
    "..orrRrr", "..odrRrg", "..odrrrg", "..odrrrg", "..sggggg", "..odrrrg",
    "..odrrrr", ".odrrrrr", ".odrrrrr", ".ooooooo", "...obbo.", "...oooo.",
])
BACK = sym([
    "......oo", "....oohh", "...ohhhH", "..ohhHhh", "..ohhhhh", "..ohhhhh",
    "..ohhhhh", "..ohhhhh", "..ohhhHh", "...oohhh", "....orrr", "...orrrR",
    "..orrRrr", "..odrRrr", "..odrrrr", "..odrrrr", "..sggggg", "..odrrrr",
    "..odrrrr", ".odrrrrr", ".odrrrrr", ".ooooooo", "...obbo.", "...oooo.",
])
SIDE = [  # regarde vers la droite
    ".....oooo.......", "....ohhhhoo.....", "...ohhHHhhho....", "...ohHhhhhhho...",
    "...ohhhhhhhho...", "...ohhhhhssso...", "...ohhhhsssso...", "...ohhhhssseo...",
    "...oohhhssspo...", "....oohsssoo....", ".....oswwo......", "....orrrRro.....",
    "....orrdRRro....", "....orrdRRro....", "....orrdRRro....", "....orrrsRro....",
    "....oggggggo....", "....orrrrrro....", "...orrrrrrrro...", "...orrrrrrrro...",
    "...odrrrrrrro...", "...oooooooooo...", "......obbbo.....", "......ooooo.....",
]
SIDE_STEP_FEET = ["....obbo..obbo..", "....ooo...oooo.."]

def frames(base, kind):
    out = []
    for f in range(4):
        rows = [r for r in base]
        if f in (1, 3):
            if kind == "side":
                rows[22:24] = SIDE_STEP_FEET
            else:  # un pied levé (caché sous la robe) + léger rebond
                left = f == 1
                r22, r23 = list(rows[22]), list(rows[23])
                rng = range(8, 16) if left else range(0, 8)
                for i in rng: r23[i] = "."
                for i in rng:
                    if r22[i] in "b": r22[i] = "o"
                rows[22], rows[23] = "".join(r22), "".join(r23)
        out.append(rows)
    return out

def draw(rows, flip=False):
    im = Image.new("RGBA", (16, 24), (0, 0, 0, 0))
    for y, r in enumerate(rows):
        assert len(r) == 16, (y, r, len(r))
        for x, ch in enumerate(r[::-1] if flip else r):
            if ch != ".": im.putpixel((x, y), PAL[ch] + (255,))
    return im

if __name__ == "__main__":
    os.chdir(os.path.join(os.path.dirname(__file__), ".."))
    sheet = Image.new("RGBA", (64, 96), (0, 0, 0, 0))
    rows = [(FRONT, "front", False), (SIDE, "side", True), (SIDE, "side", False), (BACK, "back", False)]
    for j, (base, kind, flip) in enumerate(rows):
        for i, fr in enumerate(frames(base, kind)):
            sheet.paste(draw(fr, flip), (i * 16, j * 24))
    os.makedirs("Assets/Resources", exist_ok=True)
    sheet.save("Assets/Resources/avatar_sheet.png")
    sheet.resize((64 * 8, 96 * 8), Image.NEAREST).save("Assets/Art/Preview/avatar_sheet_x8.png")
    print("ok")
