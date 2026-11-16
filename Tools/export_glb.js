const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const D = process.argv[2], OUT = '/home/user/Unity/Assets/Export';
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/three.min.js', r => r.fulfill({ path: D + '/cdn/three.min.js', contentType: 'application/javascript' }));
  await pg.goto('file:///home/user/Unity/Web/play.html'); await pg.waitForTimeout(2500);
  await pg.addScriptTag({ path: D + '/npmthree/package/examples/js/exporters/GLTFExporter.js' });
  const res = await pg.evaluate(() => new Promise(done => {
    window.requestAnimationFrame = () => 0;
    const root = new THREE.Scene(); root.name = 'Chateau';
    const skip = new Set([HERO.mesh, HERO.shadow]);
    let n = 0;
    for (const o of [...scene.children]) {
      if (skip.has(o) || o.isPoints) continue;                       // avatar, ombre, étoiles
      if (o.isMesh && o.material && o.material.isMeshBasicMaterial && o.material.transparent) continue;
      const c = o.clone(true); n++;
      c.traverse(x => { if (x.isMesh) { const m = x.material; x.material = Array.isArray(m) ? m.map(mm => mm.clone()) : m.clone();
        for (const mm of [].concat(x.material)) { mm.onBeforeCompile = () => {}; if (mm.map === stoneTex) mm.map = null; if (mm.bumpMap) mm.bumpMap = null; if (mm.side === THREE.BackSide) mm.side = THREE.DoubleSide; } } });
      root.add(c);
    }
    new THREE.GLTFExporter().parse(root, buf => {
      const u8 = new Uint8Array(buf); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      done({ glb: btoa(s), n, tex: stoneTex.image.toDataURL('image/png') });
    }, { binary: true, onlyVisible: true });
  }));
  fs.writeFileSync(OUT + '/chateau.glb', Buffer.from(res.glb, 'base64'));
  fs.writeFileSync(OUT + '/texture_pierre.png', Buffer.from(res.tex.split(',')[1], 'base64'));
  console.log('objets', res.n, 'errors', errs); await b.close();
})();
