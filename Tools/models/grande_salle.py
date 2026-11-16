"""Grande salle : bloc de 250 x 250 m sur 175 m de haut, ouvert par le haut, parois et sol de 10 m.
Deux ouvertures droites de 25 x 25 m, au centre des murs avant et arrière, au niveau du sol intérieur.
Un bloc témoin de 0,5 x 0,5 x 2 m au centre pour l'échelle.
Maillage propre : uniquement des quadrilatères, sommets partagés, aucune face interne ni sommet en T, étanche.
Unités : mètres, Y vers le haut. Sorties : Assets/Export/grande_salle.obj (+ .mtl) et grande_salle.glb"""
import json, os, struct

W, H, T = 250.0, 175.0, 10.0              # largeur, hauteur, épaisseur
OW, OH = 25.0, 25.0                       # ouvertures : largeur, hauteur
a, b, o = W / 2, W / 2 - T, OW / 2
y0, y1 = T, T + OH                        # bas et haut des ouvertures (bas = sol intérieur)

class Mesh:
    def __init__(self, name): self.name, self.V, self.F, self.key = name, [], [], {}
    def v(self, p):
        p = tuple(float(c) for c in p)
        if p not in self.key: self.key[p] = len(self.V); self.V.append(p)
        return self.key[p]
    def quad(self, pts, normal):          # oriente le quad pour que sa normale soit dans la direction donnée
        ids = [self.v(p) for p in pts]
        P = [self.V[i] for i in ids]
        u = [P[1][k] - P[0][k] for k in range(3)]; w = [P[3][k] - P[0][k] for k in range(3)]
        c = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
        if sum(c[k] * normal[k] for k in range(3)) < 0: ids = ids[::-1]
        self.F.append(ids)
    def check(self, genus):
        E = {}
        for f in self.F:
            for e in zip(f, f[1:] + f[:1]): E[tuple(sorted(e))] = E.get(tuple(sorted(e)), 0) + 1
        assert all(c == 2 for c in E.values()), self.name + " : maillage non étanche"
        assert len(self.V) - len(E) + len(self.F) == 2 - 2 * genus, self.name + " : topologie inattendue"
        return len(E)

hall = Mesh("Grande_salle")
q = hall.quad
q([(-a, 0, -a), (a, 0, -a), (a, 0, a), (-a, 0, a)], (0, -1, 0))                   # dessous
q([(-a, 0, -a), (-a, H, -a), (-a, H, a), (-a, 0, a)], (-1, 0, 0))                 # extérieur gauche
q([(a, 0, -a), (a, H, -a), (a, H, a), (a, 0, a)], (1, 0, 0))                      # extérieur droit
q([(-b, y0, -b), (-b, H, -b), (-b, H, b), (-b, y0, b)], (1, 0, 0))                # intérieur gauche
q([(b, y0, -b), (b, H, -b), (b, H, b), (b, y0, b)], (-1, 0, 0))                   # intérieur droit
for z, s in ((a, 1), (-a, -1)):                                                    # murs avant / arrière percés
    zi = z - s * T
    n_out, n_in = (0, 0, s), (0, 0, -s)
    # face extérieure : 4 trapèzes du contour vers l'ouverture (aucun sommet ajouté sur les bords)
    q([(-a, 0, z), (a, 0, z), (o, y0, z), (-o, y0, z)], n_out)
    q([(a, 0, z), (a, H, z), (o, y1, z), (o, y0, z)], n_out)
    q([(a, H, z), (-a, H, z), (-o, y1, z), (o, y1, z)], n_out)
    q([(-a, H, z), (-a, 0, z), (-o, y0, z), (-o, y1, z)], n_out)
    # face intérieure : 3 quads autour de l'ouverture (qui part du sol)
    q([(-b, y0, zi), (-o, y0, zi), (-o, y1, zi), (-b, H, zi)], n_in)
    q([(o, y0, zi), (b, y0, zi), (b, H, zi), (o, y1, zi)], n_in)
    q([(-o, y1, zi), (o, y1, zi), (b, H, zi), (-b, H, zi)], n_in)
    # tableau de l'ouverture : sol, linteau, deux côtés
    q([(-o, y0, zi), (o, y0, zi), (o, y0, z), (-o, y0, z)], (0, 1, 0))
    q([(-o, y1, zi), (o, y1, zi), (o, y1, z), (-o, y1, z)], (0, -1, 0))
    q([(-o, y0, zi), (-o, y1, zi), (-o, y1, z), (-o, y0, z)], (1, 0, 0))
    q([(o, y0, zi), (o, y1, zi), (o, y1, z), (o, y0, z)], (-1, 0, 0))
for (x0, x1) in ((-b, -o), (-o, o), (o, b)):                                      # sol intérieur : 3 bandes
    q([(x0, y0, -b), (x1, y0, -b), (x1, y0, b), (x0, y0, b)], (0, 1, 0))
