"""Grande salle : bloc de 250 x 250 m sur 175 m de haut, ouvert par le haut, parois et sol de 10 m.
Maillage minimal et propre : un seul objet fermé (étanche), 16 sommets partagés, 14 faces quadrangulaires,
aucune face interne ni arête superflue. Unités : mètres, Y vers le haut (glTF), origine au centre du sol extérieur.
Sorties : Assets/Export/grande_salle.obj (+ .mtl) et grande_salle.glb"""
import json, os, struct

W, H, T = 250.0, 175.0, 10.0          # largeur, hauteur, épaisseur
a, b = W / 2, W / 2 - T               # demi-largeur extérieure / intérieure

V = [  # 0-3 : extérieur bas, 4-7 : extérieur haut, 8-11 : intérieur haut, 12-15 : intérieur bas (sol intérieur)
    (-a, 0, -a), (a, 0, -a), (a, 0, a), (-a, 0, a),
    (-a, H, -a), (a, H, -a), (a, H, a), (-a, H, a),
    (-b, H, -b), (b, H, -b), (b, H, b), (-b, H, b),
    (-b, T, -b), (b, T, -b), (b, T, b), (-b, T, b),
]
# faces (sens anti-horaire vu de l'extérieur de la matière) + direction attendue de la normale pour vérification
F = [
    ((0, 1, 2, 3), (0, -1, 0)),                                         # dessous
    ((0, 4, 5, 1), (0, 0, -1)), ((1, 5, 6, 2), (1, 0, 0)),              # faces extérieures
    ((2, 6, 7, 3), (0, 0, 1)), ((3, 7, 4, 0), (-1, 0, 0)),
    ((4, 8, 9, 5), (0, 1, 0)), ((5, 9, 10, 6), (0, 1, 0)),              # dessus des murs (couronnement)
    ((6, 10, 11, 7), (0, 1, 0)), ((7, 11, 8, 4), (0, 1, 0)),
    ((8, 12, 13, 9), (0, 0, 1)), ((9, 13, 14, 10), (-1, 0, 0)),         # faces intérieures
    ((10, 14, 15, 11), (0, 0, -1)), ((11, 15, 12, 8), (1, 0, 0)),
    ((12, 15, 14, 13), (0, 1, 0)),                                      # sol intérieur
]

def sub(p, q): return [p[i] - q[i] for i in range(3)]
def cross(u, v): return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
for (i, j, k, l), n in F:                                               # vérification de l'orientation de chaque face
    c = cross(sub(V[j], V[i]), sub(V[l], V[i]))
    assert sum(c[t] * n[t] for t in range(3)) > 0, ((i, j, k, l), n)
edges = {}
for f, _ in F:
    for e in zip(f, f[1:] + f[:1]): edges[tuple(sorted(e))] = edges.get(tuple(sorted(e)), 0) + 1
assert all(c == 2 for c in edges.values()), "maillage non étanche"   # chaque arête partagée par exactement 2 faces
assert len(V) - len(edges) + len(F) == 2                               # caractéristique d'Euler d'un solide sans trou

out = os.path.join(os.path.dirname(__file__), "..", "..", "Assets", "Export")
os.makedirs(out, exist_ok=True)
# --- OBJ (quads, sommets partagés) ---
with open(os.path.join(out, "grande_salle.mtl"), "w") as m:
    m.write("newmtl Pierre\nKd 0.69 0.67 0.64\nNs 10\n")
with open(os.path.join(out, "grande_salle.obj"), "w") as o:
    o.write("# Grande salle 250 x 250 x 175 m, epaisseur 10 m\nmtllib grande_salle.mtl\no Grande_salle\n")
    for v in V: o.write("v %g %g %g\n" % v)
    o.write("usemtl Pierre\ns off\n")
    for f, _ in F: o.write("f " + " ".join(str(i + 1) for i in f) + "\n")
# --- GLB (sommets partagés, sans normales : rendu à facettes nettes, calculé à l'import) ---
pos = b"".join(struct.pack("<3f", *v) for v in V)
idx = b"".join(struct.pack("<3H", f[0], f[1], f[2]) + struct.pack("<3H", f[0], f[2], f[3]) for f, _ in F)
idx += b"\0" * (-len(idx) % 4)
blob = pos + idx
gltf = {
    "asset": {"version": "2.0", "generator": "grande_salle.py"},
    "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"name": "Grande_salle", "mesh": 0}],
    "materials": [{"name": "Pierre", "pbrMetallicRoughness": {"baseColorFactor": [0.43, 0.41, 0.37, 1], "metallicFactor": 0, "roughnessFactor": 0.9}}],
    "meshes": [{"name": "Grande_salle", "primitives": [{"attributes": {"POSITION": 0}, "indices": 1, "material": 0}]}],
    "buffers": [{"byteLength": len(blob)}],
    "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": len(pos), "target": 34962},
                    {"buffer": 0, "byteOffset": len(pos), "byteLength": len(F) * 12, "target": 34963}],
    "accessors": [{"bufferView": 0, "componentType": 5126, "count": len(V), "type": "VEC3",
                   "min": [-a, 0, -a], "max": [a, H, a]},
                  {"bufferView": 1, "componentType": 5123, "count": len(F) * 6, "type": "SCALAR"}],
}
js = json.dumps(gltf, separators=(",", ":")).encode(); js += b" " * (-len(js) % 4)
with open(os.path.join(out, "grande_salle.glb"), "wb") as g:
    g.write(struct.pack("<3I", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob)))
    g.write(struct.pack("<2I", len(js), 0x4E4F534A) + js)
    g.write(struct.pack("<2I", len(blob), 0x004E4942) + blob)
print("ok :", len(V), "sommets,", len(F), "faces,", len(edges), "arêtes, étanche")
