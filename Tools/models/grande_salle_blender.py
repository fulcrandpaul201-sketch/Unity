"""Grande salle en .blend (250 x 250 m, 125 m de haut, 16 colonnes de 10 x 5 m à l'intérieur et 16 en vis-à-vis à l'extérieur, reliées par-dessus le mur, ouvertures en arche 16 m x 32 m) : UN seul cube propre (8 sommets, 6 faces) ; le creux et les 2 ouvertures sont des
modificateurs Booléens (formes de découpe modifiables, en fil de fer). Bloc d'échelle 0,5 x 0,5 x 2 m au centre.
Blender (Z vers le haut, mètres). Lancer :  python3.11 avec le module bpy  ->  Assets/Export/grande_salle.blend"""
import os, sys, math
import bpy, bmesh

W, H, T = 270.0, 125.0, 10.0          # cour : 250 x 250 m navigables + murs de 10 m
COL, DEP, NCOL = 10.0, 5.0, 4         # colonnes : 10 m le long du mur, 5 m de saillie, 4 par mur, aucune dans un angle, à écart égal          # largeur, hauteur, épaisseur des parois et du sol
OW, OH, OA = 20.0, 75.0, 10.0          # ouvertures : 20 m de large (10 m de mur jusqu'aux colonnes du milieu), côtés droits sur 75 m, puis demi-cercle (rayon 10 m) ; sommet à 95 m, 10 m sous la corniche haute (105 m)
ESCALIERS = False                     # escaliers, piliers et paliers surélevés de la salle couverte : retirés (configuration gardée)
ARCHES_COTE = False                   # arches de côté de l'enceinte (vers les salles de classe) et leurs moulures : retirées (configuration gardée)
SALLES_COTE = False                   # salles carrées derrière les arches de côté : retirées pour l'instant (configuration gardée) ; True pour les remettre
PLACE_SALLES = SALLES_COTE            # colonnes / corniches de côté de l'enceinte : remises tant que les salles sont retirées
TOIT = True                           # toits de la salle couverte et des salles carrées (10 m, de 115 à 125 m) ; False pour les retirer
OUVERTURES = True                     # True : arches et fenêtres ; False pour les retirer (configuration gardée ci-dessous)
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

def arch(name, y0, y1, origin, zb=T, hs=OH, bas_rond=False):
    """forme de découpe d'une ouverture en arche (bas zb) : côtés droits sur hs, puis demi-ellipse (largeur OW, hauteur OA), extrudée en Y ;
    bas_rond : le bas est aussi arrondi (demi-cercle de zb à zb + OA, côtés droits de zb + OA à zb + hs)"""
    ox, oy, oz = origin
    if bas_rond:
        prof = [(OW / 2 * math.cos(t), zb + OA + OA * math.sin(t)) for t in (math.pi + math.pi * i / ARC_SEG for i in range(1, ARC_SEG))]
        prof += [(OW / 2, zb + OA), (OW / 2, zb + hs)]
    else:
        prof = [(-OW / 2, zb), (OW / 2, zb), (OW / 2, zb + hs)]
    for i in range(1, ARC_SEG):
        t = math.pi * i / ARC_SEG
        prof.append((OW / 2 * math.cos(t), zb + hs + OA * math.sin(t)))
    prof.append((-OW / 2, zb + hs))
    if bas_rond: prof.append((-OW / 2, zb + OA))
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
SOL_NAV, SOL_MUR = 75.0, 10.0
RE, RO = a + SOL_NAV, a + SOL_NAV + SOL_MUR                  # faces intérieure et extérieure du mur d'enceinte
RXO = 920.0; IMX = range(-15, 21)                        # mur extérieur : face extérieure de 1 840 m, 36 piliers par côté
EP_MX = 25.0; RXI = RXO - EP_MX                           # épaisseur 25 m : face intérieure de 1 790 m = 35 piliers de 10 m + 36 panneaux de 40 m
CMXI = [-RXI + 45.0 + 50.0 * k for k in range(35)]       # centres des piliers intérieurs (-850 ... 850 m, un au centre)
cutters = [
    box("Decoupe_interieur", -b, b, -b, b, T, H + M, origin=(0, 0, T)),
] + ([
    arch("Decoupe_ouverture_avant", -a - M, -b + M, origin=(0, -a, T)),
    arch("Decoupe_ouverture_arriere", b - M, a + M, origin=(0, a, T)),
] if OUVERTURES else [])
for c in cutters:
    col_cut.objects.link(c); c.display_type = "WIRE"; c.hide_render = True
def coupe_croix(ob):
    """coupe droite du maillage par les plans x = 0 et y = 0 (passent au milieu des arches et des fenêtres) : aucun trou au milieu d'une face"""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    for no in ((1, 0, 0), (0, 1, 0)):
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=no)
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
if OUVERTURES:
    coupe_croix(salle); coupe_croix(cutters[0])
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
# colonnes extérieures : déplacées sur la face extérieure du mur d'enceinte, dans l'axe des colonnes intérieures, du bas du mur (0 m) jusqu'en haut
col_ext = bpy.data.collections.new("Colonnes_exterieures"); scn.collection.children.link(col_ext)
me_ext = box("Colonne_ext_maillage", -COL / 2, COL / 2, -DEP / 2, DEP / 2, T, H, origin=(0, 0, T)).data   # posées sur le sol extérieur (10 m)
me_ext.name = "Colonne_exterieure"; me_ext.materials.append(bpy.data.materials["Pierre"])
ke = 0
IEXT = range(-1, NCOL + 3)                                # 8 par côté : les 4 dans l'axe des colonnes intérieures + 2 de chaque côté, même pas que les colonnes intérieures
for i in IEXT:
    u = -b + i * pas
    for (x, y, rz) in ((u, -RO - DEP / 2, 0), (u, RO + DEP / 2, 0)) + (() if PLACE_SALLES else ((-RO - DEP / 2, u, 90), (RO + DEP / 2, u, 90))):   # face extérieure du mur d'enceinte (murs de côté : remplacées par les salles carrées)
        ke += 1; c = bpy.data.objects.new("Colonne_ext_%02d" % ke, me_ext); c.location = (x, y, T); c.rotation_euler.z = math.radians(rz)
        col_ext.objects.link(c)
