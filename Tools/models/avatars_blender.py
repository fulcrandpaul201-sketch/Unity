"""5 essais d'avatar (2 m, même direction artistique que le château : pierre, volumes sobres, maillages propres), côte à côte.
Fichier séparé : Assets/Export/avatars.blend (+ aperçu avec --render <dossier>).
  1. Mannequin bloc      : volumes en pavés nets, comme taillés
  2. Mannequin articulé  : segments cylindriques et rotules sphériques (mannequin d'artiste)
  3. Statue lissée       : un seul volume organique continu (métaballes converties en maillage)
  4. Gardien en armure   : base bloc + casque, épaulières, plastron, jambières, lance et bouclier
  5. Moine encapuchonné  : robe, capuche et manches, visage dans l'ombre"""
import os, sys, math
import bpy, bmesh
from mathutils import Vector, Matrix

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "Assets", "Export"))
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
scn.unit_settings.system = "METRIC"

def mat(name, rgb, metal=0.0, rough=0.9):
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1); bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal; m.diffuse_color = (*rgb, 1)
    return m
PIERRE = mat("Pierre", (0.43, 0.41, 0.37))
SOMBRE = mat("Pierre_sombre", (0.22, 0.21, 0.19))
METAL = mat("Metal", (0.36, 0.35, 0.33), metal=0.85, rough=0.45)
TISSU = mat("Tissu", (0.30, 0.27, 0.24), rough=1.0)
OMBRE = mat("Ombre", (0.02, 0.02, 0.02), rough=1.0)

def finish(me, m, name, coll, smooth=False):
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = smooth
    me.materials.append(m); ob = bpy.data.objects.new(name, me); coll.objects.link(ob); return ob

def box(coll, name, c, s, m=PIERRE):
    """pavé centré en c, dimensions s"""
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((c[0] + v.co.x * s[0], c[1] + v.co.y * s[1], c[2] + v.co.z * s[2]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); return finish(me, m, name, coll)

def cyl(coll, name, p1, p2, r1, r2, m=PIERRE, seg=20, smooth=True):
    """tronc de cône de p1 (rayon r1) à p2 (rayon r2)"""
    p1, p2 = Vector(p1), Vector(p2); d = p2 - p1
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=d.length)
    R = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((p1 + p2) / 2) @ R, verts=bm.verts)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); return finish(me, m, name, coll, smooth)