for p0, p1, p2, p3 in (((-a, -a), (a, -a), (b, -b), (-b, -b)), ((a, -a), (a, a), (b, b), (b, -b)),   # couronnement
                       ((a, a), (-a, a), (-b, b), (b, b)), ((-a, a), (-a, -a), (-b, -b), (-b, b))):
    q([(p[0], H, p[1]) for p in (p0, p1, p2, p3)], (0, 1, 0))
ne_hall = hall.check(genus=2)              # un bol percé de deux ouvertures = surface de genre 2

cube = Mesh("Repere_echelle")              # bloc témoin 0,5 x 0,5 x 2 m posé sur le sol intérieur
hx, hy0, hy1 = 0.25, y0, y0 + 2.0
for axis in range(3):
    for sgn in (-1, 1):
        n = [0, 0, 0]; n[axis] = sgn
        lo = [-hx, hy0, -hx]; hi = [hx, hy1, hx]
        fixed = hi[axis] if sgn > 0 else lo[axis]
        others = [k for k in range(3) if k != axis]
        pts = []
        for (u, v) in ((0, 0), (1, 0), (1, 1), (0, 1)):
            p = [0, 0, 0]; p[axis] = fixed
            p[others[0]] = (lo, hi)[u][others[0]]; p[others[1]] = (lo, hi)[v][others[1]]
            pts.append(p)
        cube.quad(pts, n)
cube.check(genus=0)

out = os.path.join(os.path.dirname(__file__), "..", "..", "Assets", "Export")
os.makedirs(out, exist_ok=True)
MATS = [("Pierre", (0.69, 0.67, 0.64), (0.43, 0.41, 0.37)), ("Repere", (0.85, 0.25, 0.15), (0.70, 0.05, 0.02))]
with open(os.path.join(out, "grande_salle.mtl"), "w") as m:
    for n, kd, _ in MATS: m.write("newmtl %s\nKd %g %g %g\nNs 10\n\n" % ((n,) + kd))
with open(os.path.join(out, "grande_salle.obj"), "w") as f:
    f.write("# Grande salle 250 x 250 x 175 m, epaisseur 10 m, 2 ouvertures 25 x 25 m, repere 0.5 x 0.5 x 2 m\nmtllib grande_salle.mtl\n")
    base = 0
    for mesh, mat in ((hall, "Pierre"), (cube, "Repere")):
        f.write("o %s\n" % mesh.name)
        for v in mesh.V: f.write("v %g %g %g\n" % v)
        f.write("usemtl %s\ns off\n" % mat)
        for fc in mesh.F: f.write("f " + " ".join(str(base + i + 1) for i in fc) + "\n")
        base += len(mesh.V)
# GLB : un nœud par objet, sommets partagés, sans normales (facettes nettes calculées à l'import)
blob, views, accs, meshes, nodes = b"", [], [], [], []
for mi, mesh in enumerate((hall, cube)):
    pos = b"".join(struct.pack("<3f", *v) for v in mesh.V)
    idx = b"".join(struct.pack("<6H", f[0], f[1], f[2], f[0], f[2], f[3]) for f in mesh.F)
    for data, target in ((pos, 34962), (idx, 34963)):
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(data), "target": target})
        blob += data + b"\0" * (-len(data) % 4)
    xs = [v[0] for v in mesh.V]; ys = [v[1] for v in mesh.V]; zs = [v[2] for v in mesh.V]
    accs.append({"bufferView": len(views) - 2, "componentType": 5126, "count": len(mesh.V), "type": "VEC3",
                 "min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]})
    accs.append({"bufferView": len(views) - 1, "componentType": 5123, "count": len(mesh.F) * 6, "type": "SCALAR"})
    meshes.append({"name": mesh.name, "primitives": [{"attributes": {"POSITION": len(accs) - 2}, "indices": len(accs) - 1, "material": mi}]})
    nodes.append({"name": mesh.name, "mesh": mi})
gltf = {"asset": {"version": "2.0", "generator": "grande_salle.py"}, "scene": 0, "scenes": [{"nodes": [0, 1]}], "nodes": nodes,
        "materials": [{"name": n, "pbrMetallicRoughness": {"baseColorFactor": list(c) + [1], "metallicFactor": 0, "roughnessFactor": 0.9}} for n, _, c in MATS],
        "meshes": meshes, "buffers": [{"byteLength": len(blob)}], "bufferViews": views, "accessors": accs}
js = json.dumps(gltf, separators=(",", ":")).encode(); js += b" " * (-len(js) % 4)
with open(os.path.join(out, "grande_salle.glb"), "wb") as g:
    g.write(struct.pack("<3I", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob)))
    g.write(struct.pack("<2I", len(js), 0x4E4F534A) + js)
    g.write(struct.pack("<2I", len(blob), 0x004E4942) + blob)
print("ok : salle %d sommets, %d quads, %d aretes ; repere %d sommets, %d quads" % (len(hall.V), len(hall.F), ne_hall, len(cube.V), len(cube.F)))