print("colonnes extérieures :", ke)
# ponts : relient chaque colonne intérieure à son vis-à-vis extérieur (sur le mur d'enceinte) par-dessus le mur, le toit et l'enceinte (105 m de long, 10 m de large, 5 m d'épaisseur)
col_pont = bpy.data.collections.new("Ponts"); scn.collection.children.link(col_pont)
L = (RO + DEP) - (b - DEP)                                # de la colonne intérieure (110 m) à la colonne extérieure de l'enceinte (215 m) : 105 m
me_pont = box("Pont_maillage", -COL / 2, COL / 2, -L / 2, L / 2, H, H + DEP, origin=(0, 0, H)).data
me_pont.name = "Pont"; me_pont.materials.append(bpy.data.materials["Pierre"])
kp = 0
mid = ((RO + DEP) + (b - DEP)) / 2                        # milieu du pont (162,5 m du centre)
for i in range(1, NCOL + 1):
    u = -b + i * pas
    for (x, y, rz) in ((u, -mid, 0), (u, mid, 0), (-mid, u, 90), (mid, u, 90)):
        kp += 1; c = bpy.data.objects.new("Pont_%02d" % kp, me_pont); c.location = (x, y, H); c.rotation_euler.z = math.radians(rz)
        col_pont.objects.link(c)
print("ponts :", kp, "| longueur", L, "m, épaisseur", DEP, "m")
# corniches : bandes de 5 m de saillie et 10 m de haut, découpées entre les colonnes ; dans chaque angle, un seul objet en L
#   haute intérieure (105 -> 115 m, 10 m sous le haut) et haute extérieure en parallèle, tout autour
#   basses intérieure et extérieure (20 -> 30 m, 10 m au-dessus du sol intérieur), rien entre les 2 colonnes centrales avant / arrière (arches)
zc1 = H - 10.0; zc0 = zc1 - 10.0
zb0 = T + 10.0; zb1 = zb0 + 10.0
bords = [-b] + [e for i in range(1, NCOL + 1) for e in (-b + i * pas - COL / 2, -b + i * pas + COL / 2)] + [b]
E = -bords[1]                                             # distance au centre du bord de la première colonne (74 m)
bords_mx = [-RXO - DEP] + [e for i in IMX for e in (-b + i * pas - COL / 2, -b + i * pas + COL / 2)] + [RXO + DEP]   # piliers du mur extérieur
bords_mxi = [-RXI] + [e for c_ in CMXI for e in (c_ - COL / 2, c_ + COL / 2)] + [RXI]   # piliers de la face intérieure du mur extérieur
bords_ext = [-RO - DEP] + [e for i in IEXT for e in (-b + i * pas - COL / 2, -b + i * pas + COL / 2)] + [RO + DEP]   # colonnes de l'enceinte
def prisme(name, poly, z0, z1):
    """polygone (x, y) extrudé de z0 à z1 : une seule forme, sans arête superflue"""
    cx = sum(p[0] for p in poly) / len(poly); cy = sum(p[1] for p in poly) / len(poly); m = len(poly)
    v = [(x - cx, y - cy, 0.0) for x, y in poly] + [(x - cx, y - cy, z1 - z0) for x, y in poly]
    f = [tuple(range(m)), tuple(range(m, 2 * m))] + [(i, (i + 1) % m, m + (i + 1) % m, m + i) for i in range(m)]
    me = bpy.data.meshes.new(name); me.from_pydata(v, [], f); me.update(); me.validate()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); ob.location = (cx, cy, z0)
    return ob
for nom, r0, r1, z0, z1, coupe in (("Corniche", b - DEP, b, zc0, zc1, False), ("Corniche_haute_ext", RO, RO + DEP, zc0, zc1, False),
                                   ("Corniche_basse_int", b - DEP, b, zb0, zb1, True), ("Corniche_basse_ext", RO, RO + DEP, zb0, zb1, True),
                                   ("Corniche_haute_mur_ext", RXO, RXO + DEP, zc0, zc1, False), ("Corniche_basse_mur_ext", RXO, RXO + DEP, zb0, zb1, False),
                                   ("Corniche_haute_mur_int", RXI - DEP, RXI, zc0, zc1, False), ("Corniche_basse_mur_int", RXI - DEP, RXI, zb0, zb1, False)):
    colb = bpy.data.collections.new(nom); scn.collection.children.link(colb)   # r0..r1 : bande en distance au centre
    n = 0
    def ajoute(ob):
        global n
        n += 1; ob.name = ob.data.name = "%s_%02d" % (nom, n)
        ob.data.materials.append(bpy.data.materials["Pierre"]); colb.objects.link(ob)
    bb = bords_mxi if r1 == RXI else (bords_mx if r0 >= RXO else (bords_ext if r0 >= RO else bords)); Eb = -bb[1]
    for j in range(1, len(bb) // 2 - 1):                  # morceaux entre colonnes (hors angles)
        u0, u1 = bb[2 * j], bb[2 * j + 1]
        cotes_ = ((-r1, -r0, u0, u1), (r0, r1, u0, u1))
        if r0 < RO and u0 < 0 < u1:                       # cour, murs de côté : pas de bande dans la travée de la fenêtre
            cotes_ = ()
        if PLACE_SALLES and r0 == RO:                      # murs de côté de l'enceinte : seulement entre les 2 salles carrées (-23 -> 23 m)
            cotes_ = ((-r1, -r0, -8.0, 8.0), (r0, r1, -8.0, 8.0)) if u0 < 0 < u1 else ()
        for (x0, x1, y0, y1) in (((u0, u1, -r1, -r0), (u0, u1, r0, r1)) if not (coupe and u0 < 0 < u1) else ()) + cotes_:
            ajoute(box("tmp", x0, x1, y0, y1, z0, z1, origin=((x0 + x1) / 2, (y0 + y1) / 2, z0)))
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):   # angles : une seule forme en L
        Ec = 176.0 if (PLACE_SALLES and r0 == RO) else Eb # mur de côté : la branche s'arrête contre la salle carrée
        L_ = [(Eb, r0), (r0, r0), (r0, Ec), (r1, Ec), (r1, r1), (Eb, r1)]   # L : bande du mur avant/arrière + bande du mur de côté
        ajoute(prisme("tmp", [(sx * x, sy * y) for x, y in L_], z0, z1))
    print(nom, ":", n, "morceaux | de", z0, "à", z1, "m")
