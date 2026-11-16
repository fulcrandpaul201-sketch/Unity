"""Grande salle en .blend (250 x 250 m, 125 m de haut, 16 colonnes de 10 x 5 m à l'intérieur et 16 en vis-à-vis à l'extérieur, reliées par-dessus le mur, ouvertures en arche 16 m x 32 m) : UN seul cube propre (8 sommets, 6 faces) ; le creux et les 2 ouvertures sont des
modificateurs Booléens (formes de découpe modifiables, en fil de fer). Bloc d'échelle 0,5 x 0,5 x 2 m au centre.
Blender (Z vers le haut, mètres). Lancer :  python3.11 avec le module bpy  ->  Assets/Export/grande_salle.blend"""
import os, sys, math
import bpy, bmesh

W, H, T = 250.0, 125.0, 10.0
COL, DEP, NCOL = 10.0, 5.0, 4         # colonnes : 10 m le long du mur, 5 m de saillie, 4 par mur, aucune dans un angle, à écart égal          # largeur, hauteur, épaisseur des parois et du sol
OW, OH, OA = 16.0, 77.0, 8.0           # ouvertures : 16 m de large, côtés droits sur 77 m, puis demi-cercle (rayon 8 m) ; sommet à 95 m, 10 m sous la corniche haute (105 m)
ARC_SEG = 32                          # nombre de segments de l'arrondi
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "Assets", "Export"))

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
scn.unit_settings.system = "METRIC"; scn.unit_settings.scale_length = 1.0

def box(name, x0, x1, y0, y1, z0, z1, origin=(0, 0, 0)):
    """pavé de 8 sommets / 6 faces, origine donnée (échelle 1, aucune transformation à appliquer)"""
    ox, oy, oz = origin
    me = bpy.data.meshes.new(name)
    v = [(x - ox, y - oy, z - oz) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]
    f = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
    me.from_pydata(v, [], f); me.update(); me.validate()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); ob.location = origin
    return ob

def arch(name, y0, y1, origin):
    """forme de découpe d'une ouverture en arche : côtés droits sur OH, puis demi-ellipse (largeur OW, hauteur OA), extrudée en Y"""
    ox, oy, oz = origin
    prof = [(-OW / 2, T), (OW / 2, T), (OW / 2, T + OH)]
    for i in range(1, ARC_SEG):
        t = math.pi * i / ARC_SEG
        prof.append((OW / 2 * math.cos(t), T + OH + OA * math.sin(t)))
    prof.append((-OW / 2, T + OH))
    n = len(prof)
    v = [(x - ox, y - oy, z - oz) for y in (y0, y1) for (x, z) in prof]
    f = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    me = bpy.data.meshes.new(name); me.from_pydata(v, [], f); me.update(); me.validate()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); ob.location = origin
    return ob

def mat(name, rgb):
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]; bsdf.inputs["Base Color"].default_value = (*rgb, 1); bsdf.inputs["Roughness"].default_value = 0.9
    m.diffuse_color = (*rgb, 1)
    return m

col_main = bpy.data.collections.new("Grande_salle"); scn.collection.children.link(col_main)
col_cut = bpy.data.collections.new("Decoupes"); scn.collection.children.link(col_cut)

# le cube : 250 x 250 x 175 m, origine au centre du dessous
a = W / 2
salle = box("Grande_salle", -a, a, -a, a, 0, H); col_main.objects.link(salle)
salle.data.materials.append(mat("Pierre", (0.43, 0.41, 0.37)))

# formes de découpe (fil de fer, invisibles au rendu) : intérieur + 2 ouvertures (avant = -Y, arrière = +Y)
b, o, M = a - T, OW / 2, 5.0          # M : débord pour des découpes franches
cutters = [
    box("Decoupe_interieur", -b, b, -b, b, T, H + M, origin=(0, 0, T)),
    arch("Decoupe_ouverture_avant", -a - M, -b + M, origin=(0, -a, T)),
    arch("Decoupe_ouverture_arriere", b - M, a + M, origin=(0, a, T)),
]
for c in cutters:
    col_cut.objects.link(c); c.display_type = "WIRE"; c.hide_render = True
mod = salle.modifiers.new("Decoupes", "BOOLEAN")
mod.operation = "DIFFERENCE"; mod.operand_type = "COLLECTION"; mod.collection = col_cut; mod.solver = "EXACT"