def ovoide(coll, name, c, r, m=PIERRE, seg=24):
    """sphère étirée (rayons r = (rx, ry, rz))"""
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=1.0)
    for v in bm.verts: v.co = Vector((c[0] + v.co.x * r[0], c[1] + v.co.y * r[1], c[2] + v.co.z * r[2]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); return finish(me, m, name, coll, True)

def nouvelle(nom, x):
    coll = bpy.data.collections.new(nom); scn.collection.children.link(coll); return coll, x

# repères du corps (personnage de 2 m, 7,5 têtes) : x = côté, z = hauteur
SH, SHZ = 0.22, 1.60           # demi-largeur d'épaules, hauteur des épaules
ELB, WRI, HAND = 1.28, 1.00, 0.80
HIP, KNEE, ANK = 0.94, 0.52, 0.09
HX = 0.10                      # écart des hanches

def membres(coll, x, f_seg, f_joint=None):
    """bras et jambes : f_seg(nom, p1, p2, r1, r2), f_joint(nom, c, r)"""
    for s, cote in ((-1, "g"), (1, "d")):
        sh, el, wr, ha = (x + s * SH, 0, SHZ - 0.03), (x + s * 0.26, 0.02, ELB), (x + s * 0.28, 0.03, WRI), (x + s * 0.29, 0.04, HAND)
        hp, kn, an = (x + s * HX, 0, HIP), (x + s * 0.11, 0.01, KNEE), (x + s * 0.11, 0, ANK)
        f_seg("bras_" + cote, sh, el, 0.055, 0.045); f_seg("avant_bras_" + cote, el, wr, 0.045, 0.034)
        f_seg("cuisse_" + cote, hp, kn, 0.085, 0.058); f_seg("jambe_" + cote, kn, an, 0.056, 0.038)
        if f_joint:
            for nom, c, r in (("epaule", sh, 0.06), ("coude", el, 0.048), ("poignet", wr, 0.036), ("hanche", hp, 0.085),
                              ("genou", kn, 0.06), ("cheville", an, 0.04)):
                f_joint(nom + "_" + cote, c, r)
        yield s, cote, wr, ha, an

# ---------- 1. Mannequin bloc ----------
c1, x = nouvelle("1_Mannequin_bloc", -4.0)
box(c1, "tete", (x, 0, 1.86), (0.18, 0.21, 0.24)); box(c1, "cou", (x, 0, 1.70), (0.09, 0.09, 0.10))
box(c1, "torse", (x, 0, 1.44), (0.42, 0.23, 0.34)); box(c1, "ventre", (x, 0, 1.17), (0.32, 0.19, 0.20))
box(c1, "bassin", (x, 0, 1.00), (0.36, 0.21, 0.16))
def seg_bloc(nom, p1, p2, r1, r2):
    p1, p2 = Vector(p1), Vector(p2); r = (r1 + r2)
    o = cyl(c1, nom, p1, p2, r1 * 1.05, r2 * 1.05, seg=4, smooth=False); o.rotation_euler.z = 0  # section carrée
for s, cote, wr, ha, an in membres(c1, x, seg_bloc):
    box(c1, "main_" + cote, (ha[0], ha[1], (wr[2] + ha[2]) / 2 - 0.02), (0.05, 0.09, 0.18))
    box(c1, "pied_" + cote, (an[0], -0.06, 0.04), (0.10, 0.26, 0.08))

# ---------- 2. Mannequin articulé ----------
c2, x = nouvelle("2_Mannequin_articule", -2.0)
ovoide(c2, "tete", (x, 0, 1.86), (0.095, 0.11, 0.125)); cyl(c2, "cou", (x, 0, 1.64), (x, 0, 1.76), 0.045, 0.042)
ovoide(c2, "torse", (x, 0, 1.43), (0.20, 0.12, 0.19)); ovoide(c2, "bassin", (x, 0, 1.02), (0.17, 0.11, 0.11))
cyl(c2, "taille", (x, 0, 1.08), (x, 0, 1.28), 0.10, 0.13)
for s, cote, wr, ha, an in membres(c2, x, lambda n, a_, b_, r1, r2: cyl(c2, n, a_, b_, r1, r2),
                                   lambda n, c, r: ovoide(c2, n, c, (r, r, r), SOMBRE, 16)):
    ovoide(c2, "main_" + cote, (ha[0], ha[1], (wr[2] + ha[2]) / 2 - 0.02), (0.03, 0.05, 0.09))
    ovoide(c2, "pied_" + cote, (an[0], -0.06, 0.045), (0.05, 0.13, 0.045))

# ---------- 3. Statue lissée : volumes qui se chevauchent, fondus en un seul maillage (remaillage voxel + lissage) ----------
c3, x = nouvelle("3_Statue_lissee", 0.0)
tmp = bpy.data.collections.new("tmp_statue"); scn.collection.children.link(tmp)
ovoide(tmp, "tete", (x, 0, 1.86), (0.10, 0.115, 0.13)); cyl(tmp, "cou", (x, 0, 1.62), (x, 0, 1.80), 0.055, 0.05)
ovoide(tmp, "torse", (x, 0, 1.44), (0.21, 0.125, 0.20)); ovoide(tmp, "taille", (x, 0, 1.20), (0.155, 0.10, 0.16))
ovoide(tmp, "bassin", (x, 0, 1.01), (0.18, 0.115, 0.12))
for s_, cote, wr, ha, an in membres(tmp, x, lambda n, a_, b_, r1, r2: cyl(tmp, n, a_, b_, r1 * 1.1, r2 * 1.1),
                                    lambda n, c, r: ovoide(tmp, n, c, (r * 1.1,) * 3, PIERRE, 16)):
    ovoide(tmp, "main_" + cote, (ha[0], ha[1], (wr[2] + ha[2]) / 2 - 0.02), (0.035, 0.055, 0.095))
    ovoide(tmp, "pied_" + cote, (an[0], -0.06, 0.045), (0.055, 0.13, 0.05))
bmj = bmesh.new()
for o in list(tmp.objects):
    bmj.from_mesh(o.data); bpy.data.objects.remove(o)
bpy.data.collections.remove(tmp)
mej = bpy.data.meshes.new("Statue_brut"); bmj.to_mesh(mej); bmj.free()
st = bpy.data.objects.new("Statue_brut", mej); c3.objects.link(st)
rm = st.modifiers.new("fondu", "REMESH"); rm.mode = "VOXEL"; rm.voxel_size = 0.012
sm = st.modifiers.new("lissage", "CORRECTIVE_SMOOTH"); sm.iterations = 12; sm.smooth_type = "LENGTH_WEIGHTED"; sm.use_only_smooth = True
dc = st.modifiers.new("allege", "DECIMATE"); dc.ratio = 0.35
dg = bpy.context.evaluated_depsgraph_get()
me3 = bpy.data.meshes.new_from_object(st.evaluated_get(dg)); bpy.data.objects.remove(st); bpy.data.meshes.remove(mej)
me3.materials.clear(); st = finish(me3, PIERRE, "Statue", c3, True)
print("statue :", len(me3.vertices), "sommets,", len(me3.polygons), "faces")

# ---------- 4. Gardien en armure ----------
c4, x = nouvelle("4_Gardien_armure", 2.0)
box(c4, "casque", (x, 0, 1.87), (0.22, 0.25, 0.28), METAL); box(c4, "visiere", (x, -0.126, 1.87), (0.16, 0.01, 0.03), OMBRE)
box(c4, "cimier", (x, 0, 2.03), (0.03, 0.22, 0.06), METAL); box(c4, "cou", (x, 0, 1.70), (0.12, 0.12, 0.10), SOMBRE)
box(c4, "plastron", (x, -0.005, 1.43), (0.48, 0.28, 0.38), METAL); box(c4, "ventriere", (x, 0, 1.16), (0.38, 0.23, 0.20), METAL)
box(c4, "ceinture", (x, 0, 1.05), (0.42, 0.26, 0.05), SOMBRE)
for s in (-1, 1):
    box(c4, "epauliere_%d" % s, (x + s * 0.27, 0, 1.60), (0.18, 0.24, 0.10), METAL)
    box(c4, "epauliere2_%d" % s, (x + s * 0.30, 0, 1.53), (0.14, 0.22, 0.08), METAL)
    box(c4, "tassette_%d" % s, (x + s * 0.11, -0.01, 0.94), (0.17, 0.25, 0.18), METAL)
def seg_armure(nom, p1, p2, r1, r2):
    m = METAL if nom.startswith(("avant_bras", "jambe")) else SOMBRE
    k = 1.45 if m is METAL else 1.1
    cyl(c4, nom, p1, p2, r1 * k, r2 * k, m, seg=8, smooth=False)
for s, cote, wr, ha, an in membres(c4, x, seg_armure):
    box(c4, "gantelet_" + cote, (ha[0], ha[1], (wr[2] + ha[2]) / 2 - 0.02), (0.07, 0.10, 0.18), METAL)
    box(c4, "soleret_" + cote, (an[0], -0.06, 0.045), (0.12, 0.28, 0.09), METAL)
cyl(c4, "lance", (x + 0.29, 0.04, 0.0), (x + 0.29, 0.04, 2.55), 0.018, 0.018, SOMBRE, 12)
cyl(c4, "fer_de_lance", (x + 0.29, 0.04, 2.55), (x + 0.29, 0.04, 2.80), 0.04, 0.0, METAL, 4, False)
box(c4, "bouclier", (x - 0.36, -0.02, 1.15), (0.05, 0.55, 0.75), METAL); box(c4, "umbo", (x - 0.39, -0.02, 1.15), (0.02, 0.16, 0.16), SOMBRE)

# ---------- 5. Moine encapuchonné ----------
c5, x = nouvelle("5_Moine_capuche", 4.0)
cyl(c5, "robe", (x, 0, 0.0), (x, 0, 1.50), 0.42, 0.21, TISSU, 32)
cyl(c5, "pelerine", (x, 0, 1.30), (x, 0, 1.64), 0.31, 0.17, TISSU, 32)
ovoide(c5, "capuche", (x, 0.02, 1.84), (0.15, 0.16, 0.19), TISSU, 32)
cyl(c5, "pointe_capuche", (x, 0.08, 1.88), (x, 0.24, 1.62), 0.10, 0.0, TISSU, 16)
ovoide(c5, "visage_ombre", (x, -0.09, 1.81), (0.105, 0.075, 0.135), OMBRE, 24)
box(c5, "ceinture", (x, 0, 1.08), (0.40, 0.33, 0.04), SOMBRE)
for s in (-1, 1):                                          # manches : épaule -> coude, puis vers l'avant où elles se rejoignent
    cyl(c5, "manche_haut_%d" % s, (x + s * 0.22, 0, 1.56), (x + s * 0.25, -0.04, 1.26), 0.075, 0.09, TISSU, 20)
    ovoide(c5, "coude_%d" % s, (x + s * 0.25, -0.04, 1.26), (0.09, 0.09, 0.09), TISSU, 20)
    cyl(c5, "manche_bas_%d" % s, (x + s * 0.25, -0.04, 1.26), (x + s * 0.03, -0.25, 1.20), 0.09, 0.12, TISSU, 20)

# ---------- sol, repère d'échelle, lumière, caméra ----------
cg = bpy.data.collections.new("Decor"); scn.collection.children.link(cg)
box(cg, "Sol", (0, 0, -0.05), (12, 6, 0.1), PIERRE)
box(cg, "Repere_2m", (5.4, 0.6, 1.0), (0.5, 0.5, 2.0), mat("Repere", (0.70, 0.05, 0.02)))
sun = bpy.data.objects.new("Soleil", bpy.data.lights.new("Soleil", "SUN")); sun.data.energy = 2.5
sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-30)); scn.collection.objects.link(sun)
scn.world = bpy.data.worlds.new("Ciel"); scn.world.color = (0.85, 0.85, 0.85)
cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera")); cam.data.lens = 35
cam.location = (0.4, -11.5, 1.6); cam.rotation_euler = (math.radians(88), 0, math.radians(2)); scn.collection.objects.link(cam); scn.camera = cam
for coll in bpy.data.collections:
    if coll.name[0].isdigit(): print(coll.name, ":", len(coll.objects), "objets")
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "avatars.blend"), compress=True)
if os.path.exists(os.path.join(OUT, "avatars.blend1")): os.remove(os.path.join(OUT, "avatars.blend1"))
if "--render" in sys.argv:
    d = sys.argv[sys.argv.index("--render") + 1]
    scn.render.engine = "CYCLES"; scn.cycles.samples = 32; scn.cycles.device = "CPU"
    scn.render.resolution_x, scn.render.resolution_y = 1800, 760
    scn.render.filepath = os.path.join(d, "avatars.png"); bpy.ops.render.render(write_still=True)