# arrondis (congés) de 5 x 5 m dans la cour : à chaque jonction pilier / corniche intérieure, au-dessus et au-dessous de la bande,
# des deux côtés du pilier (là où la bande existe), sur toute la saillie (5 m) ; quart de cercle concave de 5 m de rayon ; objets séparés
RA, NSEG = 5.0, 8
col_arr = bpy.data.collections.new("Arrondis"); scn.collection.children.link(col_arr)
prof_a = [(0.0, 0.0), (RA, 0.0)] + [(RA + RA * math.cos(th), RA + RA * math.sin(th)) for th in
          (-math.pi / 2 - (math.pi / 2) * i / NSEG for i in range(1, NSEG))] + [(0.0, RA)]
def arrondi(name, mur, u_bord, du, z_face, dz):
    """congé : profil (s le long du mur depuis le bord du pilier, t vertical depuis la face de la bande) extrudé sur la saillie w = 0..DEP"""
    def pt(s_, t_, w):
        u, z = u_bord + du * s_, z_face + dz * t_
        return {"avant": (u, -b + w, z), "arriere": (u, b - w, z), "gauche": (-b + w, u, z), "droite": (b - w, u, z),
                "avant_ext": (u, -RO - w, z), "arriere_ext": (u, RO + w, z), "gauche_ext": (-RO - w, u, z), "droite_ext": (RO + w, u, z),
                "avant_mx": (u, -RXO - w, z), "arriere_mx": (u, RXO + w, z), "gauche_mx": (-RXO - w, u, z), "droite_mx": (RXO + w, u, z),
                "avant_mxi": (u, -RXI + w, z), "arriere_mxi": (u, RXI - w, z), "gauche_mxi": (-RXI + w, u, z), "droite_mxi": (RXI - w, u, z)}[mur]
    m = len(prof_a)
    v = [pt(s_, t_, 0.0) for s_, t_ in prof_a] + [pt(s_, t_, DEP) for s_, t_ in prof_a]
    f = [tuple(range(m)), tuple(range(m, 2 * m))] + [(i, (i + 1) % m, m + (i + 1) % m, m + i) for i in range(m)]
    me = bpy.data.meshes.new(name); me.from_pydata(v, [], f); me.update(); me.validate()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    me.materials.append(bpy.data.materials["Pierre"]); ob = bpy.data.objects.new(name, me); col_arr.objects.link(ob); return ob
ka = 0
for i in range(1, NCOL + 1):
    u = -b + i * pas
    for mur in ("avant", "arriere", "gauche", "droite"):
        for du in (-1, 1):
            u_bord = u + du * COL / 2
            for bande, zb_, zh_, coupe in (("haute", zc0, zc1, False), ("basse", zb0, zb1, True)):
                if coupe and mur in ("avant", "arriere") and abs(u) < pas and du * u < 0:
                    continue                              # pas de bande basse devant les arches
                if mur in ("gauche", "droite") and abs(u) < pas and du * u < 0:
                    continue                              # pas de bande dans la travée de la fenêtre
                for z_face, dz, pos in ((zh_, 1, "dessus"), (zb_, -1, "dessous")):
                    ka += 1; arrondi("Arrondi_%s_%d_%s_%s_%s" % (mur, round(u), "d" if du > 0 else "g", bande, pos), mur, u_bord, du, z_face, dz)
# mêmes arrondis à l'extérieur : colonnes de l'enceinte / corniches extérieures (bande basse coupée devant les arches avant / arrière)
for i in IEXT:
    u = -b + i * pas
    for mur in ("avant_ext", "arriere_ext") + (() if PLACE_SALLES else ("gauche_ext", "droite_ext")):
        for du in (-1, 1):
            u_bord = u + du * COL / 2
            for bande, zb_, zh_, coupe in (("haute", zc0, zc1, False), ("basse", zb0, zb1, True)):
                if coupe and mur in ("avant_ext", "arriere_ext") and abs(u) < pas and du * u < 0:
                    continue                              # pas de bande basse devant les arches
                for z_face, dz, pos in ((zh_, 1, "dessus"), (zb_, -1, "dessous")):
                    ka += 1; arrondi("Arrondi_%s_%d_%s_%s_%s" % (mur, round(u), "d" if du > 0 else "g", bande, pos), mur, u_bord, du, z_face, dz)
# mêmes arrondis sur le mur extérieur (piliers / corniches de sa face extérieure, pas d'ouverture donc partout)
for i in IMX:
    u = -b + i * pas
    for mur in ("avant_mx", "arriere_mx", "gauche_mx", "droite_mx"):
        for du in (-1, 1):
            for bande, zb_, zh_ in (("haute", zc0, zc1), ("basse", zb0, zb1)):
                for z_face, dz, pos in ((zh_, 1, "dessus"), (zb_, -1, "dessous")):
                    ka += 1; arrondi("Arrondi_%s_%d_%s_%s_%s" % (mur, round(u), "d" if du > 0 else "g", bande, pos), mur, u + du * COL / 2, du, z_face, dz)
for u in CMXI:                                            # face intérieure du mur extérieur
    for mur in ("avant_mxi", "arriere_mxi", "gauche_mxi", "droite_mxi"):
        for du in (-1, 1):
            for bande, zb_, zh_ in (("haute", zc0, zc1), ("basse", zb0, zb1)):
                for z_face, dz, pos in ((zh_, 1, "dessus"), (zb_, -1, "dessous")):
                    ka += 1; arrondi("Arrondi_%s_%d_%s_%s_%s" % (mur, round(u), "d" if du > 0 else "g", bande, pos), mur, u + du * COL / 2, du, z_face, dz)
