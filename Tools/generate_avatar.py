"""Avatar « apprenti sorcier » dessiné en vectoriel (anticrénelé).
Planche : 4 lignes (bas, gauche, droite, haut) x 4 images de marche, chaque image 128x192.
Sortie : Assets/Resources/avatar_sheet.png (512x768)."""
import math, os
from PIL import Image, ImageDraw

FW, FH = 128, 192
S = 4                                    # sur-échantillonnage
OUT = (44, 26, 58)
ROBE, ROBE_SH, ROBE_LT = (128, 52, 164), (90, 32, 122), (166, 98, 208)
HAT, HAT_SH, HAT_LT = (104, 38, 140), (74, 24, 102), (142, 72, 182)
GOLD, GOLD_SH = (236, 186, 70), (184, 128, 40)
HAIR, HAIR_SH, HAIR_LT = (124, 74, 44), (90, 52, 30), (166, 110, 66)
SKIN, SKIN_SH = (252, 214, 182), (230, 180, 150)
BOOT, BOOT_LT = (78, 50, 36), (112, 76, 52)
WHITE, BLUSH, EYE = (246, 242, 252), (246, 160, 170), (52, 34, 70)
LW = 1.6                                 # épaisseur du contour (pixels finaux)

class Pen:
    def __init__(self):
        self.im = Image.new("RGBA", (FW * S, FH * S), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)
    def P(self, pts): return [(x * S, y * S) for x, y in pts]
    def poly(self, pts, fill, outline=True):
        self.d.polygon(self.P(pts), fill=fill)
        if outline: self.d.line(self.P(pts + pts[:1]), fill=OUT, width=int(LW * S), joint="curve")
    def ell(self, cx, cy, rx, ry, fill, outline=True):
        box = [(cx - rx) * S, (cy - ry) * S, (cx + rx) * S, (cy + ry) * S]
        self.d.ellipse(box, fill=fill, outline=OUT if outline else None, width=int(LW * S) if outline else 0)
    def line(self, pts, fill, w):
        self.d.line(self.P(pts), fill=fill, width=int(w * S), joint="curve")
    def arc(self, cx, cy, rx, ry, a0, a1, fill, w):
        self.d.arc([(cx - rx) * S, (cy - ry) * S, (cx + rx) * S, (cy + ry) * S], a0, a1, fill=fill, width=int(w * S))
    def done(self):
        return self.im.resize((FW, FH), Image.LANCZOS)

def curve(p0, p1, p2, n=10):            # courbe de Bézier quadratique
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in [i / n for i in range(n + 1)]]

def star(cx, cy, r):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return pts

def hat(p, cx, top_y, tip_dx, view):
    # cône
    base_y = top_y + 46
    tip = (cx + tip_dx, top_y)
    cone = [(cx - 27, base_y)] + curve((cx - 22, base_y - 20), (cx - 8, top_y + 18), tip, 8)[1:] + \
           curve(tip, (cx + 10, top_y + 20), (cx + 25, base_y - 18), 8)[1:] + [(cx + 27, base_y)]
    p.poly(cone, HAT)
    p.poly([(cx + 8, base_y - 2), (cx + 4, top_y + 26), (cx + 22, base_y - 2)], HAT_SH, outline=False)
    if view != "side": p.line(curve((cx - 18, base_y - 6), (cx - 10, top_y + 24), (cx + tip_dx * 0.5 - 4, top_y + 14), 8), HAT_LT, 2)
    p.line(cone + cone[:1], OUT, LW)
    # bande dorée
    p.poly([(cx - 26, base_y - 9), (cx + 26, base_y - 9), (cx + 27, base_y), (cx - 27, base_y)], GOLD)
    if view == "front": p.poly(star(cx, base_y - 22, 7), GOLD)
    # bord
    p.ell(cx, base_y + 2, 46 if view != "side" else 42, 9, HAT)
    p.arc(cx, base_y + 2, 44 if view != "side" else 40, 7, 200, 340, HAT_LT, 1.6)

def feet(p, cx, view, ph):
    s = math.sin(ph)
    if view == "side":
        near, far = s * 13, -s * 13
        lift_n, lift_f = max(0, -s) * 4, max(0, s) * 4
        p.ell(cx + far + 4, 181 - lift_f, 13, 7, BOOT)
        return (cx + near + 4, 182 - lift_n)
    l_lift, r_lift = max(0, s) * 6, max(0, -s) * 6
    for fx, lift in ((cx - 13, l_lift), (cx + 13, r_lift)):
        p.ell(fx, 181 - lift, 11, 8, BOOT)
        p.arc(fx, 179 - lift, 7, 4, 200, 320, BOOT_LT, 1.5)
    return None

