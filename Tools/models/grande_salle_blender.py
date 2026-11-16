"""Grande salle en .blend (250 x 250 m, 125 m de haut, 16 colonnes de 10 x 5 m, ouvertures 16 x 16 m) : UN seul cube propre (8 sommets, 6 faces) ; le creux et les 2 ouvertures sont des
modificateurs Booléens (formes de découpe modifiables, en fil de fer). Bloc d'échelle 0,5 x 0,5 x 2 m au centre.
Blender (Z vers le haut, mètres). Lancer :  python3.11 avec le module bpy  ->  Assets/Export/grande_salle.blend"""
import os, sys, math
import bpy, bmesh

W, H, T = 250.0, 125.0, 10.0
COL, DEP, NCOL = 10.0, 5.0, 4         # colonnes : 10 m le long du mur, 5 m de saillie, 4 par mur, aucune dans un angle, à écart égal          # largeur, hauteur, épaisseur des parois et du sol
OW = OH = 16.0                        # ouvertures carrées : 10 m de mur entre leur bord et le bord des colonnes du milieu
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
    box("Decoupe_ouverture_avant", -o, o, -a - M, -b + M, T, T + OH, origin=(0, -a, T)),
    box("Decoupe_ouverture_arriere", -o, o, b - M, a + M, T, T + OH, origin=(0, a, T)),
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
print("colonnes :", k, "| centres le long des murs :", [round(-b + i * pas, 2) for i in range(1, NCOL + 1)])
print("mur entre colonne du milieu et ouverture :", round((-b + 3 * pas) - COL / 2 - OW / 2, 3), "m | ouverture :", OW, "x", OH, "m")

# lumière et caméra pour un premier rendu
sun = bpy.data.objects.new("Soleil", bpy.data.lights.new("Soleil", "SUN")); sun.data.energy = 3
sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(35)); scn.collection.objects.link(sun)
cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera")); cam.data.clip_end = 5000; cam.data.lens = 30
cam.location = (330, -420, 260); scn.collection.objects.link(cam); scn.camera = cam
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
    cam.location = (30, 80, 20); cam.rotation_euler = (math.radians(86), 0, math.radians(180)); cam.data.lens = 18
    scn.render.filepath = os.path.join(sys.argv[sys.argv.index("--render") + 1], "salle_int.png")
    bpy.ops.render.render(write_still=True)