print("arrondis :", ka, "| rayon", RA, "m")
# moulures harpées autour des 2 arches (intérieur + extérieur) : blocs de 5 m de haut, 2,5 m d'épaisseur, 31 blocs (écart ~0,8 m),
# s'avançant dans le mur de 5 m puis 3 m en alternance, tout le tour de l'arche (côtés droits + arrondi en éventail)
MH, MS, MG, ML = 5.0, 2.5, 1.0, (5.0, 3.0)
o = OW / 2
Lc = 2 * OH + math.pi * o                                 # longueur du contour de l'arche
nm = int((Lc + MG) // (MH + MG)) | 1; gm = (Lc - nm * MH) / (nm - 1)   # nombre de blocs, écart réajusté (~1 m)
def contour(t, zb=T, hs=OH):
    """point du bord de l'arche (x, z) et direction vers le mur, à la distance t le long du contour (départ en bas à gauche)"""
    if t <= hs: return (-o, zb + t), (-1.0, 0.0)
    if t >= hs + math.pi * o: return (o, zb + hs - (t - hs - math.pi * o)), (1.0, 0.0)
    th = math.pi - (t - hs) / o
    return (o * math.cos(th), zb + hs + o * math.sin(th)), (math.cos(th), math.sin(th))
def moulure(name, t0, t1, L, y0, y1, zb=T, hs=OH):
    ts = [t0] + [t for t in (hs + i * math.pi * o / 32 for i in range(33)) if t0 < t < t1] + [t1]
    pin, pout = [], []
    for t in ts:
        (x, z), (nx, nz) = contour(t, zb, hs); pin.append((x, z)); pout.append((x + L * nx, z + L * nz))
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
# fenêtres sans moulure : une seule par mur sans ouverture (murs gauche et droite), centrée, même forme que les arches :
# 16 m de large, bas 10 m au-dessus de la corniche basse (40 m), sommet 10 m sous la corniche haute (95 m), arrondie en bas (40 -> 48 m) et en haut (87 -> 95 m)
FZ = zb1 + 10.0; FH = T + OH - FZ
for nom, rz in ((("Decoupe_fenetre_gauche", -90), ("Decoupe_fenetre_droite", 90)) if OUVERTURES else ()):
    c = arch(nom, -a - M, -b + M, origin=(0, 0, FZ), zb=FZ, hs=FH, bas_rond=True); c.rotation_euler.z = math.radians(rz)
    col_cut.objects.link(c); c.display_type = "WIRE"; c.hide_render = True
print("fenêtres : 2 (murs gauche et droite) |", OW, "m de large, de", FZ, "à", FZ + FH + OA, "m")
# barreaux des 2 fenêtres de la cour : 3 verticaux, section 1 x 1 m, au milieu de l'épaisseur du mur,
# espacés régulièrement (3,25 m de vide) ; les verticaux vont jusqu'aux arrondis (bout ancré dans le mur) ; objets séparés
BARREAUX = False                                          # barreaux retirés (configuration gardée) ; True pour les remettre
if OUVERTURES and BARREAUX:
    col_bar = bpy.data.collections.new("Barreaux"); scn.collection.children.link(col_bar)
    BS = 1.0; vide = (OW - 3 * BS) / 4                    # 3,25 m
    zc_bas, zc_haut = FZ + OA, FZ + FH                    # centres des arrondis du bas (48 m) et du haut (87 m)
    kb = 0
    for sx, cote in ((-1, "gauche"), (1, "droite")):
        xc = sx * (a - T / 2)                             # milieu de l'épaisseur du mur (±120 m)
        for i in range(3):
            yc_ = -OW / 2 + vide + BS / 2 + i * (BS + vide)          # -4,25 / 0 / 4,25 m
            h = math.sqrt(o * o - yc_ * yc_)              # hauteur de l'arrondi au droit du barreau
            bb_ = box("Barreau_%s_%d" % (cote, i + 1), xc - BS / 2, xc + BS / 2, yc_ - BS / 2, yc_ + BS / 2, zc_bas - h, zc_haut + h, origin=(xc, yc_, zc_bas - h))
            bb_.data.materials.append(bpy.data.materials["Pierre"]); col_bar.objects.link(bb_); kb += 1
    print("barreaux :", kb, "| section", BS, "m | vide", vide, "m")
print("colonnes :", k, "| centres le long des murs :", [round(-b + i * pas, 2) for i in range(1, NCOL + 1)])
print("mur entre colonne du milieu et ouverture :", round((-b + 3 * pas) - COL / 2 - OW / 2, 3), "m | ouverture :", OW, "m de large,", OH + OA, "m de haut (arrondi à partir de", OH, "m)")

# sol extérieur et mur d'enceinte (objets séparés, rien de fusionné) :
#   sol : 75 m navigables tout autour du mur extérieur, 10 m d'épaisseur (0 -> 10 m), au niveau du sol de la salle, arrêté contre le mur d'enceinte
#   mur d'enceinte : 10 m d'épaisseur, de 0 à 125 m ; dessus / dessous coupés seulement au milieu des côtés avant / arrière (axe des arches)
def cadre(name, ri, ro, z0, z1, cotes=True):
    """anneau carré plein (intérieur ri, extérieur ro) de z0 à z1, un seul maillage ; dessus et dessous coupés par un trait droit
    au milieu de chaque côté (4 morceaux d'angle en L), faces verticales d'un seul tenant"""
    v = {}
    def p(x, y, z):
        if (x, y, z) not in v: v[(x, y, z)] = len(v)
        return v[(x, y, z)]
    f = []
    for z in (z0, z1):
        if cotes:
            for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):        # morceaux d'angle en L
                f.append([p(0, sy * ro, z), p(sx * ro, sy * ro, z), p(sx * ro, 0, z), p(sx * ri, 0, z), p(sx * ri, sy * ri, z), p(0, sy * ri, z)])
        else:                                                           # coupé seulement au milieu des côtés avant / arrière : 2 moitiés en U
            for sx in (-1, 1):
                f.append([p(0, -ro, z), p(sx * ro, -ro, z), p(sx * ro, ro, z), p(0, ro, z), p(0, ri, z), p(sx * ri, ri, z), p(sx * ri, -ri, z), p(0, -ri, z)])
    for r in (ro, ri):                                                  # faces verticales extérieures puis intérieures
        for (x0, y0), (x1, y1) in (((-r, -r), (r, -r)), ((r, -r), (r, r)), ((r, r), (-r, r)), ((-r, r), (-r, -r))):
            xm, ym = (x0 + x1) / 2, (y0 + y1) / 2
            if cotes or y0 == y1:
                f.append([p(x0, y0, z0), p(xm, ym, z0), p(x1, y1, z0), p(x1, y1, z1), p(xm, ym, z1), p(x0, y0, z1)])
            else:
                f.append([p(x0, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y0, z1)])
    me = bpy.data.meshes.new(name); me.from_pydata([(x, y, z - z0) for (x, y, z) in sorted(v, key=v.get)], [], f); me.update(); me.validate()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ok = all(e.is_manifold for e in bm.edges); bm.to_mesh(me); bm.free()
    me.materials.append(bpy.data.materials["Pierre"])
    ob = bpy.data.objects.new(name, me); ob.location = (0, 0, z0)
    print(name, ":", len(me.vertices), "sommets,", len(me.polygons), "faces, étanche =", ok)
    return ob