def robe(p, cx, by, view):
    top, hem = by + 96, 174
    hw_t, hw_b = (21, 33) if view != "side" else (17, 27)
    body = [(cx - hw_t, top)] + curve((cx - hw_b, hem - 6), (cx, hem + 6), (cx + hw_b, hem - 6), 10) + [(cx + hw_t, top)]
    body = [(cx - hw_t, top), (cx - hw_b, hem - 6)] + curve((cx - hw_b, hem - 6), (cx, hem + 6), (cx + hw_b, hem - 6), 10)[1:] + [(cx + hw_t, top)]
    p.poly(body, ROBE)
    # ombre (côté droit) et reflet (côté gauche)
    p.poly([(cx + hw_t - 7, top + 2), (cx + hw_t - 1, top + 2), (cx + hw_b - 2, hem - 6), (cx + hw_b - 14, hem - 1)], ROBE_SH, outline=False)
    p.line([(cx - hw_t + 6, top + 6), (cx - hw_b + 9, hem - 10)], ROBE_LT, 3)
    # ourlet doré
    hemband = curve((cx - hw_b, hem - 6), (cx, hem + 6), (cx + hw_b, hem - 6), 10)
    p.line(hemband, GOLD, 4)
    if view == "front":
        p.poly([(cx - 4, top + 4), (cx + 4, top + 4), (cx + 5, hem), (cx - 5, hem)], GOLD, outline=False)
        p.line([(cx + 4, top + 4), (cx + 5, hem)], GOLD_SH, 1.2)
    if view == "side":
        p.line([(cx + hw_t - 3, top + 4), (cx + hw_b - 3, hem - 6)], GOLD, 3)
    p.line(body + body[:1], OUT, LW)
    # ceinture
    bt = top + 26
    w0 = hw_t + (hw_b - hw_t) * 26 / (hem - top)
    p.poly([(cx - w0, bt), (cx + w0, bt), (cx + w0 + 0.6, bt + 6), (cx - w0 - 0.6, bt + 6)], GOLD)
    if view == "front": p.poly([(cx - 5, bt - 2), (cx + 5, bt - 2), (cx + 5, bt + 8), (cx - 5, bt + 8)], GOLD_SH)
    if view == "side": p.poly([(cx + w0 - 7, bt - 2), (cx + w0, bt - 2), (cx + w0, bt + 8), (cx + w0 - 7, bt + 8)], GOLD_SH)
    return top

def arm_front(p, sx, sy, side, swing):
    # manche évasée + main
    hx, hy = sx + side * 10, sy + 40 - swing
    sleeve = [(sx - side * 2, sy - 2), (sx + side * 9, sy + 2), (hx + side * 6, hy - 2), (hx - side * 8, hy + 1)]
    p.poly(sleeve, ROBE if side < 0 else ROBE_SH)
    p.line([(hx + side * 6, hy - 2), (hx - side * 8, hy + 1)], GOLD, 3)
    p.ell(hx - side * 1, hy + 6, 6, 6, SKIN)

def arm_side(p, sx, sy, ang, color):
    a = math.radians(ang)
    hx, hy = sx + math.sin(a) * 36, sy + math.cos(a) * 36
    nx, ny = math.cos(a) * 8, -math.sin(a) * 8
    sleeve = [(sx - nx * 0.7, sy - ny * 0.7), (sx + nx * 0.7, sy + ny * 0.7), (hx + nx, hy + ny), (hx - nx, hy - ny)]
    p.poly(sleeve, color)
    p.line([(hx + nx, hy + ny), (hx - nx, hy - ny)], GOLD, 3)
    p.ell(hx + math.sin(a) * 5, hy + math.cos(a) * 5, 6, 6, SKIN)