# repère d'échelle : 0,5 x 0,5 x 2 m posé sur le sol intérieur, au centre
rep = box("Repere_echelle", -0.25, 0.25, -0.25, 0.25, T, T + 2.0, origin=(0, 0, T)); col_main.objects.link(rep)
rep.data.materials.append(mat("Repere", (0.70, 0.05, 0.02)))

# colonnes : un seul maillage (pavé 10 x 10 m) partagé par 16 objets ; modifier l'un modifie toutes les autres
col_cols = bpy.data.collections.new("Colonnes"); scn.collection.children.link(col_cols)
me_col = box("Colonne_maillage", -COL / 2, COL / 2, -DEP / 2, DEP / 2, T, H, origin=(0, 0, T)).data   # x : le long du mur, y : saillie
me_col.name = "Colonne"; me_col.materials.append(bpy.data.materials["Pierre"])
pas = 2 * b / (NCOL + 1)                                # 5 intervalles égaux entre les angles : 46 m
k = 0
for i in range(1, NCOL + 1):
    u = -b + i * pas                                    # position le long du mur
    for (x, y, rz) in ((u, -b + DEP / 2, 0), (u, b - DEP / 2, 0), (-b + DEP / 2, u, 90), (b - DEP / 2, u, 90)):   # avant, arrière, gauche, droite
        k += 1; c = bpy.data.objects.new("Colonne_%02d" % k, me_col); c.location = (x, y, T); c.rotation_euler.z = math.radians(rz)
        col_cols.objects.link(c)
# colonnes extérieures : mêmes dimensions et mêmes positions, en vis-à-vis des intérieures, du sol (0 m) jusqu'en haut
col_ext = bpy.data.collections.new("Colonnes_exterieures"); scn.collection.children.link(col_ext)
me_ext = box("Colonne_ext_maillage", -COL / 2, COL / 2, -DEP / 2, DEP / 2, 0, H).data
me_ext.name = "Colonne_exterieure"; me_ext.materials.append(bpy.data.materials["Pierre"])
ke = 0
for i in range(1, NCOL + 1):
    u = -b + i * pas
    for (x, y, rz) in ((u, -a - DEP / 2, 0), (u, a + DEP / 2, 0), (-a - DEP / 2, u, 90), (a + DEP / 2, u, 90)):
        ke += 1; c = bpy.data.objects.new("Colonne_ext_%02d" % ke, me_ext); c.location = (x, y, 0); c.rotation_euler.z = math.radians(rz)
        col_ext.objects.link(c)
print("colonnes extérieures :", ke)
# ponts : relient chaque colonne intérieure à son vis-à-vis extérieur par-dessus le mur (20 m de long, 10 m de large, 5 m d'épaisseur)
col_pont = bpy.data.collections.new("Ponts"); scn.collection.children.link(col_pont)
L = T + 2 * DEP                                           # 5 + 10 + 5 = 20 m
me_pont = box("Pont_maillage", -COL / 2, COL / 2, -L / 2, L / 2, H, H + DEP, origin=(0, 0, H)).data
me_pont.name = "Pont"; me_pont.materials.append(bpy.data.materials["Pierre"])
kp = 0
mid = a - T / 2                                           # milieu de l'épaisseur du mur
for i in range(1, NCOL + 1):
    u = -b + i * pas
    for (x, y, rz) in ((u, -mid, 0), (u, mid, 0), (-mid, u, 90), (mid, u, 90)):
        kp += 1; c = bpy.data.objects.new("Pont_%02d" % kp, me_pont); c.location = (x, y, H); c.rotation_euler.z = math.radians(rz)
        col_pont.objects.link(c)
print("ponts :", kp, "| longueur", L, "m, épaisseur", DEP, "m")
# corniche : bande de 5 m de saillie et 10 m de haut contre le mur intérieur, 10 m sous le haut (105 -> 115 m), tout autour
# découpée entre les colonnes (rien n'est fusionné) ; les carrés d'angle appartiennent aux murs avant et arrière
col_cor = bpy.data.collections.new("Corniche"); scn.collection.children.link(col_cor)
zc1 = H - 10.0; zc0 = zc1 - 10.0
bords = [-b] + [e for i in range(1, NCOL + 1) for e in (-b + i * pas - COL / 2, -b + i * pas + COL / 2)] + [b]
kc = 0
for j in range(NCOL + 1):
    u0, u1 = bords[2 * j], bords[2 * j + 1]
    v0, v1 = max(u0, -b + DEP), min(u1, b - DEP)          # murs gauche / droite : s'arrêtent aux carrés d'angle
    for (x0, x1, y0, y1) in ((u0, u1, -b, -b + DEP), (u0, u1, b - DEP, b), (-b, -b + DEP, v0, v1), (b - DEP, b, v0, v1)):
        kc += 1; c = box("Corniche_%02d" % kc, x0, x1, y0, y1, zc0, zc1, origin=((x0 + x1) / 2, (y0 + y1) / 2, zc0))
        c.data.materials.append(bpy.data.materials["Pierre"]); col_cor.objects.link(c)