col_enc = bpy.data.collections.new("Enceinte"); scn.collection.children.link(col_enc)
col_enc.objects.link(cadre("Sol_exterieur", a, a + SOL_NAV, 0.0, T, cotes=False))
# toit : entre le mur de la cour et le mur d'enceinte (pas sur la cour), 10 m d'épaisseur sous le haut des murs (115 -> 125 m)
if TOIT: col_enc.objects.link(cadre("Toit", a, RE, H - T, H, cotes=False))
mur_enc = cadre("Mur_enceinte", RE, RO, 0.0, H, cotes=False); col_enc.objects.link(mur_enc)
# arches du mur d'enceinte : en face des arches de la salle (avant et arrière), même forme, découpe appliquée (maillage propre)
if OUVERTURES:
    coupe_x = bmesh.new(); coupe_x.from_mesh(mur_enc.data)      # trait droit au milieu des murs avant / arrière (au-dessus et au-dessous des arches)
    bmesh.ops.bisect_plane(coupe_x, geom=coupe_x.verts[:] + coupe_x.edges[:] + coupe_x.faces[:], plane_co=(0, 0, 0), plane_no=(1, 0, 0))
    YC = -b + pas / 2                                     # arches de côté : centrées à ±92 m (4 colonnes extérieures entre elles)
    for yp in ((-YC, YC) if ARCHES_COTE else ()):         # trait droit au-dessus et au-dessous des arches de côté
        bmesh.ops.bisect_plane(coupe_x, geom=coupe_x.verts[:] + coupe_x.edges[:] + coupe_x.faces[:], plane_co=(0, yp, 0), plane_no=(0, 1, 0))
    coupe_x.to_mesh(mur_enc.data); coupe_x.free(); mur_enc.data.update()
    col_tmp = bpy.data.collections.new("tmp"); scn.collection.children.link(col_tmp)
    for nom, y0, y1, oy in (("Decoupe_enceinte_avant", -RO - M, -RE + M, -RO), ("Decoupe_enceinte_arriere", RE - M, RO + M, RO)):
        c = arch(nom, y0, y1, origin=(0, oy, T)); col_tmp.objects.link(c)
    # arches de côté (murs gauche et droit) : 2 par mur, à ±92 m, 16 x 32 m depuis le palier (30 m), sommet à 62 m
    ZS = zb1; HS = 24.0                                   # 16 x 32 m : bas à 30 m, côtés droits sur 24 m, arrondi de 54 à 62 m
    for cote, rz in ((("gauche", -90), ("droite", 90)) if ARCHES_COTE else ()):
        for yo in (-YC, YC):
            nom = "Decoupe_enceinte_%s_%d" % (cote, round(yo))
            c = arch(nom, -RO - M, -RE + M, origin=(0, 0, 0), zb=ZS, hs=HS); c.rotation_euler.z = math.radians(rz); c.location = (0, yo, 0)
            col_tmp.objects.link(c)
    md = mur_enc.modifiers.new("Decoupes_enceinte", "BOOLEAN"); md.operation = "DIFFERENCE"; md.operand_type = "COLLECTION"; md.collection = col_tmp; md.solver = "EXACT"
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(mur_enc.evaluated_get(dg))
    mur_enc.modifiers.clear(); old = mur_enc.data; mur_enc.data = me; bpy.data.meshes.remove(old); me.name = "Mur_enceinte"
    for c in list(col_tmp.objects): bpy.data.objects.remove(c)
    bpy.data.collections.remove(col_tmp)
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-3); bm.normal_update()
    hz = [e for e in bm.edges if all(abs(abs(v.co.y) - abs(YC)) < 1e-3 for v in e.verts) and abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4
          and abs(e.verts[0].co.x - e.verts[1].co.x) > 1 and (abs(e.verts[0].co.z) < 1e-3 or abs(e.verts[0].co.z - H) < 1e-3)]
    for e in hz:                                          # traits inutiles sur le dessus / dessous du mur : faces réunies
        if e.is_valid and len(e.link_faces) == 2: bmesh.utils.face_join(list(e.link_faces))
    ok = all(e.is_manifold for e in bm.edges)
    biais = sum(1 for e in bm.edges if sum(1 for c in (e.verts[1].co - e.verts[0].co) if abs(c) > 1e-4) >= 2 and (e.verts[1].co - e.verts[0].co).length > 3)
    bm.to_mesh(me); bm.free(); me.update()
    print("Mur_enceinte avec arches :", len(me.vertices), "sommets,", len(me.polygons), "faces, étanche =", ok, "| arêtes en biais :", biais)
    # moulures des arches de l'enceinte : identiques à celles de la salle (31 blocs par face, intérieur + extérieur)
    col_me = bpy.data.collections.new("Moulures_enceinte"); scn.collection.children.link(col_me)
    kme = 0
    for nom, y0, y1 in (("avant_ext", -RO - MS, -RO), ("avant_int", -RE, -RE + MS), ("arriere_int", RE - MS, RE), ("arriere_ext", RO, RO + MS)):
        for i in range(nm):
            t0 = i * (MH + gm)
            col_me.objects.link(moulure("Moulure_enceinte_%s_%02d" % (nom, i + 1), t0, t0 + MH, ML[min(i, nm - 1 - i) % 2], y0, y1)); kme += 1
    nm2 = int((2 * HS + math.pi * o + MG) // (MH + MG)) | 1; gm2 = (2 * HS + math.pi * o - nm2 * MH) / (nm2 - 1)
    for cote, rz in ((("gauche", -90), ("droite", 90)) if ARCHES_COTE else ()):
        for yo in (-YC, YC):
            for face, y0, y1 in (("ext", -RO - MS, -RO), ("int", -RE, -RE + MS)):
                for i in range(nm2):
                    t0 = i * (MH + gm2)
                    ob = moulure("Moulure_enceinte_%s_%d_%s_%02d" % (cote, round(yo), face, i + 1), t0, t0 + MH, ML[min(i, nm2 - 1 - i) % 2], y0, y1, ZS, HS)
                    ob.rotation_euler.z = math.radians(rz); ob.location = (0, yo, 0); col_me.objects.link(ob); kme += 1
    print("moulures enceinte :", kme, "| arches de côté :", nm2, "blocs par face, écart", round(gm2, 3), "m")

# salles carrées derrière les 4 arches de côté de l'enceinte : 168 x 168 m (148 m + 10 m tout autour), de ±8 à ±176 m le long du mur,
# collées au mur d'enceinte ; murs de 10 m de 0 à 125 m, sol plein de 0 à 30 m (niveau du palier et du bas des arches), sans toit
def salle_carree(name, sx, y0, y1, cs, zf):
    """salle collée à la face extérieure de l'enceinte (côté sx), construite directement (comme le sol et l'enceinte) :
    murs de T sur 3 côtés de 0 à H, sol plein de 0 à zf, ouverte vers le haut et côté enceinte"""
    v = {}
    def p(d, y, z):
        k = (sx * (RO + d), y, z)
        if k not in v: v[k] = len(v)
        return v[k]
    yi0, yi1, di = y0 + T, y1 - T, cs - T
    f = [[p(0, y0, 0), p(cs, y0, 0), p(cs, y1, 0), p(0, y1, 0)],                                      # dessous
         [p(cs, y0, 0), p(cs, y1, 0), p(cs, y1, H), p(cs, y0, H)],                                    # mur du fond, face extérieure
         [p(0, y0, 0), p(cs, y0, 0), p(cs, y0, H), p(0, y0, H)],                                      # murs de côté, faces extérieures
         [p(0, y1, 0), p(cs, y1, 0), p(cs, y1, H), p(0, y1, H)],
         [p(0, y0, 0), p(0, y1, 0), p(0, y1, H), p(0, yi1, H), p(0, yi1, zf), p(0, yi0, zf), p(0, yi0, H), p(0, y0, H)],   # contre l'enceinte
         [p(0, y0, H), p(cs, y0, H), p(cs, y1, H), p(0, y1, H), p(0, yi1, H), p(di, yi1, H), p(di, yi0, H), p(0, yi0, H)], # dessus des murs
         [p(0, yi0, zf), p(di, yi0, zf), p(di, yi1, zf), p(0, yi1, zf)],                              # sol de la salle
         [p(0, yi0, zf), p(di, yi0, zf), p(di, yi0, H), p(0, yi0, H)],                                # faces intérieures
         [p(0, yi1, zf), p(di, yi1, zf), p(di, yi1, H), p(0, yi1, H)],
         [p(di, yi0, zf), p(di, yi1, zf), p(di, yi1, H), p(di, yi0, H)]]
    me = bpy.data.meshes.new(name); me.from_pydata(sorted(v, key=v.get), [], f); me.update(); me.validate()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); ok = all(e.is_manifold for e in bm.edges); bm.to_mesh(me); bm.free()
    me.materials.append(bpy.data.materials["Pierre"])
    print(name, ":", len(me.vertices), "sommets,", len(me.polygons), "faces, étanche =", ok)
    return bpy.data.objects.new(name, me)
