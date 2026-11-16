// Personnage « fille aux deux chignons » (d'après la planche fournie), construit en code, exporté en glTF pour Blender.
// Taille 1,65 m, origine aux pieds, regard vers +Z (glTF) = -Y dans Blender. Pose en A (bras écartés à ~20°) pour faciliter le rig.
function buildGirl() {
  const C = { skin: 0xf2c9b1, hair: 0x2a2a4a, navy: 0x2d2c50, tunic: 0x555b85, belt: 0x23223f, boots: 0x262541 };
  const mats = {}; for (const [k, c] of Object.entries(C)) mats[k] = new THREE.MeshStandardMaterial({ name: k, color: new THREE.Color(c).convertSRGBToLinear(), roughness: k === "boots" ? 0.45 : 0.8 });
  const root = new THREE.Group(); root.name = "Fille_chignons";
  const add = (name, geo, mat, parent = root, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mats[mat]); m.name = name; m.position.set(x, y, z); parent.add(m); return m; };
  const lathe = (pts, seg = 32, a0 = 0, a1 = Math.PI * 2) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), seg, a0, a1);
  const smooth = pts => { const c = new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y))); return c.getPoints(40).map(p => [p.x, p.y]); };

  // --- jambes (collants) et bottines ---
  for (const sx of [-1, 1]) {
    const leg = add("Jambe_" + (sx < 0 ? "D" : "G"), lathe(smooth([[0.001, 0.07], [0.036, 0.09], [0.04, 0.16], [0.052, 0.3], [0.05, 0.4], [0.047, 0.47], [0.06, 0.6], [0.068, 0.74], [0.07, 0.86], [0.05, 0.9]]), 24), "navy", root, sx * 0.082);
    leg.scale.z = 0.95;
    const boot = new THREE.Group(); boot.position.set(sx * 0.082, 0, 0); root.add(boot); boot.name = "Bottine_" + (sx < 0 ? "D" : "G");
    add("tige", lathe(smooth([[0.001, 0.02], [0.05, 0.02], [0.048, 0.08], [0.044, 0.135], [0.046, 0.14]]), 24), "boots", boot);
    const foot = add("pied", new THREE.SphereGeometry(0.05, 24, 16), "boots", boot, 0, 0.042, 0.045); foot.scale.set(0.85, 0.8, 1.9);
    add("semelle", new THREE.BoxGeometry(0.085, 0.018, 0.2), "belt", boot, 0, 0.009, 0.04);
    add("talon", new THREE.BoxGeometry(0.075, 0.035, 0.06), "belt", boot, 0, 0.018, -0.06);
  }
  // --- tunique (jupe évasée jusqu'à mi-cuisse) ---
  const skirt = add("Tunique_bas", lathe(smooth([[0.198, 0.7], [0.19, 0.74], [0.165, 0.84], [0.135, 0.94], [0.12, 1.0]]), 48), "tunic"); skirt.scale.z = 0.78;
  add("Tunique_ourlet", lathe([[0.001, 0.7], [0.198, 0.7]], 48), "tunic").scale.z = 0.78;
  const belt = add("Ceinture", lathe([[0.123, 0.955], [0.126, 0.975], [0.124, 1.01]], 48), "belt"); belt.scale.z = 0.78; belt.scale.x = 1.04;
  // --- buste : pull marine + corsage gris-bleu au décolleté en cœur ---
  const tProf = smooth([[0.105, 0.98], [0.11, 1.05], [0.135, 1.16], [0.148, 1.24], [0.15, 1.32], [0.12, 1.37], [0.06, 1.4]]);
  const torso = add("Pull", lathe(tProf, 48), "navy"); torso.scale.z = 0.7;
  {   // corsage : coque légèrement plus large, dont le haut dépend de l'angle (haut devant avec creux central, bas dans le dos)
    const rAt = y => { for (let i = 1; i < tProf.length; i++) if (tProf[i][1] >= y) { const [r0, y0] = tProf[i - 1], [r1, y1] = tProf[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); } return tProf[tProf.length - 1][0]; };
    const topY = a => { const f = Math.cos(a); if (f < 0) return 1.13 + 0.02 * (1 + f);   // dos
      const c = Math.abs(Math.sin(a)); return 1.15 + 0.11 * f * (1 - 0.35 * Math.exp(-(c * c) / 0.004)) - 0.005 * (1 - f); };
    const NS = 96, NR = 14, pos = [], idx = [];
    for (let i = 0; i <= NS; i++) { const a = i / NS * Math.PI * 2; const yt = topY(a);
      for (let j = 0; j <= NR; j++) { const y = 0.985 + (yt - 0.985) * j / NR, r = rAt(y) * 1.025; pos.push(Math.sin(a) * r, y, Math.cos(a) * r * 0.7 * 1.0); } }
    for (let i = 0; i < NS; i++) for (let j = 0; j < NR; j++) { const a = i * (NR + 1) + j, b = a + NR + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    add("Corsage", g, "tunic");
    for (const sx of [-1, 1]) { const b = add("Buste", new THREE.SphereGeometry(0.05, 20, 14), "tunic", root, sx * 0.055, 1.2, 0.062); b.scale.set(1, 0.9, 0.6); }
  }
  add("Col_roule", lathe([[0.001, 1.37], [0.058, 1.37], [0.055, 1.42], [0.057, 1.46], [0.001, 1.46]], 32), "navy").scale.z = 0.92;
  // --- bras (manches bouffantes) en pose A ---
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group(); sh.name = "Bras_" + (sx < 0 ? "D" : "G"); sh.position.set(sx * 0.158, 1.335, -0.01); sh.rotation.z = sx * 0.36; root.add(sh);
    add("epaule", new THREE.SphereGeometry(0.047, 20, 14), "navy", sh);
    add("bras", lathe(smooth([[0.001, -0.29], [0.037, -0.28], [0.04, -0.15], [0.044, -0.03], [0.034, 0.02]]), 24), "navy", sh);
    const el = new THREE.Group(); el.position.y = -0.285; el.rotation.x = -0.12; sh.add(el);
    add("avant_bras", lathe(smooth([[0.035, 0.0], [0.043, -0.07], [0.047, -0.15], [0.04, -0.22], [0.03, -0.25], [0.001, -0.255]]), 24), "navy", el);
    add("poignet", lathe([[0.029, -0.24], [0.031, -0.265], [0.001, -0.266]], 20), "belt", el);
    const hand = add("main", new THREE.SphereGeometry(0.045, 18, 14), "skin", el, 0, -0.32, 0.005); hand.scale.set(0.55, 1.35, 0.95);
    const th = add("pouce", new THREE.SphereGeometry(0.016, 10, 8), "skin", el, -sx * 0.0 + 0, -0.295, 0.035); th.scale.set(1, 2, 1);
  }
  // --- tête (sans visage, comme la planche) et cheveux ---
  add("Cou", lathe([[0.04, 1.42], [0.04, 1.5]], 16), "skin");
  const head = new THREE.Group(); head.name = "Tete"; head.position.set(0, 1.56, 0.01); root.add(head);
  add("visage", new THREE.SphereGeometry(0.098, 32, 24), "skin", head).scale.set(0.86, 1.1, 0.95);
  add("menton", new THREE.SphereGeometry(0.07, 24, 16), "skin", head, 0, -0.05, 0.02).scale.set(0.85, 0.85, 0.95);
  for (const sx of [-1, 1]) add("oreille", new THREE.SphereGeometry(0.02, 12, 10), "skin", head, sx * 0.085, -0.005, -0.005).scale.set(0.45, 1, 0.75);
  add("Calotte", new THREE.SphereGeometry(0.107, 36, 24, 0, Math.PI * 2, 0, Math.PI * 0.52), "hair", head, 0, 0.008, -0.008).scale.set(0.93, 1.06, 1.04);
  // carré : cheveux qui tombent derrière et sur les côtés jusqu'au menton, ouverts devant le visage
  const bob = add("Carre", lathe(smooth([[0.1, 0.03], [0.115, -0.04], [0.118, -0.1], [0.11, -0.13]]), 40, Math.PI * 0.3, Math.PI * 1.4), "hair", head, 0, 0, -0.008);
  bob.material = bob.material.clone(); bob.material.side = THREE.DoubleSide; bob.scale.set(0.95, 1, 1.02);
  // frange droite sur le front
  const fringe = add("Frange", new THREE.SphereGeometry(0.11, 32, 12, Math.PI * 1.65 - Math.PI, Math.PI * 0.7, Math.PI * 0.12, Math.PI * 0.3), "hair", head, 0, 0.012, 0.0);
  fringe.material = fringe.material.clone(); fringe.material.side = THREE.DoubleSide; fringe.scale.set(0.95, 1.05, 1.06);
  for (const sx of [-1, 1]) {   // mèches qui encadrent le visage
    const lk = add("Meche", lathe(smooth([[0.001, -0.14], [0.012, -0.12], [0.02, -0.04], [0.02, 0.04]]), 12), "hair", head, sx * 0.083, 0, 0.035); lk.scale.z = 0.6;
    add("Chignon", new THREE.SphereGeometry(0.052, 24, 18), "hair", head, sx * 0.07, 0.115, -0.025);
  }
  root.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  return root;
}
