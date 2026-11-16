// Grande salle : cube de 250 x 250 x 250 m creusé par le haut (ouvert au-dessus), parois et sol de 10 m d'épaisseur.
// Un seul maillage, sans faces qui se chevauchent. Unités : mètres. Origine au centre du sol, sous la salle (y = 0).
function buildHall() {
  const S = 250, T = 10, H = S / 2;
  const parts = [
    [S, T, S, 0, T / 2, 0],                          // sol
    [S, S - T, T, 0, T + (S - T) / 2, -H + T / 2],   // mur arrière (pleine largeur)
    [S, S - T, T, 0, T + (S - T) / 2, H - T / 2],    // mur avant (pleine largeur)
    [T, S - T, S - 2 * T, -H + T / 2, T + (S - T) / 2, 0],   // mur gauche (entre les deux)
    [T, S - T, S - 2 * T, H - T / 2, T + (S - T) / 2, 0],    // mur droit
  ];
  const geos = parts.map(([w, h, d, x, y, z]) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g.toNonIndexed(); });
  const pos = [], nor = [];
  for (const g of geos) { pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ name: "Pierre", color: 0xb0aca4, roughness: 0.9 }));
  m.name = "Grande_salle";
  return m;
}