# salles carrées derrière les 4 arches de côté de l'enceinte : 168 x 168 m, de ±8 à ±176 m le long du mur,
# collées au mur d'enceinte ; murs de 10 m de 0 à 125 m, sol plein de 0 à 30 m (niveau du palier et du bas des arches), sans toit
if SALLES_COTE:
    col_sc = bpy.data.collections.new("Salles_cote"); scn.collection.children.link(col_sc)
    for sx, cote in ((-1, "gauche"), (1, "droite")):
        for y0s, y1s, pos in ((-176.0, -8.0, "avant"), (8.0, 176.0, "arriere")):
            col_sc.objects.link(salle_carree("Salle_%s_%s" % (cote, pos), sx, y0s, y1s, 168.0, 30.0))
            if TOIT:                                      # toit : 10 m d'épaisseur entre les murs, au ras du haut (115 -> 125 m)
                xa, xb = sorted((sx * RO, sx * (RO + 168.0 - T)))
                t = box("Toit_salle_%s_%s" % (cote, pos), xa, xb, y0s + T, y1s - T, H - T, H, origin=((xa + xb) / 2, (y0s + y1s) / 2, H - T))
                t.data.materials.append(bpy.data.materials["Pierre"]); col_sc.objects.link(t)

# escaliers d'honneur de la salle couverte : de chaque côté, un palier en U plein de 10 à 30 m (bande de côté entière + angles + 125 m des bandes
# avant et arrière, jusqu'à 75 m de l'axe des arches) ; au bout de chaque branche du U, un escalier (4 en tout) sur toute la largeur (75 m), 2 volées de 4 marches de 2,5 x 2,5 m (hauteur = profondeur) séparées par un
# palier de repos de 15 m à 20 m, qui descend vers l'arche (pied à 45 m de son axe) ; garde-corps retirés pour l'instant (GARDE_CORPS)
MARCHE, Z_HAUT = 2.5, zb1
LARG, PAL, GC = SOL_NAV, 0.0, 2.5       # largeur : toute la bande (75 m) ; PAL = 0 : escalier droit, sans palier de repos
L_PALIER = 125.0; GARDE_CORPS = False                # garde-corps : 2,5 m d'épaisseur, 2,5 m au-dessus des marches (True pour les remettre)
col_esc = bpy.data.collections.new("Escalier")
if ESCALIERS: scn.collection.children.link(col_esc)
XB = RE - L_PALIER                                        # distance à l'axe des arches du bout des paliers (75 m)
def prisme_xz(name, prof, y0, y1, sx):
    """profil (d, z) extrudé en y ; d compté depuis le bout du palier vers l'axe de l'arche, côté sx (-1 gauche, +1 droite)"""
    m = len(prof)
    v = [(sx * (XB - d), y0, z) for d, z in prof] + [(sx * (XB - d), y1, z) for d, z in prof]
    f = [tuple(range(m)), tuple(range(m, 2 * m))] + [(i, (i + 1) % m, m + (i + 1) % m, m + i) for i in range(m)]
    me = bpy.data.meshes.new(name); me.from_pydata(v, [], f); me.update(); me.validate()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    me.materials.append(bpy.data.materials["Pierre"]); ob = bpy.data.objects.new(name, me); col_esc.objects.link(ob); return ob