print("corniche :", kc, "morceaux | de", zc0, "à", zc1, "m")
# corniches basses : identiques à celle du haut (10 m de haut, 5 m de saillie), 10 m au-dessus du sol intérieur (20 -> 30 m)
# à l'intérieur et en parallèle à l'extérieur ; rien entre les 2 colonnes centrales des murs avant et arrière (arches)
zb0 = T + 10.0; zb1 = zb0 + 10.0
# + corniche haute extérieure : en parallèle de celle du haut intérieure (105 -> 115 m), tout autour sans coupure
for nom, r0, r1, z0, z1, coupe in (("Corniche_basse_int", b - DEP, b, zb0, zb1, True), ("Corniche_basse_ext", a, a + DEP, zb0, zb1, True),
                                   ("Corniche_haute_ext", a, a + DEP, zc0, zc1, False)):   # r0..r1 : bande en distance au centre
    colb = bpy.data.collections.new(nom); scn.collection.children.link(colb)
    lim = -b if r1 == b else -a - DEP                     # extrémité côté angle (carrés d'angle sur les murs avant / arrière)
    bb = [lim] + bords[1:-1] + [-lim]
    n = 0
    for j in range(NCOL + 1):
        u0, u1 = bb[2 * j], bb[2 * j + 1]
        v0, v1 = max(u0, -r0), min(u1, r0)                # murs gauche / droite : s'arrêtent aux carrés d'angle
        for (x0, x1, y0, y1) in (((u0, u1, -r1, -r0), (u0, u1, r0, r1)) if not (coupe and j == NCOL // 2) else ()) + ((-r1, -r0, v0, v1), (r0, r1, v0, v1)):
            n += 1; c = box("%s_%02d" % (nom, n), x0, x1, y0, y1, z0, z1, origin=((x0 + x1) / 2, (y0 + y1) / 2, z0))
            c.data.materials.append(bpy.data.materials["Pierre"]); colb.objects.link(c)
    print(nom, ":", n, "morceaux | de", z0, "à", z1, "m")
# moulures harpées autour des 2 arches (intérieur + extérieur) : blocs de 5 m de haut, 2,5 m d'épaisseur, 31 blocs (écart ~0,8 m),
# s'avançant dans le mur de 5 m puis 3 m en alternance, tout le tour de l'arche (côtés droits + arrondi en éventail)
MH, MS, MG, ML = 5.0, 2.5, 1.0, (5.0, 3.0)
o = OW / 2
Lc = 2 * OH + math.pi * o                                 # longueur du contour de l'arche
nm = int((Lc + MG) // (MH + MG)) | 1; gm = (Lc - nm * MH) / (nm - 1)   # nombre de blocs, écart réajusté (~1 m)
def contour(t):
    """point du bord de l'arche (x, z) et direction vers le mur, à la distance t le long du contour (départ en bas à gauche)"""
    if t <= OH: return (-o, T + t), (-1.0, 0.0)
    if t >= OH + math.pi * o: return (o, T + OH - (t - OH - math.pi * o)), (1.0, 0.0)
    th = math.pi - (t - OH) / o
    return (o * math.cos(th), T + OH + o * math.sin(th)), (math.cos(th), math.sin(th))
def moulure(name, t0, t1, L, y0, y1):
    ts = [t0] + [t for t in (OH + i * math.pi * o / 32 for i in range(33)) if t0 < t < t1] + [t1]
    pin, pout = [], []
    for t in ts:
        (x, z), (nx, nz) = contour(t); pin.append((x, z)); pout.append((x + L * nx, z + L * nz))
    ring = pin + pout[::-1]; m = len(ring); N = len(ts)
    v = [(x, y0, z) for (x, z) in ring] + [(x, y1, z) for (x, z) in ring]
    f = [tuple(range(m)), tuple(m + i for i in range(m))[::-1]] + [(i, (i + 1) % m, m + (i + 1) % m, m + i) for i in range(m)]
    me = bpy.data.meshes.new(name); me.from_pydata(v, [], f); me.update(); me.validate()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    me.materials.append(bpy.data.materials["Pierre"])
    return bpy.data.objects.new(name, me)
col_moul = bpy.data.collections.new("Moulures"); scn.collection.children.link(col_moul)
km = 0
for nom, y0, y1 in (("avant_ext", -a - MS, -a), ("avant_int", -b, -b + MS), ("arriere_int", b - MS, b), ("arriere_ext", a, a + MS)):
    for i in range(nm):
        t0 = i * (MH + gm)
        ob = moulure("Moulure_%s_%02d" % (nom, i + 1), t0, t0 + MH, ML[min(i, nm - 1 - i) % 2], y0, y1); col_moul.objects.link(ob); km += 1   # nombre impair : alternance symétrique, un seul bloc au sommet
print("moulures :", km, "blocs |", nm, "par face d'arche | écart", round(gm, 3), "m")
print("colonnes :", k, "| centres le long des murs :", [round(-b + i * pas, 2) for i in range(1, NCOL + 1)])
print("mur entre colonne du milieu et ouverture :", round((-b + 3 * pas) - COL / 2 - OW / 2, 3), "m | ouverture :", OW, "m de large,", OH + OA, "m de haut (arrondi à partir de", OH, "m)")

# lumière et caméra pour un premier rendu
sun = bpy.data.objects.new("Soleil", bpy.data.lights.new("Soleil", "SUN")); sun.data.energy = 3
sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(35)); scn.collection.objects.link(sun)
cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera")); cam.data.clip_end = 5000; cam.data.lens = 30
cam.location = (210, -270, 200); scn.collection.objects.link(cam); scn.camera = cam
cam.rotation_euler = (math.radians(62), 0, math.radians(38))
scn.world = bpy.data.worlds.new("Ciel"); scn.world.color = (0.75, 0.78, 0.82)

# vérification : maillage final (après Booléens) étanche, dimensions exactes
dg = bpy.context.evaluated_depsgraph_get()
ev = salle.evaluated_get(dg).to_mesh()
bm = bmesh.new(); bm.from_mesh(ev)
manifold = all(e.is_manifold for e in bm.edges)
xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]; zs = [v.co.z for v in bm.verts]
print("cube de base :", len(salle.data.vertices), "sommets,", len(salle.data.polygons), "faces")
print("après découpes :", len(bm.verts), "sommets,", len(bm.faces), "faces, étanche =", manifold)
print("boîte :", (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs)))
bm.free(); salle.evaluated_get(dg).to_mesh_clear()
assert manifold

