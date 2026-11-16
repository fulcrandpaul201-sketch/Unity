const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const D = process.argv[2], OUT = '/home/user/Unity/Assets/Export';
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 1500, height: 800 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.setContent('<body style="margin:0;background:#fff"><canvas id="c" width="1500" height="800"></canvas></body>');
  await pg.addScriptTag({ path: D + '/cdn/three.min.js' });
  await pg.addScriptTag({ path: D + '/npmthree/package/examples/js/exporters/GLTFExporter.js' });
  await pg.addScriptTag({ path: '/home/user/Unity/Tools/models/fille_chignons.js' });
  const glb = await pg.evaluate(() => new Promise(done => {
    const r = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true }); r.outputEncoding = THREE.sRGBEncoding; r.setClearColor(0xffffff);
    const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 0.9));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(2, 3, 4); sc.add(dl);
    const angles = [0.6, 0, Math.PI / 2, -Math.PI / 2.4, Math.PI];
    angles.forEach((a, i) => { const g = buildGirl(); g.rotation.y = a; g.position.x = (i - 2) * 0.55; sc.add(g); });
    const cam = new THREE.OrthographicCamera(-1.69, 1.69, 1.8, 0, 0.1, 20); cam.position.set(0, 0, 6); cam.lookAt(0, 0, 0);
    r.render(sc, cam);
    const solo = buildGirl();
    new THREE.GLTFExporter().parse(solo, buf => { const u8 = new Uint8Array(buf); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); done(btoa(s)); }, { binary: true });
  }));
  fs.writeFileSync(OUT + '/fille_chignons.glb', Buffer.from(glb, 'base64'));
  await pg.screenshot({ path: OUT + '/fille_chignons_apercu.png' });
  console.log('errors', errs); await b.close();
})();