n2 = round((Z_HAUT - T) / MARCHE / 2)                     # 4 marches par volée
def gprof_():                                             # garde-corps : suivent la pente, 2,5 m au-dessus du nez des marches
    return [(0.0, T), (long_e + GC, T), (long_e + GC, T + GC), (long_e - (n2 - 1) * MARCHE, T + MARCHE * n2 + GC),
            (n2 * MARCHE, T + MARCHE * n2 + GC), (0.0, Z_HAUT + GC)]
prof = [(0.0, T)]; d = 0.0; z = Z_HAUT
for k in range(n2):                                       # volée haute (descend depuis le palier d'angle)
    prof += [(d, z)]; z -= MARCHE; prof += [(d, z)]; d += MARCHE
prof[-1] = (d - MARCHE, z)                                # (le dernier giron devient le palier)
d -= MARCHE; prof += [(d + PAL, z)]; d += PAL
for k in range(n2):                                       # volée basse
    z -= MARCHE; prof += [(d, z)]; d += MARCHE; prof += [(d, z)] if z > T else []
prof = [p for i, p in enumerate(prof) if i == 0 or p != prof[i - 1]]
prof = [p for p in prof if p != (0.0, Z_HAUT)]
prof[-1] = (prof[-1][0], T) if prof[-1][1] == T else prof[-1]
if prof[-1][1] != T: prof.append((prof[-1][0], T))
if PAL == 0:                                              # escalier droit : 8 marches de 2,5 x 2,5 m, du palier (30 m) au sol (10 m)
    prof = [(0.0, T)]
    for k in range(2 * n2):                               # marche k : dessus à 30 - 2,5 k, de d = 2,5 k à 2,5 (k + 1)
        prof += [(k * MARCHE, Z_HAUT - k * MARCHE), ((k + 1) * MARCHE, Z_HAUT - k * MARCHE)]
    prof.append((2 * n2 * MARCHE, T))
long_e = prof[-1][0]
for sx, sy, nom in (((-1, -1, "avant_gauche"), (1, -1, "avant_droite"), (-1, 1, "arriere_gauche"), (1, 1, "arriere_droite")) if ESCALIERS else ()):
    yc = sy * (a + RE) / 2                                # axe de la bande avant / arrière
    # en largeur : escalier 25 m | pilier 25 m (du sol au plafond, jusqu'au pied des escaliers) | escalier 25 m
    l3 = LARG / 3
    prisme_xz("Escalier_%s_1" % nom, prof, yc - LARG / 2, yc - LARG / 2 + l3, sx)
    prisme_xz("Escalier_%s_2" % nom, prof, yc + LARG / 2 - l3, yc + LARG / 2, sx)
    xa_, xb_ = sorted((sx * XB, sx * (XB - long_e)))
    bloc = box("Pilier_%s" % nom, xa_, xb_, yc - l3 / 2, yc + l3 / 2, T, H - T, origin=((xa_ + xb_) / 2, yc, T))   # pilier : du sol jusqu'au plafond (115 m)
    bloc.data.materials.append(bpy.data.materials["Pierre"]); col_esc.objects.link(bloc)
    for g, ya in ((("1", yc - LARG / 2 - GC), ("2", yc + LARG / 2)) if GARDE_CORPS else ()):
        prisme_xz("Garde_corps_%s_%s" % (nom, g), gprof_(), ya, ya + GC, sx)
# paliers en U (gauche et droite) : une seule forme chacun, de 10 à 30 m
for sx, nom in (((-1, "Palier_gauche"), (1, "Palier_droit")) if ESCALIERS else ()):
    u = [(XB, -RE), (RE, -RE), (RE, RE), (XB, RE), (XB, a), (a, a), (a, -a), (XB, -a)]
    pal = prisme(nom, [(sx * x, y) for x, y in u], T, Z_HAUT); pal.data.materials.append(bpy.data.materials["Pierre"]); col_esc.objects.link(pal)
if ESCALIERS: print("escaliers : 4 x", 2 * n2, "marches |", long_e, "m de long | paliers en U | pieds des escaliers à", XB - long_e, "m de l'axe des arches")