def head(p, cx, cy, view):
    if view == "front":
        p.ell(cx, cy + 2, 37, 34, HAIR)                         # cheveux arrière
        p.poly([(cx - 37, cy + 2), (cx - 34, cy + 30), (cx - 26, cy + 22)], HAIR)
        p.poly([(cx + 37, cy + 2), (cx + 34, cy + 30), (cx + 26, cy + 22)], HAIR)
        p.ell(cx, cy + 6, 31, 29, SKIN)                         # visage
        # frange
        bang = [(cx - 33, cy + 4)] + [(cx - 33 + i * 8.25, cy - 8 + (6 if i % 2 else 12)) for i in range(1, 8)] + [(cx + 33, cy + 4), (cx + 30, cy - 20), (cx - 30, cy - 20)]
        p.poly(bang, HAIR)
        p.arc(cx - 6, cy - 6, 20, 10, 200, 300, HAIR_LT, 2.2)
        # yeux
        for ex in (cx - 12, cx + 12):
            p.ell(ex, cy + 12, 5.5, 7.5, EYE, outline=False)
            p.ell(ex - 1.8, cy + 9, 2.2, 2.6, WHITE, outline=False)
            p.ell(ex + 1.8, cy + 15.5, 1.1, 1.1, WHITE, outline=False)
        for bx in (cx - 22, cx + 22): p.ell(bx, cy + 22, 6, 3.5, BLUSH, outline=False)
        p.arc(cx, cy + 22, 5, 4, 20, 160, OUT, 1.6)
    elif view == "back":
        p.ell(cx, cy + 6, 36, 34, HAIR)
        p.arc(cx - 4, cy + 2, 24, 14, 200, 320, HAIR_LT, 2.2)
        p.arc(cx + 2, cy + 18, 22, 12, 30, 150, HAIR_SH, 2)
    else:  # profil vers la droite
        p.ell(cx - 2, cy + 3, 34, 33, HAIR)
        p.poly([(cx - 30, cy + 10), (cx - 26, cy + 36), (cx - 12, cy + 30)], HAIR)
        face = [(cx - 4, cy - 12)] + curve((cx + 12, cy - 16), (cx + 36, cy - 4), (cx + 31, cy + 18), 6) + \
               curve((cx + 31, cy + 18), (cx + 26, cy + 34), (cx + 6, cy + 34), 6)[1:] + [(cx - 6, cy + 24)]
        p.poly(face, SKIN)
        bang = [(cx - 8, cy - 22), (cx + 30, cy - 12), (cx + 33, cy - 2), (cx + 24, cy - 4), (cx + 22, cy + 4), (cx + 14, cy - 4), (cx + 8, cy + 6), (cx - 4, cy - 2), (cx - 10, cy + 22), (cx - 18, cy + 10)]
        p.poly(bang, HAIR)
        p.arc(cx - 4, cy - 4, 20, 12, 200, 300, HAIR_LT, 2.2)
        p.ell(cx + 18, cy + 12, 4.5, 7, EYE, outline=False)
        p.ell(cx + 17, cy + 9, 1.8, 2.3, WHITE, outline=False)
        p.ell(cx + 22, cy + 22, 5, 3, BLUSH, outline=False)
        p.arc(cx + 24, cy + 26, 4, 3, 30, 120, OUT, 1.4)

def frame(view, f):
    ph = f * math.pi / 2
    bob = -abs(math.sin(ph)) * 3
    p = Pen(); cx = 64
    sw = math.sin(ph)
    near_foot = feet(p, cx, view, ph)
    if view == "side":
        arm_side(p, cx - 2, 104 + bob, -sw * 28, ROBE_SH)       # bras arrière
    top = robe(p, cx, bob, view)
    if view == "side":
        p.ell(near_foot[0], near_foot[1], 13, 7, BOOT)
        p.arc(near_foot[0] + 2, near_foot[1] - 2, 8, 4, 200, 320, BOOT_LT, 1.5)
    if view != "side":
        for side in (-1, 1):
            arm_front(p, cx + side * 20, top + 4, side, (sw * side) * 3)
    if view == "front":
        p.poly([(cx - 10, top - 1), (cx + 10, top - 1), (cx, top + 9)], WHITE)    # col
    hy = 70 + bob
    head(p, cx, hy, view)
    hat(p, cx, 4 + bob, {"front": 14, "back": -14, "side": -22}[view], view)
    if view == "side":
        arm_side(p, cx + 2, 104 + bob, sw * 28, ROBE)           # bras avant
    return p.done()

if __name__ == "__main__":
    os.chdir(os.path.join(os.path.dirname(__file__), ".."))
    sheet = Image.new("RGBA", (FW * 4, FH * 4), (0, 0, 0, 0))
    for row, (view, flip) in enumerate([("front", False), ("side", True), ("side", False), ("back", False)]):
        for f in range(4):
            im = frame(view, f)
            if flip: im = im.transpose(Image.FLIP_LEFT_RIGHT)
            sheet.paste(im, (f * FW, row * FH))
    os.makedirs("Assets/Resources", exist_ok=True)
    sheet.save("Assets/Resources/avatar_sheet.png", optimize=True)
    os.makedirs("Assets/Art/Preview", exist_ok=True)
    bg = Image.new("RGBA", sheet.size, (200, 190, 220, 255)); bg.alpha_composite(sheet)
    bg.save("Assets/Art/Preview/avatar_sheet.png")
    print("ok")