# vue 3D à l'ouverture : cadrée sur toute la salle, sans découpage au loin
from mathutils import Euler
n = 0
for scr in bpy.data.screens:
    for area in scr.areas:
        for sp in area.spaces:
            if sp.type == "VIEW_3D":
                sp.clip_end = 5000; sp.clip_start = 0.1
                r3 = sp.region_3d; r3.view_location = (0, 0, 50); r3.view_distance = 620
                r3.view_rotation = Euler((math.radians(62), 0, math.radians(38))).to_quaternion(); n += 1
print("vues 3D réglées :", n)
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "grande_salle.blend"), compress=True)
if os.path.exists(os.path.join(OUT, "grande_salle.blend1")): os.remove(os.path.join(OUT, "grande_salle.blend1"))

if "--render" in sys.argv:                                   # aperçu (Cycles CPU, rapide)
    scn.render.engine = "CYCLES"; scn.cycles.samples = 16; scn.cycles.device = "CPU"
    scn.render.resolution_x, scn.render.resolution_y = 1000, 700
    scn.render.filepath = os.path.join(sys.argv[sys.argv.index("--render") + 1], "salle_ext.png")
    bpy.ops.render.render(write_still=True)
    cam.location = (0, 60, 22); cam.rotation_euler = (math.radians(90), 0, math.radians(180)); cam.data.lens = 24
    scn.render.filepath = os.path.join(sys.argv[sys.argv.index("--render") + 1], "salle_int.png")
    bpy.ops.render.render(write_still=True)