# mur extérieur : englobe tout, face extérieure de 1 840 x 1 840 m (au moins 3 fois la surface de 1 040 m, en gardant 40 m de mur entre piliers, angles compris),
# 25 m d'épaisseur (pour 40 m de mur entre piliers aussi à l'intérieur), de 0 à 125 m ; 36 piliers par côté dehors, 35 dedans
col_mx = bpy.data.collections.new("Mur_exterieur"); scn.collection.children.link(col_mx)
H_MX = 2 * H                                              # mur extérieur : hauteur doublée (250 m), piliers aussi ; bandes inchangées
col_mx.objects.link(cadre("Mur_exterieur", RXI, RXO, 0.0, H_MX, cotes=False))
# sol entre l'enceinte et le mur extérieur : comme celui de la cour, 10 m d'épaisseur (0 -> 10 m)
col_mx.objects.link(cadre("Sol_mur_exterieur", RO, RXI, 0.0, T, cotes=False))
me_px = box("Pilier_mur_ext_maillage", -COL / 2, COL / 2, -DEP / 2, DEP / 2, 0, H_MX).data
me_px.name = "Pilier_mur_exterieur"; me_px.materials.append(bpy.data.materials["Pierre"])
kx = 0
for i in IMX:                                             # centres de -875 à 875 m, pas de 50 m
    u = -b + i * pas
    for (x, y, rz) in ((u, -RXO - DEP / 2, 0), (u, RXO + DEP / 2, 0), (-RXO - DEP / 2, u, 90), (RXO + DEP / 2, u, 90)):
        kx += 1; c = bpy.data.objects.new("Pilier_mur_ext_%02d" % kx, me_px); c.location = (x, y, 0); c.rotation_euler.z = math.radians(rz)
        col_mx.objects.link(c)
me_pi = box("Pilier_mur_int_maillage", -COL / 2, COL / 2, -DEP / 2, DEP / 2, T, H_MX, origin=(0, 0, T)).data
me_pi.name = "Pilier_mur_interieur"; me_pi.materials.append(bpy.data.materials["Pierre"])
ki = 0
for u in CMXI:                                            # piliers de la face intérieure, posés sur le sol (10 m)
    for (x, y, rz) in ((u, -RXI + DEP / 2, 0), (u, RXI - DEP / 2, 0), (-RXI + DEP / 2, u, 90), (RXI - DEP / 2, u, 90)):
        ki += 1; c = bpy.data.objects.new("Pilier_mur_int_%02d" % ki, me_pi); c.location = (x, y, T); c.rotation_euler.z = math.radians(rz)
        col_mx.objects.link(c)
ecarts_i = sorted(set([round(CMXI[0] - COL / 2 + RXI, 3)] + [round(CMXI[k + 1] - CMXI[k] - COL, 3) for k in range(34)]))
print("mur extérieur, face intérieure :", 2 * RXI, "m | piliers :", ki, "| écarts (angles compris) :", ecarts_i, "| épaisseur", EP_MX, "m")
ecarts = [round((-b + (i + 1) * pas - COL / 2) - (-b + i * pas + COL / 2), 3) for i in range(-15, 20)]
print("mur extérieur :", 2 * RXO, "m | piliers :", kx, "| écarts entre piliers :", set(ecarts), "| angle :", RXO - (-b + 20 * pas + COL / 2), "m")

# lumière et caméra pour un premier rendu
sun = bpy.data.objects.new("Soleil", bpy.data.lights.new("Soleil", "SUN")); sun.data.energy = 1.5                     # soleil plus doux : les faces éclairées ne virent pas au blanc
sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(35)); scn.collection.objects.link(sun)
cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera")); cam.data.clip_end = 5000; cam.data.lens = 30
cam.location = (330, -430, 300); scn.collection.objects.link(cam); scn.camera = cam
cam.rotation_euler = (math.radians(62), 0, math.radians(38))
scn.world = bpy.data.worlds.new("Ciel"); scn.world.color = (0.95, 0.95, 0.95)   # lumière ambiante plus claire, ombres moins contrastées

# découpes appliquées : la salle devient un seul maillage propre ; des coupes en croix on ne garde qu'un trait,
# du sommet de chaque arche / fenêtre jusqu'à l'arête du haut (et sur le dessus du mur) ; tout le reste est dissous
if OUVERTURES:
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(salle.evaluated_get(dg))
    salle.modifiers.clear(); old = salle.data; salle.data = me; bpy.data.meshes.remove(old); me.name = "Grande_salle"
    for c in list(col_cut.objects): bpy.data.objects.remove(c)
    bpy.data.collections.remove(col_cut)
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-3)   # sommets en double laissés par le calcul (arêtes de longueur nulle)
    bm.normal_update()
    def sur_coupe(e):
        return all(abs(v.co.x) < 1e-4 for v in e.verts) or all(abs(v.co.y) < 1e-4 for v in e.verts)
    inutiles = [e for e in bm.edges if sur_coupe(e) and len(e.link_faces) == 2
                and e.link_faces[0].normal.dot(e.link_faces[1].normal) > 0.9999 and max(v.co.z for v in e.verts) <= FZ + 1e-4]
    bmesh.ops.dissolve_edges(bm, edges=inutiles, use_verts=True)
    # sol : le sol de la salle et le sol des passages sous les arches ne forment qu'une seule face (même surface plate)
    sol = [e for e in bm.edges if all(abs(v.co.z - T) < 1e-4 for v in e.verts) and len(e.link_faces) == 2
           and all(f.normal.z > 0.9999 for f in e.link_faces)]
    bmesh.ops.dissolve_edges(bm, edges=sol, use_verts=True)
    print("traits du sol enlevés :", len(sol))
    bm.to_mesh(me); bm.free(); me.update()
    print("traits droits restants (au-dessus et, si besoin, au-dessous des ouvertures) :", sum(1 for e in me.edges if all(abs(me.vertices[i].co.x) < 1e-4 for i in e.vertices) or all(abs(me.vertices[i].co.y) < 1e-4 for i in e.vertices)))

# vérification : maillage final (après Booléens) étanche, dimensions exactes
dg = bpy.context.evaluated_depsgraph_get()
ev = salle.evaluated_get(dg).to_mesh()
bm = bmesh.new(); bm.from_mesh(ev)
manifold = all(e.is_manifold for e in bm.edges)
xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]; zs = [v.co.z for v in bm.verts]
biais = sum(1 for e in bm.edges if sum(1 for c in (e.verts[1].co - e.verts[0].co) if abs(c) > 1e-4) >= 2 and (e.verts[1].co - e.verts[0].co).length > 3)
print("arêtes en biais (hors arrondis) :", biais)
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
